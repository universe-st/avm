# 资源规范与场景作用域

> 目的：每个场景只持有自己需要的资源；进入新场景前一定经过加载页；离开后自动回收。
> 后续资源会越来越多，**禁止把资源当成全局常驻**。

## 1. 唯一真值

资源清单只有一个地方：`src/assets/bundles.ts`。

```ts
interface AssetDef {
  key: string;          // 全局唯一，Phaser cache key
  kind: 'image' | 'audio' | 'json';
  url: string;          // 相对站点根，如 assets/img/title/title_bg.webp
  weight?: number;      // 可选，缺省按 catalog 字节/1KB
  required?: boolean;   // 默认 true；false 时失败只降级
  label?: string;       // 加载页显示名
}
```

- 改资源先改 `bundles.ts`，再跑 `pnpm assets:scan`（更新字节数）与 `pnpm assets:check`。
- key 命名：`img.<bundle>.<name>` / `audio.bgm.<name>` / `audio.sfx.<name>` / `font.<name>`。
- 文件路径：`public/assets/{img,audio,font,data}/<bundle>/<name>[@2x].<ext>`。
- `BundleDef.persistent: true` 只给真正的全局资源（`core` / `ui`）。章节、剧情、战斗包**不要**标常驻。

## 2. 当前 bundle 表

| bundle | 内容 | 预算 | 常驻 | 加载点 |
| --- | --- | --- | --- | --- |
| `core` | 基础纹理（白像素）、按钮点击音、逐字提示音 ×3、播放控制图标 ×2 | 2 MB | ✅ | 冷启动（之后每批自动带上） |
| `ui` | 设置弹窗/通用 UI（本期为空，用主题绘制） | 1 MB | ✅ | 冷启动（之后每批自动带上） |
| `title` | 标题主视觉、徽记、标题 BGM | 6 MB | — | 进入标题 |
| `ch.00` | 序章占位背景 | 2 MB | — | 进入占位页 |
| `cutscene.prologue` | 开幕剧情 5 张配图 + 开幕曲《星夜梦境》 | 6 MB | — | 点击开始 / 进入开幕 |
| `ch.01` | 50×54 寝室整图、郑卿睡床 4 帧、周全 Q 版四向/行走、小白/郑卿、校园 BGM、呼噜/拳击/手机 SFX | 8 MB | — | 进入第一章 |
| `battle.common` | 战斗公共资源（本期为空，依赖 `ui`） | 3 MB | — | 进入剧情战 |
| `battle.ch01` | 梦域金殿背景、矿工 sprite、战斗 BGM/金属 SFX；依赖 `ch.01` 复用周全 sprite | 5 MB | — | 进入剧情战 |

后续：`ch.NN`（单章 ≤ 8 MB）、`battle.<id>`（≤ 5 MB）、`cutscene.<id>`（单段 ≤ 8 MB）。
章节包不得互相依赖；公共资源上移到 `ui` / `battle.common`。

第一章资源说明：

- `ch.01` 的寝室改用 50×54 俯视整图 `dorm_q.png`（1600×1728，按 720 宽显示），配套郑卿睡床 4 帧与 Q 版周全 160×400 帧（场景缩放 0.45）；旧 `dorm_room.png` 仅留作历史资源。
- 周全四向静态图/行走 sheet 由游戏素材大师 sprite 模块生成；小白/矿工/郑卿由参考设定图的精灵图裁切。
- 资源路径/key 按 `map / character / cg / battle / ui` 分组，key 统一从 `src/assets/keys.ts` 取，详见 `docs/RENDER-LAYERS.md`。当前 `ch.01` 共 41 个文件。
- BGM/SFX 标 `required:false`：音频失败只静音，不阻断剧情。

## 3. 场景资源作用域（核心机制）

实现位置：

| 文件 | 职责 |
| --- | --- |
| `src/assets/bundles.ts` | `expandBundleIds()` 依赖闭包、`persistentBundleIds()` 常驻包、`collectAssets()` 扁平资源 |
| `src/resource/scope.ts` | `planRelease()` 纯函数：算「切场景后该删哪些 bundle/资源 key」 |
| `src/resource/asset-service.ts` | 串行加载、已加载账本、`releaseExcept()` 真正删除纹理/音频/JSON |
| `src/resource/scene-resources.ts` | 场景门禁 `loadSceneResources()` + 目标场景 `create` 后回收 |
| `src/app/director.ts` | `enterModule()`：加载 → 切场景 → 回收 |
| `src/dev/stage-runner.ts` | 舞台预览走同一套门禁与回收 |

### 3.1 生命周期

```
enterModule(from, module)
  ├─ loadSceneResources(module.requires, { show:'always' })
  │    └─ AssetService.ensure(requires + 依赖闭包 + 常驻包)
  │         └─ LoaderScene 立即显示；加载完成后至少停留 520ms
  ├─ releaseSceneResourcesAfterCreate(target, module.requires)
  │    └─ 监听目标场景 CREATE（此时旧场景已 shutdown、GameObject 已销毁）
  ├─ from.scene.start(module.sceneKey, data)
  └─ 目标场景 CREATE 后 setTimeout(0)
       └─ AssetService.releaseExcept(module.requires)
            ├─ planRelease()：保留 requires 闭包 + 常驻包
            ├─ 删除非常驻 bundle 的 texture（先删引用该纹理的动画）
            └─ 删除非常驻 bundle 的 audio / json cache
```

为什么回收要等目标场景 `create`：

- 旧场景的 `SHUTDOWN` 早于新场景 `CREATE`；在 `CREATE` 里再让出一帧，旧 GameObject 已全部销毁，新场景的 `create()` 也已引用完自己的纹理；
- 新场景需要的 bundle 仍在 keep 闭包里，不会被误删；
- 正在播放的 Sound 实例在 Phaser 内部持有 `audioBuffer`，删 cache 不会打断 BGM 交叉淡化。

### 3.2 依赖闭包与常驻包

- `requires: ['battle.ch01']` 自动包含 `battle.common`、`ch.01`、`ui`、`core`，无需在模块里手写依赖。
- `core` / `ui` 标 `persistent: true`：每个加载批次自动带上，切场景时永不释放。
- 两个 bundle 共享同一个资源 key 时，只要还有一个 bundle 保留，该 key 就不删（`planRelease` 已处理）。
- 运行时用 Canvas 生成的 UI 纹理（`__avm.scrim.*`、`__avm.cine.vignette` 等）是引擎级装饰，按设计常驻，不进入 bundle 账本；它们不含文件资源，体积极小。

### 3.3 禁止跨场景预取

**不要在场景里预取下一个场景的 bundle。** 预取会让「点击开始」时缓存命中，加载页一闪而过甚至完全不出现，既违背「每次进入新场景都有加载页」，也让内存里常驻了玩家可能永远不会去的资源。所有跨场景资源都在门禁里加载。

### 3.4 验收/调试

浏览器控制台：

```js
__AVM__.assets.bundles()  // 当前排队的 bundle（含依赖闭包）
__AVM__.assets.keys()     // 当前 cache 里真实存在的资源 key
```

切换场景前后对比即可确认：进入寝室后只剩 `core/ui/ch.01`，回到标题后 `ch.01` 已释放。

舞台预览不新增一套资源表：`scene.<id>` / `battle.<id>` 的 `requires` 必须与 `GameModule.requires` 或战斗模块声明一致；`cg.<id>` 的帧 key 必须在 `requires` 的依赖闭包里。`stage-catalog` 单测会校验。预览启动同样走 `loadSceneResources()` 与 `releaseSceneResourcesAfterCreate()`。

## 4. 进度契约

UI 只认 `LoadState`（`src/assets/types.ts`）：

```ts
{
  phase: 'idle' | 'loading' | 'ready' | 'error',
  progress: 0..1,        // 按权重、批次内单调递增
  currentKey, currentLabel,
  loaded, total,         // 文件计数
  bytesLoaded, bytesTotal,
  startedAt, show, holdMs, error
}
```

- **进度 = Σ已完成权重 / Σ总权重**；不用 Phaser 的 `load.progress`（文件计数）。
- 权重 = `bytes / 1024`，钳制 [1, 4096]；BGM 与 1×1 图标不会同权。
- `total = 0` 时进度视为 1（资源全在缓存）；仍然会先发一次 `loading` 再发 `ready`，让 `show:'always'` 能亮起加载页。
- 同一批次内进度只增不减；失败重试不回退。
- 必填资源失败 → `phase = 'error'` 并 reject；可选资源失败 → 继续并记为降级。
- `holdMs` 由调用方指定：场景门禁默认 520ms，舞台预览显式 420ms。

## 5. 加载页策略

| 场景 | 行为 |
| --- | --- |
| 冷启动 | 进入标题前显示；加载 `core + ui + title` |
| 任意场景切换 | **总是显示**；`show:'always'`，同步亮起遮罩，最短 520ms，淡出 200ms |
| 缓存全命中 | 仍然显示 520ms，作为场景转场，不闪进目标画面 |
| 舞台预览 | 总是显示，最短 420ms |
| 取消显示 | 只有未来明确的资源预热才允许 `show:'never'`；当前无调用方 |
| 失败 | 立即显示错误文案，不自动隐藏 |

加载页是常驻的 `LoaderScene`，用 Phaser 原生 Rectangle/Graphics/Text 绘制，**不依赖任何待加载资源**；否则「加载字体/图集才能显示加载条」会变成死锁。

## 6. 硬规则

1. 场景 `create()` 里禁止 `this.load`；新增资源必须登记 bundle。
2. 进入任何内容场景前必须走 `enterModule()` / `launchStage()`；禁止绕过门禁直接 `scene.start()`。
3. 每个 `GameModule.requires` 必须覆盖该场景用到的所有资源 key；新增场景先补 `requires` 再写视图。
4. 只有 `core` / `ui` 允许 `persistent: true`；章节/剧情/战斗资源一律随场景回收。
5. 禁止跨场景预取（`prefetch` 已移除）；加载页必须真实反映本次进入所需的资源。
6. 资源回收只由 `AssetService.releaseExcept()` 负责；场景/UI 不要手工 `textures.remove()` 或 `cache.audio.remove()`。
7. 回收后重新进入同一场景必须能重新加载；新场景的 `create()` 不能假设上一个场景的资源还在。
8. 加载页三档保留：`always`（内容场景）、`auto`（预留）、`never`（预留）；内容场景只准用 `always`。
9. 防闪烁：`always` 同步显示、最短 520ms、完成后再停留 120ms 才淡出；`auto` 延迟 120ms。
10. 同一时刻只跑一个加载批次；`ensure()` / `releaseExcept()` 共用一条队列。
11. 弱网/省流量：加载页照常显示；不做静默预取。
12. 必填资源失败必须阻断并可重试；可选资源必须有占位。
13. 舞台预览与正常进入共用同一套门禁与回收；预览同样禁止 `this.load`。

> 以后若要接入「下一章空闲预取」，必须先改掉 `releaseExcept` 的淘汰口径，并在文档里重新定义加载页何时显示；不要偷偷恢复 `prefetch()`。

## 7. 失败与降级

- 单文件失败：Phaser 的 `loaderror` 记录 key；批次继续。
- 批次完成时：`requiredFailures()` 非空 → `error` + reject（加载页显示错误，不自动隐藏）。
- 可选失败：保留占位（目前是空纹理/静音），下次 `ensure` 仍会重试。
- 断网恢复：监听 `online` 后重新 `ensure` 即可（M1 在错误页提供按钮）。

## 8. 命名与格式

| 类别 | 规范 |
| --- | --- |
| 图像 | 2× 设计；WebP（含 alpha）优先，PNG 回退；单边 ≤ 2048；小图打图集，留 1px extrude + 2px padding。全屏过场图用 1080×1920（1.5× 设计）优先保证显存；标题主视觉 1440×2560 是已存在的例外 |
| 音频 | BGM 60–120s 可循环，-16 LUFS；SFX ≤ 2s；MP3 128k（BGM）/96k（SFX）。≤ 50ms 的连续触发音（逐字提示音）用 22.05kHz / 16bit 单声道 WAV，避免 MP3 编码前导静音拖拍 |
| 字体 | WOFF2 子集；首屏前 `document.fonts.ready` 等待 |
| 数据 | JSON UTF-8 无 BOM |
| 体积 | 清单与 catalog 记录 bytes/hash/mtime |

## 9. 新资源接入清单

- [ ] `bundles.ts` 新增 AssetDef（key 唯一）
- [ ] 文件放到 `public/assets/...`
- [ ] `pnpm assets:scan`
- [ ] `pnpm assets:check`
- [ ] 目标场景的 `GameModule.requires` / 舞台条目的 `requires` 覆盖新 key（依赖闭包自动展开，不用手写依赖）
- [ ] 场景通过 `enterModule` 进入，不直接 `this.load`
- [ ] 如果需要新场景：同步登记 `scene-keys.ts`、`main.ts`、`stage-catalog.ts`
- [ ] 预算未超；可选资源标了 `required: false`
- [ ] 在 `ASSET-CREDITS.md` 登记来源
- [ ] 验收：`__AVM__.assets.bundles()` 在进入/离开场景后符合预期
