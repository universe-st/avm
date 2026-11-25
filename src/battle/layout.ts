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
