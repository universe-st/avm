import type { SlotId } from './types';
import { SLOT_COORDS, SLOT_ORDER, SQRT3_2 } from './core/slots';

/**
 * 战斗战场的纯布局（设计坐标，720 宽基准）。
 *
 * 11 个点位按**四三四等距六边形网格**布置：
 * 上排 4（`upperFarLeft`/`upperLeft`/`upperRight`/`upperFarRight`）、
 * 中排 3（`left`/`center`/`right`）、下排 4。
 * 所有相邻边（横边、斜边、中排与上下排）**视觉距离都等于同一个 `spacing`**，
 * 因为坐标本身就是正六边形网格（`SLOT_COORDS` × spacing）；不要退回椭圆/45° 环。
 * `center` 是几何中心。
 *
 * 顶部预留 = 页眉 118 + 行动表 rail 64 + 间距 10 = fieldTop 192。
 * 行动表只剩标题 + 头像 chip 一行；不再有意图行，所以 rail 恒 64。
 */

export interface BattlePoint {
  readonly x: number;
  readonly y: number;
}

/** 行动表 rail 高度（标题 + 44px 头像 chip 一行）。 */
export const BATTLE_RAIL_HEIGHT = 64;

/** 兼容旧调用：rail 恒 64，不再随怪物数量变化。 */
export function battleRailHeight(): number {
  return BATTLE_RAIL_HEIGHT;
}

export const BATTLE_LAYOUT = {
  /** 页眉（地点/章节/回合/菜单）预留高度。 */
  headerHeight: 118,
  /** 页眉/行动表与战场之间的呼吸间距。 */
  fieldGap: 10,
  /** 底部指令面板（含安全区 padding）。 */
  bottomHeight: 360,
  /** 玩家战斗立绘的屏显高度（用于算上方站位不能被页眉压住）。 */
  playerHeight: 170,
  /** 最高怪物的屏显高度（御厨约 200）；上排站位要给它留头。 */
  enemyHeight: 200,
  /**
   * 相邻点位的最大间距（设计 px）。由**横向**卡死：
   * 720 宽 − 最宽角色（矿工 down 正文 260px×0.7=182，半宽 91）×2 − 11px 边距×2 = 516，
   * 而最外侧点在 1.5s 处 → `1.5s ≤ 258` → **s = 172**（外角 x = 102/618）。
   */
  maxSpacing: 172,
  /** 短屏下限：再小角色会挤成一团、点位点击区也会互相压。 */
  minSpacing: 96,
} as const;

/**
 * 点位点击区：**圆形**，且必须盖住脚下的移动/落点黄圈（2026-11-25）。
 *
 * 黄圈是 `ui/battle-fx.ts` 的 `drawSlotRing` 默认椭圆：中心在 `脚底 + 4`、半径 46×15
 * （移动/落点高亮都用默认值）。旧版把圆心放在脚底正上方、圆底贴脚底，导致**黄圈下半圈
 * 点不动、要往上点**（用户 2026-11-25 实测反馈）。
 *
 * 现在：半径随间距夹住（2r ≤ spacing，相邻点位点击区不重叠），圆心再下移，
 * 保证黄圈最宽处 `(46, 脚底+4)` 落在圆内：`(4 + offsetY)² + 46² ≤ radius²`。
 * 手机 172 → r=84 / offset=40（覆盖脚底 −124..+44），短屏 114 → r=55 / offset=26。
 */
export const SLOT_HIT_RING = {
  /** 黄圈椭圆的长半轴上限（`drawSlotRing` 默认 radiusX）。 */
  radiusX: 46,
  /** 黄圈椭圆的短半轴上限（默认 radiusY）。 */
  radiusY: 15,
  /** 黄圈中心相对脚底的下移量（默认椭圆画在 point.y + 4）。 */
  dy: 4,
} as const;

/** 移动/落点黄圈的实际尺寸：短屏间距变小时等比收一点（否则 92px 宽的圈会挤在一起）。 */
export function slotRingSize(spacing: number): { readonly radiusX: number; readonly radiusY: number; readonly dy: number } {
  return {
    radiusX: Math.min(SLOT_HIT_RING.radiusX, Math.round(spacing * 0.4)),
    radiusY: Math.min(SLOT_HIT_RING.radiusY, Math.round(spacing * 0.13)),
    dy: SLOT_HIT_RING.dy,
  };
}

export function slotHitCircle(spacing: number): { readonly radius: number; readonly offsetY: number } {
  const radius = Math.max(40, Math.min(84, Math.floor(spacing * 0.49)));
  const ring = slotRingSize(spacing);
  // 圆心从 40 往下试，取第一个「整个黄圈都在圆内」的位置（采样椭圆外围，够用且确定）。
  let offsetY = 0;
  for (let candidate = Math.min(40, radius); candidate >= 0; candidate -= 1) {
    if (ringFitsInCircle(radius, candidate, ring)) {
      offsetY = candidate;
      break;
    }
  }
  return { radius, offsetY };
}

function ringFitsInCircle(
  radius: number,
  offsetY: number,
  ring: { readonly radiusX: number; readonly radiusY: number; readonly dy: number },
): boolean {
  for (let step = 0; step < 24; step += 1) {
    const rad = (step * Math.PI * 2) / 24;
    const x = ring.radiusX * Math.cos(rad);
    const y = ring.dy + ring.radiusY * Math.sin(rad);
    if (Math.hypot(x, y + offsetY) > radius) return false;
  }
  return true;
}

/**
 * 近身攻击的「贴身」冲刺（2026-11-25）。
 *
 * 动作为：快速冲到目标身旁 → 播攻击帧 → 快速退回原点位（周全的落点选择例外）。
 * 冲刺后与目标脚底保留的剩余距离：占间距 40%，夹在 [42, 68]（手机 172→68、短屏 114→45.6）。
 * 太小会两张图完全叠在一起（矿工 190 宽、周全 73 宽、御厨 135 宽），太大又不像「冲到身边」。
 */
export const MELEE_STRIKE = {
  /** 停在目标脚底前的剩余距离（占相邻间距的比例）。 */
  gapRatio: 0.4,
  minGap: 42,
  maxGap: 68,
} as const;

/**
 * 近身攻击的落位点：从攻击者脚底沿「攻击者 → 目标」的连线冲到目标身旁。
 *
 * 只做表现层位移，**不参与判定**：命中/背袭/落点选择仍按真实点位算
 * （这个点只决定角色图站哪）。`from === target` 时回退到目标点自身，避免除零。
 */
export function meleeStrikePoint(
  from: BattlePoint,
  target: BattlePoint,
  spacing: number,
): BattlePoint {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance) || distance < 1) return { x: target.x, y: target.y };
  const gap = Math.min(
    distance * 0.5,
    Math.max(MELEE_STRIKE.minGap, Math.min(MELEE_STRIKE.maxGap, spacing * MELEE_STRIKE.gapRatio)),
  );
  const reach = Math.max(0, distance - gap);
  return {
    x: Math.round(from.x + (dx / distance) * reach),
    y: Math.round(from.y + (dy / distance) * reach),
  };
}

export interface BattleLayout {
  readonly width: number;
  readonly height: number;
  readonly fieldTop: number;
  readonly fieldBottom: number;
  /** 行动表 rail 的顶部 y。 */
  readonly railTop: number;
  readonly railHeight: number;
  /** 相邻点位的实际间距（短屏会被压到 `minSpacing`）。 */
  readonly spacing: number;
  /** 网格的几何中心（画环用）。 */
  readonly center: BattlePoint;
  /** 中心点位的脚底坐标（= slots.center；也是原 v2 monster 的位置）。 */
  readonly centerPoint: BattlePoint;
  readonly slots: Readonly<Record<SlotId, BattlePoint>>;
  /** 玩家立绘从脚底往上的高度。 */
  readonly playerHeadOffset: number;
}

export function planBattleLayout(width = 720, height = 1280): BattleLayout {
  const safeWidth = Math.max(360, Math.round(width));
  const safeHeight = Math.max(640, Math.round(height));
  const railHeight = BATTLE_RAIL_HEIGHT;
  const railTop = BATTLE_LAYOUT.headerHeight;
  const fieldTop = railTop + railHeight + BATTLE_LAYOUT.fieldGap;
  const fieldBottom = Math.max(fieldTop + 240, safeHeight - BATTLE_LAYOUT.bottomHeight);
  const centerX = Math.round(safeWidth / 2);
  const centerY = Math.round(fieldTop + (fieldBottom - fieldTop) * 0.56);

  const availableAbove =
    centerY - fieldTop - Math.max(BATTLE_LAYOUT.playerHeight, BATTLE_LAYOUT.enemyHeight) - 8;
  const availableBelow = fieldBottom - 16 - centerY;
  // 上下排相对中排偏移 = spacing×√3/2，所以 spacing 由「上排头顶留 8px」与
  // 「下排脚底留 16px」中较小的一侧决定；再夹在 [minSpacing, maxSpacing] 之间。
  const spacing = Math.max(
    BATTLE_LAYOUT.minSpacing,
    Math.min(
      BATTLE_LAYOUT.maxSpacing,
      Math.min(availableAbove, availableBelow) / SQRT3_2,
    ),
  );
  const centerPoint: BattlePoint = { x: centerX, y: centerY };

  const slots = {} as Record<SlotId, BattlePoint>;
  for (const slot of SLOT_ORDER) {
    const coord = SLOT_COORDS[slot];
    slots[slot] = {
      x: Math.round(centerX + coord.x * spacing),
      y: Math.round(centerY - coord.y * spacing),
    };
  }

  return {
    width: safeWidth,
    height: safeHeight,
    fieldTop,
    fieldBottom,
    railTop,
    railHeight,
    spacing,
    center: { x: centerX, y: centerY },
    centerPoint,
    slots,
    playerHeadOffset: BATTLE_LAYOUT.playerHeight,
  };
}
