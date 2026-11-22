import type { SlotId } from './types';

/**
 * 战斗战场的纯布局（设计坐标，720 宽基准）。
 *
 * 7 个点位：6 个环位 + `center`。`center` 就是 v2 怪物站的红圈，
 * 现在也是合法点位；`slots.center` 和 `centerPoint` 是同一个脚底坐标。
 *
 * 顶部预留 = 页眉 118 + 行动表 rail（1–2 怪 96 / 3 怪 116）+ 间距 10。
 * 去掉 SPD 量条后，1–2 怪时 fieldTop 从上版的 244 上移到 224，战场略大。
 */

export interface BattlePoint {
  readonly x: number;
  readonly y: number;
}

export const RAIL_BASE_HEIGHT = 96;
export const RAIL_INTENT_ROW_HEIGHT = 20;

/** 行动表 rail 高度：至少有 2 行意图位（1–2 怪 96），3 怪 116。 */
export function battleRailHeight(enemyCount: number): number {
  const rows = Math.max(2, Math.min(3, Math.trunc(enemyCount) || 0));
  return RAIL_BASE_HEIGHT + (rows - 2) * RAIL_INTENT_ROW_HEIGHT;
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
  /** 左右两格的水平半径。 */
  radiusX: 250,
  /** 四斜格相对中心的水平偏移。 */
  diagonalX: 180,
  /** 上下两格的垂直半径上限/下限。 */
  maxRadiusY: 190,
  minRadiusY: 96,
} as const;

export interface BattleLayout {
  readonly width: number;
  readonly height: number;
  readonly fieldTop: number;
  readonly fieldBottom: number;
  /** 行动表 rail 的顶部 y。 */
  readonly railTop: number;
  readonly railHeight: number;
  /** 环的几何中心（画环用）。 */
  readonly center: BattlePoint;
  /** 中心点位的脚底坐标（= slots.center；也是原 v2 monster 的位置）。 */
  readonly centerPoint: BattlePoint;
  readonly slots: Readonly<Record<SlotId, BattlePoint>>;
  /** 玩家立绘从脚底往上的高度。 */
  readonly playerHeadOffset: number;
}

export function planBattleLayout(
  width = 720,
  height = 1280,
  intentRows = 2,
): BattleLayout {
  const safeWidth = Math.max(360, Math.round(width));
  const safeHeight = Math.max(640, Math.round(height));
  const railHeight = battleRailHeight(intentRows);
  const railTop = BATTLE_LAYOUT.headerHeight;
  const fieldTop = railTop + railHeight + BATTLE_LAYOUT.fieldGap;
  const fieldBottom = Math.max(fieldTop + 240, safeHeight - BATTLE_LAYOUT.bottomHeight);
  const centerX = Math.round(safeWidth / 2);
  const centerY = Math.round(fieldTop + (fieldBottom - fieldTop) * 0.56);

  const availableAbove = centerY - fieldTop - BATTLE_LAYOUT.playerHeight - 8;
  const availableBelow = fieldBottom - 16 - centerY;
  const radiusY = Math.max(
    BATTLE_LAYOUT.minRadiusY,
    Math.min(BATTLE_LAYOUT.maxRadiusY, availableAbove, availableBelow),
  );

  const diagonalX = Math.min(BATTLE_LAYOUT.diagonalX, BATTLE_LAYOUT.radiusX);
  const leftX = centerX - BATTLE_LAYOUT.radiusX;
  const rightX = centerX + BATTLE_LAYOUT.radiusX;
  const upperLeftX = centerX - diagonalX;
  const upperRightX = centerX + diagonalX;

  // 中心脚底略偏前，不跟环位角色抢同一条线。
  const centerPoint: BattlePoint = {
    x: centerX,
    y: Math.min(fieldBottom - 24, centerY + Math.round(radiusY * 0.45)),
  };

  const slots: Record<SlotId, BattlePoint> = {
    right: { x: rightX, y: centerY },
    upperRight: { x: upperRightX, y: centerY - radiusY },
    upperLeft: { x: upperLeftX, y: centerY - radiusY },
    left: { x: leftX, y: centerY },
    lowerLeft: { x: upperLeftX, y: centerY + radiusY },
    lowerRight: { x: upperRightX, y: centerY + radiusY },
    center: centerPoint,
  };

  return {
    width: safeWidth,
    height: safeHeight,
    fieldTop,
    fieldBottom,
    railTop,
    railHeight,
    center: { x: centerX, y: centerY },
    centerPoint,
    slots,
    playerHeadOffset: BATTLE_LAYOUT.playerHeight,
  };
}
