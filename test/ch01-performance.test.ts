import { describe, expect, it } from 'vitest';
import { CH01_ASSET_KEYS, CH01_Q_STATIC_SPRITES, CH01_STATIC_SPRITES } from '../src/assets/keys';
import { isWalkableTile } from '../src/map/core/room';
import { CH01_DORM_ROOM } from '../src/map/rooms/ch01-dorm';
import {
  initialPose,
  poseAfterMove,
  poseAfterSetSitting,
  poseTextureKind,
} from '../src/actors/player-pose';
import {
  CH01_DREAM_ENTRY_PERFORMANCE,
  CH01_DREAM_FLASH_PERFORMANCE,
  CH01_SIT_DISPLAY_HEIGHT,
  CH01_SIT_HEAD_OFFSET,
  CH01_SIT_TILE,
  CH01_STAND_UP_SEQUENCE,
  CH01_WAKE_PERFORMANCE,
  CH01_XIAOBAI_OFFSET,
  STANDUP_TO_IDLE_FADE_MS,
  flashInMs,
  flashOutMs,
  planFlashHandoff,
  resolveSittingKey,
  resolveStandingKey,
  sittingScaleFor,
  standUpFrameAt,
  standUpFramesFromLayout,
  standUpToIdleFadeMs,
  stepDurationMs,
  timelineDurationMs,
  type FlashStep,
  type PerformanceStep,
} from '../src/story/ch01-performance';

/**
 * 寝室表演的时间线契约（t29 重排）。
 *
 * 这些断言锁的是「编排」而不是观感：步骤顺序、时长、reduced-motion 降级、缺图回退。
 * 观感（坐地贴图、白光亮度）留给合并后的统一实机/录屏验收。
 */

describe('CG 结束即坐定（dreamEntry）', () => {
  const timeline = CH01_DREAM_ENTRY_PERFORMANCE;

  it('第一步是「已坐定」，不是 walk / stand', () => {
    const first = timeline.steps[0];
    expect(first?.kind).toBe('sit');
    if (first?.kind !== 'sit') throw new Error('expected sit');
    // from: 'sit' = 已经坐着，只把坐标/朝向钉死；不会播「站起来→坐下」的过渡。
    expect(first.from).toBe('sit');
    expect(first.to).toEqual(CH01_SIT_TILE);
    expect(first.facing).toBe('right');
    expect(first.dust).toBe(false);

    // 整段不允许出现走位或起身：CG 之后不该再有「站在书桌边」的中间态。
    expect(timeline.steps.some((step) => step.kind === 'walk')).toBe(false);
    expect(timeline.steps.some((step) => step.kind === 'frame-sequence')).toBe(false);
  });

  it('每一步都是 0 时长（场景在 CG 回调里同步执行，不经过 Clock）', () => {
    for (const step of timeline.steps) {
      expect(stepDurationMs(step, false)).toBe(0);
      expect(stepDurationMs(step, true)).toBe(0);
    }
    expect(timelineDurationMs(timeline)).toBe(0);
    expect(timelineDurationMs(timeline, true)).toBe(0);
  });

  it('坐点在寝室的可走格上（不是家具/墙）', () => {
    expect(isWalkableTile(CH01_DORM_ROOM, CH01_SIT_TILE[0], CH01_SIT_TILE[1])).toBe(true);
  });

  it('小白同帧落到主角右侧、略高', () => {
    const move = timeline.steps[1];
    expect(move?.kind).toBe('move-actor');
    if (move?.kind !== 'move-actor') throw new Error('expected move-actor');
    expect(move.offset[0]).toBeGreaterThan(0);
    expect(move.offset[1]).toBeLessThan(0);
    expect(move.offset).toEqual(CH01_XIAOBAI_OFFSET);
    expect(stepDurationMs(move)).toBe(0);
  });

  it('对白期间 sit 不会被 sync / 走位帧解除（坐姿独占）', () => {
    let pose = poseAfterSetSitting(initialPose(), true);
    for (let i = 0; i < 30; i += 1) pose = poseAfterMove(pose, true, 16);
    expect(pose.sitting).toBe(true);
    expect(pose.walking).toBe(false);
    expect(poseTextureKind(pose, true)).toBe('sitting');
  });
});

describe('坐地尺寸换算（不拉伸图片凑大小）', () => {
  it('占位 zhou_sit（96×160）→ 1.0，正式素材（160×400）→ 0.4', () => {
    expect(sittingScaleFor(160)).toBe(1);
    expect(sittingScaleFor(400)).toBe(0.4);
    expect(CH01_SIT_DISPLAY_HEIGHT).toBe(160);
  });

  it('源图尺寸拿不到时退回 1（不会把角色缩没）', () => {
    expect(sittingScaleFor(0)).toBe(1);
    expect(sittingScaleFor(Number.NaN)).toBe(1);
    expect(sittingScaleFor(-10)).toBe(1);
  });

  it('坐姿头顶高度低于显示高度（表情气泡落在坐着的脑袋上）', () => {
    expect(CH01_SIT_HEAD_OFFSET).toBeGreaterThan(0);
    expect(CH01_SIT_HEAD_OFFSET).toBeLessThan(CH01_SIT_DISPLAY_HEIGHT);
  });
});

describe('入梦白光（dreamFlash，含交接）', () => {
  const timeline = CH01_DREAM_FLASH_PERFORMANCE;
  const flash = timeline.steps[1];

  it('顺序：停顿一拍 → 白光；白光必须是最后一步', () => {
    expect(timeline.steps.map((step) => step.kind)).toEqual(['wait', 'flash']);
    expect(timeline.steps.at(-1)).toBe(flash);
  });

  it('白光要求交接：寝室只淡入，不淡出', () => {
    if (flash?.kind !== 'flash') throw new Error('expected flash');
    expect(flash.handoff).toBe(true);
    // 时间线总时长只算「淡入 + 保持」，淡出留给下一个场景。
    expect(stepDurationMs(flash)).toBe(flash.ms + flash.holdMs);
    expect(flashOutMs(flash)).toBeGreaterThan(0);
  });

  it('切场景发生在全白之后：switchAtMs = 淡入 + 保持 = 时间线结束点', () => {
    if (flash?.kind !== 'flash') throw new Error('expected flash');
    const plan = planFlashHandoff(flash);
    expect(plan.fadeInMs).toBe(flashInMs(flash));
    expect(plan.opaqueHoldMs).toBe(flash.holdMs);
    expect(plan.switchAtMs).toBe(plan.fadeInMs + plan.opaqueHoldMs);
    // 没有任何「提前淡出」的窗口：整段时间线结束时刚好是全白
    // （flash 之前的 wait 不算在白光内部，切场点 = wait + 淡入 + 保持）。
    const beforeFlash = stepDurationMs(timeline.steps[0] as PerformanceStep);
    expect(plan.switchAtMs + beforeFlash).toBe(timelineDurationMs(timeline));
    expect(plan.switchAtMs).toBeGreaterThanOrEqual(plan.fadeInMs);
    expect(plan.opaqueHoldMs).toBeGreaterThan(0);
  });

  it('正常总时长 1130ms（320 停顿 + 550 淡入 + 260 全白）', () => {
    expect(timelineDurationMs(timeline)).toBe(1130);
    if (flash?.kind !== 'flash') throw new Error('expected flash');
    expect(flash.ms).toBe(550);
    expect(flash.holdMs).toBe(260);
    expect(flash.outMs).toBeGreaterThanOrEqual(300);
  });

  it('reduced-motion 更短，且仍有全白保持', () => {
    expect(timelineDurationMs(timeline, true)).toBe(460);
    expect(timelineDurationMs(timeline, true)).toBeLessThan(timelineDurationMs(timeline));
    for (const step of timeline.steps) {
      expect(stepDurationMs(step, true)).toBeLessThan(stepDurationMs(step, false));
    }
    if (flash?.kind !== 'flash') throw new Error('expected flash');
    const plan = planFlashHandoff(flash, true);
    expect(plan.opaqueHoldMs).toBe(120);
    expect(plan.outMs).toBe(160);
    expect(plan.fadeInMs).toBe(220);
  });
});

describe('寝室战后起身表演（wakeUp）', () => {
  const timeline = CH01_WAKE_PERFORMANCE;

  it('第一步是 sit 而不是起身（进来就坐在地上，不是先站再瞬移坐下）', () => {
    expect(timeline.steps[0]?.kind).toBe('sit');
    const first = timeline.steps[0];
    if (first?.kind !== 'sit') throw new Error('expected sit');
    expect(first.to).toEqual(CH01_SIT_TILE);
    expect(first.from).toBe('sit');
    const firstSequence = timeline.steps.findIndex((step) => step.kind === 'frame-sequence');
    expect(firstSequence).toBeGreaterThan(0);
  });

  it('起身 = frame-sequence（8 帧 × 65ms = 520ms），后面留一拍再恢复对话', () => {
    const stand = timeline.steps.find((step) => step.kind === 'frame-sequence');
    expect(stand?.kind).toBe('frame-sequence');
    if (stand?.kind !== 'frame-sequence') throw new Error('expected frame-sequence');
    expect(stand.actor).toBe('zhou');
    expect(stand.sequence).toBe('standUp');
    expect(stand.frameCount).toBe(CH01_STAND_UP_SEQUENCE.frameCount);
    expect(stand.frameMs).toBe(CH01_STAND_UP_SEQUENCE.frameMs);
    expect(stand.frameCount * stand.frameMs).toBe(520);
    expect(stand.ms).toBe(520);
    expect(stand.ms).toBe(CH01_STAND_UP_SEQUENCE.durationMs);
    expect(stepDurationMs(stand)).toBe(520);
    expect(timeline.steps.at(-1)?.kind).toBe('wait');
  });

  it('帧序列只允许 Linear（ease 会让某些帧停更久、另一些被跳过）', () => {
    expect(CH01_STAND_UP_SEQUENCE.ease).toBe('Linear');
    const stand = timeline.steps.find((step) => step.kind === 'frame-sequence');
    if (stand?.kind !== 'frame-sequence') throw new Error('expected frame-sequence');
    expect(stand.ease).toBe('Linear');
    // 线性推进：帧号与已播时长成正比（任何 ease 曲线都会破坏这个比例）。
    const quarter = stand.ms / 4;
    expect(standUpFrameAt(quarter, stand.frameCount, stand.ms)).toBe(2);
    expect(standUpFrameAt(quarter * 2, stand.frameCount, stand.ms)).toBe(4);
    expect(standUpFrameAt(quarter * 3, stand.frameCount, stand.ms)).toBe(6);
  });

  it('reduced-motion 等比例减半（帧序列 260ms，每一帧都还在）', () => {
    const stand = timeline.steps.find((step) => step.kind === 'frame-sequence');
    if (stand?.kind !== 'frame-sequence') throw new Error('expected frame-sequence');
    expect(stepDurationMs(stand, true)).toBe(260);
    expect(stepDurationMs(stand, true)).toBe(stand.ms / 2);
    // reduced 只压缩时长，不压缩帧数：帧号映射仍按 8 帧均分。
    expect(standUpFrameAt(0, stand.frameCount, 260)).toBe(0);
    expect(standUpFrameAt(130, stand.frameCount, 260)).toBe(4);
    expect(standUpFrameAt(260, stand.frameCount, 260)).toBe(7);
  });

  it('总时长 1320ms，reduced-motion 560ms', () => {
    expect(timelineDurationMs(timeline)).toBe(1320);
    expect(timelineDurationMs(timeline, true)).toBe(560);
    expect(timelineDurationMs(timeline, true)).toBeLessThan(timelineDurationMs(timeline));
  });

  it('起身末帧 → idle 交叉淡入：110ms 短过渡，reduced-motion 硬切', () => {
    // 时长必须在 (0, 120]：太长会被看成「淡出」，太短等于没磨平侧脸→3/4 的跳变。
    expect(STANDUP_TO_IDLE_FADE_MS).toBeGreaterThan(0);
    expect(STANDUP_TO_IDLE_FADE_MS).toBeLessThanOrEqual(120);
    expect(standUpToIdleFadeMs(false)).toBe(STANDUP_TO_IDLE_FADE_MS);
    // reduced-motion 不建临时层，直接硬切。
    expect(standUpToIdleFadeMs(true)).toBe(0);
    // 交叉发生在帧序列结束之后，必须赶在表演收尾（最后的 wait）之前完成，
    // 否则 performing 解除、update() 的 sync() 会和临时层抢同一张 sprite。
    const tail = timeline.steps.at(-1);
    expect(tail?.kind).toBe('wait');
    if (tail?.kind !== 'wait') throw new Error('expected wait');
    expect(STANDUP_TO_IDLE_FADE_MS).toBeLessThanOrEqual(stepDurationMs(tail));
    // reduced 下是 0（硬切），自然落在缩短后的收势里。
    expect(standUpToIdleFadeMs(true)).toBeLessThanOrEqual(stepDurationMs(tail, true));
  });
});

describe('起身帧序列（zhou_stand_up）素材契约', () => {
  it('横排 strip：8 帧 × 160×400 = 1280（< 手机 4096 纹理上限）', () => {
    expect(CH01_STAND_UP_SEQUENCE.key).toBe(CH01_ASSET_KEYS.characters.zhouStandUp);
    expect(CH01_STAND_UP_SEQUENCE.frameCount * CH01_STAND_UP_SEQUENCE.frameWidth).toBe(1280);
    expect(CH01_STAND_UP_SEQUENCE.frameCount * CH01_STAND_UP_SEQUENCE.frameWidth).toBeLessThan(
      4096,
    );
  });

  it('按贴图宽度判定可用帧数：占位图（96×160）判定为不可用', () => {
    expect(standUpFramesFromLayout(1280, 400)).toBe(8);
    // 占位 zhou_sit.png 宽 96 < 2×160，高度也 < 400 → 0 → 场景走 tween 回退。
    expect(standUpFramesFromLayout(96, 160)).toBe(0);
    // 只有一帧宽 → 不可用；多出来的帧裁掉。
    expect(standUpFramesFromLayout(160, 400)).toBe(0);
    expect(standUpFramesFromLayout(640, 400)).toBe(4);
    expect(standUpFramesFromLayout(1600, 400)).toBe(8);
    expect(standUpFramesFromLayout(Number.NaN, 400)).toBe(0);
  });

  it('帧序号按整段时长均分（65ms/帧），钳在最后一帧、不循环', () => {
    // 默认参数 = 素材声明：8 帧 / 520ms。
    expect(standUpFrameAt(0)).toBe(0);
    expect(standUpFrameAt(64)).toBe(0);
    expect(standUpFrameAt(65)).toBe(1);
    expect(standUpFrameAt(260)).toBe(4);
    expect(standUpFrameAt(519)).toBe(7);
    expect(standUpFrameAt(520)).toBe(7);
    // 超界：负数当作 0，超过整段钳在最后一帧（绝不到 8 或回绕到 0）。
    expect(standUpFrameAt(-1)).toBe(0);
    expect(standUpFrameAt(521)).toBe(7);
    expect(standUpFrameAt(9999)).toBe(7);
    expect(standUpFrameAt(Number.NaN)).toBe(0);
    // 显式传参（帧数 / 时长）与默认值等价。
    expect(standUpFrameAt(65, 8, 520)).toBe(standUpFrameAt(65));
    expect(standUpFrameAt(260, 8, 520)).toBe(4);
    // 退化输入不抛错、不越界。
    expect(standUpFrameAt(100, 8, 0)).toBe(7);
    expect(standUpFrameAt(100, 0, 520)).toBe(0);
  });
});

describe('坐姿/站立贴图回退（缺图绝不白屏）', () => {
  const none = (): boolean => false;
  const only =
    (...keys: string[]) =>
    (key: string): boolean =>
      keys.includes(key);

  it('新素材存在时优先用 zhou_sit_right', () => {
    const key = resolveSittingKey(only(CH01_ASSET_KEYS.characters.zhouSitRight));
    expect(key).toBe(CH01_ASSET_KEYS.characters.zhouSitRight);
  });

  it('新素材缺失时回退到现有椅子占位 zhou_sit', () => {
    const key = resolveSittingKey(
      only(CH01_ASSET_KEYS.characters.zhouSit, CH01_Q_STATIC_SPRITES.right),
    );
    expect(key).toBe(CH01_ASSET_KEYS.characters.zhouSit);
  });

  it('坐姿全缺时退到 Q 版朝右立绘', () => {
    const key = resolveSittingKey(only(CH01_Q_STATIC_SPRITES.right));
    expect(key).toBe(CH01_Q_STATIC_SPRITES.right);
  });

  it('一张都没有时返回 null，由场景保持站立（不抛错）', () => {
    expect(resolveSittingKey(none)).toBeNull();
  });

  it('站立回退：Q 版朝右 → 旧版朝右', () => {
    expect(
      resolveStandingKey('right', only(CH01_Q_STATIC_SPRITES.right)),
    ).toBe(CH01_Q_STATIC_SPRITES.right);
    expect(
      resolveStandingKey('right', only(CH01_STATIC_SPRITES.right)),
    ).toBe(CH01_STATIC_SPRITES.right);
    expect(resolveStandingKey('right', none)).toBeNull();
  });
});

describe('时间线纯数据约定', () => {
  it('flash 步骤带 reduced 时长且不低于最小值', () => {
    const flash: FlashStep = {
      kind: 'flash',
      ms: 550,
      holdMs: 200,
      outMs: 320,
    };
    expect(flashInMs(flash, false)).toBe(550);
    expect(flashInMs(flash, true)).toBe(275);
    expect(flashOutMs(flash, true)).toBe(160);
    expect(planFlashHandoff(flash).switchAtMs).toBe(750);
    expect(planFlashHandoff(flash).outMs).toBe(320);
  });

  it('三段表演的坐下锚点一致（同一张地毯中心）', () => {
    const entrySit = CH01_DREAM_ENTRY_PERFORMANCE.steps.find((step) => step.kind === 'sit');
    const wakeSit = CH01_WAKE_PERFORMANCE.steps.find((step) => step.kind === 'sit');
    expect(entrySit?.kind === 'sit' && entrySit.to).toEqual(CH01_SIT_TILE);
    expect(wakeSit?.kind === 'sit' && wakeSit.to).toEqual(CH01_SIT_TILE);
  });
});
