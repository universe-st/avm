import { describe, expect, it } from 'vitest';
import type { BattleEnemySetup, BattleSetup } from '../src/battle/types';
import { BATTLE_LAYOUT, battleRailHeight, planBattleLayout, slotHitCircle } from '../src/battle/layout';
import { ADJACENT, SLOT_ORDER, adjacentSlots } from '../src/battle/core/slots';
import { placeUnits } from '../src/battle/core/placement';
import { CH01_KITCHEN_BATTLE } from '../src/battle/data/ch01-kitchen';

const HEIGHTS = [1100, 1180, 1280, 1440, 1558, 1700] as const;

const UPPER_ROW = ['upperFarLeft', 'upperLeft', 'upperRight', 'upperFarRight'] as const;
const LOWER_ROW = ['lowerFarLeft', 'lowerLeft', 'lowerRight', 'lowerFarRight'] as const;

describe('battle layout (11 points, 4-3-4)', () => {
  it('has 11 slots and puts center on the old monster foot point', () => {
    const layout = planBattleLayout(720, 1280);
    expect(SLOT_ORDER).toHaveLength(11);
    expect(Object.keys(layout.slots)).toHaveLength(11);
    expect(layout.slots.center).toEqual(layout.centerPoint);
    expect(layout.centerPoint.x).toBe(360);
    expect(layout.center).toEqual({ x: 360, y: layout.center.y });
    // 三排：上 4 / 中 3 / 下 4。
    expect(UPPER_ROW.filter((slot) => layout.slots[slot].y < layout.center.y)).toHaveLength(4);
    expect(LOWER_ROW.filter((slot) => layout.slots[slot].y > layout.center.y)).toHaveLength(4);
    expect(layout.spacing).toBe(BATTLE_LAYOUT.maxSpacing);
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

  it('keeps the 11 points inside the safe field for every design height', () => {
    for (const height of HEIGHTS) {
      const layout = planBattleLayout(720, height);
      const label = `h=${height}`;

      expect(layout.fieldBottom, label).toBeGreaterThan(layout.fieldTop + 240);
      expect(layout.centerPoint.y, label).toBeLessThanOrEqual(layout.fieldBottom - 16);
      expect(layout.centerPoint.y, label).toBeGreaterThan(layout.fieldTop);

      const upperFeet = Math.min(...UPPER_ROW.map((slot) => layout.slots[slot].y));
      const lowerFeet = Math.max(...LOWER_ROW.map((slot) => layout.slots[slot].y));
      expect(upperFeet - layout.playerHeadOffset, `${label} upper head`).toBeGreaterThanOrEqual(
        layout.fieldTop,
      );
      // 御厨/帮厨约 200 高：上排站位不能顶进行动表。
      expect(upperFeet - 200, `${label} upper enemy head`).toBeGreaterThanOrEqual(
        layout.fieldTop,
      );
      expect(lowerFeet, `${label} lower feet`).toBeLessThanOrEqual(layout.fieldBottom - 8);
      // 四角是横向最外沿，不能被屏幕切掉。
      expect(Math.min(layout.slots.upperFarLeft.x, layout.slots.lowerFarLeft.x), label).toBeGreaterThan(50);
      expect(
        Math.max(layout.slots.upperFarRight.x, layout.slots.lowerFarRight.x),
        label,
      ).toBeLessThan(670);
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

  it('puts every adjacent pair at the same visual distance (20 edges)', () => {
    for (const height of HEIGHTS) {
      const layout = planBattleLayout(720, height);
      const distances: number[] = [];
      for (const slot of SLOT_ORDER) {
        for (const next of ADJACENT[slot]) {
          if (slot < next) continue;
          const a = layout.slots[slot];
          const b = layout.slots[next];
          distances.push(Math.hypot(a.x - b.x, a.y - b.y));
        }
      }
      expect(distances.length, `h=${height}`).toBe(20);
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
    expect(layout.slots.upperFarLeft.y).toBe(layout.slots.upperFarRight.y);
    expect(layout.slots.left.x + layout.slots.right.x).toBe(720);
    expect(layout.slots.upperLeft.x + layout.slots.upperRight.x).toBe(720);
    expect(layout.slots.upperFarLeft.x + layout.slots.upperFarRight.x).toBe(720);
    expect(layout.slots.lowerFarLeft.x + layout.slots.lowerFarRight.x).toBe(720);
    expect(layout.centerPoint.x).toBe(360);
  });

  it('clamps spacing between minSpacing and maxSpacing as the viewport changes', () => {
    const short = planBattleLayout(720, 1100);
    const tall = planBattleLayout(720, 1558);

    // 172 由横向预算卡死（1.5s ≤ 258），足够高的视口一律封顶。
    expect(planBattleLayout(720, 1280).spacing).toBe(BATTLE_LAYOUT.maxSpacing);
    expect(tall.spacing).toBe(BATTLE_LAYOUT.maxSpacing);
    // 1100 高时由「上排头顶留 8px」压到约 114。
    expect(Math.round(short.spacing)).toBe(114);
    for (const height of HEIGHTS) {
      const spacing = planBattleLayout(720, height).spacing;
      expect(spacing, `h=${height}`).toBeGreaterThanOrEqual(BATTLE_LAYOUT.minSpacing);
      expect(spacing, `h=${height}`).toBeLessThanOrEqual(BATTLE_LAYOUT.maxSpacing);
    }
  });
});

describe('battle placement capacity (11 points)', () => {
  const player = CH01_KITCHEN_BATTLE.party[0]!;
  const template = CH01_KITCHEN_BATTLE.enemies[1]!;

  /** 不带点位的怪物（placement 会从空点位里按 seed 抽）。 */
  const spawn = (count: number): BattleEnemySetup[] => {
    const { slot: _slot, ...rest } = template;
    return Array.from({ length: count }, (_, index) => ({ ...rest, id: `spawn-${index}` }));
  };

  const setupWith = (enemies: BattleEnemySetup[]): BattleSetup => ({
    ...CH01_KITCHEN_BATTLE,
    party: [{ ...player, slot: 'left' }],
    enemies,
  });

  it('can place 11 units and rejects the 12th with a clear error', () => {
    const eleven = placeUnits(setupWith(spawn(10)), 5);
    const slots = [...eleven.partySlots, ...eleven.enemySlots];
    expect(slots).toHaveLength(11);
    expect(new Set(slots).size).toBe(11);
    expect(eleven.partySlots[0]).toBe('left');

    expect(() => placeUnits(setupWith(spawn(11)), 5)).toThrow(/点位不足：最多只能放 11 个单位/);
  });

  it('fills default party slots in PARTY_FILL_ORDER (left first)', () => {
    const party = Array.from({ length: 11 }, (_, index) => ({
      ...player,
      id: `party-${index}`,
      slot: undefined,
    }));
    const { partySlots } = placeUnits({ ...CH01_KITCHEN_BATTLE, party, enemies: [] }, 1);
    expect(partySlots[0]).toBe('left');
    expect(new Set(partySlots).size).toBe(11);
    expect(partySlots).toEqual([
      'left',
      'right',
      'lowerLeft',
      'lowerRight',
      'center',
      'upperLeft',
      'upperRight',
      'upperFarLeft',
      'upperFarRight',
      'lowerFarLeft',
      'lowerFarRight',
    ]);
  });

  it('keeps adjacent lists sorted by SLOT_ORDER for deterministic AI picks', () => {
    for (const slot of SLOT_ORDER) {
      const indices = adjacentSlots(slot).map((next) => SLOT_ORDER.indexOf(next));
      expect(indices, slot).toEqual([...indices].sort((a, b) => a - b));
    }
  });

  it('uses a circular slot hit area that never overlaps its neighbours', () => {
    // 圆底贴脚底：offsetY == radius；直径不超过间距 → 相邻点位点击区不重叠。
    for (const spacing of [BATTLE_LAYOUT.minSpacing, 114, 130, BATTLE_LAYOUT.maxSpacing]) {
      const { radius, offsetY } = slotHitCircle(spacing);
      expect(offsetY, `spacing=${spacing}`).toBe(radius);
      expect(radius * 2, `spacing=${spacing}`).toBeLessThanOrEqual(spacing);
      expect(radius, `spacing=${spacing}`).toBeGreaterThanOrEqual(24);
    }
    // 上限 65（手机 172 间距时到顶），短屏 114 时收到 52。
    expect(slotHitCircle(172).radius).toBe(65);
    expect(slotHitCircle(114).radius).toBe(52);
    expect(slotHitCircle(96).radius).toBe(44);
  });
});
