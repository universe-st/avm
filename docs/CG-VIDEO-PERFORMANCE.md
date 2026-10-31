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
