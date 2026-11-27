/**
 * 「说话人名字从『白色小精灵』变成『小白』」的纯数据（不依赖 Phaser）。
 *
 * 剧本里这一拍是 `fx: 'rename'`（`ch01-after.ts` 的「代号更新确认」那一行）；
 * 表现层在 `src/ui/name-rename-fx.ts`。时间线与名字常量放这里，是为了让单测
 * 不用 import Phaser（`test/name-rename-fx.test.ts`）。
 */

/** 定名前剧本里用的显示名（`ch01-after.ts` 的 `CH01_AFTER_XIAOBAI_SPEAKER`）。 */
export const NAME_RENAME_FROM = '白色小精灵';
/** 定名后的显示名。 */
export const NAME_RENAME_TO = '小白';

/**
 * 时间线（毫秒 / 块大小）。改这里就会同时改演出与单测，不要在别处写第二份数字。
 *
 * 顺序：白光划过 → 粗块抖动 → 逐列覆写 → 细一档收敛 → 交回文字。
 */
export const NAME_RENAME_TIMELINE = {
  /** 台词出现后稍等一拍再划白光，免得和面板换行同帧抢眼。 */
  sweepDelay: 20,
  /** 白光从名字左侧扫到右侧。 */
  sweep: 220,
  /** 粗马赛克抖动（数据损坏感）持续时长。 */
  corrupt: 260,
  /** 抖动重绘间隔：太小像电视雪花，太大像卡住。 */
  glitchTick: 62,
  /** 逐列覆写，每一步的间隔。 */
  morphStep: 40,
  /** 覆写步数（左 → 右）。 */
  morphSteps: 8,
  /** 收敛：块从 6 变 3。 */
  refine: 110,
  /** 交回真正的文字（交叉淡入）。 */
  reveal: 120,
  /** 粗块边长（设计 px）：3 还能认出字形，6 只剩色块（2026-11-27 实机调过）。 */
  block: 3,
  /** 收敛后的块边长（设计 px）。 */
  refineBlock: 2,
} as const;

/** 整段演出的总时长（毫秒）；场景/测试用这一个数，不要自己加。 */
export const NAME_RENAME_TOTAL_MS =
  NAME_RENAME_TIMELINE.sweepDelay +
  NAME_RENAME_TIMELINE.sweep +
  NAME_RENAME_TIMELINE.corrupt +
  NAME_RENAME_TIMELINE.morphStep * NAME_RENAME_TIMELINE.morphSteps +
  NAME_RENAME_TIMELINE.refine +
  NAME_RENAME_TIMELINE.reveal;
