# CG 视频性能：为什么不用 Phaser Video GameObject

> 2026-10-29。真机反馈：开场 CG 在手机上播放明显卡顿（掉帧、和音轨不同步）。
> 排查后改成「DOM `<video>` 直显 + canvas 只画 UI」，帧不再经过 canvas。

## 1. 现象与根因

| | |
| --- | --- |
| 现象 | 手机上开场 CG 播放卡顿；视频本身 720p / 2.06 Mbps / 24fps / 3.4 MB，规格很轻 |
| 根因 | `this.add.video()` 每帧把 720×1280 的画面**上传成 GPU 纹理**再重绘 canvas（`requestVideoFrameCallback` → `texImage2D` → 整屏 redraw）。解码器跟得上，时间全花在上传和重绘上。中低端 Android WebView 的 GPU/主线程顶不住 |

规格本身没问题，所以**转码降码率只能缓解、不能根治**。

## 2. 现在的做法

```text
<body>
  <video>    ← position: fixed; object-fit: contain; z-index: 0; pointer-events: none
  <canvas>   ← 透明（main.ts 的 transparent: true），z-index: 1，只画 UI
```

- 视频帧由**浏览器合成器直接输出**，不经过 canvas，纹理上传成本归零。
- Phaser 侧不再创建 Video GameObject；只从 `this.cache.video.get(key).url` 取地址，自己建 `<video>`。
- 场景 camera 背景设 `rgba(0,0,0,0)`，把下面的视频露出来。
- UI（状态文案 / 跳过 / 开启声音）仍在 Compose 里，叠在透明 canvas 上。

## 3. 三个必须记住的坑

1. **canvas 默认是普通文档流**，`<video>` 是 `position: fixed`。定位元素永远画在非定位元素上面，
   **跟 DOM 顺序无关**——只把 video 插在 canvas 前面，结果是「视频能看、按钮全被盖住」。
   必须在挂载时给 canvas 加 `position: relative; z-index: 1`，场景 shutdown 再还原。
2. **`this.cache.video.get(key)` 返回的不是 `<video>` 元素**（Phaser 4 只存 `{ url, noAudio, crossOrigin }`）。
   自己建元素时从 `.url` 取地址；写 `element.setAttribute(...)` 会报 `element.setAttribute is not a function`。
3. **透明 canvas 是全局的**：`main.ts` 的 `transparent: true` 之后，每个内容场景都要自己铺不透明背景色，
   否则会透出 body 的渐变。目前只有 `ch01-opening` 设成透明。

## 4. 收益与代价

- 收益：视频播放期间的每帧 GPU 上传消失，手机上只剩合成器硬解 + UI 重绘。
- 代价：视频画在 canvas 下面，**Phaser 的滤镜/相机特效加不到视频上**；要做画面特效用 CSS filter 或后期视频。
- 兼容：`playsinline` / `webkit-playsinline` 必须给，否则 iOS 会强制全屏播放。
  未挂载到 DOM 的 `<video>` 在 iOS 上不解码，表现是「有进度、没画面」。

## 5. 验证清单

- `?stage=scene.ch01.open`：视频可见、右下「跳过」可见、canvas 透明、播完自动进寝室。
- 进寝室后 `canvas.style.zIndex` 应恢复成空（`getComputedStyle` 为 `auto`）。
- 手机上重点看：开头 3 秒是否掉帧、音画是否同步、切场景时画面是否闪黑。

## 6. 2026-10-31 补充：9:16 视频的上下黑边

`720×1280` 的成片放进 `390×844`（9:19.5）视口时，`contain` 会在上下各留约 75 CSS px 黑边。解决方案不是重出视频，而是 `src/ui/video-surface.ts` 的双层挂载：

- 背景层：同源 `<video>`，`object-fit:cover` + `blur(28px) brightness(.55) saturate(.9)` + `scale(1.06)`，永远 muted + loop；
- 前景层：同源 `<video>`，`object-fit:contain`，保留完整构图与声音；
- 两层都由合成器直出，仍然不经过 canvas；跳过按钮在 DOM 层，带 `env(safe-area-inset-*)`。

开场动画（canvas 透明、视频在下面）与手机 CG（视频盖在 canvas 上）共用这个模块，只是 `zIndex` 不同。代价是同源视频解码两份；低端 Android 若掉帧，可对非关键 CG 退回 `layout:'contain'`。

## 7. 2026-11-03 修复：CG 播完「马赛克定格很久」才进寝室

### 现象

开场 CG 播完后画面停住并变成马赛克（像素块），要等一段时间才恢复、才进第一章。

### 根因（三条叠加）

1. 马赛克层是 `position:fixed; z-index:9` 的全屏 DOM，而加载页画在同一张 Phaser canvas 上（`z-index:2`）、
   寝室首帧也在它下面 —— 等待期间玩家只看到一块不会动的像素画。
2. 寝室资源**没有预取**：`ch01Dorm.requires` 冷启动约 14.5 MB（`ch.01` 7.0 + `ch01.char` 3.2 + 手机 CG 4.2），
   而视频播放的 12.8s 里网络完全空闲。
3. 马赛克淡出绑在 `enterModule()` 的 promise 上：`await enterModule().then(() => setTimeout(fade, 140))`，
   加载多久就定格多久。

### 修前 / 修后（本机实测，390×844，CDP 关缓存）

| 时间点 | 修前 | 修后 |
| --- | --- | --- |
| video ended → 马赛克出现 | 0 ms | 1 ms |
| **全屏马赛克定格**（只有马赛克、无任何进度） | **785 ms** | **121~131 ms** |
| video ended → 寝室场景 create | 783 ms | 353~370 ms |
| video ended → 马赛克完全消失 | 1264 ms | 564~568 ms |

360×780 复测：定格 121~131 ms、寝室 create 353~368 ms、马赛克消失 564~573 ms；热缓存同量级（本机 localhost 冷/热差别可以忽略）。

### 做法

1. **播放期间预取**：`ch01-opening` 的 `create()` 里就 `assetService.prefetch(MODULES.ch01Dorm.requires)`
   （`show:'never'`，绝不把加载页弹到 CG 上）。`prefetch()` 会给这批 bundle 打 pin，
   `releaseExcept()` 不回收 —— 否则开场场景自己的那次回收（排在预取之后）会立刻把刚预取的资源删掉，
   白白下载一遍。
2. **收尾只由定时器驱动**：`src/app/cg-handoff.ts`（纯逻辑、可单测）：
   `holdMs=120` 定格 → 预取没完成就先 `revealLoading()` 亮加载页 → `fadeOut()` → `fadeMs=320` 溶解 → 移除。
   `enter()` 慢、卡住、直接 reject 都不影响这条时间线。
3. **先淡出、隔一帧再切场景**（`afterPaint`）：寝室首帧 `create()` 实测要 160~200ms，
   主线程一堵，CSS transition 还没提交就会被一起推迟。先让浏览器提交一帧，溶解交给合成器，
   定格时间从此只由 `holdMs` 决定，与场景构建耗时解耦。
4. **预取命中时静默切场景**：`enterModule(..., { skipGateWhenReady: true })` —— 资源都在 cache 里就不亮加载页、
   不吃 520ms hold，像素画直接溶进寝室首帧。没命中则原样走门禁（加载页 + 进度）。
5. **视频卡死兜底**：每 1.5s 看一次 `currentTime`，连续 3 次不走就判定播不动；被系统/策略暂停先尝试续播，
   两次不行直接进寝室 —— 避免 `ended` 事件丢了以后永远停在最后一帧。

### 被排除的方案

- **把马赛克挪到 canvas 下面**：寝室 camera 背景不透明，第一帧就会把转场整块抹掉，等于删掉画风转场。
- **只缩短加载页 holdMs**：马赛克是 `z-index:9`，加载页再短也在它下面，玩家还是只看得到像素块。
- **把淡出绑在寝室 `CREATE` 事件上**：主线程被首帧构建堵住时，回调一样推迟；实测定格会被拉到 200ms+，
  慢设备更容易超 250ms 预算。

### 怎么验证

- `?stage=scene.ch01.open&hud=0`，CDP 打点：`video ended` / 马赛克 canvas 出现 / `[assets] 释放 bundle` 日志 /
  马赛克移除；`Network.setCacheDisabled(true)` 做冷缓存。
- 断言：全屏定格 < 250ms；video ended → 寝室 create < 1200ms（本机冷/热都是 353~370ms —— 预取在播放期间就完成了）。
- 慢网络/预取没命中时（把预取临时关掉复现）：定格仍只有 126ms，随后是**带进度条的加载页**
  （`33-ch01-transition-loading-fallback.png`，截到 82%），不再有「只有马赛克」的空档。
- 单测：`test/cg-handoff.test.ts`（进入失败 / 一直不返回时过渡层仍按时收掉）、
  `test/loader-gate.test.ts`（预取批次 loading/error/ready 全程不亮页；`revealState` 只对进行中的批次生效）。
- 证据：`docs/screenshots/ingame/30-ch01-opening-transition.gif`（12 帧 → 10 帧过渡）、
  `31-ch01-opening-pixel-frame.png`、`32-ch01-dorm-first.png`。
