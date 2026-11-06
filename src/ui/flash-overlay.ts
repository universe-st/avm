/**
 * 全屏纯色「白场」层（纯 DOM，不依赖 Phaser）。
 *
 * 入梦这类转场要的是**全屏**白光：盖住地图、角色，也盖住 Compose HUD 和右上角按钮。
 * Phaser 里加矩形只能盖到 UIRoot（depth 10000）以下，HUD 会浮在白场上；
 * 所以这里跟 `video-surface` / `pixel-transition` 一样走 fixed DOM 层。
 *
 * ## 层叠
 *
 * `position: fixed; inset: 0` + 调用方给的 z-index（默认 9，与马赛克过渡层同档），
 * 永远盖在 Phaser canvas 之上。`pointer-events: none`，不影响后续输入。
 *
 * ## 生命周期
 *
 * - `fadeIn(ms)`：从透明淡到不透明；重复调用无副作用（只认第一次）。
 * - `fadeOut(ms)`：从当前不透明度淡回透明。
 * - `remove()`：立刻从 DOM 摘掉；幂等。场景 shutdown 必须调一次，避免白层残留。
 *
 * Node/单测环境没有 `document`：模块顶层不碰 DOM，`mountFlashOverlay()` 在无 DOM 时返回
 * `null`，调用方退回相机 flash 即可。
 */

export interface FlashOverlayHandle {
  readonly element: HTMLDivElement;
  fadeIn(ms: number): void;
  fadeOut(ms: number): void;
  remove(): void;
}

export interface FlashOverlayOptions {
  /** 底色，默认纯白。 */
  readonly color?: string;
  /** 叠放层级；默认 9（与像素过渡层同档，盖住 canvas）。 */
  readonly zIndex?: number;
}

export function mountFlashOverlay(options: FlashOverlayOptions = {}): FlashOverlayHandle | null {
  if (typeof document === 'undefined') return null;

  try {
    const color = options.color ?? '#ffffff';
    const zIndex = options.zIndex ?? 9;
    const root = document.createElement('div');
    root.dataset.avm = 'flash-overlay';
    root.style.cssText =
      'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;' +
      `background:${color};opacity:0;z-index:${zIndex};` +
      'transition:opacity 0ms linear;will-change:opacity;';
    document.body.appendChild(root);

    let fadedIn = false;
    let fadedOut = false;
    let removed = false;

    const setTransition = (ms: number, easing: string): void => {
      root.style.transition = `opacity ${Math.max(0, ms)}ms ${easing}`;
    };

    return {
      element: root,
      fadeIn(ms: number): void {
        if (fadedIn || removed) return;
        fadedIn = true;
        setTransition(ms, 'linear');
        // 强制一次样式计算，保证「0 → 1」这一帧真的会触发 transition（刚 append 时尤其重要）。
        void root.offsetWidth;
        root.style.opacity = '1';
      },
      fadeOut(ms: number): void {
        if (fadedOut || removed) return;
        fadedOut = true;
        setTransition(ms, 'ease');
        void root.offsetWidth;
        root.style.opacity = '0';
      },
      remove(): void {
        if (removed) return;
        removed = true;
        root.remove();
      },
    };
  } catch (error) {
    console.warn('[flash-overlay] 白光层挂载失败，退回场景内闪白', error);
    return null;
  }
}
