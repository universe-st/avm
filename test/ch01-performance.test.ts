import { describe, expect, it } from 'vitest';
import { CH01_ASSET_KEYS, CH01_Q_STATIC_SPRITES, CH01_STATIC_SPRITES } from '../src/assets/keys';
import { isWalkableTile } from '../src/map/core/room';
import { CH01_DORM_ROOM } from '../src/map/rooms/ch01-dorm';
import {
  CH01_DREAM_INTRO_PERFORMANCE,
  CH01_SIT_TILE,
  CH01_WAKE_PERFORMANCE,
  CH01_XIAOBAI_OFFSET,
  flashInMs,
  flashOutMs,
  resolveSittingKey,
  resolveStandingKey,
  stepDurationMs,
  timelineDurationMs,
  type FlashStep,
} from '../src/story/ch01-performance';

/**
 * 寝室两段表演的时间线契约。
 *
 * 这些断言锁的是「编排」而不是观感：步骤顺序、总时长、reduced-motion 降级、缺图回退。
 * 观感（走路速度、白光亮度）留给统一实机回归。
 */
describe('寝室入梦表演（dreamIntro）', () => {
  const timeline = CH01_DREAM_INTRO_PERFORMANCE;

  it('顺序：走路 → 坐下 → 小白到右侧 → 停顿 → 白光', () => {
    expect(timeline.steps.map((step) => step.kind)).toEqual([
      'walk',
      'sit',
      'move-actor',
      'wait',
      'flash',
    ]);
  });

  it('坐下点在寝室的可走格上（不是家具/墙）', () => {
    expect(isWalkableTile(CH01_DORM_ROOM, CH01_SIT_TILE[0], CH01_SIT_TILE[1])).toBe(true);
  });

  it('走到房间中心（tile 16,29）并面朝右，不写死像素', () => {
    const walk = timeline.steps[0];
    expect(walk?.kind).toBe('walk');
    if (walk?.kind !== 'walk') throw new Error('expected walk');
    expect(walk.to).toEqual(CH01_SIT_TILE);
    expect(walk.facing).toBe('right');

    const sit = timeline.steps[1];
    expect(sit?.kind).toBe('sit');
    if (sit?.kind !== 'sit') throw new Error('expected sit');
    expect(sit.from).toBe('stand');
    expect(sit.facing).toBe('right');
    expect(sit.dust).toBe(true);
  });

  it('小白落在主角右侧、略高（offset x > 0，y < 0）', () => {
    const move = timeline.steps[2];
    expect(move?.kind).toBe('move-actor');
    if (move?.kind !== 'move-actor') throw new Error('expected move-actor');
    expect(move.offset[0]).toBeGreaterThan(0);
    expect(move.offset[1]).toBeLessThan(0);
    expect(move.offset).toEqual(CH01_XIAOBAI_OFFSET);
  });

  it('白光：淡入 + 保持 + 淡出都有明确时长，且保持后才交给金殿', () => {
    const flash = timeline.steps[4];
    expect(flash?.kind).toBe('flash');
    if (flash?.kind !== 'flash') throw new Error('expected flash');
    expect(flash.ms).toBeGreaterThanOrEqual(450);
    expect(flash.ms).toBeLessThanOrEqual(600);
    expect(flash.holdMs).toBeGreaterThan(0);
    expect(flash.outMs).toBeGreaterThan(0);
    // 总时长里只算「淡入 + 保持」；淡出与 beginPalace 的转场重叠。
    expect(stepDurationMs(flash)).toBe(flash.ms + flash.holdMs);
  });

  it('正常节奏总时长 = 3890ms', () => {
    expect(timelineDurationMs(timeline)).toBe(3890);
  });

  it('reduced-motion 每一步都更短，总时长 1580ms', () => {
    const normal = timelineDurationMs(timeline, false);
    const reduced = timelineDurationMs(timeline, true);
    expect(reduced).toBeLessThan(normal);
    expect(reduced).toBe(1580);
    for (const step of timeline.steps) {
      expect(stepDurationMs(step, true)).toBeLessThan(stepDurationMs(step, false));
    }
    const flash = timeline.steps[4];
    if (flash?.kind !== 'flash') throw new Error('expected flash');
    expect(flashInMs(flash, true)).toBe(200);
    expect(flashOutMs(flash, true)).toBe(140);
  });
});

describe('寝室战后起身表演（wakeUp）', () => {
  const timeline = CH01_WAKE_PERFORMANCE;

  it('第一步是 sit 而不是 stand（进来就坐在地上，不是先站再瞬移坐下）', () => {
    expect(timeline.steps[0]?.kind).toBe('sit');
    expect(timeline.steps.some((step) => step.kind === 'stand')).toBe(true);
    const firstStand = timeline.steps.findIndex((step) => step.kind === 'stand');
    expect(firstStand).toBeGreaterThan(0);
  });

  it('起身动画 380–520ms，后面留一拍再恢复对话', () => {
    const stand = timeline.steps.find((step) => step.kind === 'stand');
    expect(stand?.kind).toBe('stand');
    if (stand?.kind !== 'stand') throw new Error('expected stand');
    expect(stand.ms).toBeGreaterThanOrEqual(380);
    expect(stand.ms).toBeLessThanOrEqual(520);
    expect(timeline.steps.at(-1)?.kind).toBe('wait');
  });

  it('总时长 1260ms，reduced-motion 520ms', () => {
    expect(timelineDurationMs(timeline)).toBe(1260);
    expect(timelineDurationMs(timeline, true)).toBe(520);
    expect(timelineDurationMs(timeline, true)).toBeLessThan(timelineDurationMs(timeline));
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
  });

  it('两段表演都必须包含坐下（构图锚点）', () => {
    expect(CH01_DREAM_INTRO_PERFORMANCE.steps.some((step) => step.kind === 'sit')).toBe(true);
    expect(CH01_WAKE_PERFORMANCE.steps.some((step) => step.kind === 'sit')).toBe(true);
  });
});
