import { SAVE_MODULES, type SaveModule } from './schema';

/**
 * 「现在能不能存档」的唯一判定（纯函数，不依赖 Phaser / localStorage）。
 *
 * 规则只有一个总纲：**只有玩家真的能自由走动时才存档**——存档要能恢复成一个可玩的
 * 自由探索局面。对话/表演/过场/章节卡/切场/结束/弹窗里存下来的状态既没有可复现的游标，
 * 读回来也只能落在一段演出的半截，所以一律拒绝，并把原因显示在菜单里。
 *
 * 规则顺序就是优先级（`SAVE_BLOCK_ORDER`）：越「不可能同时存在」的场景越靠前，
 * UI 提示一条就够，玩家不需要看到五条理由。
 */

export type SaveContextModule =
  | SaveModule
  | 'ch01Palace'
  | 'battleCh01'
  | 'battleKitchen'
  | 'title'
  | 'other';

export type SaveBlockReason =
  /** 舞台预览：`AGENTS.md` §2 第 14 条，预览一律不写存档。 */
  | 'preview'
  /** 金殿/战斗/标题这类没有自由活动的模块。 */
  | 'unsupported-module'
  /** 本节结束（结束卡/失败卡）。 */
  | 'ended'
  /** 章节卡正在播。 */
  | 'card'
  /** 正在切场景（入梦白场/进战斗）。 */
  | 'transition'
  /** 过场视频（手机 CG）播放中。 */
  | 'cutscene'
  /** 表演时间线（坐定/起身/入梦）进行中。 */
  | 'performance'
  /** 对话进行中。 */
  | 'dialogue'
  /** 有模态弹窗打开（对话记录/退出确认/菜单自己）。 */
  | 'modal'
  /** 不在自由探索 phase。 */
  | 'not-free-roam';

export const SAVE_BLOCK_MESSAGES: Readonly<Record<SaveBlockReason, string>> = {
  preview: '预览模式不写存档',
  'unsupported-module': '纯剧情演出 / 战斗不能存档',
  ended: '本节已结束，不能存档',
  card: '章节卡播放中不能存档',
  transition: '场景切换中不能存档',
  cutscene: '过场动画播放中不能存档',
  performance: '剧情演出中不能存档',
  dialogue: '对话进行中不能存档',
  modal: '有弹窗打开时不能存档',
  'not-free-roam': '当前不是自由活动，不能存档',
};

/** 判定顺序（测试与文档共用这一份）。 */
export const SAVE_BLOCK_ORDER: readonly SaveBlockReason[] = [
  'preview',
  'unsupported-module',
  'ended',
  'card',
  'transition',
  'cutscene',
  'performance',
  'dialogue',
  'modal',
  'not-free-roam',
];

/**
 * 各模块的「自由活动」phase 名称。
 *
 * 寝室多一个 `prep`：命名完了、还没跟小白开口的那段自由活动（2026-11-27 用户拍板
 * 「能存档」）。它不是 `explore`——回去摸书桌/叫郑卿都说不通——但玩家确实在自由走动，
 * 所以存进去要恢复成「准备阶段」而不是回到寝室开头（见 `flowSnapshotFromSave`）。
 */
export const FREE_ROAM_PHASES: Readonly<Record<SaveModule, readonly string[]>> = {
  ch01Dorm: ['explore', 'prep'],
  ch01Kitchen: ['explore'],
};

export function isSaveModuleId(value: string): value is SaveModule {
  return (SAVE_MODULES as readonly string[]).includes(value);
}

/** 该模块 + phase 是否处在允许存档的自由探索段。 */
export function isFreeRoamPhase(module: SaveContextModule, phase: string): boolean {
  if (!isSaveModuleId(module)) return false;
  return FREE_ROAM_PHASES[module].includes(phase);
}

export interface SaveAvailabilityContext {
  readonly preview: boolean;
  readonly module: SaveContextModule;
  /** 场景自己的 phase 字符串（寝室 `Ch01Phase`、御膳房 `KitchenPhase`）。 */
  readonly phase: string;
  /** 对话进行中（含逐字/等待推进）。 */
  readonly dialogue?: boolean;
  /** 表演时间线进行中。 */
  readonly performance?: boolean;
  readonly transition?: boolean;
  readonly cutscene?: boolean;
  /** 章节卡（寝室/御膳房的阶段字卡）。 */
  readonly card?: boolean;
  readonly ended?: boolean;
  readonly modalOpen?: boolean;
}

export type SaveAvailability =
  | { readonly allowed: true; readonly message: string }
  | { readonly allowed: false; readonly reason: SaveBlockReason; readonly message: string };

function blocks(reason: SaveBlockReason, context: SaveAvailabilityContext): boolean {
  switch (reason) {
    case 'preview':
      return context.preview === true;
    case 'unsupported-module':
      return !isSaveModuleId(context.module);
    case 'ended':
      return context.ended === true;
    case 'card':
      return context.card === true;
    case 'transition':
      return context.transition === true;
    case 'cutscene':
      return context.cutscene === true;
    case 'performance':
      return context.performance === true;
    case 'dialogue':
      return context.dialogue === true;
    case 'modal':
      return context.modalOpen === true;
    case 'not-free-roam':
      return !isFreeRoamPhase(context.module, context.phase);
  }
}

/** 唯一入口：菜单、场景、测试都调它。 */
export function evaluateSaveAvailability(context: SaveAvailabilityContext): SaveAvailability {
  for (const reason of SAVE_BLOCK_ORDER) {
    if (blocks(reason, context)) {
      return { allowed: false, reason, message: SAVE_BLOCK_MESSAGES[reason] };
    }
  }
  return { allowed: true, message: '可以存档' };
}
