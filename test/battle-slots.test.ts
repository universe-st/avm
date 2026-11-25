import { describe, expect, it } from 'vitest';
import type { Facing8, SlotId } from '../src/battle/types';
import {
  ADJACENT,
  FACING_ANGLES,
  HIT_FRONT_ARC_MAX,
  HIT_SINGLE_FRONT_MAX,
  PARTY_FILL_ORDER,
  SLOT_COORDS,
  SLOT_ORDER,
  ZONE_BACK_MIN,
  ZONE_FRONT_MAX,
  adjacentSlots,
  allSlots,
  angleFromTo,
  facingFromPoints,
  formatSlots,
  hitPointsFor,
  isAdjacentSlot,
  isBackstabPoint,
  mirrorSlot,
  normalizeDegrees,
  pointDistance,
  shortestStepToward,
  slotLabel,
  zoneOfPoint,
} from '../src/battle/core/slots';

const FACINGS: readonly Facing8[] = [
  'up',
  'upRight',
  'right',
  'downRight',
  'down',
  'downLeft',
  'left',
  'upLeft',
];

const SLOTS: readonly SlotId[] = [...SLOT_ORDER];

const sorted = (slots: readonly SlotId[]): string[] => [...slots].sort();

describe('battle slots / 十一点位四三四', () => {
  it('has 11 unique points on the 4-3-4 grid', () => {
    expect(SLOT_ORDER).toHaveLength(11);
    expect(new Set(SLOT_ORDER).size).toBe(11);
    expect(Object.keys(SLOT_COORDS)).toHaveLength(11);
    expect(Object.keys(ADJACENT)).toHaveLength(11);
    expect(SLOT_ORDER).toContain('center');
    expect(SLOT_ORDER).toContain('upperFarLeft');
    expect(new Set(FACINGS).size).toBe(8);
    // 补位顺序覆盖全部点位、且 left 仍是第一顺位。
    expect(PARTY_FILL_ORDER[0]).toBe('left');
    expect(sorted(PARTY_FILL_ORDER)).toEqual(sorted(SLOT_ORDER));
  });

  it('derives adjacency from grid distance 1 (20 edges, degrees 2/4/5/6)', () => {
    const edges = new Set<string>();
    const degrees: Record<string, number> = {};
    for (const slot of SLOT_ORDER) {
      const adjacent = adjacentSlots(slot);
      expect(adjacent, slot).not.toContain(slot);
      expect(new Set(adjacent).size, slot).toBe(adjacent.length);
      degrees[slot] = adjacent.length;
      for (const next of adjacent) {
        expect(isAdjacentSlot(next, slot), `${slot}↔${next}`).toBe(true);
        edges.add([slot, next].sort().join('↔'));
      }
    }
    expect(edges.size).toBe(20);

    // 四角是死胡同（2），上下排内侧 4，中排两侧 5，中心 6。
    expect(degrees.upperFarLeft).toBe(2);
    expect(degrees.upperFarRight).toBe(2);
    expect(degrees.lowerFarLeft).toBe(2);
    expect(degrees.lowerFarRight).toBe(2);
    expect(degrees.upperLeft).toBe(4);
    expect(degrees.upperRight).toBe(4);
    expect(degrees.lowerLeft).toBe(4);
    expect(degrees.lowerRight).toBe(4);
    expect(degrees.left).toBe(5);
    expect(degrees.right).toBe(5);
    expect(degrees.center).toBe(6);
  });

  it('keeps the old ring points around center and the far points at the row ends', () => {
    expect(sorted(adjacentSlots('center'))).toEqual(
      sorted(['left', 'right', 'upperLeft', 'upperRight', 'lowerLeft', 'lowerRight']),
    );
    expect(sorted(adjacentSlots('left'))).toEqual(
      sorted(['upperFarLeft', 'upperLeft', 'center', 'lowerLeft', 'lowerFarLeft']),
    );
    expect(sorted(adjacentSlots('upperFarLeft'))).toEqual(sorted(['upperLeft', 'left']));
    expect(sorted(adjacentSlots('upperRight'))).toEqual(
      sorted(['upperLeft', 'upperFarRight', 'center', 'right']),
    );
    // 端点是死胡同：中心走不到，必须经过内侧邻点。
    expect(isAdjacentSlot('center', 'upperFarLeft')).toBe(false);
    expect(isAdjacentSlot('upperFarLeft', 'upperFarRight')).toBe(false);
    // 旧的「对边」关系仍然成立，隔着中心的左/右不再相邻。
    expect(isAdjacentSlot('left', 'right')).toBe(false);
    expect(isAdjacentSlot('upperLeft', 'lowerRight')).toBe(false);
    expect(isAdjacentSlot('upperLeft', 'upperRight')).toBe(true);
  });

  it('every point is reachable from every other point (BFS on 11 points)', () => {
    for (const from of SLOTS) {
      const seen = new Set<SlotId>([from]);
      const queue: SlotId[] = [from];
      for (let head = 0; head < queue.length; head += 1) {
        for (const next of adjacentSlots(queue[head]!)) {
          if (seen.has(next)) continue;
          seen.add(next);
          queue.push(next);
        }
      }
      expect(seen.size, from).toBe(11);
    }
  });

  it('measures distance on the 11-point graph (center shortens opposite ring)', () => {
    expect(pointDistance('center', 'center')).toBe(0);
    expect(pointDistance('center', 'left')).toBe(1);
    expect(pointDistance('left', 'right')).toBe(2);
    expect(pointDistance('upperLeft', 'lowerRight')).toBe(2);
    expect(pointDistance('upperLeft', 'upperRight')).toBe(1);
    expect(pointDistance('left', 'right', new Set<SlotId>(['center']))).toBe(3);
    // 端点到对角端点：横跨三列、隔一排，最短 4 步。
    expect(pointDistance('upperFarLeft', 'lowerFarRight')).toBe(4);
  });

  it('takes one step toward a target, avoiding occupied points', () => {
    expect(shortestStepToward('right', 'left', new Set())).toBe('center');
    expect(shortestStepToward('right', 'left', new Set<SlotId>(['center']))).toBe('upperRight');
    // 中心被封死时走内圈（左上/左下）最快；两端要多绕一步。
    expect(shortestStepToward('left', 'right', new Set<SlotId>(['center']))).toBe('upperLeft');
    expect(shortestStepToward('left', 'left', new Set())).toBeNull();
  });

  it('facing left: the whole left side is front, the right side is back', () => {
    expect(zoneOfPoint('left', 'center', 'left')).toBe('front');
    expect(zoneOfPoint('upperLeft', 'center', 'left')).toBe('front');
    expect(zoneOfPoint('lowerLeft', 'center', 'left')).toBe('front');
    expect(zoneOfPoint('right', 'center', 'left')).toBe('back');
    expect(zoneOfPoint('upperRight', 'center', 'left')).toBe('back');
    expect(zoneOfPoint('lowerRight', 'center', 'left')).toBe('back');
  });

  it('facing right: mirror of facing left', () => {
    for (const slot of SLOTS) {
      if (slot === 'center') continue;
      const leftZone = zoneOfPoint(slot, 'center', 'left');
      const rightZone = zoneOfPoint(mirrorSlot(slot), 'center', 'right');
      expect(rightZone, `${slot} vs ${mirrorSlot(slot)}`).toBe(leftZone);
    }
  });

  it('uses the grid thresholds: front ≤60, back ≥120', () => {
    expect([ZONE_FRONT_MAX, ZONE_BACK_MIN]).toEqual([60, 120]);
    expect([HIT_SINGLE_FRONT_MAX, HIT_FRONT_ARC_MAX]).toEqual([30, 120]);
    expect(zoneOfPoint('upperRight', 'center', 'upRight')).toBe('front');
    expect(zoneOfPoint('right', 'center', 'upRight')).toBe('front');
    expect(zoneOfPoint('upperLeft', 'center', 'upRight')).toBe('side');
    expect(zoneOfPoint('lowerRight', 'center', 'upRight')).toBe('side');
    expect(zoneOfPoint('left', 'center', 'upRight')).toBe('back');
    expect(zoneOfPoint('lowerLeft', 'center', 'upRight')).toBe('back');
  });

  it('classifies the full back-stab table: turning your back on any point is back', () => {
    for (const target of SLOTS) {
      for (const attacker of SLOTS) {
        if (attacker === target) continue;
        // 背对来向（8 向量化后误差 ≤22.5°，仍远大于 120° 阈值）。
        const away = facingFromPoints(target, attacker);
        const back = FACINGS[(FACINGS.indexOf(away) + 4) % FACINGS.length]!;
        expect(isBackstabPoint(attacker, target, back), `${target}←${attacker}`).toBe(true);
        expect(zoneOfPoint(attacker, target, back)).toBe('back');
      }
    }
  });

  it('every ring point is front when the monster faces it from center', () => {
    for (const slot of SLOTS) {
      if (slot === 'center') continue;
      const facing = facingFromPoints('center', slot);
      expect(zoneOfPoint(slot, 'center', facing), slot).toBe('front');
      expect(isBackstabPoint(slot, 'center', facing), slot).toBe(false);
    }
  });

  it('quantizes grid directions to the nearest 8-way facing (60° steps)', () => {
    expect(facingFromPoints('left', 'upperLeft')).toBe('upRight');
    expect(facingFromPoints('upperRight', 'right')).toBe('downRight');
    expect(facingFromPoints('right', 'lowerRight')).toBe('downLeft');
    expect(facingFromPoints('lowerLeft', 'left')).toBe('upLeft');
    expect(facingFromPoints('center', 'upperLeft')).toBe('upLeft');
    expect(facingFromPoints('upperLeft', 'center')).toBe('downRight');
    expect(facingFromPoints('center', 'left')).toBe('left');
    expect(facingFromPoints('left', 'center')).toBe('right');
    expect(normalizeDegrees(180)).toBe(-180);
    // 网格邻点方向相差 60°（不是 v2 的 45°）。
    expect(Math.round(angleFromTo('center', 'upperRight'))).toBe(60);
    // normalizeDegrees 把 180 折成 -180（同一个方向）。
    expect(Math.abs(Math.round(angleFromTo('center', 'left')))).toBe(180);
  });

  it('mirror is an involution; center maps to itself; ring never maps to itself', () => {
    for (const slot of SLOTS) {
      expect(mirrorSlot(mirrorSlot(slot))).toBe(slot);
      if (slot === 'center') expect(mirrorSlot(slot)).toBe('center');
      else expect(mirrorSlot(slot)).not.toBe(slot);
    }
    expect(mirrorSlot('upperFarLeft')).toBe('upperFarRight');
    expect(mirrorSlot('lowerFarLeft')).toBe('lowerFarRight');
    expect(mirrorSlot('upperLeft')).toBe('upperRight');
  });

  it('hitPointsFor follows the plan truth table', () => {
    // single-front ±30° 在网格里只剩瞄准的那一个点。
    expect(sorted(hitPointsFor('center', 'left', 'single-front'))).toEqual(['left']);
    expect(sorted(hitPointsFor('center', 'upperRight', 'single-front'))).toEqual(['upperRight']);
    expect(sorted(hitPointsFor('center', 'right', 'single-front'))).toEqual(['right']);
    expect(sorted(hitPointsFor('left', 'center', 'single-front'))).toEqual(['center']);
    expect(sorted(hitPointsFor('left', 'upperLeft', 'single-front'))).toEqual(['upperLeft']);
    expect(sorted(hitPointsFor('upperRight', 'center', 'single-front'))).toEqual(['center']);
    expect(sorted(hitPointsFor('upperFarLeft', 'left', 'single-front'))).toEqual(['left']);

    // front-arc <120°：中心出手正好命中「正面+侧面」3/6。
    expect(sorted(hitPointsFor('center', 'left', 'front-arc'))).toEqual(
      sorted(['left', 'upperLeft', 'lowerLeft']),
    );
    // 中心朝右上时左右两侧各 60°，都算正面/侧面扇区（3 个），背后 3 个打不到。
    expect(sorted(hitPointsFor('center', 'upperRight', 'front-arc'))).toEqual(
      sorted(['upperLeft', 'upperRight', 'right']),
    );
    expect(sorted(hitPointsFor('center', 'right', 'front-arc'))).toEqual(
      sorted(['right', 'upperRight', 'lowerRight']),
    );
    expect(sorted(hitPointsFor('left', 'center', 'front-arc'))).toEqual(
      sorted(['center', 'upperLeft', 'lowerLeft']),
    );
    // 端点只有 2 个邻点：横扫能覆盖到其中一个斜向邻点，但够不到另一侧。
    expect(sorted(hitPointsFor('left', 'upperLeft', 'front-arc'))).toEqual(
      sorted(['center', 'upperLeft', 'upperFarLeft']),
    );
    expect(sorted(hitPointsFor('upperRight', 'center', 'front-arc'))).toEqual(
      sorted(['center', 'right', 'upperLeft']),
    );

    expect(hitPointsFor('center', 'left', 'all-slots')).toHaveLength(11);
    expect(allSlots()).toHaveLength(11);
  });

  it('single-front hits exactly the aimed point for every origin/aim pair', () => {
    for (const origin of SLOTS) {
      for (const aim of adjacentSlots(origin)) {
        expect(hitPointsFor(origin, aim, 'single-front'), `${origin}→${aim}`).toEqual([aim]);
      }
    }
  });

  it('front-arc never reaches behind the origin', () => {
    for (const origin of SLOTS) {
      for (const aim of SLOTS) {
        if (aim === origin) continue;
        const aimAngle = angleFromTo(origin, aim);
        for (const hit of hitPointsFor(origin, aim, 'front-arc')) {
          const delta = Math.abs(normalizeDegrees(angleFromTo(origin, hit) - aimAngle));
          expect(delta, `${origin}→${aim} hits ${hit}`).toBeLessThan(HIT_FRONT_ARC_MAX);
        }
      }
    }
  });

  it('produces a valid zone for every 11x11 attacker/target/facing combination', () => {
    for (const attacker of SLOTS) {
      for (const target of SLOTS) {
        if (attacker === target) continue;
        for (const facing of FACINGS) {
          const zone = zoneOfPoint(attacker, target, facing);
          expect(['front', 'side', 'back']).toContain(zone);
          expect(Number.isFinite(FACING_ANGLES[facing])).toBe(true);
        }
      }
    }
  });

  it('formats labels and hit sets for the HUD', () => {
    expect(slotLabel('center')).toBe('中');
    expect(slotLabel('upperLeft')).toBe('左上');
    expect(slotLabel('upperFarLeft')).toBe('左上端');
    expect(slotLabel('upperFarRight')).toBe('右上端');
    expect(slotLabel('lowerFarLeft')).toBe('左下端');
    expect(slotLabel('lowerFarRight')).toBe('右下端');
    expect(formatSlots(['left', 'upperLeft', 'lowerLeft'])).toBe('左/左上/左下');
    expect(formatSlots(['center', 'left'])).toBe('中/左');
  });
});
