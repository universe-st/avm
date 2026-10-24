# 架构

## 1. 分层

```
scenes / ui / story
   │
   ├─ app/            viewport、settings、modules、director（场景门禁）
   │
   ├─ resource/       AssetService（队列/权重/进度/失败） + LoaderScene（加载 UI）
   │        │
   │        └─ assets/bundles.ts（唯一资源清单） + catalog.gen.json（字节数）
   │
   ├─ story/          无 Phaser 的剧情数据与时间线（prologue.ts / prologue-player.ts）
   │
   ├─ audio/          AudioDirector（BGM/SFX/解锁/持久化）
   │
   └─ theme/          主题令牌（墨黑/鎏金/朱红）
        │
phaser-mvvm（vendor/phaser-mvvm/packages/*）+ Phaser 4.2.1
```

**硬规则：场景里不出现 `this.load.*`。** 所有资源先登记 bundle，再经 `AssetService.ensure()` 进入。

## 2. 启动与场景流

```
BootScene.create
  ├─ applyCamera(scene)
  ├─ scene.launch('loader')            // 常驻加载场景，bringToTop
  ├─ await assetService.whenReady()    // LoaderScene.create 里 attach
  ├─ await document.fonts.ready
  └─ enterModule(this, 'title')
        ├─ await assetService.ensure(['core','title'])   // 显示加载页
        └─ this.scene.start('title')

TitleScene（UIScene）
  ├─ 背景封面图（cover）+ 渐变压暗
  ├─ content(): 版本/设置、标题、三个按钮、版权
  ├─ audioDirector.attach + playTitleBgm
  ├─ 800ms 后静默 prefetch(cutscene.prologue)
  └─ 开始游戏 → enterModule(this, 'prologue')

PrologueScene（UIScene）
  ├─ 原生层：CinematicBackdrop / scrim / SparkField / MeteorSweep / WarOverlay / TitleCard
  ├─ Compose 层：右上角「跳过」
  ├─ ProloguePlayer 每帧 tick(delta)：打字 → 停留 → 淡出 → 下一 cue
  └─ 完成/跳过 → enterModule(this, 'placeholder')；返回键 → enterModule(this, 'title')

PlaceholderScene（UIScene）
  └─ 返回标题 → enterModule(this, 'title')
```

`enterModule` 必须传当前场景，内部用 `from.scene.start()`。用全局 `game.scene.start()` 不会停旧场景，会留下重叠的 UIRoot。

### 2.1 开幕剧情播放器

开幕剧情刻意分成两层：

- **纯逻辑**：`src/story/prologue.ts` 是文案/配图/节奏的唯一真值；`src/story/prologue-player.ts` 是 `typing → holding → leaving → awaiting-continue` 状态机，不 import Phaser，单测覆盖「补全、推进、最后确认、离开中忽略输入」。
- **表现**：`PrologueScene` 每帧把 `delta` 钳制到 100ms 后喂给 player；`src/ui/cinematic.ts` 提供双缓冲背景、渐变压暗、星尘、流星、震屏/白闪、战争红点与日期卡。文字用原生 `Text`（固定文本框 + `setResolution`），不把长句烘焙进图片。

场景内不出现 `this.load`；5 张图由 `cutscene.prologue` bundle 在进入前加载，标题页会提前静默预取。

## 3. 视口与设备分辨率

- 设计宽固定 **720**；设计高 `clamp(round(720 * viewportH / viewportW), 1280, 1600)`。
- 渲染倍率 `scale = clamp(viewportW * dpr / 720, 1, 2.5)`。
- `gameSize = 设计 × scale`，`Scale.FIT` + `CENTER_BOTH`。
- 相机：`setZoom(scale)` + `centerOn(360, designH / 2)`；`MVVMPlugin.configure({ designResolution, textResolution: scale })`。
- 20:9、19.5:9、16:9 手机按比例无黑边；4:3 平板留上下边（主题背景）。
- **只 setZoom 不 centerOn** 会只看到设计框右下四分之一，点击全部落空（phaser-mvvm PITFALLS §8.73）。

像素素材纹理单独设 NEAREST；UI 文本与光效保持 LINEAR。`roundPixels: true`。

## 4. 资源框架

### 4.1 组成

| 文件 | 职责 |
| --- | --- |
| `src/assets/types.ts` | AssetDef / BundleDef / LoadState 类型 |
| `src/assets/bundles.ts` | 资源唯一真值：key、kind、url、required、label |
| `src/assets/catalog.gen.json` | `tools/scan-assets.mjs` 生成的字节数（权重来源） |
| `src/resource/plan.ts` | 纯函数：权重、总权重、进度、必填失败、缺失筛选 |
| `src/resource/asset-service.ts` | 单例队列、去重、加载、进度状态、失败策略 |
| `src/resource/loader-scene.ts` | 常驻加载场景，订阅状态画进度条 |

### 4.2 状态机

```
idle ──ensure()──► loading ──全部完成──► ready
                        │
                        └─必填失败──► error
```

- 一个批次串行执行；`ensure()` 通过 Promise 链排队，避免多场景抢 Phaser cache。
- 已加载的资源按 `textures.exists` / `cache.audio.exists` 跳过，重复请求立即完成。
- 进度按权重：`Σ已完成权重 / Σ总权重`，权重 = 字节/1KB（[1,4096]），不用 Phaser 的文件计数。
- `LoadState` 通过 `@phaser-mvvm/core` 的 `ref` 发布，LoaderScene 用 `onChange` 订阅。

### 4.3 加载 UI 的独立性

LoaderScene 用 Phaser 原生对象（Rectangle/Graphics/Text）画进度，**不依赖任何待加载资源**。否则「加载字体/图集才能显示加载条」会变成死锁。

显示策略：

- `show: 'always'`：立即显示（冷启动）。
- `show: 'auto'`：延迟 120ms 才显示；如果在此之前完成，不闪。
- `show: 'never'`：预取，静默。
- 最短可见 420ms，完成后再停留 120ms 才淡出。
- `error`：立即显示错误文案，不自动隐藏。

## 5. 音频

- `AudioDirector` 是 game 级 SoundManager 的薄封装。
- 同一首 BGM 跨场景不重启；不同曲目交叉淡入淡出（当前实现是先淡出旧的，再淡入新的）。
- 首触解锁：`playTitleBgm` 先尝试播；被浏览器拦截则监听 `unlocked`，首次 pointerdown/keydown 再补播。
- `visibilitychange` 与 Cordova `pause/resume` 暂停/恢复全部音频。
- 音量/静音写入 `localStorage` 的 `avm.settings.v1`。

## 6. 主题

`src/theme/theme.ts` 继承框架 DARK_THEME，替换为「刺客终端」配色（墨黑/鎏金/朱红）与 720 设计宽对应的字号/控件高（约为 CSS 尺寸的 2 倍）。在 `new Phaser.Game()` 之前 `applyTheme()`。

## 7. 新增一个模块（场景）

1. 在 `src/assets/bundles.ts` 登记资源（key 唯一、url 相对站点根）。
2. 在 `src/app/modules.ts` 加 `GameModule`：`requires`、`prefetch`、`gate`。
3. 场景内只写视图；切换用 `enterModule(this, id)`。禁止 `this.load`。
4. 跑 `pnpm assets:scan && pnpm check`。

## 8. 已知边界

- 标题页已触发一次 `cutscene.prologue` 预取；C/D 类的章节调度器与缓存淘汰仍未接入。
- 缓存释放 API 已留，当前不真正卸载纹理。
- 开幕正文是 Phaser Text，未接 DOM a11y 镜像；跳过按钮与「点击继续」提示可键盘/读屏访问。
- a11y 镜像与输入桥沿用框架默认；尚未做游戏内无障碍适配。
