/**
 * 原生 Phaser 渲染层级契约（Compose UI 永远在原生层之上）。
 *
 * 层次从下到上：
 *   background → props → markers → fog → characters → effects → input → cinematic → cg → debug
 *
 * 规则：
 * - 背景/道具/角色/CG 的 depth 只能从这里取，不允许在场景里写魔法数字。
 * - 角色按脚底 y 排序：`characterDepth(feetY, mapHeight)`；大地图必须有界，否则会盖过 effects/cg。
 * - **迷雾必须在角色之下**（`fog < characters`）。曾经把 fog 放在角色之上（2500 > 1900），
 *   结果 245px 高的角色（≈3.5 格）头一伸进北边未探索格，整块黑幕就把上半身吃掉——
 *   看起来就是「人被切了一半」。敌人的隐蔽改由各自的 alpha（`npcSeen()`）负责，不需要雾来盖人。
 * - Compose UI（HUD/对话/按钮）由 MVVM 层负责；它的 UIRoot depth 固定为 `UI_ROOT_DEPTH`，高于所有原生层。
 */
export const LAYERS = {
  /** 地图/战斗背景。 */
  background: 0,
  /** 地图家具、战斗地面贴花等静态道具。 */
  props: 100,
  /** 交互点、地面箭头、地图标记。 */
  markers: 200,
  /** 角色基准层；实际 depth = characters + 有界映射（见 characterDepth）。 */
  characters: 1000,
  /**
   * 视野迷雾：在地图标记之上、**角色之下**。
   *
   * 迷雾是"地面上的黑暗"，不是"盖在所有东西上的黑布"：角色站进暗处也要看得见自己。
   * 因此它必须低于 `characters`（角色 depth 1000–1900），只高于 `markers`（区域名/门牌）。
   */
  fog: 500,
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

/**
 * 屏幕层（过场专用）：不随镜头缩放、永远盖在世界之上、又在 Compose UI 之下。
 *
 * 这一层的存在就是为了不再出现「立绘被太监挡住」「黑边压不住角色」这类问题：
 * 只要是贴在屏幕上的东西（立绘、遮幅、字卡、速度线、硬切），depth 只能从这里取。
 */
export const SCREEN_LAYERS = {
  /** 半身立绘：盖住世界，但**在遮幅之下**（遮幅是"裁画面"，要能切到立绘）。 */
  portrait: 6950,
  /** 集中线/速度线。 */
  speedlines: 7000,
  /** 上下遮幅（电影画幅）。 */
  letterbox: 7020,
  /** 定格字卡：在遮幅之上，不能被黑边吃掉。 */
  stamp: 7040,
  /** 硬切色块：屏幕层最上面。 */
  cut: 7060,
} as const;

/** Compose UIRoot 的 depth；必须高于所有原生层。 */
export const UI_ROOT_DEPTH = 10000;

export function characterDepth(feetY: number, maxFeetY = 1600): number {
  const max = Number.isFinite(maxFeetY) && maxFeetY > 0 ? maxFeetY : 1600;
  const y = Number.isFinite(feetY) ? feetY : 0;
  const ratio = Math.min(1, Math.max(0, y / max));
  return LAYERS.characters + Math.round(ratio * 900);
}
