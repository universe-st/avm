import type { Facing8, SlotId, Zone } from '../types';

/**
 * 7 点位 / 朝向 / 背袭 / 相邻 / 命中集合的纯几何。
 *
 * 角度用屏幕坐标（0° = 正右，90° = 正上，逆时针为正）。
 * 环位按规范角度 0/45/135/180/225/315°（与 v2 的 45° 环一致）；`center` 是原点。
 *
 * **不要直接把两个点角度分别归一化后相减**：180 会被折成 -180，
 * `center→left` 会漏掉左上/左下。所有“差”都走 `normalizeDegrees(a - b)`。
 */

/** 6 个环位的顺时针/逆时针顺序（相邻关系用）。 */
export const RING_ORDER: readonly SlotId[] = [
  'right',
  'upperRight',
  'upperLeft',
  'left',
  'lowerLeft',
  'lowerRight',
];

/** 7 个点位的遍历顺序：先环位、最后中心（画环/标签/高亮用）。 */
export const SLOT_ORDER: readonly SlotId[] = [...RING_ORDER, 'center'];

/** 环位角度（屏幕坐标）。 */
export const RING_ANGLES: Readonly<Record<Exclude<SlotId, 'center'>, number>> = {
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

/** 8 向的遍历顺序（平局裁决用；顺序本身不影响结果）。 */
const FACING_ORDER: readonly Facing8[] = [
  'right',
  'upRight',
  'up',
  'upLeft',
  'left',
  'downLeft',
  'down',
  'downRight',
];

/** 点位的单位向量；center 是原点。 */
export const POINT_VECTORS: Readonly<Record<SlotId, { readonly x: number; readonly y: number }>> = {
  center: { x: 0, y: 0 },
  right: { x: 1, y: 0 },
  upperRight: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  upperLeft: { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  left: { x: -1, y: 0 },
  lowerLeft: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  lowerRight: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
};

export const SLOT_LABELS: Readonly<Record<SlotId, string>> = {
  center: '中',
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

/** 把角度归一到 (-180, 180]；-180 表示 180。 */
export function normalizeDegrees(degrees: number): number {
  const wrapped = ((degrees + 180) % 360 + 360) % 360 - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/** 从 from 指向 to 的角度（屏幕坐标）；同点返回 0（数据错误时防御性兜底）。 */
export function angleFromTo(from: SlotId, to: SlotId): number {
  if (from === to) return 0;
  const a = POINT_VECTORS[from];
  const b = POINT_VECTORS[to];
  return normalizeDegrees(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI);
}

/**
 * 角度 → 最近 8 向。
 *
 * 环位之间会出现 67.5°/112.5° 这种正好夹在两向中间的方向（左→左上、右上→右等）。
 * 平局取 `|cos|` 更大的一向（环的切线/斜向），避免不同实现的舍入差。
 */
export function facingFromAngle(degrees: number): Facing8 {
  const angle = normalizeDegrees(degrees);
  let best: Facing8 = 'right';
  let bestDiff = Number.POSITIVE_INFINITY;
  let bestCos = -1;
  for (const facing of FACING_ORDER) {
    const diff = Math.abs(normalizeDegrees(angle - FACING_ANGLES[facing]));
    const cos = Math.abs(Math.cos((FACING_ANGLES[facing] * Math.PI) / 180));
    if (
      diff < bestDiff - 1e-9 ||
      (Math.abs(diff - bestDiff) <= 1e-9 && cos > bestCos + 1e-12)
    ) {
      best = facing;
      bestDiff = diff;
      bestCos = cos;
    }
  }
  return best;
}

/** 两点方向 → 最近 8 向。 */
export function facingFromPoints(from: SlotId, to: SlotId): Facing8 {
  return facingFromAngle(angleFromTo(from, to));
}

/**
 * attacker 相对 target 朝向的区域。
 *
 * - `|rel| ≤ 45°`：正面
 * - `45° < |rel| < 135°`：侧面
 * - `|rel| ≥ 135°`：背面（背袭）
 */
export function zoneOfPoint(attacker: SlotId, target: SlotId, targetFacing: Facing8): Zone {
  const delta = Math.abs(
    normalizeDegrees(angleFromTo(target, attacker) - FACING_ANGLES[targetFacing]),
  );
  if (delta <= 45) return 'front';
  if (delta < 135) return 'side';
  return 'back';
}

/** 是否吃背袭。 */
export function isBackstabPoint(attacker: SlotId, target: SlotId, targetFacing: Facing8): boolean {
  return zoneOfPoint(attacker, target, targetFacing) === 'back';
}

/** 环上/中心相邻点位；center ↔ 6 环，环 ↔ center + 两个环邻。 */
export function adjacentSlots(slot: SlotId): SlotId[] {
  if (slot === 'center') return [...RING_ORDER];
  const index = RING_ORDER.indexOf(slot);
  if (index < 0) return [];
  const count = RING_ORDER.length;
  return [
    'center',
    RING_ORDER[(index + 1) % count]!,
    RING_ORDER[(index + count - 1) % count]!,
  ];
}

export function isAdjacentSlot(from: SlotId, to: SlotId): boolean {
  return adjacentSlots(from).includes(to);
}

/** 全部 7 个点位。 */
export function allSlots(): SlotId[] {
  return [...SLOT_ORDER];
}

/**
 * 技能命中集合（只服务怪物技能/意图；玩家解离突刺是单一目标）。
 *
 * 先取 origin 的相邻点，再按 aim 方向过滤：
 * - single-front：角差 ≤45°
 * - front-arc：角差 <135°（正好 135° 按背面排除）
 * - all-slots：全部 7 点
 */
export function hitPointsFor(
  origin: SlotId,
  aim: SlotId,
  hit: 'single-front' | 'front-arc' | 'all-slots',
): SlotId[] {
  if (hit === 'all-slots') return allSlots();
  const aimAngle = angleFromTo(origin, aim);
  const matched = new Set<SlotId>();
  for (const point of adjacentSlots(origin)) {
    const delta = Math.abs(normalizeDegrees(angleFromTo(origin, point) - aimAngle));
    if (hit === 'single-front' ? delta <= 45 + 1e-9 : delta < 135 - 1e-9) {
      matched.add(point);
    }
  }
  return SLOT_ORDER.filter((point) => matched.has(point));
}

/** 镜像点位：以战场中心对称（center→center）。 */
export function mirrorSlot(slot: SlotId): SlotId {
  switch (slot) {
    case 'center':
      return 'center';
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

/** 7 点图上的最短步数；`blocked` 为不可经过的点（起点除外）。 */
export function pointDistance(
  from: SlotId,
  to: SlotId,
  blocked: ReadonlySet<SlotId> = new Set(),
): number {
  if (from === to) return 0;
  const distance = new Map<SlotId, number>([[from, 0]]);
  const queue: SlotId[] = [from];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    const nextDistance = (distance.get(current) ?? 0) + 1;
    for (const next of adjacentSlots(current)) {
      if (blocked.has(next) || distance.has(next)) continue;
      distance.set(next, nextDistance);
      if (next === to) return nextDistance;
      queue.push(next);
    }
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * 追击 AI 用：从 `from` 走一步，缩短到 `target` 的距离，且落点不在 `blocked`。
 *
 * `target` 本身通常被玩家占着，所以 BFS 以它为源、但不把 target 当障碍；
 * 从 target 向外扩散到空闲点，再挑一个距离更小的相邻点。
 */
export function shortestStepToward(
  from: SlotId,
  target: SlotId,
  blocked: ReadonlySet<SlotId>,
): SlotId | null {
  if (from === target) return null;
  const distance = new Map<SlotId, number>([[target, 0]]);
  const queue: SlotId[] = [target];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head]!;
    const nextDistance = (distance.get(current) ?? 0) + 1;
    for (const next of adjacentSlots(current)) {
      // from 允许出现在路径上（它是怪物自己的点位），其他被占点不能穿。
      if (next !== from && blocked.has(next)) continue;
      if (distance.has(next)) continue;
      distance.set(next, nextDistance);
      queue.push(next);
    }
  }

  const currentDistance = distance.get(from) ?? Number.POSITIVE_INFINITY;
  let best: SlotId | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const next of adjacentSlots(from)) {
    if (blocked.has(next)) continue;
    const d = distance.get(next);
    if (d !== undefined && d < bestDistance - 1e-9 && d < currentDistance - 1e-9) {
      best = next;
      bestDistance = d;
    }
  }
  return best;
}

/** 点位中文名。 */
export function slotLabel(slot: SlotId): string {
  return SLOT_LABELS[slot];
}

/** 朝向中文名。 */
export function facingLabel(facing: Facing8): string {
  return FACING_LABELS[facing];
}

/** 点位列表 → 「左/左上/左下」。 */
export function formatSlots(slots: readonly SlotId[]): string {
  return slots.map(slotLabel).join('/');
}
