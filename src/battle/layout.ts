import type { SlotId } from './types';

/**
 * 战斗战场的纯布局（设计坐标，720 宽基准）。
 *
 * 六个站位是一个**椭圆环**：左右两格在怪物两侧，四斜在上下方收窄，
 * 这样竖屏 720 宽也能一眼读出「谁在它背后」。所有坐标只由设计宽高决定，
 * 场景与 HUD 用同一份输出，避免「HUD 以为战场在这、角色画到那」。
 *
 * 顶部预留 = 页眉 118 + 跑条 64 + 间距；底部预留 = 指令面板 360。
 * 设计高 1100（1200×648 横屏钳制后的高度）时环会压扁，但仍在安全区内。
 */

export interface BattlePoint {
  readonly x: number;
  readonly y: number;
}

export const BATTLE_LAYOUT = {
  /** 页眉（地点/章节/回合/菜单）预留高度。 */
  headerHeight: 118,
  /** 页眉下方「跑条 + 接下来」条预留高度。 */
  railHeight: 64,
  /** 页眉/跑条与战场之间的呼吸间距。 */
  fieldGap: 10,
  /** 底部指令面板（含安全区 padding）。 */
  bottomHeight: 360,
  /** 玩家战斗立绘的屏显高度（用于算上方站位不能被页眉压住）。 */
  playerHeight: 170,
  /** 怪物屏显高度。 */
  monsterHeight: 260,
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
  /** 跑条条的顶部 y（Compose/native 叠层用）。 */
  readonly railTop: number;
  readonly center: BattlePoint;
  /** 怪物脚底坐标。 */
  readonly monster: BattlePoint;
  readonly monsterHeadY: number;
  readonly slots: Readonly<Record<SlotId, BattlePoint>>;
  /** 玩家立绘从脚底往上的高度。 */
  readonly playerHeadOffset: number;
  readonly monsterHeight: number;
}

export function planBattleLayout(width = 720, height = 1280): BattleLayout {
  const safeWidth = Math.max(360, Math.round(width));
  const safeHeight = Math.max(640, Math.round(height));

  const railTop = BATTLE_LAYOUT.headerHeight;
  const fieldTop = railTop + BATTLE_LAYOUT.railHeight + BATTLE_LAYOUT.fieldGap;
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

  const slots: Record<SlotId, BattlePoint> = {
    right: { x: rightX, y: centerY },
    upperRight: { x: upperRightX, y: centerY - radiusY },
    upperLeft: { x: upperLeftX, y: centerY - radiusY },
    left: { x: leftX, y: centerY },
    lowerLeft: { x: upperLeftX, y: centerY + radiusY },
    lowerRight: { x: upperRightX, y: centerY + radiusY },
  };

  const monsterHeight = Math.min(
    BATTLE_LAYOUT.monsterHeight,
    Math.round((fieldBottom - fieldTop) * 0.55),
  );
  // 怪物站在环心略偏前，脚底不跟站位角色抢同一条线。
  const monsterY = Math.min(fieldBottom - 24, centerY + Math.round(radiusY * 0.45));

  return {
    width: safeWidth,
    height: safeHeight,
    fieldTop,
    fieldBottom,
    railTop,
    center: { x: centerX, y: centerY },
    monster: { x: centerX, y: monsterY },
    monsterHeadY: monsterY - monsterHeight,
    slots,
    playerHeadOffset: BATTLE_LAYOUT.playerHeight,
    monsterHeight,
  };
}
