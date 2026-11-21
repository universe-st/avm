import type { Facing8, SlotId, Zone } from '../types';

/**
 * 站位 / 朝向 / 背袭的纯几何。
 *
 * 角度用屏幕坐标（0° = 正右，90° = 正上，逆时针为正），所以：
 * - 玩家在左（180°）时，要面向右（0°）看怪物；
 * - 怪物面向左（180°）时，左/左上/左下都在它的背面。
 *
 * **背面判定是 `|相对角| ≥ 135°`**（不是 >90°）：
 * 6 个站位按 45° 递增，正右朝向时左/左上/左下（135/180/225）才是背后，
 * 45° 的斜前方不算；面向 45° 时只有两个斜后格吃背袭。与 `docs/DESIGN-BATTLE.md` 一致。
 */

/** 6 个站位的角度（屏幕坐标）。 */
export const SLOT_ANGLES: Readonly<Record<SlotId, number>> = {
  right: 0,
  upperRight: 45,
  upperLeft: 135,
  left: 180,
  lowerLeft: 225,
  lowerRight: 315,
};

/** 8 个朝向的角度（屏幕坐标）。 */
export const FACING_ANGLES: Readonly<Record<Facing8, number>> = {
  right: 0,
  upRight: 45,
  up: 90,
  upLeft: 135,
  left: 180,
  downLeft: 225,
  down: 270,
  downRight: 315,
};

export const SLOT_ORDER: readonly SlotId[] = [
  'right',
  'upperRight',
  'upperLeft',
  'left',
  'lowerLeft',
  'lowerRight',
];

export const SLOT_LABELS: Readonly<Record<SlotId, string>> = {
  right: '右',
  upperRight: '右上',
  upperLeft: '左上',
  left: '左',
  lowerLeft: '左下',
  lowerRight: '右下',
};

export const FACING_LABELS: Readonly<Record<Facing8, string>> = {
  up: '上',
  upRight: '右上',
  right: '右',
  downRight: '右下',
  down: '下',
  downLeft: '左下',
  left: '左',
  upLeft: '左上',
};

/** 站位 → 指向该站位的朝向（怪物转向用）。 */
export const SLOT_FACING: Readonly<Record<SlotId, Facing8>> = {
  right: 'right',
  upperRight: 'upRight',
  upperLeft: 'upLeft',
  left: 'left',
  lowerLeft: 'downLeft',
  lowerRight: 'downRight',
};

/** 把角度归一到 (-180, 180]。180 会保留为 -180，两者 |·| 相同，不影响判定。 */
export function normalizeDegrees(degrees: number): number {
  const wrapped = ((degrees + 180) % 360 + 360) % 360 - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/** 某站位相对怪物朝向的角度；负 = 朝向前方偏右/左（取决于坐标系），只用绝对值。 */
export function relativeAngle(slot: SlotId, facing: Facing8): number {
  return normalizeDegrees(SLOT_ANGLES[slot] - FACING_ANGLES[facing]);
}

/**
 * 站位相对朝向的区域。
 *
 * - `|rel| ≤ 45°`：正面（站位正对怪物脸，或左右各 45° 内）
 * - `45° < |rel| < 135°`：侧面（斜侧，可躲开只打正面的技能）
 * - `|rel| ≥ 135°`：背面（背袭）
 */
export function zoneOfSlot(slot: SlotId, facing: Facing8): Zone {
  const delta = Math.abs(relativeAngle(slot, facing));
  if (delta <= 45) return 'front';
  if (delta < 135) return 'side';
  return 'back';
}

/** 是否吃背袭。 */
export function isBackstabSlot(slot: SlotId, facing: Facing8): boolean {
  return zoneOfSlot(slot, facing) === 'back';
}

/** 镜像站位：相对怪物中心点对称（左↔右、左上↔右下、左下↔右上）。 */
export function mirrorSlot(slot: SlotId): SlotId {
  switch (slot) {
    case 'right':
      return 'left';
    case 'left':
      return 'right';
    case 'upperRight':
      return 'lowerLeft';
    case 'lowerLeft':
      return 'upperRight';
    case 'upperLeft':
      return 'lowerRight';
    case 'lowerRight':
      return 'upperLeft';
  }
}

/** 所有落在指定区域内的站位（按 `SLOT_ORDER`）。 */
export function slotsInZones(
  facing: Facing8,
  zones: readonly Zone[],
): SlotId[] {
  return SLOT_ORDER.filter((slot) => zones.includes(zoneOfSlot(slot, facing)));
}

/** 「正面 + 侧面」= 横扫类技能的覆盖范围。 */
export function frontArcSlots(facing: Facing8): SlotId[] {
  return slotsInZones(facing, ['front', 'side']);
}

/** 仅正面。 */
export function frontSlots(facing: Facing8): SlotId[] {
  return slotsInZones(facing, ['front']);
}

/** 全站位（震地 / AOE）。 */
export function allSlots(): SlotId[] {
  return [...SLOT_ORDER];
}

/** 根据技能命中类型给出会被覆盖的站位。 */
export function hitSlotsFor(
  facing: Facing8,
  hit: 'single-front' | 'front-arc' | 'all-slots',
): SlotId[] {
  if (hit === 'all-slots') return allSlots();
  if (hit === 'front-arc') return frontArcSlots(facing);
  return frontSlots(facing);
}

/** 站位中文名。 */
export function slotLabel(slot: SlotId): string {
  return SLOT_LABELS[slot];
}

/** 朝向中文名。 */
export function facingLabel(facing: Facing8): string {
  return FACING_LABELS[facing];
}

/** 站位列表 → 「左/左上/左下」。 */
export function formatSlots(slots: readonly SlotId[]): string {
  return slots.map(slotLabel).join('/');
}

/**
 * 环上相邻的站位（一次移动只能走一格）。
 *
 * `SLOT_ORDER` 本身就是环的顺时针顺序：
 * right → upperRight → upperLeft → left → lowerLeft → lowerRight → right。
 * 所以相邻 = 前后各一个；对面（left↔right、upperLeft↔lowerRight 等）不可一步走到，
 * 只有解离突刺的闪现可以跨到镜相对位。
 */
export function adjacentSlots(slot: SlotId): SlotId[] {
  const index = SLOT_ORDER.indexOf(slot);
  if (index < 0) return [];
  const count = SLOT_ORDER.length;
  return [
    SLOT_ORDER[(index + 1) % count]!,
    SLOT_ORDER[(index + count - 1) % count]!,
  ];
}

export function isAdjacentSlot(from: SlotId, to: SlotId): boolean {
  return adjacentSlots(from).includes(to);
}
