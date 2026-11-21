import {
  CH01_ASSET_KEYS,
  CH01_Q_STATIC_SPRITES,
  CH01_STATIC_SPRITES,
} from '../assets/keys';
import type { Facing } from '../map/types';

/**
 * 寝室「表演」的纯数据时间线（不 import Phaser，可在 Node 里单测）。
 *
 * 场景只负责按步骤执行：坐到房间中心、把小白挪到右侧、白场、起身。
 * 时长/降级（reduced-motion）都写在这里，场景不再写魔法数字。
 *
 * 三段（#t29 重排）：
 * - `dreamEntry`：手机 CG 结束的**那一刻**画面就应该是「主角坐在房间中心、小白在右侧」。
 *   所以这段是 0 时长的「构图钉死」步骤，由场景在 CG 回调里**同步**执行，
 *   中间不允许出现任何「站在书桌边」的帧，也没有走路。
 * - `dreamFlash`：小白对白全部在坐姿下说完之后，停顿一拍 → 全屏白光 → 切金殿。
 *   白光在寝室里只淡入、不淡出（`handoff`）：淡出交给金殿首帧，否则会露出寝室。
 * - `wakeUp`：战后回到寝室时**已经坐着**（不是先站着再瞬移），起身播 `zhou_stand_up`
 *   8 帧序列（520ms / Linear）；素材不可用时直接落回站立静态图。
 *
 * 坐地朝右正式素材 `zhou_sit_right` 已入库；缺图时回退到现有 `zhou_sit`（椅子占位）
 * → Q 版朝右立绘。回退解析也在这里，场景只拿结果。
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

/**
 * 小白飘到头部高度时，中心相对「头部中线」的额外偏移（设计 px，负 = 更高）。
 *
 * 0 = 正好压在头部中线上（用户要的就是「和周全的头部在同一水平线」）；
 * 想让它再高一点/低一点只改这一个数，场景与测试都跟它走。
 */
export const CH01_XIAOBAI_HEAD_OFFSET_PX = 0;

/**
 * 坐地之后角色应有的**显示**高度（设计 px）。
 *
 * 站立 Q 帧显示高 = 400 × 0.6138 ≈ 245；坐地约 2/3 高度、与现有 `zhou_sit`
 * 占位（96×160，按 1.0 显示）的观感对齐。
 */
export const CH01_SIT_DISPLAY_HEIGHT = 160;

/** 坐姿头顶到脚底的距离（设计 px），让表情气泡落在坐着的脑袋上而不是站姿高度。 */
export const CH01_SIT_HEAD_OFFSET = 132;

/**
 * 站立时「头部可见轮廓的中线」到脚底的设计距离（px）。
 *
 * 小白在起身时要飘到**与周全头部同一水平线**，所以对齐点必须按身体部位算，不能写死
 * 某个「-N 格」。口径与实测（`tools/measure-actor-footprint.py` 同一套 alpha ≥ 40 的口径）：
 * - `zhou_idle_right.png` / `q/zhou_q_*.png` 都是 160×400 画布、脚底 394、头区从第 23 行开始，
 *   脖子（行宽局部最小）在 140（正侧面）/ 146–149（3/4 面），头部中线约 82–86 画布行；
 * - 换算到显示 px：`(394 - 中线) × displayScale(0.6138)` ≈ 189–192；
 * - 起身末帧（`zhou_stand_up` 第 8 帧，scale 1.0、脚底 394）量出 189。
 * 三张图落在 189–192 之间，统一取 190，误差 ≤3px。贴图重生成后跑
 * `test/ch01-xiaobai-head-level.test.ts`：它现场解码 PNG 重算，这里对不上就红。
 */
export const CH01_STAND_HEAD_CENTER_OFFSET = 190;

/**
 * 坐姿贴图的显示缩放：**按贴图源图高度换算**，不在代码里拉伸凑大小。
 *
 * - 占位 `zhou_sit`（96×160）→ 160 / 160 = 1.0；与改版前一致；
 * - 正式「坐地朝右」（160×400）→ 160 / 400 = 0.4；
 * - 源图尺寸拿不到（0/NaN）时返回 1，至少不会把角色缩没。
 */
export function sittingScaleFor(
  sourceHeight: number,
  targetHeight = CH01_SIT_DISPLAY_HEIGHT,
): number {
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) return 1;
  return targetHeight / sourceHeight;
}

/**
 * 起身帧序列的素材契约（t28 正式素材，见 `assets-src/character/ch01/standup-manifest.json`）。
 *
 * 8 帧 × 160×400 = 1280 宽，仍在手机 4096 纹理上限内；整段 8 × 65 = 520ms。
 * **播放必须 Linear**：`ease` 只该作用在位移上，曲线会让某些帧停更久、另一些被跳过。
 */
export const CH01_STAND_UP_SEQUENCE = {
  key: CH01_ASSET_KEYS.characters.zhouStandUp,
  frameWidth: 160,
  frameHeight: 400,
  frameCount: 8,
  frameMs: 65,
  /** 整段播放时长 = 8 × 65 = 520ms（帧号按这个时长均分）。 */
  durationMs: 8 * 65,
  /** 帧序列唯一允许的插值方式；场景直接取这个值，禁止在场景里另写 ease。 */
  ease: 'Linear',
} as const;

/**
 * 起身末帧 → 站立 idle 的过渡时长（ms）。
 *
 * #t41 起**硬切**（0ms），不再有「转身」：帧序列末帧是正侧面朝右，起身结束直接切到
 * 侧面 idle `zhou_idle_right`（同为 160×400 / 人物高 371 / 底边 394，朝向一致），
 * 姿势没有跳变，不需要任何 alpha 交叉。旧值 110ms 是切 `q.right`（3/4 朝镜头）时
 * 用来磨平「侧面 → 3/4 面」那一下的，看起来就是一个快速转身——正是本次要消除的。
 *
 * 上限 `STANDUP_TO_IDLE_FADE_MAX_MS`：真机上若硬切仍闪 1 帧，允许把常量调到
 * ≤40ms 做极短融合（场景里有这条分支），但绝不允许回到 110ms 的 3/4 面交叉。
 */
export const STANDUP_TO_IDLE_FADE_MS = 0;

/** 过渡时长允许的上限：再长就会被看成「淡出」而不是硬切。 */
export const STANDUP_TO_IDLE_FADE_MAX_MS = 40;

/** 过渡的实际时长；正常与 reduced-motion **一致**（都是 0 = 硬切）。 */
export function standUpToIdleFadeMs(_reduced = false): number {
  return STANDUP_TO_IDLE_FADE_MS;
}

/**
 * 起身序列在 `elapsedMs` 时该显示第几帧：按整段时长**均分**，钳在最后一帧、不循环。
 *
 * 默认参数就是 `zhou_stand_up` 的素材契约（8 帧 / 520ms），场景只需传已播时长。
 * 例：8 帧 / 520ms 时每帧 65ms，0 → f0、64 → f0、65 → f1、519/520/超界 → f7。
 */
export function standUpFrameAt(
  elapsedMs: number,
  frameCount: number = CH01_STAND_UP_SEQUENCE.frameCount,
  durationMs: number = CH01_STAND_UP_SEQUENCE.durationMs,
): number {
  if (!Number.isFinite(frameCount) || frameCount <= 0) return 0;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return frameCount - 1;
  const clamped = Math.min(elapsedMs, durationMs);
  return Math.min(frameCount - 1, Math.floor((clamped / durationMs) * frameCount));
}

/**
 * 从贴图尺寸判断能切出几帧。
 *
 * 素材按 **横排 strip** 加载成一张图（与行走 sheet 同一套做法，`AssetKind` 没有
 * spritesheet），所以这里用「宽度 / frameWidth」判定，而不是 Phaser 的 frameTotal：
 * 占位图 `zhou_sit.png`（96×160）→ 0，正式 1280×400 → 8，多出来的帧裁掉。
 * < 2 帧一律视为不可用，场景直接落回站立静态图（绝不白屏/报错）。
 */
export function standUpFramesFromLayout(
  width: number,
  height: number,
  meta = CH01_STAND_UP_SEQUENCE,
): number {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 0;
  if (width < meta.frameWidth * 2 || height < meta.frameHeight) return 0;
  return Math.min(Math.floor(width / meta.frameWidth), meta.frameCount);
}

export type PerformanceTimelineId = 'dreamEntry' | 'dreamFlash' | 'wakeUp' | 'getUp';

interface StepTiming {
  /** 正常节奏下这一步占用的时长（ms）。 */
  readonly ms: number;
  /** reduced-motion 下的时长；省略时取 `ms` 的一半（最低 60ms）。 */
  readonly reducedMs?: number;
  /**
   * 与**上一步同时开始**，不额外占用时间线长度（目前只有 `float-actor` 用）。
   *
   * 用途：起身帧序列（`frame-sequence`）在播的同时，小白也要同步升起。时间线是顺序数组，
   * 没有这个标记就只能「起身演完再飘起来」或者「先飘起来再起身」——都不是同步。
   * `planPerformance()` 会把它压在**上一步的起点**上，总时长取所有步骤结束时间的最大值。
   */
  readonly parallel?: boolean;
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

/**
 * 小白「飘到与主角头部齐平」。
 *
 * 与 `move-actor` 的区别：目标高度**不按脚底+格数**给，而是按站立姿态的头部中线
 * （`CH01_STAND_HEAD_CENTER_OFFSET`）给——头部高度改了、贴图换了，漂浮落点跟着对，
 * 不会变成「浮在胸口」或「飘到头顶上方」。
 */
export interface FloatActorStep extends StepTiming {
  readonly kind: 'float-actor';
  readonly actor: 'xiaobai';
  /** 目标高度锚点：`head` = 主角头部可见轮廓的中线（站立姿态，与脚底固定距离）。 */
  readonly anchor: 'head';
  /** 相对锚点的额外偏移（设计 px，负 = 更高）；0 = 正对头部中线。 */
  readonly offsetPx: number;
}

export interface WaitStep extends StepTiming {
  readonly kind: 'wait';
}

export interface FlashStep extends StepTiming {
  readonly kind: 'flash';
  /** 白场淡入时长。 */
  readonly holdMs: number;
  readonly reducedHoldMs?: number;
  /** 淡出时长；`handoff` 时交给下一个场景，不计入时间线总时长。 */
  readonly outMs: number;
  readonly reducedOutMs?: number;
  /**
   * 淡出交接给下一个场景：本场景只负责淡入 + 保持全白，**不淡出**。
   *
   * 入梦白光必须这样用——寝室里一淡出就会露出寝室最后一帧（t27 实测露 0.48s）。
   */
  readonly handoff?: boolean;
}

export interface FrameSequenceStep extends StepTiming {
  /** 帧序列步骤：场景按「已播时长 / 整段时长 × 帧数」取帧，不叠 ease。 */
  readonly kind: 'frame-sequence';
  readonly actor: 'zhou';
  /** 序列 id；场景据此挑 sheet（目前只有起身一段）。 */
  readonly sequence: 'standUp';
  readonly frameCount: number;
  readonly frameMs: number;
  /** 只允许 `Linear`（见 `CH01_STAND_UP_SEQUENCE`）。 */
  readonly ease: 'Linear';
}

export type PerformanceStep =
  | WalkStep
  | SitStep
  | MoveActorStep
  | FloatActorStep
  | WaitStep
  | FlashStep
  | FrameSequenceStep;

export interface PerformanceTimeline {
  readonly id: PerformanceTimelineId;
  readonly steps: readonly PerformanceStep[];
}

/**
 * CG 结束那一帧的构图：**已经坐定**，小白已经在右侧。
 *
 * 两步都是 0 时长——场景在手机 CG 的 `onDone` 里同步执行它们，
 * 因此玩家从 CG 切回地图时看到的第一帧就是「坐在地上、小白在右边」，
 * 不会再出现「站在书桌边说话」的中间态。
 */
export const CH01_DREAM_ENTRY_PERFORMANCE: PerformanceTimeline = {
  id: 'dreamEntry',
  steps: [
    {
      kind: 'sit',
      actor: 'zhou',
      to: CH01_SIT_TILE,
      facing: 'right',
      from: 'sit',
      dust: false,
      ms: 0,
      reducedMs: 0,
    },
    {
      kind: 'move-actor',
      actor: 'xiaobai',
      offset: CH01_XIAOBAI_OFFSET,
      ms: 0,
      reducedMs: 0,
    },
  ],
};

/**
 * 对白说完之后的入梦白场：停顿一拍 → 白光淡入 → 保持全白 → **交接**给金殿。
 *
 * `handoff: true` 表示淡出不在寝室做：`finishPerformance` 只保持全白，
 * `beginPalace` 在切场景之后才在白场之上淡出，寝室一帧都不会露出来。
 */
export const CH01_DREAM_FLASH_PERFORMANCE: PerformanceTimeline = {
  id: 'dreamFlash',
  steps: [
    // 对白最后一句是「什么……情况……」，给玩家一拍反应时间就起白场。
    { kind: 'wait', ms: 320, reducedMs: 120 },
    {
      kind: 'flash',
      ms: 550,
      reducedMs: 220,
      holdMs: 260,
      reducedHoldMs: 120,
      outMs: 340,
      reducedOutMs: 160,
      handoff: true,
    },
  ],
};

/**
 * 战后回来：第一拍是 `sit`（进场景时就坐着），随后起身（`zhou_stand_up` 帧序列，
 * 素材不可用时直接落回站立静态图，不做「缩小的站立图」）、**同时**小白同步飘到与
 * 头部齐平（`float-actor` / `parallel`），再留一拍给画面收势。
 * 顺序被单测锁住——绝不能变成先 `stand` 再补坐下。
 *
 * `ms` = 8 帧 × 65ms 的帧序列时长；`reducedMs` 等比例减半（260）。
 * 小白的漂浮与起身**等长、同时开始、同时结束**：起身最后一帧站直的那一刻，
 * 它也刚好停在头部水平线上（不是起身完了才慢慢补飘上来）。
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
    {
      kind: 'frame-sequence',
      actor: 'zhou',
      sequence: 'standUp',
      frameCount: CH01_STAND_UP_SEQUENCE.frameCount,
      frameMs: CH01_STAND_UP_SEQUENCE.frameMs,
      ease: CH01_STAND_UP_SEQUENCE.ease,
      ms: CH01_STAND_UP_SEQUENCE.durationMs,
      // 等比例缩短：动画的每一帧都还在，只是每帧更短。
      reducedMs: Math.round(CH01_STAND_UP_SEQUENCE.durationMs / 2),
    },
    {
      kind: 'float-actor',
      actor: 'xiaobai',
      anchor: 'head',
      offsetPx: CH01_XIAOBAI_HEAD_OFFSET_PX,
      // 与上一步（起身帧序列）同一刻起飘、同一刻停，不额外占用时间线。
      parallel: true,
      ms: CH01_STAND_UP_SEQUENCE.durationMs,
      reducedMs: Math.round(CH01_STAND_UP_SEQUENCE.durationMs / 2),
    },
    { kind: 'wait', ms: 160, reducedMs: 60 },
  ],
};

/**
 * 黑场胁迫收尾：趴地 → 撑起坐住 → 起身（8 帧）→ 小白同步飘回头部中线。
 *
 * 第一拍是 `wait`：场景在这 200ms 里把趴姿交叉淡成坐姿（站起序列第 0 帧），
 * 时间线自己不驱动贴图，等淡完再开帧序列，避免「还趴着就开始站」。
 * 之后的 `frame-sequence` / `float-actor(parallel)` 与 `CH01_WAKE_PERFORMANCE` 同源同长。
 */
export const CH01_GETUP_PERFORMANCE: PerformanceTimeline = {
  id: 'getUp',
  steps: [
    { kind: 'wait', ms: 200, reducedMs: 60 },
    {
      kind: 'frame-sequence',
      actor: 'zhou',
      sequence: 'standUp',
      frameCount: CH01_STAND_UP_SEQUENCE.frameCount,
      frameMs: CH01_STAND_UP_SEQUENCE.frameMs,
      ease: CH01_STAND_UP_SEQUENCE.ease,
      ms: CH01_STAND_UP_SEQUENCE.durationMs,
      reducedMs: Math.round(CH01_STAND_UP_SEQUENCE.durationMs / 2),
    },
    {
      kind: 'float-actor',
      actor: 'xiaobai',
      anchor: 'head',
      offsetPx: CH01_XIAOBAI_HEAD_OFFSET_PX,
      parallel: true,
      ms: CH01_STAND_UP_SEQUENCE.durationMs,
      reducedMs: Math.round(CH01_STAND_UP_SEQUENCE.durationMs / 2),
    },
    { kind: 'wait', ms: 140, reducedMs: 60 },
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

/** 白场淡出时长；`handoff` 时这期间已经在下一个场景，不计入时间线总时长。 */
export function flashOutMs(step: FlashStep, reduced = false): number {
  return reduced ? step.reducedOutMs ?? half(step.outMs) : step.outMs;
}

/** 整段时间线总时长（到最后一个步骤结束、可以交给下一个流程为止）。 */
export function timelineDurationMs(timeline: PerformanceTimeline, reduced = false): number {
  return planPerformance(timeline, reduced).reduce(
    (end, planned) => Math.max(end, planned.startAtMs + planned.durationMs),
    0,
  );
}

/** 时间线上的一步：什么时候开始、占多久。场景只照这个表挂定时器，不再自己累加。 */
export interface PerformanceStepPlan {
  readonly step: PerformanceStep;
  readonly startAtMs: number;
  readonly durationMs: number;
}

/**
 * 把顺序数组展开成「开始时间 + 时长」。
 *
 * - 普通步骤接在上一步结束点；
 * - `parallel: true` 的步骤压到**上一步的起点**（不是上一步的结束点）：
 *   起身帧序列与小白的同步漂浮就是这么对齐的；
 * - 总时长取所有步骤 `startAtMs + durationMs` 的最大值，所以并行步骤不会把时间线撑长。
 *
 * 纯函数，不 import Phaser；场景和单测共用同一份计划。
 */
export function planPerformance(
  timeline: PerformanceTimeline,
  reduced = false,
): readonly PerformanceStepPlan[] {
  const plan: PerformanceStepPlan[] = [];
  let cursor = 0;
  for (const step of timeline.steps) {
    const durationMs = stepDurationMs(step, reduced);
    const previous = plan.at(-1);
    /**
     * 第一步就标 `parallel` 没有「上一步」可并行，退化成从 0 开始——
     * 不抛错、不静默跳过（跳过会让这一步永远不播）。
     */
    const startAtMs = step.parallel === true && previous ? previous.startAtMs : cursor;
    plan.push({ step, startAtMs, durationMs });
    cursor = Math.max(cursor, startAtMs + durationMs);
  }
  return plan;
}

/**
 * 白场交接时间表。
 *
 * `switchAtMs` 必须正好等于「淡入 + 保持」——也就是时间线上 flash 这一步结束时：
 * 此刻 overlay 已 **100% 不透明**，切场景发生在全白期间，寝室的任何一帧都看不见；
 * 淡出时长只在下一个场景里使用。
 */
export interface FlashHandoffPlan {
  readonly fadeInMs: number;
  readonly opaqueHoldMs: number;
  readonly switchAtMs: number;
  readonly outMs: number;
}

export function planFlashHandoff(step: FlashStep, reduced = false): FlashHandoffPlan {
  const fadeInMs = flashInMs(step, reduced);
  const opaqueHoldMs = reduced ? step.reducedHoldMs ?? half(step.holdMs) : step.holdMs;
  return {
    fadeInMs,
    opaqueHoldMs,
    switchAtMs: fadeInMs + opaqueHoldMs,
    outMs: flashOutMs(step, reduced),
  };
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
