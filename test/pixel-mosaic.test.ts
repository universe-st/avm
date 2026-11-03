import { describe, expect, it } from 'vitest';
import {
  coverCrop,
  MOSAIC_BACKDROP_HEIGHT,
  MOSAIC_BACKDROP_WIDTH,
  MOSAIC_FOREGROUND_HEIGHT,
  MOSAIC_FOREGROUND_WIDTH,
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
