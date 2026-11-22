import { describe, expect, it } from 'vitest';
import type { Facing8, SlotId } from '../src/battle/types';
import {
  FACING_ANGLES,
  RING_ORDER,
  SLOT_ORDER,
  adjacentSlots,
  allSlots,
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

describe('battle slots / 七点位', () => {
  it('has 7 unique points: center + 6 ring', () => {
    expect(SLOT_ORDER).toHaveLength(7);
    expect(new Set(SLOT_ORDER).size).toBe(7);
    expect(RING_ORDER).toHaveLength(6);
    expect(SLOT_ORDER).toContain('center');
    expect(RING_ORDER).not.toContain('center');
    expect(new Set(FACINGS).size).toBe(8);
  });

  it('center is adjacent to all ring points; a ring has center + two ring neighbours', () => {
    expect(sorted(adjacentSlots('center'))).toEqual(sorted(RING_ORDER));
    for (const slot of RING_ORDER) {
      const adjacent = adjacentSlots(slot);
      expect(adjacent).toHaveLength(3);
      expect(adjacent).toContain('center');
      expect(adjacent).not.toContain(slot);
      expect(isAdjacentSlot('center', slot)).toBe(true);
      expect(isAdjacentSlot(slot, 'center')).toBe(true);
    }
    expect(sorted(adjacentSlots('left'))).toEqual(sorted(['center', 'upperLeft', 'lowerLeft']));
    expect(isAdjacentSlot('left', 'right')).toBe(false);
    expect(isAdjacentSlot('upperLeft', 'lowerRight')).toBe(false);
  });

  it('measures distance on the 7-point graph (center shortens opposite ring)', () => {
    expect(pointDistance('center', 'center')).toBe(0);
    expect(pointDistance('center', 'left')).toBe(1);
    expect(pointDistance('left', 'right')).toBe(2);
    expect(pointDistance('upperLeft', 'lowerRight')).toBe(2);
    expect(pointDistance('upperLeft', 'upperRight')).toBe(1);
    expect(pointDistance('left', 'right', new Set<SlotId>(['center']))).toBe(3);
  });

  it('takes one step toward a target, avoiding occupied points', () => {
    expect(shortestStepToward('right', 'left', new Set())).toBe('center');
    expect(shortestStepToward('right', 'left', new Set<SlotId>(['center']))).toBe('upperRight');
    expect(shortestStepToward('left', 'right', new Set<SlotId>(['center']))).toBe('lowerLeft');
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

  it('back is |relative angle| >= 135, front is <= 45', () => {
    expect(zoneOfPoint('upperRight', 'center', 'upRight')).toBe('front');
    expect(zoneOfPoint('right', 'center', 'upRight')).toBe('front');
    expect(zoneOfPoint('upperLeft', 'center', 'upRight')).toBe('side');
    expect(zoneOfPoint('lowerRight', 'center', 'upRight')).toBe('side');
    expect(zoneOfPoint('left', 'center', 'upRight')).toBe('back');
    expect(zoneOfPoint('lowerLeft', 'center', 'upRight')).toBe('back');
  });

  it('every ring point is front when the monster faces it from center', () => {
    for (const slot of RING_ORDER) {
      const facing = facingFromPoints('center', slot);
      expect(zoneOfPoint(slot, 'center', facing), slot).toBe('front');
      expect(isBackstabPoint(slot, 'center', facing), slot).toBe(false);
    }
  });

  it('resolves 67.5/112.5 degree ties to the tangential diagonal', () => {
    expect(facingFromPoints('left', 'upperLeft')).toBe('upRight');
    expect(facingFromPoints('upperRight', 'right')).toBe('downRight');
    expect(facingFromPoints('right', 'lowerRight')).toBe('downLeft');
    expect(facingFromPoints('lowerLeft', 'left')).toBe('upLeft');
    expect(facingFromPoints('center', 'upperLeft')).toBe('upLeft');
    expect(facingFromPoints('upperLeft', 'center')).toBe('downRight');
    expect(facingFromPoints('center', 'left')).toBe('left');
    expect(facingFromPoints('left', 'center')).toBe('right');
    expect(normalizeDegrees(180)).toBe(-180);
  });

  it('mirror is an involution; center maps to itself; ring never maps to itself', () => {
    for (const slot of SLOTS) {
      expect(mirrorSlot(mirrorSlot(slot))).toBe(slot);
      if (slot === 'center') expect(mirrorSlot(slot)).toBe('center');
      else expect(mirrorSlot(slot)).not.toBe(slot);
    }
  });

  it('hitPointsFor follows the plan truth table', () => {
    expect(sorted(hitPointsFor('center', 'left', 'single-front'))).toEqual(
      sorted(['left', 'upperLeft', 'lowerLeft']),
    );
    expect(sorted(hitPointsFor('center', 'left', 'front-arc'))).toEqual(
      sorted(['left', 'upperLeft', 'lowerLeft']),
    );
    expect(sorted(hitPointsFor('center', 'upperRight', 'single-front'))).toEqual(
      sorted(['right', 'upperRight']),
    );
    expect(sorted(hitPointsFor('center', 'upperRight', 'front-arc'))).toEqual(
      sorted(['right', 'upperRight', 'upperLeft', 'lowerRight']),
    );
    expect(sorted(hitPointsFor('center', 'right', 'single-front'))).toEqual(
      sorted(['right', 'upperRight', 'lowerRight']),
    );
    expect(sorted(hitPointsFor('left', 'center', 'single-front'))).toEqual(['center']);
    expect(sorted(hitPointsFor('left', 'center', 'front-arc'))).toEqual(
      sorted(['center', 'upperLeft', 'lowerLeft']),
    );
    expect(sorted(hitPointsFor('left', 'upperLeft', 'single-front'))).toEqual(['upperLeft']);
    expect(sorted(hitPointsFor('left', 'upperLeft', 'front-arc'))).toEqual(
      sorted(['center', 'upperLeft']),
    );
    expect(sorted(hitPointsFor('upperRight', 'center', 'single-front'))).toEqual(
      sorted(['center', 'upperLeft']),
    );
    expect(sorted(hitPointsFor('upperRight', 'center', 'front-arc'))).toEqual(
      sorted(['center', 'upperLeft', 'right']),
    );
    expect(hitPointsFor('center', 'left', 'all-slots')).toHaveLength(7);
    expect(allSlots()).toHaveLength(7);
  });

  it('produces a valid zone for every 7x7 attacker/target/facing combination', () => {
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
    expect(formatSlots(['left', 'upperLeft', 'lowerLeft'])).toBe('左/左上/左下');
    expect(formatSlots(['center', 'left'])).toBe('中/左');
  });
});
