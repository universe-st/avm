import { describe, expect, it } from 'vitest';
import {
  CH01_ASSET_KEYS,
  CH01_Q_STATIC_SPRITES,
  CH01_Q_WALK_SHEETS,
} from '../src/assets/keys';
import type { Facing } from '../src/map/types';
import {
  initialPose,
  planPlayerTexture,
  poseAfterMove,
  poseAfterSetSitting,
  poseAfterStandUpSettled,
  poseTextureKind,
  walkFrameIndex,
  type PlayerPose,
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
    expect(initialPose()).toEqual({ sitting: false, walking: false, walkClock: 0, sideIdle: false });
    expect(poseTextureKind(initialPose(), true)).toBe('standing');
  });

  it('站立行走会推进行走帧', () => {
    const walk = poseAfterMove(initialPose(), true, 65);
    expect(walk).toEqual({ sitting: false, walking: true, walkClock: 65, sideIdle: false });
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
    expect(standing).toEqual({ sitting: false, walking: false, walkClock: 0, sideIdle: false });
    expect(poseTextureKind(standing, true)).toBe('standing');
  });

  it('坐姿贴图缺失时降级到行走/站立，不卡在坐姿', () => {
    const sitting = poseAfterSetSitting(initialPose(), true);
    expect(poseTextureKind(sitting, false)).toBe('standing');
    const walking = poseAfterMove(sitting, false, 0);
    expect(poseTextureKind({ ...walking, walking: true }, false)).toBe('walking');
  });
});

/**
 * 起身后的侧面 idle（#t41）。
 *
 * 背景：起身序列末帧是正侧面朝右，旧实现切到 3/4 朝镜头的 `q.right`（先 110ms 交叉），
 * 看上去就是「站起来又快速转了个身」。现在起身结束先落到同朝向的 `zhou_idle_right`，
 * 可以硬切；这段特例只属于「刚起身、玩家还没动」，一迈步/转向就回到八向逻辑。
 */
describe('PlayerPose：起身后的侧面 idle', () => {
  const SIDE_IDLE = { key: CH01_ASSET_KEYS.characters.zhouIdleRight, facing: 'right' } as const;
  const allAvailable = (): boolean => true;

  function plan(
    pose: PlayerPose,
    facing: Facing = 'right',
    available: (key: string) => boolean = allAvailable,
  ) {
    return planPlayerTexture({
      pose,
      facing,
      statics: CH01_Q_STATIC_SPRITES,
      walkSheets: CH01_Q_WALK_SHEETS,
      sittingKey: CH01_ASSET_KEYS.characters.zhouSitRight,
      sideIdle: SIDE_IDLE,
      available,
    });
  }

  it('起身结束 = 站定 + 侧面 idle，贴图是 zhouIdleRight（不再钉 q.right）', () => {
    const pose = poseAfterStandUpSettled();
    expect(pose.sideIdle).toBe(true);
    expect(pose.sitting).toBe(false);
    expect(pose.walking).toBe(false);
    expect(poseTextureKind(pose, true, true)).toBe('side-idle');
    expect(plan(pose)).toEqual({ kind: 'side-idle', key: CH01_ASSET_KEYS.characters.zhouIdleRight });
    expect(plan(pose).key).not.toBe(CH01_Q_STATIC_SPRITES.right);
    expect(CH01_ASSET_KEYS.characters.zhouIdleRight).toBe('img.char.ch01.zhou_idle_right');
  });

  it('每帧「原地站着」的 moveTo 不会把侧面 idle 刷回 q.right', () => {
    // 探索循环每帧都会调 moveTo(position, facing, false, 0)；坐标/朝向都没变，不算「动了」。
    let pose = poseAfterStandUpSettled();
    for (let i = 0; i < 30; i += 1) pose = poseAfterMove(pose, false, 0);
    expect(pose.sideIdle).toBe(true);
    expect(plan(pose).kind).toBe('side-idle');
  });

  it('玩家一迈步就切到行走帧，停步后是普通静态帧（不再钉在 idle）', () => {
    const settled = poseAfterStandUpSettled();
    const walking = poseAfterMove(settled, true, 16);
    expect(walking.sideIdle).toBe(false);
    expect(plan(walking)).toEqual({ kind: 'walking', key: CH01_Q_WALK_SHEETS.right });
    const stopped = poseAfterMove(walking, false, 0);
    expect(stopped.sideIdle).toBe(false);
    expect(plan(stopped)).toEqual({ kind: 'standing', key: CH01_Q_STATIC_SPRITES.right });
  });

  it('只转向（没有位移）也作废侧面 idle，按新朝向取图', () => {
    const settled = poseAfterStandUpSettled();
    const turned = poseAfterMove(settled, false, 0, true);
    expect(turned.sideIdle).toBe(false);
    expect(plan(turned, 'left')).toEqual({ kind: 'standing', key: CH01_Q_STATIC_SPRITES.left });
    expect(plan(turned, 'down')).toEqual({ kind: 'standing', key: CH01_Q_STATIC_SPRITES.down });
  });

  it('侧面 idle 只匹配它自己的朝向（素材是正侧面朝右）', () => {
    const settled = poseAfterStandUpSettled();
    // 标记还在、但朝向不是 right：不能用朝右的侧面图。
    expect(plan(settled, 'left')).toEqual({ kind: 'standing', key: CH01_Q_STATIC_SPRITES.left });
  });

  it('坐下清掉侧面 idle；起身时不会凭空复活', () => {
    const sitting = poseAfterSetSitting(poseAfterStandUpSettled(), true);
    expect(sitting.sideIdle).toBe(false);
    expect(plan(sitting).kind).toBe('sitting');
    const stood = poseAfterSetSitting(sitting, false);
    expect(stood.sideIdle).toBe(false);
    expect(plan(stood)).toEqual({ kind: 'standing', key: CH01_Q_STATIC_SPRITES.right });
  });

  it('起身表演收尾再调一次 setSitting(false) 不会擦掉侧面 idle', () => {
    // ch01-dorm-scene 的 startWakePerformance 回调会补一刀 setSitting(false)；
    // 那一下必须保留 performStand 收尾时钉下的 sideIdle，否则起身一结束就闪回 q.right。
    const settled = poseAfterStandUpSettled();
    const again = poseAfterSetSitting(settled, false);
    expect(again.sideIdle).toBe(true);
    expect(plan(again).kind).toBe('side-idle');
  });

  it('侧面素材缺失时降级到普通站立帧（绝不 setTexture 不存在的 key）', () => {
    const planMissing = plan(poseAfterStandUpSettled(), 'right', (key) => key !== SIDE_IDLE.key);
    expect(planMissing).toEqual({ kind: 'standing', key: CH01_Q_STATIC_SPRITES.right });
  });

  it('行走 sheet 缺失时退回静态帧（旧行为不变）', () => {
    const walking = poseAfterMove(poseAfterStandUpSettled(), true, 16);
    const planNoSheet = plan(walking, 'right', (key) => !key.includes('walk_'));
    expect(planNoSheet).toEqual({ kind: 'standing', key: CH01_Q_STATIC_SPRITES.right });
  });
});
