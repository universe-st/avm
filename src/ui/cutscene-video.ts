import type Phaser from 'phaser';

/**
 * 全屏过场视频（CG）的 DOM 直显封装。
 *
 * ## 为什么盖在 canvas 上面，而不是像开场动画那样塞在下面
 *
 * 开场动画的宿主场景把 canvas 设成透明（`rgba(0,0,0,0)`），`<video>` 放在 canvas 底下，
 * 靠合成器直出画面、canvas 只画 UI。寝室场景的 canvas 是不透明的（房间、角色、UI 都在上面），
 * 塞在下面根本看不到，所以这里反过来：视频盖在 canvas 之上（z-index 2），
 * 播放期间游戏内的 HUD 会被挡住 —— 也正合意：过场时只留一个「跳过」。
 *
 * ## 两个必须记住的坑
 *
 * 1. canvas 是普通文档流，`<video>` 是 `position: fixed`。想让视频盖住它，必须给 canvas
 *    显式设 `position: relative`（否则 auto 定位也会参与层叠，但不同浏览器下表现不一致），
 *    并抬 z-index。销毁时要把这两个样式原样还回去，否则后面的场景会跟着错层。
 * 2. `this.cache.video.get(key)` 返回的是 `{ url, noAudio, crossOrigin }`，**不是** `<video>` 元素；
 *    自己建元素时从 `.url` 取地址。
 */
export type CutsceneEndReason = 'ended' | 'skipped' | 'error';

export interface CutsceneVideoHandle {
  destroy(): void;
}

export interface CutsceneVideoOptions {
  /** 跳过按钮文字，默认「跳过」。 */
  readonly skipLabel?: string;
}

const CANVAS_Z = '1';
const VIDEO_Z = '2';
const BUTTON_Z = '3';

export function playCutsceneVideo(
  scene: Phaser.Scene,
  key: string,
  onDone: (reason: CutsceneEndReason) => void,
  options: CutsceneVideoOptions = {},
): CutsceneVideoHandle {
  const entry = scene.cache.video.get(key) as { url?: string } | undefined;
  const src = entry?.url;

  let finished = false;
  let videoEl: HTMLVideoElement | null = null;
  let buttonEl: HTMLButtonElement | null = null;
  let fallbackTimer: Phaser.Time.TimerEvent | null = null;

  const canvas = scene.game.canvas;
  const prevPosition = canvas.style.position;
  const prevZIndex = canvas.style.zIndex;

  const cleanup = (): void => {
    fallbackTimer?.remove();
    fallbackTimer = null;
    if (videoEl) {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
      videoEl.remove();
      videoEl = null;
    }
    if (buttonEl) {
      buttonEl.remove();
      buttonEl = null;
    }
    canvas.style.position = prevPosition;
    canvas.style.zIndex = prevZIndex;
  };

  const finish = (reason: CutsceneEndReason): void => {
    if (finished) return;
    finished = true;
    cleanup();
    onDone(reason);
  };

  const handle: CutsceneVideoHandle = { destroy: () => finish('skipped') };

  if (!src) {
    console.warn('[cutscene] 视频缓存里没有可用地址', key);
    scene.time.delayedCall(0, () => finish('error'));
    return handle;
  }

  const element = document.createElement('video');
  element.src = src;
  element.playsInline = true;
  element.setAttribute('playsinline', '');
  element.setAttribute('webkit-playsinline', '');
  element.removeAttribute('controls');
  element.preload = 'auto';
  element.loop = false;
  // contain：竖屏片子放进任意视口，宁可上下留黑边，也不裁掉画面边缘。
  element.style.cssText =
    'position:fixed;left:0;top:0;width:100%;height:100%;object-fit:contain;' +
    `background:#05060a;pointer-events:none;z-index:${VIDEO_Z};`;
  videoEl = element;

  canvas.style.position = 'relative';
  canvas.style.zIndex = CANVAS_Z;
  document.body.appendChild(element);

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = options.skipLabel ?? '跳过';
  button.style.cssText =
    'position:fixed;top:14px;right:14px;z-index:' + BUTTON_Z + ';' +
    'padding:8px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.45);' +
    'background:rgba(5,6,10,.55);color:#f2ece0;font-size:13px;letter-spacing:.08em;' +
    'cursor:pointer;backdrop-filter:blur(4px);';
  button.addEventListener('click', () => finish('skipped'));
  buttonEl = button;
  document.body.appendChild(button);

  element.addEventListener('ended', () => finish('ended'));
  element.addEventListener('error', () => {
    console.warn('[cutscene] 视频加载失败', key, element.error?.code, element.error?.message);
    finish('error');
  });

  const tryPlay = (): void => {
    const played = element.play();
    // 带声音被浏览器拦掉：交给 400ms 的静音重试。
    played?.catch(() => undefined);
  };

  tryPlay();
  fallbackTimer = scene.time.delayedCall(400, () => {
    if (finished || element !== videoEl) return;
    if (!element.paused) return;
    element.muted = true;
    tryPlay();
  });

  return handle;
}
