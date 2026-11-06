import {
  CH01_ASSET_KEYS,
  CH01_Q_STATIC_SPRITES,
  CH01_STATIC_SPRITES,
} from '../assets/keys';
import type { Facing } from '../map/types';

/**
 * 寝室两段「表演」的纯数据时间线（不 import Phaser，可在 Node 里单测）。
 *
 * 场景只负责按步骤执行：走路、坐下、把小白挪到右边、白场、起身。
 * 时长/降级（reduced-motion）都写在这里，场景不再写魔法数字。
 *
 * 两段：
 * - `dreamIntro`：小白说完 → 主角走到房间中心 → 坐地朝右 → 小白浮到右侧 → 停顿 → 全屏白光 → 金殿；
 * - `wakeUp`：战后回到寝室时**已经坐着**（不是先站着再瞬移），第一句征召台词后起身。
 *
 * 素材还没正式生成：坐地朝右用 `zhou_sit_right` 占位 key，缺图时回退到现有
 * `zhou_sit`（椅子占位）→ Q 版朝右立绘。回退解析也在这里，场景只拿结果。
 */

/** 坐下的位置（地毯一带，房间横向中心）；两段表演必须用同一个点。 */
export const CH01_SIT_TILE = [16, 29] as const;

/**
 * 小白相对主角脚底的偏移（tile 单位）。
 *
 * 为什么不是字面的 +1 格：寝室是 33 格铺满 720 设计宽，1 格只有约 21.8px，
 * 而主角 Q 版立绘约 98px 宽（≈4.5 格）。+1 格会整个叠在主角身上。
 * 这里取「右 3 格、上 2.5 格」，实际约 +65px / -55px：小白基本落在主角右侧，
 * 只留几像素叠在坐姿右缘（它 depth 更高，不会被人挡住）。y 为负 = 比脚底高（漂浮）。
 */
export const CH01_XIAOBAI_OFFSET = [3, -2.5] as const;

export type PerformanceTimelineId = 'dreamIntro' | 'wakeUp';

interface StepTiming {
  /** 正常节奏下这一步占用的时长（ms）。 */
  readonly ms: number;
  /** reduced-motion 下的时长；省略时取 `ms` 的一半（最低 60ms）。 */
  readonly reducedMs?: number;
}

export interface WalkStep extends StepTiming {
  readonly kind: 'walk';
  readonly actor: 'zhou';
  /** 目标 tile（用 `tileCenter()` 换算，不写死像素）。 */
  readonly to: readonly [number, number];
  readonly facing: Facing;
}

export interface SitStep extends StepTiming {
  readonly kind: 'sit';
  readonly actor: 'zhou';
  /** 坐下的落点 tile；表演执行器会先停掉走路 tween 再钉到这个点。 */
  readonly to: readonly [number, number];
  readonly facing: Facing;
  /** `stand` = 现在站着要坐下；`sit` = 已经坐着，只给一个停顿拍。 */
  readonly from: 'stand' | 'sit';
  /** 坐下瞬间的轻微下沉 + 尘土；`from: 'sit'` 时不加。 */
  readonly dust: boolean;
}

export interface MoveActorStep extends StepTiming {
  readonly kind: 'move-actor';
  readonly actor: 'xiaobai';
  /** 相对 `actor` 脚底的偏移（tile 单位），y 为负 = 更高。 */
  readonly offset: readonly [number, number];
}

export interface WaitStep extends StepTiming {
  readonly kind: 'wait';
}

export interface FlashStep extends StepTiming {
  readonly kind: 'flash';
  /** 白场淡入时长。 */
  readonly holdMs: number;
  readonly reducedHoldMs?: number;
  /** 淡出时长（交给金殿转场期间消化，不计入时间线总时长）。 */
  readonly outMs: number;
  readonly reducedOutMs?: number;
}

export interface StandStep extends StepTiming {
  readonly kind: 'stand';
  readonly actor: 'zhou';
}

export type PerformanceStep =
  | WalkStep
  | SitStep
  | MoveActorStep
  | WaitStep
  | FlashStep
  | StandStep;

export interface PerformanceTimeline {
  readonly id: PerformanceTimelineId;
  readonly steps: readonly PerformanceStep[];
}

/** 入梦前：小白台词走完 → 走到中心坐下 → 小白到右侧 → 白光。 */
export const CH01_DREAM_INTRO_PERFORMANCE: PerformanceTimeline = {
  id: 'dreamIntro',
  steps: [
    { kind: 'walk', actor: 'zhou', to: CH01_SIT_TILE, facing: 'right', ms: 1600, reducedMs: 700 },
    {
      kind: 'sit',
      actor: 'zhou',
      to: CH01_SIT_TILE,
      facing: 'right',
      from: 'stand',
      dust: true,
      ms: 420,
      reducedMs: 160,
    },
    { kind: 'move-actor', actor: 'xiaobai', offset: CH01_XIAOBAI_OFFSET, ms: 520, reducedMs: 200 },
    // 让玩家看清「坐在地上、小白在右边」这个构图，再切白场。
    { kind: 'wait', ms: 600, reducedMs: 240 },
    {
      kind: 'flash',
      ms: 550,
      reducedMs: 200,
      holdMs: 200,
      reducedHoldMs: 80,
      outMs: 320,
      reducedOutMs: 140,
    },
  ],
};

/**
 * 战后回来：第一拍是 `sit`（进场景时就坐着），随后 3 段 tween 起身。
 * 顺序被单测锁住——绝不能变成先 `stand` 再补坐下。
 */
export const CH01_WAKE_PERFORMANCE: PerformanceTimeline = {
  id: 'wakeUp',
  steps: [
    {
      kind: 'sit',
      actor: 'zhou',
      to: CH01_SIT_TILE,
      facing: 'right',
      from: 'sit',
      dust: false,
      ms: 640,
      reducedMs: 240,
    },
    { kind: 'stand', actor: 'zhou', ms: 460, reducedMs: 220 },
    { kind: 'wait', ms: 160, reducedMs: 60 },
  ],
};

const MIN_REDUCED_MS = 60;

function half(ms: number): number {
  return Math.max(MIN_REDUCED_MS, Math.round(ms / 2));
}

/** 这一步占用的时间（flash 计入「淡入 + 保持」，不含淡出）。 */
export function stepDurationMs(step: PerformanceStep, reduced = false): number {
  if (step.kind === 'flash') {
    const fadeIn = reduced ? step.reducedMs ?? half(step.ms) : step.ms;
    const hold = reduced ? step.reducedHoldMs ?? half(step.holdMs) : step.holdMs;
    return fadeIn + hold;
  }
  return reduced ? step.reducedMs ?? half(step.ms) : step.ms;
}

/** 白场淡入时长（单独取，场景要在淡入结束后才开始保持倒计时）。 */
export function flashInMs(step: FlashStep, reduced = false): number {
  return reduced ? step.reducedMs ?? half(step.ms) : step.ms;
}

/** 白场淡出时长；这期间金殿转场已经在跑，不计入时间线总时长。 */
export function flashOutMs(step: FlashStep, reduced = false): number {
  return reduced ? step.reducedOutMs ?? half(step.outMs) : step.outMs;
}

/** 整段时间线总时长（到最后一个步骤结束、可以交给下一个流程为止）。 */
export function timelineDurationMs(timeline: PerformanceTimeline, reduced = false): number {
  return timeline.steps.reduce((total, step) => total + stepDurationMs(step, reduced), 0);
}

/**
 * 坐姿贴图优先级：
 * 1. 新素材「坐地朝右」`zhou_sit_right`（还没生成，先占 key）；
 * 2. 现有椅子占位 `zhou_sit`；
 * 3. Q 版朝右立绘（最坏情况也别白屏）。
 */
export const ZHOU_SIT_KEY_CANDIDATES = [
  CH01_ASSET_KEYS.characters.zhouSitRight,
  CH01_ASSET_KEYS.characters.zhouSit,
  CH01_Q_STATIC_SPRITES.right,
] as const;

/** 站立回退：Q 版朝右 → 旧版朝右；解析不到时场景保持当前贴图。 */
export function zhouStandKeyCandidates(facing: Facing): readonly string[] {
  const primary = CH01_Q_STATIC_SPRITES[facing];
  const legacy = CH01_STATIC_SPRITES[facing];
  const fallback = CH01_Q_STATIC_SPRITES.right;
  const legacyFallback = CH01_STATIC_SPRITES.right;
  return [primary, legacy, fallback, legacyFallback].filter(
    (key, index, keys) => keys.indexOf(key) === index,
  );
}

/** 从候选 key 里挑第一个 `exists()` 为真的；都没有返回 null。 */
export function resolveTextureKey(
  candidates: readonly string[],
  exists: (key: string) => boolean,
): string | null {
  for (const key of candidates) {
    if (exists(key)) return key;
  }
  return null;
}

/** 坐姿贴图回退解析（缺图绝不白屏/报错）。 */
export function resolveSittingKey(exists: (key: string) => boolean): string | null {
  return resolveTextureKey(ZHOU_SIT_KEY_CANDIDATES, exists);
}

/** 站立贴图回退解析（起身结束时用）。 */
export function resolveStandingKey(
  facing: Facing,
  exists: (key: string) => boolean,
): string | null {
  return resolveTextureKey(zhouStandKeyCandidates(facing), exists);
}
