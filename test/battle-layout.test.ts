import { describe, expect, it } from 'vitest';
import { battleRailHeight, planBattleLayout } from '../src/battle/layout';
import { SLOT_ORDER, adjacentSlots } from '../src/battle/core/slots';

const HEIGHTS = [1100, 1180, 1280, 1440, 1558, 1700] as const;

describe('battle layout (7 points)', () => {
  it('has 7 slots and puts center on the old monster foot point', () => {
    const layout = planBattleLayout(720, 1280);
    expect(SLOT_ORDER).toHaveLength(7);
    expect(Object.keys(layout.slots)).toHaveLength(7);
    expect(layout.slots.center).toEqual(layout.centerPoint);
    expect(layout.centerPoint.x).toBe(360);
    expect(layout.center).toEqual({ x: 360, y: layout.center.y });
  });

  it('uses one 64 rail for every monster count', () => {
    expect(battleRailHeight()).toBe(64);

    const two = planBattleLayout(720, 1280);
    expect(two.railHeight).toBe(64);
    expect(two.fieldTop).toBe(192);
    const three = planBattleLayout(720, 1280);
    expect(three.railHeight).toBe(64);
    expect(three.fieldTop).toBe(192);
  });

  it('keeps the 7 points inside the safe field for every design height', () => {
    for (const height of HEIGHTS) {
      const layout = planBattleLayout(720, height);
      const label = `h=${height}`;

      expect(layout.fieldBottom, label).toBeGreaterThan(layout.fieldTop + 240);
      expect(layout.centerPoint.y, label).toBeLessThanOrEqual(layout.fieldBottom - 16);
      expect(layout.centerPoint.y, label).toBeGreaterThan(layout.fieldTop);

      const upperFeet = Math.min(layout.slots.upperLeft.y, layout.slots.upperRight.y);
      const lowerFeet = Math.max(layout.slots.lowerLeft.y, layout.slots.lowerRight.y);
      expect(upperFeet - layout.playerHeadOffset, `${label} upper head`).toBeGreaterThanOrEqual(
        layout.fieldTop,
      );
      // 御厨/帮厨约 200 高：上排站位不能顶进行动表。
      expect(upperFeet - 200, `${label} upper enemy head`).toBeGreaterThanOrEqual(
        layout.fieldTop,
      );
      expect(lowerFeet, `${label} lower feet`).toBeLessThanOrEqual(layout.fieldBottom - 8);
    }
  });

  it('keeps every point inside the safe area and keeps them apart', () => {
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

  it('puts every adjacent pair at the same visual distance (regular hexagon)', () => {
    for (const height of HEIGHTS) {
      const layout = planBattleLayout(720, height);
      const distances: number[] = [];
      for (const slot of SLOT_ORDER) {
        for (const next of adjacentSlots(slot)) {
          if (slot < next) continue;
          const a = layout.slots[slot];
          const b = layout.slots[next];
          distances.push(Math.hypot(a.x - b.x, a.y - b.y));
        }
      }
      expect(distances.length, `h=${height}`).toBe(12);
      const first = distances[0]!;
      for (const distance of distances) {
        expect(Math.abs(distance - first), `h=${height}`).toBeLessThanOrEqual(1.01);
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
    expect(layout.centerPoint.x).toBe(360);
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
