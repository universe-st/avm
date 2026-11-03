import { CG_HANDOFF_FADE_MS } from '../app/cg-handoff';

/**
 * 「写实视频 → 像素马赛克 → 游戏场景」里那块马赛克定格层（纯 DOM，不依赖 Phaser）。
 *
 * 做法：把视频**最后一帧** drawImage 到 48×104 的小 canvas，再 CSS 拉伸铺满全屏 +
 * `image-rendering: pixelated`。只 drawImage、不读像素，所以不会触发跨域污染。
 *
 * 层叠：`position: fixed; z-index: 9`。它必须盖在 Phaser canvas（z-index 2）之上，
 * 否则寝室的不透明背景色会直接把它抹掉——代价是**加载页也在它下面**，
 * 所以全屏定格的时间必须短（见 `app/cg-handoff.ts`）。
 *
 * 溶解用 CSS `opacity` transition：`opacity` 是合成器属性，`fadeOut()` 之后
 * 下一帧起就由合成器接管，后面寝室首帧构建把主线程堵住也不影响它继续溶解。
 * （调用方必须保证「先 fadeOut、隔一帧再起跑场景切换」，否则 transition 还没提交
 * 就被首帧构建卡住，淡出会被一起推迟——这条在 `app/cg-handoff.ts` 里实现。）
 */
export interface PixelTransitionHandle {
  readonly canvas: HTMLCanvasElement;
  /** 开始溶解；重复调用无副作用。 */
  fadeOut(): void;
  /** 从 DOM 摘掉；重复调用无副作用。 */
  remove(): void;
}

/** 小到能看清像素块、又足够保留构图（9:16 竖屏）。 */
const MOSAIC_WIDTH = 48;
const MOSAIC_HEIGHT = 104;
const MOSAIC_Z_INDEX = 9;

/**
 * 抓 `video` 的当前帧，挂一层全屏马赛克。
 *
 * 拿不到画面（没有视频 / 首帧未解码 / 老 WebView 抛错）时返回 `null`，
 * 调用方应退回普通淡出——宁可少一次画风转场，也不能卡住。
 */
export function mountPixelTransition(video: HTMLVideoElement | null): PixelTransitionHandle | null {
  if (typeof document === 'undefined') return null;
  if (!video || video.readyState < 2 || video.videoWidth === 0) return null;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = MOSAIC_WIDTH;
    canvas.height = MOSAIC_HEIGHT;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;object-fit:cover;' +
      'image-rendering:pixelated;pointer-events:none;' +
      `z-index:${MOSAIC_Z_INDEX};` +
      // 时长与 app/cg-handoff 的 fadeMs 同源，改一处即可。
      `transition:opacity ${CG_HANDOFF_FADE_MS}ms ease;` +
      'background:#05060a;';
    canvas.dataset.avm = 'pixel-transition';
    document.body.appendChild(canvas);

    let faded = false;
    return {
      canvas,
      fadeOut(): void {
        if (faded) return;
        faded = true;
        canvas.style.opacity = '0';
      },
      remove(): void {
        canvas.remove();
      },
    };
  } catch (error) {
    console.warn('[pixel-transition] 像素化转场抓帧失败，退回普通淡出', error);
    return null;
  }
}
