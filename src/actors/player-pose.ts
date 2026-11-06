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
 * - 贴图归属固定为 坐姿 > 行走 > 站立，`sync()` 只读这个结论，不再各自判断。
 */

export interface PlayerPose {
  readonly sitting: boolean;
  readonly walking: boolean;
  readonly walkClock: number;
}

export type PlayerTextureKind = 'sitting' | 'walking' | 'standing';

export function initialPose(): PlayerPose {
  return { sitting: false, walking: false, walkClock: 0 };
}

/**
 * 一次移动解算后的姿态。
 *
 * 坐着时即使调用方传 `walking: true`，也只挪脚底，不切换成行走帧——
 * 表演里 walk tween 的最后一帧不能抢走 sit 步骤的坐姿。
 */
export function poseAfterMove(pose: PlayerPose, walking: boolean, deltaMs: number): PlayerPose {
  const effectiveWalking = pose.sitting ? false : walking;
  const delta = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
  return {
    sitting: pose.sitting,
    walking: effectiveWalking,
    walkClock: effectiveWalking ? pose.walkClock + delta : 0,
  };
}

/** 坐下/起身的唯一入口；会同时清掉行走帧时钟。 */
export function poseAfterSetSitting(_pose: PlayerPose, sitting: boolean): PlayerPose {
  return {
    sitting,
    walking: false,
    walkClock: 0,
  };
}

/** 当前该用哪张贴图：坐姿 > 行走 > 站立（坐姿素材缺失时才降级）。 */
export function poseTextureKind(
  pose: PlayerPose,
  sittingTextureAvailable: boolean,
): PlayerTextureKind {
  if (pose.sitting && sittingTextureAvailable) return 'sitting';
  if (pose.walking) return 'walking';
  return 'standing';
}

/** 行走帧序号；非行走姿态一律 0（不读残留的 walkClock）。 */
export function walkFrameIndex(pose: PlayerPose, frameMs: number, frameCount: number): number {
  if (!pose.walking || frameMs <= 0 || frameCount <= 0) return 0;
  return Math.floor(pose.walkClock / frameMs) % frameCount;
}
