/**
 * 原生 Phaser 渲染层级契约（Compose UI 永远在原生层之上）。
 *
 * 层次从下到上：
 *   background → props → markers → characters → effects → cinematic → cg → debug
 *
 * 规则：
 * - 背景/道具/角色/CG 的 depth 只能从这里取，不允许在场景里写魔法数字。
 * - 角色按脚底 y 排序：`characterDepth(feetY)`。
 * - Compose UI（HUD/对话/按钮）由 MVVM 层负责；它的 UIRoot depth 固定为 `UI_ROOT_DEPTH`，高于所有原生层。
 */
export const LAYERS = {
  /** 地图/战斗背景。 */
  background: 0,
  /** 地图家具、战斗地面贴花等静态道具。 */
  props: 100,
  /** 交互点、地面箭头、地图标记。 */
  markers: 200,
  /** 角色基准层；实际 depth = characters + 脚底 y。 */
  characters: 1000,
  /** 世界内特效（飘字、交互气泡、光效）。 */
  effects: 3000,
  /** 原生输入层（摇杆等），在特效之上、章节卡之下。 */
  input: 3200,
  /** 章节卡、过场黑边等电影化原生层。 */
  cinematic: 4000,
  /** 全屏剧情 CG；必须盖住角色和世界特效。 */
  cg: 5000,
  /** 碰撞/调试覆盖层。 */
  debug: 6000,
} as const;

/** Compose UIRoot 的 depth；必须高于所有原生层。 */
export const UI_ROOT_DEPTH = 10000;

export function characterDepth(feetY: number): number {
  return LAYERS.characters + Math.round(Number.isFinite(feetY) ? feetY : 0);
}
