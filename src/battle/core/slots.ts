import type { Facing8, SlotId, Zone } from '../types';

/**
 * 11 点位（四三四）/ 朝向 / 背袭 / 相邻 / 命中集合的纯几何。
 *
 * 坐标以**相邻间距 `s` 为单位**、y 向上（屏幕坐标 = 中心 − 该值 × s）。
 * 判定直接用真实网格坐标算角度，v2 的 45° 环抽象（`POINT_VECTORS`/`RING_ANGLES`）已删除：
 * 网格邻点的方向恰好相差 60°，所以正面/背面的分界是 60/120，不是 45/135。
 *
 * 角度用屏幕坐标（0° = 正右，90° = 正上，逆时针为正）。
 *
 * **不要直接把两个点角度分别归一化后相减**：180 会被折成 -180，
 * `center→left` 会漏掉左上/左下。所有“差”都走 `normalizeDegrees(a - b)`。
 */

/** 上下排相对中排的纵向偏移（√3/2）：正六边形的高 = s×√3/2。 */
export const SQRT3_2 = Math.sqrt(3) / 2;

/**
 * 面对面判定阈值。
 *
 * 网格里相邻两点的方向**恰好相差 60°**，所以「一步之内 = 正面、两步以上 = 背面」：
 * 60° 以内是正面（左/左上/左下都在正前方），120° 以外才算背袭。
 */
export const ZONE_FRONT_MAX = 60;
export const ZONE_BACK_MIN = 120;

/** 命中角：`single-front` 在 ±30° 内（网格里刚好只剩瞄准的那一个点）。 */
export const HIT_SINGLE_FRONT_MAX = 30;
/** 命中角：`front-arc` 覆盖「正面 + 侧面」扇区，背后打不到。 */
export const HIT_FRONT_ARC_MAX = 120;

/** 四三四网格坐标（单位 = 相邻间距 s，y 向上）。 */
export const SLOT_COORDS: Readonly<Record<SlotId, { readonly x: number; readonly y: number }>> = {
  upperFarLeft: { x: -1.5, y: SQRT3_2 },
  upperLeft: { x: -0.5, y: SQRT3_2 },
  upperRight: { x: 0.5, y: SQRT3_2 },
  upperFarRight: { x: 1.5, y: SQRT3_2 },
  left: { x: -1, y: 0 },
  center: { x: 0, y: 0 },
  right: { x: 1, y: 0 },
  lowerFarLeft: { x: -1.5, y: -SQRT3_2 },
  lowerLeft: { x: -0.5, y: -SQRT3_2 },
  lowerRight: { x: 0.5, y: -SQRT3_2 },
  lowerFarRight: { x: 1.5, y: -SQRT3_2 },
};

/**
 * 空间顺序：上排左→右、中排左→右、下排左→右。
 *
 * 画环/列标签/遍历都用它；`ADJACENT` 的排序也以它为下标基准，
 * 保证「AI 取相邻候选的第一个」在不同实现/平台上都确定。
 */
export const SLOT_ORDER: readonly SlotId[] = [
  'upperFarLeft',
  'upperLeft',
  'upperRight',
  'upperFarRight',
  'left',
  'center',
  'right',
  'lowerFarLeft',
  'lowerLeft',
  'lowerRight',
  'lowerFarRight',
];

/**
 * 默认玩家补位顺序（只给 `placement.ts` 用）。
 *
 * 先补**中排与下排**：上排离行动表最近，角色头顶容易被 rail 压；
 * `left` 是第一顺位（两场战斗的剧情脚本都写死它，玩家默认站左半边），
 * 中心是走位的枢纽，尽量留空。多角色时按这个顺序占空位，不随机。
 */
export const PARTY_FILL_ORDER: readonly SlotId[] = [
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
];

export const SLOT_LABELS: Readonly<Record<SlotId, string>> = {
  upperFarLeft: '左上端',
  upperLeft: '左上',
  upperRight: '右上',
  upperFarRight: '右上端',
  left: '左',
  center: '中',
  right: '右',
  lowerFarLeft: '左下端',
  lowerLeft: '左下',
  lowerRight: '右下',
  lowerFarRight: '右下端',
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

/**
 * 邻接表：**邻接 = 网格距离 1，别手写边表**。
 *
 * 由 `SLOT_COORDS` 的距离直接生成（共 20 条边：四角 2 邻、上/下排内侧 4 邻、
 * 中排两侧 5 邻、中心 6 邻）；每个邻点表按 `SLOT_ORDER` 下标排序，保证确定性。
 */
export const ADJACENT: Readonly<Record<SlotId, readonly SlotId[]>> = buildAdjacent();

function buildAdjacent(): Readonly<Record<SlotId, readonly SlotId[]>> {
  const table = {} as Record<SlotId, SlotId[]>;
  for (const slot of SLOT_ORDER) {
    const origin = SLOT_COORDS[slot];
    table[slot] = SLOT_ORDER.filter((candidate) => {
      if (candidate === slot) return false;
      const other = SLOT_COORDS[candidate];
      return Math.abs(Math.hypot(other.x - origin.x, other.y - origin.y) - 1) < 1e-6;
    });
  }
  return table;
}

/** 把角度归一到 (-180, 180]；-180 表示 180。 */
export function normalizeDegrees(degrees: number): number {
  const wrapped = ((degrees + 180) % 360 + 360) % 360 - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

/** 从 from 指向 to 的角度（屏幕坐标）；同点返回 0（数据错误时防御性兜底）。 */
export function angleFromTo(from: SlotId, to: SlotId): number {
  if (from === to) return 0;
  const a = SLOT_COORDS[from];
  const b = SLOT_COORDS[to];
  return normalizeDegrees(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI);
}

/**
 * 角度 → 最近 8 向。
 *
 * 网格里两点的方向都是 30° 的倍数，理论上不会正好夹在两向中间（22.5°）；
 * 保留平局裁决（取 `|cos|` 更大的一向）只是防御性兜底，避免浮点舍入造成抖动。
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
 * - `|rel| ≤ 60°`：正面
 * - `60° < |rel| < 120°`：侧面
 * - `|rel| ≥ 120°`：背面（背袭）
 *
 * 阈值来自网格本身：一步之内（邻点方向相差 60°）都是正面，两步以上才是背面。
 */
export function zoneOfPoint(attacker: SlotId, target: SlotId, targetFacing: Facing8): Zone {
  const delta = Math.abs(
    normalizeDegrees(angleFromTo(target, attacker) - FACING_ANGLES[targetFacing]),
  );
  if (delta <= ZONE_FRONT_MAX + 1e-9) return 'front';
  if (delta < ZONE_BACK_MIN - 1e-9) return 'side';
  return 'back';
}

/** 是否吃背袭。 */
export function isBackstabPoint(attacker: SlotId, target: SlotId, targetFacing: Facing8): boolean {
  return zoneOfPoint(attacker, target, targetFacing) === 'back';
}

/** 相邻点位（网格距离 1）。返回副本，调用方可以随便 sort/filter。 */
export function adjacentSlots(slot: SlotId): SlotId[] {
  return [...ADJACENT[slot]];
}

export function isAdjacentSlot(from: SlotId, to: SlotId): boolean {
  return ADJACENT[from].includes(to);
}

/** 全部 11 个点位（空间顺序）。 */
export function allSlots(): SlotId[] {
  return [...SLOT_ORDER];
}

/**
 * 技能命中集合（只服务怪物技能/意图；玩家解离突刺是单一目标）。
 *
 * 先取 origin 的相邻点，再按 aim 方向过滤：
 * - single-front：角差 ≤30°（网格里等于**只命中瞄准的那一个点**）
 * - front-arc：角差 <120°（正面 + 侧面，背后打不到）
 * - all-slots：全部 11 点
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
    if (
      hit === 'single-front'
        ? delta <= HIT_SINGLE_FRONT_MAX + 1e-9
        : delta < HIT_FRONT_ARC_MAX - 1e-9
    ) {
      matched.add(point);
    }
  }
  return SLOT_ORDER.filter((point) => matched.has(point));
}

/** 镜像点位：坐标 x → −x（center 落在自己身上）。 */
export function mirrorSlot(slot: SlotId): SlotId {
  const coord = SLOT_COORDS[slot];
  const targetX = -coord.x;
  for (const candidate of SLOT_ORDER) {
    const other = SLOT_COORDS[candidate];
    if (Math.abs(other.x - targetX) <= 1e-6 && Math.abs(other.y - coord.y) <= 1e-6) {
      return candidate;
    }
  }
  // 坐标表是对称的；走到这里是数据错误（新增点位忘了配对）。
  throw new Error(`[battle] 点位 ${slot} 没有镜像点`);
}

/** 11 点图上的最短步数；`blocked` 为不可经过的点（起点除外）。 */
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
