import { describe, expect, it } from 'vitest';
import {
  initialPose,
  poseAfterMove,
  poseAfterSetSitting,
  poseTextureKind,
  walkFrameIndex,
} from '../src/actors/player-pose';

/**
 * 玩家姿态纯逻辑回归。
 *
 * 重点：入梦表演的 walk tween 和 sit 步骤在同一个 tick 结束（Phaser 默认 Clock 先于
 * TweenManager 更新），walk 的最后一帧 `moveTo(walking=true)` 绝不能把刚设好的坐姿
 * 覆盖回行走帧。这里把「坐下后 sync 不会改回行走帧」钉成纯逻辑断言。
 */
describe('PlayerPose：坐姿独占', () => {
  it('初始是站立姿态', () => {
    expect(initialPose()).toEqual({ sitting: false, walking: false, walkClock: 0 });
    expect(poseTextureKind(initialPose(), true)).toBe('standing');
  });

  it('站立行走会推进行走帧', () => {
    const walk = poseAfterMove(initialPose(), true, 65);
    expect(walk).toEqual({ sitting: false, walking: true, walkClock: 65 });
    expect(poseTextureKind(walk, true)).toBe('walking');
    expect(walkFrameIndex(walk, 65, 20)).toBe(1);
  });

  it('坐下后 walk 的最后一帧（walking=true）不能把姿态改回行走', () => {
    const sitting = poseAfterSetSitting(initialPose(), true);
    const afterStrayMove = poseAfterMove(sitting, true, 16);
    expect(afterStrayMove.sitting).toBe(true);
    expect(afterStrayMove.walking).toBe(false);
    expect(afterStrayMove.walkClock).toBe(0);
    // 这就是 PlayerActor.sync() 读取的结论：贴图必须仍是坐姿。
    expect(poseTextureKind(afterStrayMove, true)).toBe('sitting');
    expect(walkFrameIndex(afterStrayMove, 65, 20)).toBe(0);
  });

  it('坐下后反复 move（走位 tween 残余帧）也不会解除坐姿', () => {
    let pose = poseAfterSetSitting(initialPose(), true);
    for (let i = 0; i < 10; i += 1) pose = poseAfterMove(pose, true, 16);
    expect(pose.sitting).toBe(true);
    expect(poseTextureKind(pose, true)).toBe('sitting');
  });

  it('只有 setSitting(false) 能起身，并清空行走时钟', () => {
    const sitting = poseAfterMove(poseAfterSetSitting(initialPose(), true), true, 100);
    expect(sitting.walkClock).toBe(0);
    const standing = poseAfterSetSitting(sitting, false);
    expect(standing).toEqual({ sitting: false, walking: false, walkClock: 0 });
    expect(poseTextureKind(standing, true)).toBe('standing');
  });

  it('坐姿贴图缺失时降级到行走/站立，不卡在坐姿', () => {
    const sitting = poseAfterSetSitting(initialPose(), true);
    expect(poseTextureKind(sitting, false)).toBe('standing');
    const walking = poseAfterMove(sitting, false, 0);
    expect(poseTextureKind({ ...walking, walking: true }, false)).toBe('walking');
  });
});
