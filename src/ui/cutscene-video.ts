import type Phaser from 'phaser';
import { mountVideoSurface, type VideoSurfaceHandle } from './video-surface';

/**
 * 全屏过场视频（CG）的 DOM 直显封装。
 *
 * ## 为什么盖在 canvas 上面，而不是像开场动画那样塞在下面
 *
 * 开场动画的宿主场景把 canvas 设成透明（`rgba(0,0,0,0)`），`<video>` 放在 canvas 底下，
 * 靠合成器直出画面、canvas 只画 UI。寝室场景的 canvas 是不透明的（房间、角色、UI 都在上面），
 * 塞在下面根本看不到，所以这里反过来：视频盖在 canvas 之上，播放期间游戏内的 HUD 会被挡住 ——
 * 也正合意：过场时只留一个「跳过」。
 *
 * ## 三个必须记住的坑
 *
 * 1. **canvas 默认是普通文档流**，`<video>` 是 `position: fixed`。定位元素永远画在非定位元素上面，
 *    跟 DOM 顺序无关。必须给 canvas 显式设 `position: relative` 并抬 z-index，销毁时还原。
 * 2. **Phaser 4 的 video 缓存存的是 `{ url }`，不是 `<video>` 元素**；自己建元素时从 `.url` 取地址。
 * 3. 视频 9:16 在 9:19.5 手机上会上下留边，所以走 `video-surface` 的「前景 contain + 背景模糊 cover」。
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

export function playCutsceneVideo(
  scene: Phaser.Scene,
  key: string,
  onDone: (reason: CutsceneEndReason) => void,
  options: CutsceneVideoOptions = {},
): CutsceneVideoHandle {
  const entry = scene.cache.video.get(key) as { url?: string } | undefined;
  const src = entry?.url;

  let finished = false;
  let surface: VideoSurfaceHandle | null = null;
  let fallbackTimer: Phaser.Time.TimerEvent | null = null;

  const canvas = scene.game.canvas;
  const prevPosition = canvas.style.position;
  const prevZIndex = canvas.style.zIndex;

  const restoreCanvas = (): void => {
    canvas.style.position = prevPosition;
    canvas.style.zIndex = prevZIndex;
  };

  const finish = (reason: CutsceneEndReason): void => {
    if (finished) return;
    finished = true;
    fallbackTimer?.remove();
    fallbackTimer = null;
    surface?.destroy();
    surface = null;
    restoreCanvas();
    onDone(reason);
  };

  const handle: CutsceneVideoHandle = { destroy: () => finish('skipped') };

  if (!src) {
    console.warn('[cutscene] 视频缓存里没有可用地址', key);
    scene.time.delayedCall(0, () => finish('error'));
    return handle;
  }

  canvas.style.position = 'relative';
  canvas.style.zIndex = CANVAS_Z;

  surface = mountVideoSurface({
    src,
    layout: 'fill',
    zIndex: 2,
    skipLabel: options.skipLabel ?? '跳过',
    onEnded: () => {
      const element = surface?.element;
      finish(element?.ended === true ? 'ended' : 'skipped');
    },
    onError: (reason) => {
      console.warn('[cutscene] 视频加载失败', key, reason);
      finish('error');
    },
  });

  void surface.play();

  // 兜底：视频迟迟不起播（素材损坏/解码失败无 error）时不要卡住流程。
  fallbackTimer = scene.time.delayedCall(400, () => {
    if (finished || !surface) return;
    if (!surface.element.paused) return;
    // 先交给 video-surface 的静音重试；再等 6 秒仍不动就放行。
    scene.time.delayedCall(6000, () => {
      if (finished) return;
      if (surface?.element.paused === true) finish('error');
    });
  });

  return handle;
}
