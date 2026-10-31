/**
 * 全屏过场视频的 DOM 挂载层（纯 DOM，不依赖 Phaser）。
 *
 * ## 要解决的问题
 *
 * CG 是 9:16（720×1280），手机视口常常是 9:19.4～20:9，`object-fit: contain` 会在上下留出
 * 约 75px 的黑边。直接 `cover` 又会把靠近画面边缘的构图裁掉（床、窗、字幕都可能在边上）。
 * 这里用两层同源 `<video>`：
 * - **背景层**：`cover` + `blur(28px) brightness(.55) saturate(.9)` + `scale(1.06)`，永远 muted + loop；
 * - **前景层**：`contain`，保持完整构图。
 * 露出来的黑边被「同一段画面的模糊放大」填满，看起来是有意的电影框，而不是没铺满。
 *
 * ## 层叠契约（本模块只负责视频层）
 *
 * - 背景层 `z-index = zIndex`，前景层 `zIndex + 1`，跳过按钮 `zIndex + 2`（默认 0/1/2）。
 * - **不碰 canvas 的 `position` / `z-index`**：canvas 是普通文档流元素，`<video>` 是 `fixed`，
 *   想让视频盖住 canvas / 想让 Compose 的关卡按钮挂在视频之上，由调用方自己抬 canvas 或传更大的
 *   `zIndex`（例如 canvas 设 `position: relative; z-index: 1` 时，这里传 `zIndex: 2`）。
 * - 两层都是 `pointer-events: none`，只有跳过按钮可点；点按钮不会把事件冒泡给游戏。
 *
 * ## 生命周期
 *
 * - `mountVideoSurface()` 立刻尝试自动播放（先带声音，被拦就静音重试并回调 `onMutedChange(true)`）。
 * - `onEnded` 只触发一次：自然播完或点跳过。**触发后不自动销毁**——调用方可能还要做溶解/淡出，
 *   由调用方在合适的时机 `destroy()`。
 * - `destroy()` 幂等：暂停、清 `src`、`load()`、移除两层元素与按钮；**不会**再触发 `onEnded`。
 * - Node/单测环境没有 DOM：本模块在模块顶层不碰 `document`，只有 `mountVideoSurface()` 被调用时才
 *   检查环境并抛错，所以可以安全地被导入。
 */

export type VideoSurfaceLayout = 'fill' | 'contain';

export interface VideoSurfaceOptions {
  readonly src: string;
  /** `fill` = 前景 contain + 背景模糊铺满；`contain` = 只建前景层。默认 `fill`。 */
  readonly layout?: VideoSurfaceLayout;
  /** 底层元素的 z-index；前景是 +1、跳过按钮 +2。默认 0。 */
  readonly zIndex?: number;
  /** 前景是否静音。默认 false（先尝试带声音自动播放）。 */
  readonly muted?: boolean;
  /** 前景是否循环。默认 false。 */
  readonly loop?: boolean;
  /** 跳过按钮文案；传 `null` 不显示按钮。默认「跳过」。 */
  readonly skipLabel?: string | null;
  readonly onEnded?: () => void;
  /** 简短失败原因，例如 `media-error:decode · ...`、`play-rejected`、`missing-src`。 */
  readonly onError?: (reason: string) => void;
  /** 静音状态被动变化时通知（目前只有「自动播放被拦 → 改静音重试成功」这一条路径）。 */
  readonly onMutedChange?: (muted: boolean) => void;
}

export interface VideoSurfaceHandle {
  readonly element: HTMLVideoElement;
  /** `layout: 'contain'` 时为 null。 */
  readonly backdrop: HTMLVideoElement | null;
  readonly muted: boolean;
  setMuted(muted: boolean): void;
  play(): Promise<void>;
  destroy(): void;
}

const BASE_LAYER_STYLE =
  'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;';

/** 前景：严格构图，宁可留边也不裁画面。 */
const FOREGROUND_STYLE = `${BASE_LAYER_STYLE}object-fit:contain;`;

/** 背景：同一段画面铺满 + 模糊压暗，填掉上下黑边；放大 6% 让模糊边缘不露白。 */
const BACKDROP_STYLE =
  `${BASE_LAYER_STYLE}object-fit:cover;` +
  'filter:blur(28px) brightness(.55) saturate(.9);transform:scale(1.06);';

/** 跳过按钮：墨黑半透明底 + 1px 鎏金边框 + 宣纸白字，和游戏内 secondary 按钮同一套观感。 */
const SKIP_BUTTON_STYLE = [
  'position:fixed',
  'top:calc(env(safe-area-inset-top, 0px) + 14px)',
  'right:calc(env(safe-area-inset-right, 0px) + 14px)',
  'display:inline-flex',
  'align-items:center',
  'justify-content:center',
  'min-width:56px',
  'min-height:56px',
  'padding:0 20px',
  'border-radius:999px',
  'border:1px solid rgba(216, 183, 106, .65)',
  'background:rgba(5, 6, 10, .55)',
  'color:#f2efe6',
  'font:600 16px/1 system-ui, -apple-system, "PingFang SC", "Noto Sans CJK SC", sans-serif',
  'letter-spacing:.08em',
  'cursor:pointer',
  'touch-action:manipulation',
  '-webkit-tap-highlight-color:transparent',
  'backdrop-filter:blur(6px)',
  '-webkit-backdrop-filter:blur(6px)',
].join(';');

/** `MediaError.code` → 可读原因。 */
const MEDIA_ERROR_LABELS: Record<number, string> = {
  1: 'aborted',
  2: 'network',
  3: 'decode',
  4: 'unsupported',
};

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/** 把 `MediaError` 压成一行短原因；WebView 的 message 常常很长，截断到 64 字。 */
function mediaErrorReason(error: MediaError | null): string {
  if (!error) return 'media-error';
  const label = MEDIA_ERROR_LABELS[error.code] ?? `code-${error.code}`;
  const detail = typeof error.message === 'string' ? error.message.trim() : '';
  const short = detail.length > 64 ? `${detail.slice(0, 64)}…` : detail;
  return short === '' ? `media-error:${label}` : `media-error:${label} · ${short}`;
}

/**
 * 建一个视频元素。`src` 为空时**不赋值**——`video.src = ''` 会被解析成"当前页面 URL"，
 * 触发一次假的媒体错误，反而掩盖真正的问题。
 */
function createVideoElement(
  src: string,
  muted: boolean,
  loop: boolean,
  style: string,
  zIndex: number,
): HTMLVideoElement {
  const element = document.createElement('video');
  // iOS：三个都写。`playsinline` 属性 + 属性名本身缺一不可，否则 iPhone 会强行全屏播放。
  element.playsInline = true;
  element.setAttribute('playsinline', '');
  element.setAttribute('webkit-playsinline', '');
  element.removeAttribute('controls');
  element.preload = 'auto';
  element.muted = muted;
  element.loop = loop;
  if (src !== '') element.src = src;
  element.style.cssText = `${style}z-index:${zIndex};`;
  return element;
}

/** 暂停 → 清 src → load() → 移除。顺序不能反：先摘 src 再 load 才会真正释放解码器。 */
function releaseVideoElement(element: HTMLVideoElement): void {
  try {
    element.pause();
  } catch {
    // 某些 WebView 对已脱离文档的元素调用 pause 会抛，忽略即可。
  }
  element.removeAttribute('src');
  try {
    element.load();
  } catch {
    // 同上：释放失败不影响 DOM 清理。
  }
  element.remove();
}

/**
 * 挂一层全屏过场视频。
 *
 * 调用方负责：给 canvas 设好 `position` / `z-index`（或传更大的 `zIndex`）、在场景 shutdown 里
 * 调 `destroy()`。本函数只创建/清理视频层与跳过按钮，不碰 Phaser。
 */
export function mountVideoSurface(options: VideoSurfaceOptions): VideoSurfaceHandle {
  if (typeof document === 'undefined') {
    throw new Error('mountVideoSurface：需要浏览器 DOM 环境（Node/SSR 下不可用）');
  }

  const src = options.src.trim();
  const layout = options.layout ?? 'fill';
  const baseZIndex = finiteOr(options.zIndex, 0);
  const skipLabel = options.skipLabel === undefined ? '跳过' : options.skipLabel;

  let destroyed = false;
  /** `onEnded` 的一次性闸门：自然播完 / 点跳过，只放行一次。 */
  let settled = false;
  let muted = options.muted === true;
  let playAttempt: Promise<void> | null = null;
  /** 同一条错误只报一次，避免 `error` 事件连发刷屏。 */
  const reported = new Set<string>();

  const report = (reason: string): void => {
    if (destroyed || reported.has(reason)) return;
    reported.add(reason);
    options.onError?.(reason);
  };

  const finish = (): void => {
    if (settled || destroyed) return;
    settled = true;
    options.onEnded?.();
  };

  // ---------------------------------------------------------------- 元素

  // 先建背景、再建前景：DOM 顺序与 z-index 一致，读代码时不会误以为前景在下。
  const backdrop =
    layout === 'fill'
      ? createVideoElement(src, true, true, BACKDROP_STYLE, baseZIndex)
      : null;
  const foreground = createVideoElement(
    src,
    muted,
    options.loop === true,
    FOREGROUND_STYLE,
    baseZIndex + 1,
  );

  const handleEnded = (): void => finish();
  const handleError = (): void => report(mediaErrorReason(foreground.error));
  const handleBackdropError = (): void => {
    if (backdrop) report(`backdrop-${mediaErrorReason(backdrop.error)}`);
  };

  foreground.addEventListener('ended', handleEnded);
  foreground.addEventListener('error', handleError);
  if (backdrop) {
    backdrop.addEventListener('error', handleBackdropError);
    document.body.appendChild(backdrop);
  }
  document.body.appendChild(foreground);

  // ---------------------------------------------------------------- 播放

  const playForeground = (): Promise<void> => {
    if (destroyed || src === '') return Promise.resolve();
    if (!foreground.paused) return Promise.resolve();
    if (playAttempt) return playAttempt;

    const attempt = (async (): Promise<void> => {
      try {
        await foreground.play();
        return;
      } catch {
        // 带声音被自动播放策略拦下：静音再试（这是唯一允许的降级路径）。
        if (destroyed) return;
      }
      if (!muted) {
        muted = true;
        foreground.muted = true;
        options.onMutedChange?.(true);
      }
      try {
        await foreground.play();
      } catch {
        report('play-rejected');
      }
    })();

    playAttempt = attempt.finally(() => {
      playAttempt = null;
    });
    return playAttempt;
  };

  const playBackdrop = (): void => {
    if (destroyed || !backdrop || src === '') return;
    // 背景层永远 muted，正常情况下不会被策略拦；失败也不该影响前景。
    void backdrop.play().catch(() => undefined);
  };

  // ---------------------------------------------------------------- 跳过按钮

  let skipButton: HTMLButtonElement | null = null;
  const handleSkipClick = (event: MouseEvent): void => {
    // 别让这一次点击冒泡给游戏（场景层可能挂了「继续/点击推进」）。
    event.preventDefault();
    event.stopPropagation();
    finish();
  };

  if (skipLabel !== null) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = skipLabel;
    button.setAttribute('aria-label', skipLabel === '' ? '跳过' : skipLabel);
    button.style.cssText = `${SKIP_BUTTON_STYLE}z-index:${baseZIndex + 2};`;
    button.addEventListener('click', handleSkipClick);
    document.body.appendChild(button);
    skipButton = button;
  }

  // ---------------------------------------------------------------- 句柄

  const handle: VideoSurfaceHandle = {
    element: foreground,
    backdrop,
    get muted(): boolean {
      return muted;
    },
    /**
     * 手动切换静音。只改状态并通知，不自动开始播放——**静音后想重新起播请再调 `play()`**
     * （自动播放被拦时，播放器状态由调用方掌握更稳妥）。
     */
    setMuted(next: boolean): void {
      if (destroyed) return;
      const value = next === true;
      if (value === muted) return;
      muted = value;
      foreground.muted = value;
      options.onMutedChange?.(value);
    },
    play(): Promise<void> {
      playBackdrop();
      return playForeground();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      // 销毁不是"播完"：闸门关掉，任何迟到的 ended 都不再回调。
      settled = true;
      playAttempt = null;

      foreground.removeEventListener('ended', handleEnded);
      foreground.removeEventListener('error', handleError);
      backdrop?.removeEventListener('error', handleBackdropError);
      skipButton?.removeEventListener('click', handleSkipClick);

      releaseVideoElement(foreground);
      if (backdrop) releaseVideoElement(backdrop);
      skipButton?.remove();
      skipButton = null;
    },
  };

  // ---------------------------------------------------------------- 自动播放

  if (src === '') {
    report('missing-src');
  } else {
    void handle.play();
  }

  return handle;
}
