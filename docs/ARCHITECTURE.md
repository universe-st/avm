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
   ├─ dev/            舞台目录、URL/控制台后门、启动器、预览 HUD、确定性随机
   │
   ├─ audio/          AudioDirector（SFX/解锁/后台暂停）+ BgmManager（曲目表/场景切换/交叉淡化）
   │
   └─ theme/          主题令牌（墨黑/鎏金/朱红）
        │
phaser-mvvm（vendor/phaser-mvvm/packages/*）+ Phaser 4.2.1
```

**硬规则：场景里不出现 `this.load.*`。** 所有资源先登记 bundle，再经 `AssetService.ensure()` 进入；切场景后由 `releaseExcept()` 回收不属于新场景的 bundle（`core`/`ui` 常驻）。详见 [RESOURCE-SPEC.md](RESOURCE-SPEC.md) §3。

## 2. 启动与场景流

```
BootScene.create
  ├─ applyCamera(scene)
  ├─ scene.launch('loader')            // 常驻加载场景，bringToTop
  ├─ await assetService.whenReady()    // LoaderScene.create 里 attach
  ├─ await document.fonts.ready
  ├─ ?stage=<id> ? launchStage(game, id, …) : enterModule(this, 'title')
  │     ├─ await loadSceneResources(entry.requires)     // 同一套门禁，加载页总是显示
  │     ├─ stop 所有内容场景（保留 loader）
  │     ├─ game.scene.start(hostSceneKey, StageLaunchContext)
  │     └─ 目标 create 后 releaseExcept(entry.requires) // 回收旧场景资源
  └─ enterModule(this, 'title')（无舞台参数时）
        ├─ await loadSceneResources(['core','title'])   // 显示加载页
        ├─ this.scene.start('title')
        └─ 目标 create 后 releaseExcept(['core','title'])

TitleScene（UIScene）
  ├─ 背景封面图（cover）+ 渐变压暗
  ├─ content(): 版本/设置、标题、三个按钮、版权
  ├─ audioDirector.attach + bgmManager.enterScene（标题曲）
  └─ 开始游戏 → enterModule(this, 'prologue')  // 加载 cutscene.prologue，回收 title

PrologueScene（UIScene）
  ├─ 原生层：CinematicBackdrop / scrim / SparkField / MeteorSweep / WarOverlay / TitleCard
  ├─ Compose 层：右上角「自动播放 / 跳过」图标
  ├─ bgmManager.enterScene：标题曲淡出、开幕曲《星夜梦境》淡入
  ├─ ProloguePlayer 每帧 tick(delta)：打字 → 停留 → 淡出 → 下一 cue
  └─ 完成/跳过 → enterModule(this, 'ch01Dorm')；返回键 → enterModule(this, 'title')

Ch01DormScene（UIScene，第一章第一节）
  ├─ 原生世界：dorm_room 房间图、玩家 4 向 sprite、交互 marker、小白
  ├─ Compose HUD：目标 / 房间名 / 菜单；Branch 切换「探索」按钮与「对话」面板
  ├─ Ch01Flow：intro → explore → dream → battle → after → complete
  ├─ 移动/碰撞：map/core/collision.ts（分轴、滑墙、脚底盒）
  └─ 找手机 → 白闪 → enterModule(this, 'battleCh01', { encounterId, seed, preview })

BattleCh01Scene（UIScene，第一章剧情战）
  ├─ 背景：梦域金殿 WebP；角色：周全 / 矿工 sprite；HP 条
  ├─ 纯逻辑：battle/core/scripted-battle.ts（攻击固定 1、3 回合必败）
  ├─ Compose：回合、HP、攻击/防御、日志、战败覆盖层
  └─ 战败 → enterModule(this, 'ch01Dorm', { resume: 'afterBattle' })

PlaceholderScene（UIScene）
  ├─ 仅作舞台预览占位；正常流程不再进入
  └─ 返回标题 → enterModule(this, 'title')
```

`enterModule(from, id, data?)` 现在可以把 `data` 原样传给目标场景 `init()`，用于地图 → 战斗 → 地图的剧情状态；正常流程仍只走这一条路。

`enterModule` 必须传当前场景，内部用 `from.scene.start()`。用全局 `game.scene.start()` 不会停旧场景，会留下重叠的 UIRoot。它同时负责资源纪律：加载目标场景 bundle → 切场景 → 目标 `create` 后回收旧 bundle。

舞台预览是唯一例外：`src/dev/stage-runner.ts` 的 `launchStage()` 会先停掉所有内容场景（保留 loader），再启动目标场景。它同样走 `loadSceneResources()` + `releaseSceneResourcesAfterCreate()`，并注入 `StageLaunchContext`；正常流程仍然只走 `enterModule`。

### 2.1 第一章第一节的分层

> 渲染层级/模块归属的完整契约见 [RENDER-LAYERS.md](RENDER-LAYERS.md)：原生层 background → props → markers → characters → effects → cinematic → cg → debug，Compose UI 永远在最上面。

- **纯逻辑**：`src/story/ch01-dorm.ts`（全部台词/目标）、`ch01-flow.ts`（章节状态机）、`src/story/dialogue-player.ts`（逐字对话）、`src/map/core/`（房间校验/碰撞）、`src/battle/core/scripted-battle.ts`（剧情战）。都不 import Phaser，单测覆盖。
- **表现**：`Ch01DormRoomView` 画地图，`PlayerActor` 画角色，`CgOverlay` 画 CG，`ui/ch01-hud.ts` / `ui/ch01-modals.ts` 画 Compose HUD/模态；`Ch01DormScene` 只编排流程/输入/碰撞。`BattleCh01Scene` 同样把 HUD/模态拆到 `ui/battle-ch01-*.ts`，只消费战斗事件。
- **房间**：11×15 ASCII 碰撞 + 由「游戏素材大师」零件拼成的预烘焙图；换家具时优先改零件/拼图脚本，不在场景里摆 `this.add.*`。
- **确定性**：战斗判定无随机；预览 seed 只影响背景尘埃/光点，同 seed 同画面。

### 2.2 开幕剧情播放器

开幕剧情刻意分成两层：

- **纯逻辑**：`src/story/prologue.ts` 是文案/配图/节奏的唯一真值；`src/story/prologue-player.ts` 是 `typing → holding → leaving → awaiting-continue` 状态机，不 import Phaser，单测覆盖「补全、推进、最后确认、离开中忽略输入」。
- **表现**：`PrologueScene` 每帧把 `delta` 钳制到 100ms 后喂给 player；`src/ui/cinematic.ts` 提供双缓冲背景、渐变压暗、星尘、流星、震屏/白闪、战争红点与日期卡。文字用原生 `Text`（固定文本框 + `setResolution`），不把长句烘焙进图片。

场景内不出现 `this.load`；5 张图由 `cutscene.prologue` bundle 在进入开幕前加载。**不在标题页预取**：每次进入新场景都要真实经过加载页，且离开后资源会随场景回收。

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
| `src/assets/bundles.ts` | 资源唯一真值：key、kind、url、required、label；依赖闭包 `expandBundleIds()`；常驻包 |
| `src/assets/catalog.gen.json` | `tools/scan-assets.mjs` 生成的字节数（权重来源） |
| `src/resource/plan.ts` | 纯函数：权重、总权重、进度、必填失败、缺失筛选 |
| `src/resource/scope.ts` | 纯函数：`planRelease()` 计算场景切换后该释放的 bundle / 资源 key |
| `src/resource/asset-service.ts` | 单例队列、去重、加载、进度状态、失败策略、`releaseExcept()` 真正卸载 |
| `src/resource/scene-resources.ts` | 场景门禁：`loadSceneResources()` + 目标 create 后回收 |
| `src/resource/loader-scene.ts` | 常驻加载场景，订阅状态画进度条 |

### 4.2 状态机

```
idle ──ensure()──► loading ──全部完成──► ready
                        │
                        └─必填失败──► error

目标场景 CREATE ──releaseExcept(keep)──► 删除 keep 闭包外的 bundle / 资源
```

- 一个批次串行执行；`ensure()` 与 `releaseExcept()` 共用 Promise 链排队，避免多场景抢 Phaser cache。
- 已加载的资源按 `textures.exists` / `cache.audio.exists` 跳过，重复请求立即完成；但 `show:'always'` 仍会亮加载页。
- 进度按权重：`Σ已完成权重 / Σ总权重`，权重 = 字节/1KB（[1,4096]），不用 Phaser 的文件计数。
- `LoadState` 通过 `@phaser-mvvm/core` 的 `ref` 发布，LoaderScene 用 `onChange` 订阅。
- 释放按依赖闭包算：保留目标 `requires` + 常驻包；删纹理前先删引用它的动画；音频只删 cache，不打断正在播放的 Sound。

### 4.3 加载 UI 的独立性

LoaderScene 用 Phaser 原生对象（Rectangle/Graphics/Text）画进度，**不依赖任何待加载资源**。否则「加载字体/图集才能显示加载条」会变成死锁。

显示策略：

- `show: 'always'`：同步显示，作为每次进入新场景的转场遮罩；最短 520ms（`holdMs` 可覆盖）。
- `show: 'auto'`：延迟 120ms 才显示；如果在此之前完成，不闪。
- `show: 'never'`：静默（当前无调用方；禁止用于跨场景预取）。
- 完成后再停留 120ms 才淡出（200ms）。
- `error`：立即显示错误文案，不自动隐藏。

### 4.4 场景资源作用域

场景只声明 `requires`，不关心「上一个场景留下了什么」：

- `enterModule` 加载目标闭包 → `scene.start` → 目标 `create` 后 `releaseExcept(目标 requires)`；
- 回收时机在目标 `create` 之后：旧场景已 shutdown、GameObject 已销毁，新场景的纹理仍在 keep 闭包；
- `core` / `ui` 标 `persistent`，永不释放；
- 没有跨场景 `prefetch`。加载页必须真实反映本次进入所需的资源。

验收：`__AVM__.assets.bundles()` / `__AVM__.assets.keys()` 可直接检查当前场景持有的资源。

## 5. 音频

- `audio/bgm-tracks.ts`：纯数据——曲目表（key + 标签 + 淡入淡出时长）与「场景 → 曲子」映射；`undefined` = 保持当前曲目，`null` = 淡出到静音。单测不需要 Phaser。
- `audio/bgm-manager.ts`：`BgmManager` 在 `scene.create()` 里被 `enterScene(this)` 调用一次，按场景表切曲；跨场景的淡出交给**新场景**的 tween 驱动（旧场景 shutdown 会销毁自己的 tween）。
- `audio/audio-director.ts`：只剩 SFX（点击、逐字提示音）、WebAudio 首触解锁与后台暂停。
- 音量记账：淡入淡出不读 `sound.volume`（WebAudio gain 要等一个渲染量子，刚 play 时读到的是 1），而是由管理器自己记账后再写回。
- 新增一首 BGM：`bundles.ts` 登记 key → `bgm-tracks.ts` 加曲目并在 `BGM_BY_SCENE` 绑定场景 → 场景 `create()` 里已经有 `enterScene` 就不用改。缺资源时只 `console.warn`，不阻断剧情。
- 首触解锁：`play()` 先尝试播；被浏览器拦截则监听 SoundManager 的 `unlocked`，首次 pointerdown/keydown 补播并淡入。
- `visibilitychange` 与 Cordova `pause/resume` 暂停/恢复全部音频。
- 音量/静音写入 `localStorage` 的 `avm.settings.v1`。

## 6. 主题

`src/theme/theme.ts` 继承框架 DARK_THEME，替换为「刺客终端」配色（墨黑/鎏金/朱红）与 720 设计宽对应的字号/控件高（约为 CSS 尺寸的 2 倍）。在 `new Phaser.Game()` 之前 `applyTheme()`。

## 7. 新增一个模块（场景）

1. 在 `src/assets/bundles.ts` 登记资源（key 唯一、url 相对站点根）。
2. 在 `src/app/modules.ts` 加 `GameModule`：`requires`、`gate: { title }`。内容场景的加载页固定 `always`，没有降级开关；不要加 `prefetch`。
3. 在 `src/app/scene-keys.ts` 登记场景 key，并加入 `CONTENT_SCENE_KEYS`。
4. 在 `src/dev/stage-catalog.ts` 登记舞台条目（`scene.<id>`，`requires` 与 `GameModule` 一致）。
5. 场景内只写视图；切换用 `enterModule(this, id)`。禁止 `this.load`，也不要假设上一个场景的资源还在。
6. 跑 `pnpm assets:scan && pnpm check`（舞台目录单测会检查模块/内容场景覆盖）。
7. 验收：进入/离开新场景后 `__AVM__.assets.bundles()` 只剩目标闭包 + 常驻包。

## 8. 舞台预览与测试后门

目标：任意场景/CG/战斗都能用稳定 ID 单独打开，且不绕过资源门禁、不依赖存档。

```
?stage=<id> ─┐
__AVM__.stages.go(id) ─┼─► launchStage(game, id, { seed, skip, frame, params, hud })
HUD 目录 / 代码 ─┘         │
                           ├─ findStage(id) / status=ready
                           ├─ await loadSceneResources(entry.requires) // 总是显示加载页
                           ├─ stopContentScenes(game)（保留 loader）
                           ├─ game.scene.start(hostSceneKey, StageLaunchContext)
                           ├─ 目标 create 后 releaseExcept(entry.requires)
                           ├─ trackSceneShutdown → 正常剧情跳转后自动收 HUD
                           └─ mountStageHud（DOM，`hud=0` 时不挂）
```

- **目录唯一真值**：`src/dev/stage-catalog.ts`，`scene` / `cg` / `battle` 三类；ID 规则与命名见 `docs/STAGE-PREVIEW.md`。
- **CG 通用化**：`CgStageScene` 按目录帧显示，CG 不需要专用场景。
- **战斗契约**：`BattleSandboxScene` 证明 seed/params/资源门禁/退出路径；真实战斗新增 `battle.*` 条目。验收快照约定（opening/mid/victory 等）写在 `docs/STAGE-PREVIEW.md` §9。
- **预览 HUD**：DOM 层，覆盖任意场景，不占设计空间；顶部胶囊 + 目录/重开/标题；`Alt+Shift+D` 隐藏。浏览器截图要干净时用 `&hud=0`。
- **确定性随机**：`src/dev/random.ts` 的 `mulberry32` / `hashSeed`；预览/战斗随机必须走 seed。
- **测试门禁**：`test/stage-catalog.test.ts` 校验模块 gate 同步与内容场景覆盖；新增场景不登记会失败。

## 9. 已知边界

- 标题页已触发一次 `cutscene.prologue` 预取；C/D 类的章节调度器与缓存淘汰仍未接入。
- 缓存释放 API 已留，当前不真正卸载纹理。
- 开幕正文是 Phaser Text，未接 DOM a11y 镜像；右上角图标按钮在 DOM 镜像里是「自动播放」checkbox（checked 即自动开启）与「跳过剧情」button，「点击继续」提示可键盘/读屏访问。逐字提示音是纯装饰音效，不承载信息。
- a11y 镜像与输入桥沿用框架默认；尚未做游戏内无障碍适配。
