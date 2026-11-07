/**
 * 玩家姿态的纯逻辑（无 Phaser 依赖，可在 Node 单测）。
 *
 * ## 为什么单独抽出来（#t23 真机回归的根因）
 *
 * 入梦表演里 `walk` 步骤的 tween 和 `sit` 步骤在**同一个 tick** 结束：
 * Phaser 场景默认插件顺序是 `Clock` → … → `TweenManager`，所以 `Clock` 上的
 * sit 定时器先跑，把角色切成坐姿；随后 `TweenManager` 里 walk tween 的最后一帧
 * 仍会调用 `PlayerActor.moveTo(..., walking=true)`。旧实现里 `moveTo()` 会
 * `this.sitting = false` 并 `sync()`，于是坐姿被行走帧/站立帧覆盖，画面停在站立。
 *
 * 规则：**坐姿是独占姿态**。
 * - `move` 只负责脚底坐标与朝向；坐着时忽略 `walking`、不推进行走帧；
 * - 只有 `setSitting(false)` 能解除坐姿；
 * - 贴图归属固定为 坐姿 > 行走 > 侧面 idle > 站立，`sync()` 只读这个结论，
 *   不再各自判断。
 *
 * ## 侧面 idle（#t41）
 *
 * 起身序列的末帧是**正侧面朝右**，原本要切到 3/4 朝镜头的 `q.right`，中间那一下
 * 看起来就是「转身」。现在起身结束先落到侧面 idle（`sideIdle`），朝向和末帧一致，
 * 可以硬切。这个姿态只属于「刚起身、玩家还没动」这一小段：玩家一迈步/转向/被挪位置，
 * 标记立刻作废，回到八向静态/行走逻辑。
 */

import type { Facing } from '../map/types';

export interface PlayerPose {
  readonly sitting: boolean;
  readonly walking: boolean;
  readonly walkClock: number;
  /**
   * 起身结束后的「侧面站立 idle」（素材是正侧面朝右）。
   *
   * 只在 `sitting === false && walking === false` 时有意义；玩家一动就清掉。
   */
  readonly sideIdle: boolean;
}

export type PlayerTextureKind = 'sitting' | 'walking' | 'side-idle' | 'standing';

export function initialPose(): PlayerPose {
  return { sitting: false, walking: false, walkClock: 0, sideIdle: false };
}

/**
 * 一次移动解算后的姿态。
 *
 * 坐着时即使调用方传 `walking: true`，也只挪脚底，不切换成行走帧——
 * 表演里 walk tween 的最后一帧不能抢走 sit 步骤的坐姿。
 *
 * `stirred` = 这一帧玩家**真的动了**（位移或转向）。默认取 `walking`：行走帧推进
 * 必然意味着动了。场景里「没输入也要 `moveTo(原地, 原朝向, false, 0)`」是每帧都调的，
 * 这时 `stirred` 为假，侧面 idle 必须留着——否则起身一站定就被刷回 `q.right`。
 */
export function poseAfterMove(
  pose: PlayerPose,
  walking: boolean,
  deltaMs: number,
  stirred = walking,
): PlayerPose {
  const effectiveWalking = pose.sitting ? false : walking;
  const delta = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
  return {
    sitting: pose.sitting,
    walking: effectiveWalking,
    walkClock: effectiveWalking ? pose.walkClock + delta : 0,
    // 玩家一动，起身后的侧面 idle 立刻作废（坐姿下本来就无效，也一并清掉）。
    sideIdle: pose.sideIdle && !stirred && !effectiveWalking,
  };
}

/**
 * 坐下/起身的唯一入口；会同时清掉行走帧时钟。
 *
 * 坐下的那一刻侧面 idle 必须作废；**起身（`sitting: false`）保留已有标记**——
 * 起身表演把姿态钉成「站定 + 侧面 idle」之后，收尾回调还会再调一次
 * `setSitting(false)`，那一下不能把侧面 idle 擦回 `q.right`。
 */
export function poseAfterSetSitting(pose: PlayerPose, sitting: boolean): PlayerPose {
  return {
    sitting,
    walking: false,
    walkClock: 0,
    sideIdle: sitting ? false : pose.sideIdle,
  };
}

/** 起身结束的站立姿态：站着、不走、站立 idle 用侧面素材（朝向由 actor 自己核对）。 */
export function poseAfterStandUpSettled(): PlayerPose {
  return { sitting: false, walking: false, walkClock: 0, sideIdle: true };
}

/** 当前该用哪张贴图：坐姿 > 行走 > 侧面 idle > 站立（坐姿素材缺失时才降级）。 */
export function poseTextureKind(
  pose: PlayerPose,
  sittingTextureAvailable: boolean,
  sideIdleAvailable = false,
): PlayerTextureKind {
  if (pose.sitting && sittingTextureAvailable) return 'sitting';
  if (pose.walking) return 'walking';
  if (pose.sideIdle && sideIdleAvailable) return 'side-idle';
  return 'standing';
}

/** 侧面 idle 素材（只有一张正侧面朝右，所以带朝向）。 */
export interface SideIdleTexture {
  readonly key: string;
  readonly facing: Facing;
}

export interface PlayerTexturePlanInput {
  readonly pose: PlayerPose;
  readonly facing: Facing;
  readonly statics: Readonly<Record<Facing, string>>;
  readonly walkSheets: Readonly<Record<Facing, string>>;
  /** 坐地贴图；没有配置时跳过坐姿。 */
  readonly sittingKey?: string;
  /** 起身后的侧面 idle；省略 = 不做这段特例。 */
  readonly sideIdle?: SideIdleTexture;
  /** 纹理是否已加载：缺图一律降级，绝不 `setTexture` 一个不存在的 key。 */
  readonly available: (key: string) => boolean;
}

export interface PlayerTexturePlan {
  readonly kind: PlayerTextureKind;
  readonly key: string;
}

/**
 * `sync()` 该给 sprite 换哪张图——整条决策链在这里，Phaser 只负责照做。
 *
 * 优先级与 `poseTextureKind` 一致：坐姿 > 行走 > 侧面 idle > 站立；行走 sheet 缺图
 * 时退回静态帧（旧行为），侧面 idle 缺图或朝向不符时也退回静态帧。
 */
export function planPlayerTexture(input: PlayerTexturePlanInput): PlayerTexturePlan {
  const { pose, facing } = input;
  const sitting = input.sittingKey;
  if (pose.sitting && sitting !== undefined && input.available(sitting)) {
    return { kind: 'sitting', key: sitting };
  }
  if (pose.walking) {
    const sheet = input.walkSheets[facing];
    if (input.available(sheet)) return { kind: 'walking', key: sheet };
  }
  const side = input.sideIdle;
  if (pose.sideIdle && side !== undefined && side.facing === facing && input.available(side.key)) {
    return { kind: 'side-idle', key: side.key };
  }
  return { kind: 'standing', key: input.statics[facing] };
}

/** 行走帧序号；非行走姿态一律 0（不读残留的 walkClock）。 */
export function walkFrameIndex(pose: PlayerPose, frameMs: number, frameCount: number): number {
  if (!pose.walking || frameMs <= 0 || frameCount <= 0) return 0;
  return Math.floor(pose.walkClock / frameMs) % frameCount;
}
