import { describe, expect, it } from 'vitest';
import { planBattleLayout } from '../src/battle/layout';

const HEIGHTS = [1100, 1180, 1280, 1440, 1558, 1700] as const;

describe('battle layout', () => {
  it('keeps the ring and the monster inside the safe field for every design height', () => {
    for (const height of HEIGHTS) {
      const layout = planBattleLayout(720, height);
      const label = `h=${height}`;

      expect(layout.fieldBottom, label).toBeGreaterThan(layout.fieldTop + 240);
      expect(layout.monsterHeadY, label).toBeGreaterThanOrEqual(layout.fieldTop);
      expect(layout.monster.y, label).toBeLessThanOrEqual(layout.fieldBottom - 16);

      const upperFeet = Math.min(
        layout.slots.upperLeft.y,
        layout.slots.upperRight.y,
      );
      const lowerFeet = Math.max(
        layout.slots.lowerLeft.y,
        layout.slots.lowerRight.y,
      );
      expect(upperFeet - layout.playerHeadOffset, `${label} upper head`).toBeGreaterThanOrEqual(
        layout.fieldTop,
      );
      expect(lowerFeet, `${label} lower feet`).toBeLessThanOrEqual(layout.fieldBottom - 8);
    }
  });

  it('keeps every slot inside the horizontal safe area and keeps them apart', () => {
    for (const height of HEIGHTS) {
      const layout = planBattleLayout(720, height);
      const points = Object.values(layout.slots);
      for (const point of points) {
        expect(point.x).toBeGreaterThan(50);
        expect(point.x).toBeLessThan(670);
      }
      for (let i = 0; i < points.length; i += 1) {
        for (let j = i + 1; j < points.length; j += 1) {
          const dx = points[i]!.x - points[j]!.x;
          const dy = points[i]!.y - points[j]!.y;
          expect(Math.hypot(dx, dy), `h=${height} slot ${i}/${j}`).toBeGreaterThan(90);
        }
      }
    }
  });

  it('is symmetric around the vertical centre line', () => {
    const layout = planBattleLayout(720, 1280);
    expect(layout.slots.left.y).toBe(layout.slots.right.y);
    expect(layout.slots.upperLeft.y).toBe(layout.slots.upperRight.y);
    expect(layout.slots.lowerLeft.y).toBe(layout.slots.lowerRight.y);
    expect(layout.slots.left.x + layout.slots.right.x).toBe(720);
    expect(layout.slots.upperLeft.x + layout.slots.upperRight.x).toBe(720);
    expect(layout.monster.x).toBe(360);
  });

  it('grows with the viewport but clamps the vertical radius', () => {
    const short = planBattleLayout(720, 1100);
    const tall = planBattleLayout(720, 1558);
    const shortRadius = short.slots.left.y - short.slots.upperLeft.y;
    const tallRadius = tall.slots.left.y - tall.slots.upperLeft.y;
    expect(tallRadius).toBeGreaterThanOrEqual(shortRadius);
    expect(tallRadius).toBeLessThanOrEqual(190);
    expect(shortRadius).toBeGreaterThanOrEqual(96);
  });
});
