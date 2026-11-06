import { describe, expect, it } from 'vitest';
import {
  canCaptureFrame,
  coverCrop,
  FRAME_BACKDROP_HEIGHT,
  FRAME_BACKDROP_WIDTH,
  FRAME_MAX_EDGE,
  MOSAIC_BACKDROP_HEIGHT,
  MOSAIC_BACKDROP_WIDTH,
  MOSAIC_FOREGROUND_HEIGHT,
  MOSAIC_FOREGROUND_WIDTH,
  planFrameTransition,
  planMosaic,
} from '../src/ui/pixel-transition';

/**
 * 像素化转场的构图。
 *
 * 守的是 2026-11-03 那条反馈：旧实现把 720×1280（9:16）直接画进 48×104（9:19.5）再
 * `object-fit:cover` 铺满 9:19.5 屏，纵向被拉开 1.22 倍，像素人物比视频帧「更近」，
 * 切到马赛克时构图会跳。现在前景必须保持源比例（9:16），背景用同比例的 cover 裁切铺底。
 */
const VIDEO_W = 720;
const VIDEO_H = 1280;

/**
 * 画布宽高比与源裁切宽高比一致 ⇒ `drawImage` 既不拉伸也不压扁。
 *
 * 画布只有几十像素宽，非 9:16 的源在取整时允许 1~2 个像素的量化误差（≤ 3%）；
 * 9:16（实际片子）是精确相等的。
 */
function expectNoStretch(layer: { width: number; height: number; sw: number; sh: number }): void {
  const canvasAspect = layer.width / layer.height;
  const sourceAspect = layer.sw / layer.sh;
  expect(Math.abs(canvasAspect / sourceAspect - 1)).toBeLessThan(0.03);
  expect(canvasAspect).toBeGreaterThan(0);
}

describe('像素化转场构图', () => {
  it('前景保持 9:16（45×80），把整帧画进去', () => {
    const plan = planMosaic(VIDEO_W, VIDEO_H);
    expect(MOSAIC_FOREGROUND_WIDTH).toBe(45);
    expect(MOSAIC_FOREGROUND_HEIGHT).toBe(80);
    expect(plan.foreground.width).toBe(45);
    expect(plan.foreground.height).toBe(80);
    expect(plan.foreground.sx).toBe(0);
    expect(plan.foreground.sy).toBe(0);
    expect(plan.foreground.sw).toBe(VIDEO_W);
    expect(plan.foreground.sh).toBe(VIDEO_H);
    // 9:16 = 0.5625；旧的 48×104 是 0.4615，纵向多拉 1.22x。
    expect(plan.foreground.width / plan.foreground.height).toBeCloseTo(9 / 16, 6);
    expectNoStretch(plan.foreground);
  });

  it('背景按 cover 裁切：比例与目标一致，不超出源画面', () => {
    const plan = planMosaic(VIDEO_W, VIDEO_H);
    const { backdrop } = plan;
    expect(backdrop.width).toBe(MOSAIC_BACKDROP_WIDTH);
    expect(backdrop.height).toBe(MOSAIC_BACKDROP_HEIGHT);
    // 9:19.5 比 9:16 更高 ⇒ 左右裁、高度铺满。
    expect(backdrop.sh).toBe(VIDEO_H);
    expect(backdrop.sy).toBe(0);
    expect(backdrop.sw).toBeLessThan(VIDEO_W);
    expect(backdrop.sx).toBeGreaterThan(0);
    expectNoStretch(backdrop);
    expect(backdrop.sx + backdrop.sw).toBeLessThanOrEqual(VIDEO_W + 1e-6);
  });

  it('换一个源比例也不会被拉伸（前景高度跟着源比例走）', () => {
    const plan = planMosaic(1920, 1080);
    expect(plan.foreground.height).toBe(25); // 45 * 1080 / 1920 = 25.3 → 25
    expectNoStretch(plan.foreground);
    expectNoStretch(plan.backdrop);
  });

  it('coverCrop：源更宽裁左右，源更高裁上下', () => {
    const wide = coverCrop(1920, 1080, 48, 104);
    expect(wide.sh).toBe(1080);
    expect(wide.sw).toBeCloseTo((1080 * 48) / 104, 6);
    expect(wide.sx).toBeCloseTo((1920 - wide.sw) / 2, 6);
    expect(wide.sy).toBe(0);

    const tall = coverCrop(720, 1920, 48, 104);
    expect(tall.sw).toBe(720);
    expect(tall.sh).toBeCloseTo((720 * 104) / 48, 6);
    expect(tall.sy).toBeCloseTo((1920 - tall.sh) / 2, 6);
    expect(tall.sx).toBe(0);
  });

  it('回归：不再把整帧塞进 9:19.5 的画布（旧实现的 1.22x 拉伸）', () => {
    const plan = planMosaic(VIDEO_W, VIDEO_H);
    const stretched = plan.foreground.width === MOSAIC_BACKDROP_WIDTH &&
      plan.foreground.height === MOSAIC_BACKDROP_HEIGHT;
    expect(stretched).toBe(false);
    const stretchRatio = (VIDEO_H / VIDEO_W) / (plan.foreground.height / plan.foreground.width);
    expect(Math.abs(stretchRatio - 1)).toBeLessThan(0.02);
  });
});

/**
 * 「跳过」用的整帧过渡层。
 *
 * 跳过不能出现马赛克（那是播完的画风转场），但也不能露 `<video>` 的最后一帧。
 * 做法是按当前帧原样画一块全屏 canvas 盖住视频，再用 120ms 淡出切走。
 * 这里守的是它的几何：前景必须与 `<video>` 的 contain 几何一致（同一帧不能跳位置），
 * 背景沿用马赛克的 cover 契约，只是分辨率高一点——它不像素化。
 */
describe('跳过用的整帧过渡层', () => {
  it('9:16 片子按原分辨率整帧画（720×1280），不缩放', () => {
    const plan = planFrameTransition(VIDEO_W, VIDEO_H);
    expect(plan.foreground.width).toBe(VIDEO_W);
    expect(plan.foreground.height).toBe(VIDEO_H);
    expect(plan.foreground.sx).toBe(0);
    expect(plan.foreground.sy).toBe(0);
    expect(plan.foreground.sw).toBe(VIDEO_W);
    expect(plan.foreground.sh).toBe(VIDEO_H);
    expectNoStretch(plan.foreground);
  });

  it('超过长边上限才缩（4K 片子也不会为一次淡出占几十 MB），比例不变', () => {
    const plan = planFrameTransition(3840, 2160);
    expect(Math.max(plan.foreground.width, plan.foreground.height)).toBe(FRAME_MAX_EDGE);
    expect(plan.foreground.width / plan.foreground.height).toBeCloseTo(16 / 9, 2);
    // 源矩形仍然是整帧：缩放只发生在目标画布上。
    expect(plan.foreground.sw).toBe(3840);
    expect(plan.foreground.sh).toBe(2160);
    expectNoStretch(plan.foreground);
  });

  it('背景层与马赛克层同一套 cover 契约，只是分辨率更高', () => {
    const plan = planFrameTransition(VIDEO_W, VIDEO_H);
    expect(plan.backdrop.width).toBe(FRAME_BACKDROP_WIDTH);
    expect(plan.backdrop.height).toBe(FRAME_BACKDROP_HEIGHT);
    expect(plan.backdrop.width / plan.backdrop.height).toBeCloseTo(
      MOSAIC_BACKDROP_WIDTH / MOSAIC_BACKDROP_HEIGHT,
      6,
    );
    expect(plan.backdrop.width).toBeGreaterThan(MOSAIC_BACKDROP_WIDTH);
    expectNoStretch(plan.backdrop);
    expect(plan.backdrop.sx + plan.backdrop.sw).toBeLessThanOrEqual(VIDEO_W + 1e-6);
  });

  it('跳过层不倒进 45×80：像素化只属于「播完」那条路径', () => {
    const plan = planFrameTransition(VIDEO_W, VIDEO_H);
    expect(plan.foreground.width).not.toBe(MOSAIC_FOREGROUND_WIDTH);
    expect(plan.foreground.height).not.toBe(MOSAIC_FOREGROUND_HEIGHT);
    expect(plan.foreground.width).toBeGreaterThan(MOSAIC_BACKDROP_WIDTH * 4);
  });

  it('Node 环境里抓不到帧（canCaptureFrame 恒 false，跳过走纯黑兜底）', () => {
    expect(canCaptureFrame(null)).toBe(false);
  });
});
