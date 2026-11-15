/**
 * 金殿半身立绘的几何计算（纯逻辑，不依赖 Phaser）。
 *
 * 立绘是 720×900 的透明 PNG，显示宽度**是改版前的一半**、原比例不变：
 *
 *   旧宽 = round(round(designHeight × 0.46) / 900 × 720)   // 改版前按屏高 46% 换算
 *   新宽 = 旧宽 / 2  ≈ round(designHeight × 0.184)          // 现在宽度减半
 *   新高 = round(新宽 × 900 / 720)                         // 720:900 不变形
 *
 * 用户原话：「对话上角色的贴图太大挡住场景了。宽度改成原来一半，比例不变。」
 * 其余观感（贴地位置、从画面边上探出、入场/呼吸）都不动，所以这里的
 * anchorX / baseY / fromX 沿用改版前的参照系。
 */

/** 立绘 PNG 的原始尺寸。 */
export const PORTRAIT_SOURCE_WIDTH = 720;
export const PORTRAIT_SOURCE_HEIGHT = 900;

/** 改版前的高度占比（按屏幕设计高度的 46% 定高）。 */
const LEGACY_HEIGHT_RATIO = 0.46;
/** 改版前的宽度系数：先按 900 高换算成宽，等于 0.46 × 720/900 = 0.368。 */
const LEGACY_WIDTH_RATIO = LEGACY_HEIGHT_RATIO * (PORTRAIT_SOURCE_WIDTH / PORTRAIT_SOURCE_HEIGHT);
/** 改版后的宽度系数：旧宽的一半（0.368 / 2 = 0.184）。 */
const HALF_WIDTH_RATIO = LEGACY_WIDTH_RATIO / 2;

/** 立绘走位用的最小设计视口信息（ViewportPlan 结构兼容）。 */
export interface PortraitPlanLike {
  readonly designWidth: number;
  readonly designHeight: number;
}

/** 立绘从哪一侧滑入。 */
export type PortraitSide = 'right' | 'left';

/** 立绘在屏幕层里的几何：全部是设计坐标（720 宽）。 */
export interface PortraitMetrics {
  /** 显示宽度，设计 px。 */
  readonly width: number;
  /** 显示高度，设计 px；与 width 保持 720:900。 */
  readonly height: number;
  /** 落点 X：右侧人物贴右，左侧人物贴左。 */
  readonly anchorX: number;
  /** 落点 Y（底边贴地）：designHeight - 210，给底部对话面板留位置。 */
  readonly baseY: number;
  /** 入场动画的起点 X（从画面外滑入）。 */
  readonly fromX: number;
}

/** 改版前的显示尺寸，只用于对照与单测（宽度减半前的值）。 */
export function legacyPortraitSize(plan: PortraitPlanLike): { width: number; height: number } {
  const height = Math.round(plan.designHeight * LEGACY_HEIGHT_RATIO);
  const width = Math.round((height / PORTRAIT_SOURCE_HEIGHT) * PORTRAIT_SOURCE_WIDTH);
  return { width, height };
}

/** 立绘贴边时露在屏幕外的比例：anchorX 距边缘 0.30 宽，剩余 0.20 宽探出画面。 */
const SIDE_ANCHOR_RATIO = 0.30;
/** 底部留白：给对话面板让位。 */
const BASE_Y_OFFSET = 210;
/** 入场横向位移：从这一侧画面外滑进来。 */
const ENTER_OFFSET = 260;

export function portraitMetrics(
  plan: PortraitPlanLike,
  side: PortraitSide = 'right',
): PortraitMetrics {
  const width = Math.round(plan.designHeight * HALF_WIDTH_RATIO);
  const height = Math.round((width / PORTRAIT_SOURCE_WIDTH) * PORTRAIT_SOURCE_HEIGHT);
  const anchorX =
    side === 'right' ? plan.designWidth - width * SIDE_ANCHOR_RATIO : width * SIDE_ANCHOR_RATIO;
  const baseY = plan.designHeight - BASE_Y_OFFSET;
  const fromX = anchorX + (side === 'right' ? ENTER_OFFSET : -ENTER_OFFSET);
  return { width, height, anchorX, baseY, fromX };
}
