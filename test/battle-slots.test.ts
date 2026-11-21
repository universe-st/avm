import { describe, expect, it } from 'vitest';
import type { Facing8, SlotId } from '../src/battle/types';
import {
  SLOT_FACING,
  SLOT_ORDER,
  formatSlots,
  hitSlotsFor,
  isBackstabSlot,
  mirrorSlot,
  slotLabel,
  slotsInZones,
  zoneOfSlot,
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

describe('battle slots / zones', () => {
  it('facing left: the whole left side is front, the right side is back', () => {
    expect(zoneOfSlot('left', 'left')).toBe('front');
    expect(zoneOfSlot('upperLeft', 'left')).toBe('front');
    expect(zoneOfSlot('lowerLeft', 'left')).toBe('front');
    expect(zoneOfSlot('right', 'left')).toBe('back');
    expect(zoneOfSlot('upperRight', 'left')).toBe('back');
    expect(zoneOfSlot('lowerRight', 'left')).toBe('back');
  });

  it('facing right: mirror of facing left', () => {
    for (const slot of SLOTS) {
      const leftZone = zoneOfSlot(slot, 'left');
      const rightZone = zoneOfSlot(mirrorSlot(slot), 'right');
      expect(rightZone, `${slot} vs ${mirrorSlot(slot)}`).toBe(leftZone);
    }
  });

  it('back is |relative angle| >= 135, front is <= 45', () => {
    // 面向 45°（右上）时：右上/右是正面，左上/右下是侧面，左/左下是背面。
    expect(zoneOfSlot('upperRight', 'upRight')).toBe('front');
    expect(zoneOfSlot('right', 'upRight')).toBe('front');
    expect(zoneOfSlot('upperLeft', 'upRight')).toBe('side');
    expect(zoneOfSlot('lowerRight', 'upRight')).toBe('side');
    expect(zoneOfSlot('left', 'upRight')).toBe('back');
    expect(zoneOfSlot('lowerLeft', 'upRight')).toBe('back');
  });

  it('every slot is front when the monster turns to face it', () => {
    for (const slot of SLOTS) {
      expect(zoneOfSlot(slot, SLOT_FACING[slot]), slot).toBe('front');
      expect(isBackstabSlot(slot, SLOT_FACING[slot]), slot).toBe(false);
    }
  });

  it('mirror is an involution and never returns the same slot', () => {
    for (const slot of SLOTS) {
      expect(mirrorSlot(mirrorSlot(slot))).toBe(slot);
      expect(mirrorSlot(slot)).not.toBe(slot);
    }
  });

  it('front / front-arc / all hit sets follow the facing', () => {
    expect(hitSlotsFor('left', 'single-front').sort()).toEqual(
      ['left', 'lowerLeft', 'upperLeft'].sort(),
    );
    expect(hitSlotsFor('left', 'front-arc').sort()).toEqual(
      ['left', 'lowerLeft', 'upperLeft'].sort(),
    );
    expect(hitSlotsFor('upRight', 'single-front').sort()).toEqual(
      ['right', 'upperRight'].sort(),
    );
    expect(hitSlotsFor('upRight', 'front-arc')).toHaveLength(4);
    expect(hitSlotsFor('upRight', 'all-slots')).toHaveLength(6);
    expect(slotsInZones('upRight', ['back']).sort()).toEqual(['left', 'lowerLeft'].sort());
  });

  it('formats slot labels for the HUD', () => {
    expect(slotLabel('upperLeft')).toBe('左上');
    expect(formatSlots(['left', 'upperLeft', 'lowerLeft'])).toBe('左/左上/左下');
  });

  it('defines every facing and slot exactly once', () => {
    expect(new Set(FACINGS).size).toBe(8);
    expect(new Set(SLOTS).size).toBe(6);
  });
});
