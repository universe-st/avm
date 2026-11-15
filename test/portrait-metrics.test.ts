import { describe, expect, it } from 'vitest';
import {
  PORTRAIT_SOURCE_HEIGHT,
  PORTRAIT_SOURCE_WIDTH,
  legacyPortraitSize,
  portraitMetrics,
} from '../src/ui/portrait-metrics';
import { planViewport } from '../src/app/viewport';

/**
 * 金殿立绘：显示宽度必须是改版前的一半，且 720:900 不变形。
 *
 * 这些断言全部是纯逻辑（不碰 Phaser 的 GameObject）：
 * 参考视口 → designHeight 也走生产的 `planViewport()` 现场复算，
 * 不写死一张可能过时的表。
 */

const DESIGN_WIDTH = 720;
const SOURCE_ASPECT = PORTRAIT_SOURCE_HEIGHT / PORTRAIT_SOURCE_WIDTH; // 900/720 = 1.25
const RATIO_TOLERANCE = 0.01;

const plan = (designHeight: number) => ({ designWidth: DESIGN_WIDTH, designHeight });

/** 生产里会出现的五档设计高度：最小 1100 / 大屏 1280 / 两代 iPhone / 最大 1700。 */
const DESIGN_HEIGHTS = [1100, 1280, 1558, 1561, 1700];

describe('portrait metrics', () => {
  it('把显示宽度精确减半（±1 设计 px 的取整误差）', () => {
    for (const designHeight of DESIGN_HEIGHTS) {
      const { width } = portraitMetrics(plan(designHeight), 'right');
      const legacy = legacyPortraitSize(plan(designHeight));

      // 新宽 × 2 必须回到旧宽（允许两边各自取整带来的 1px 误差）
      expect(Math.abs(width * 2 - legacy.width), `designHeight=${designHeight}`).toBeLessThanOrEqual(
        1,
      );
      // 等价写法：width = round(designHeight × 0.184)
      expect(
        Math.abs(width - Math.round(designHeight * 0.184)),
        `designHeight=${designHeight}`,
      ).toBeLessThanOrEqual(1);
      // 旧宽确实接近半屏（574 那档），新宽只有它的一半
      expect(width).toBeLessThan(legacy.width);
    }
  });

  it('高度跟着宽度等比减半，720:900 不变形', () => {
    for (const designHeight of [...DESIGN_HEIGHTS, 600, 2400]) {
      const { width, height } = portraitMetrics(plan(designHeight), 'right');
      expect(width).toBeGreaterThan(0);
      expect(height).toBe(Math.round((width * PORTRAIT_SOURCE_HEIGHT) / PORTRAIT_SOURCE_WIDTH));
      expect(
        Math.abs(height / width - SOURCE_ASPECT),
        `designHeight=${designHeight} → ${width}×${height}`,
      ).toBeLessThanOrEqual(RATIO_TOLERANCE);
    }
  });

  it('宽度不再占半屏以上（不超过设计宽的 42%）', () => {
    // 1100–1561 是实际会出现的视口；1700 是 planViewport 的钳制上限，
    // 那档宽度 313/720 = 43.5%，仍远小于改版前的 574/720 = 79.7%。
    for (const designHeight of [1100, 1280, 1558, 1561]) {
      const { width } = portraitMetrics(plan(designHeight), 'right');
      expect(width, `designHeight=${designHeight}`).toBeLessThanOrEqual(DESIGN_WIDTH * 0.42);
    }
    const maxWidth = portraitMetrics(plan(1700), 'right').width;
    expect(maxWidth).toBeLessThanOrEqual(DESIGN_WIDTH * 0.44);
    // 无论哪一档都不能再盖掉半屏
    expect(maxWidth).toBeLessThan(DESIGN_WIDTH / 2);
  });

  it('参照系与动效不变：贴地、从画面边上探出、左右对称', () => {
    for (const designHeight of DESIGN_HEIGHTS) {
      const right = portraitMetrics(plan(designHeight), 'right');
      const left = portraitMetrics(plan(designHeight), 'left');

      // 底边贴地位置不变：给对话面板留 210
      expect(right.baseY).toBe(designHeight - 210);
      expect(left.baseY).toBe(designHeight - 210);

      // 落点仍在画面内
      for (const anchorX of [right.anchorX, left.anchorX]) {
        expect(anchorX).toBeGreaterThan(0);
        expect(anchorX).toBeLessThan(DESIGN_WIDTH);
      }

      // 右侧人物：右缘溢出屏幕，左边不空——依旧是"从画面边上探出半个身"
      expect(
        right.anchorX + right.width / 2,
        `designHeight=${designHeight} 右缘没探出屏幕`,
      ).toBeGreaterThan(DESIGN_WIDTH);
      expect(right.anchorX - right.width / 2).toBeGreaterThan(0);

      // 左侧人物镜像对称：左缘溢出屏幕
      expect(left.anchorX - left.width / 2).toBeLessThan(0);
      expect(left.anchorX + left.width / 2).toBeLessThan(DESIGN_WIDTH);

      // anchorX 的 0.30 系数：左右落点关于画面中线对称
      expect(left.anchorX + right.anchorX).toBeCloseTo(DESIGN_WIDTH, 6);
      expect(right.anchorX).toBeCloseTo(DESIGN_WIDTH - right.width * 0.3, 6);
      expect(left.anchorX).toBeCloseTo(left.width * 0.3, 6);

      // 入场 tween 的横向位移不变：260px，从各自那一侧滑进来
      expect(right.fromX).toBe(right.anchorX + 260);
      expect(left.fromX).toBe(left.anchorX - 260);
    }
  });

  it('按真实视口复算旧/新尺寸（不是照抄参考表）', () => {
    const viewports = [
      { label: '390×844', cssWidth: 390, cssHeight: 844 },
      { label: '360×640', cssWidth: 360, cssHeight: 640 },
      { label: '430×932', cssWidth: 430, cssHeight: 932 },
      { label: '1200×648', cssWidth: 1200, cssHeight: 648 },
    ] as const;

    const expected = new Map([
      ['390×844', { designHeight: 1558, width: 287, height: 359 }],
      ['360×640', { designHeight: 1280, width: 236, height: 295 }],
      ['430×932', { designHeight: 1561, width: 287, height: 359 }],
      // 202 × 1.25 = 252.5，按契约 height = round(width × 900 / 720) 取 253；
      // 参考表里的 252 是 Python 的 round-half-even，比例误差同样 < 0.01。
      ['1200×648', { designHeight: 1100, width: 202, height: 253 }],
    ]);

    for (const { label, cssWidth, cssHeight } of viewports) {
      const viewportPlan = planViewport(cssWidth, cssHeight, 1);
      const expectRow = expected.get(label);
      if (!expectRow) throw new Error(`缺少 ${label} 的期望值`);

      expect(viewportPlan.designWidth).toBe(DESIGN_WIDTH);
      expect(viewportPlan.designHeight, label).toBe(expectRow.designHeight);

      const metrics = portraitMetrics(viewportPlan, 'right');
      expect({ width: metrics.width, height: metrics.height }, label).toEqual({
        width: expectRow.width,
        height: expectRow.height,
      });

      // 复核减半：旧尺寸仍按改版前公式现算
      const legacy = legacyPortraitSize(viewportPlan);
      expect(Math.abs(metrics.width * 2 - legacy.width), label).toBeLessThanOrEqual(1);
    }
  });
});
