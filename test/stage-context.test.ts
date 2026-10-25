import { describe, expect, it } from 'vitest';
import {
  createStageContext,
  isStageLaunchContext,
  normalizeSeed,
  parseBooleanToken,
  readStageContext,
  stageBoolParam,
  stageIntParam,
  stageParam,
  type CgFrame,
} from '../src/dev/stage-types';
import { hashSeed, mulberry32, randomInt } from '../src/dev/random';

const frames: readonly CgFrame[] = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];

describe('stage context', () => {
  it('fills deterministic defaults', () => {
    const context = createStageContext({ id: 'scene.prologue', kind: 'scene' });
    expect(context).toMatchObject({
      stageId: 'scene.prologue',
      kind: 'scene',
      preview: true,
      seed: 1,
      skip: false,
      frame: 0,
      origin: 'code',
    });
    expect(context.params).toEqual({});
    expect(typeof context.startedAt).toBe('number');
  });

  it('normalizes seed and clamps the CG frame', () => {
    const context = createStageContext(
      { id: 'cg.prologue.sequence', kind: 'cg', frames },
      { seed: -3, frame: 99, skip: true, origin: 'console', params: { a: '1' } },
    );
    expect(context.seed).toBe(4294967293);
    expect(context.frame).toBe(2);
    expect(context.skip).toBe(true);
    expect(context.origin).toBe('console');
    expect(context.params).toEqual({ a: '1' });
  });

  it('reads typed params with fallbacks', () => {
    const context = createStageContext(
      { id: 'battle.sandbox', kind: 'battle' },
      { params: { enemies: 'a,b', turns: '99', fast: 'yes' } },
    );
    expect(stageParam(context, 'enemies')).toBe('a,b');
    expect(stageParam(context, 'missing')).toBeUndefined();
    expect(stageIntParam(context, 'turns', 10, 1, 20)).toBe(20);
    expect(stageIntParam(context, 'missing', 10)).toBe(10);
    expect(stageIntParam(context, 'turns', 10, 1, 20)).toBe(20);
    expect(stageBoolParam(context, 'fast', false)).toBe(true);
    expect(stageBoolParam(context, 'missing', true)).toBe(true);
  });

  it('guards the launch context shape', () => {
    const context = createStageContext({ id: 'battle.sandbox', kind: 'battle' });
    expect(isStageLaunchContext(context)).toBe(true);
    expect(isStageLaunchContext(null)).toBe(false);
    expect(isStageLaunchContext({})).toBe(false);
    expect(isStageLaunchContext({ ...context, stageId: 'invalid' })).toBe(false);
  });

  it('falls back when a scene is started directly without launch data', () => {
    const fallback = { id: 'cg.prologue.sky', kind: 'cg' as const };
    const context = readStageContext(undefined, fallback);
    expect(context.stageId).toBe('cg.prologue.sky');
    expect(context.origin).toBe('code');
    expect(context.preview).toBe(true);
  });

  it('parses seed and boolean tokens consistently', () => {
    expect(normalizeSeed(undefined)).toBe(1);
    expect(normalizeSeed(Number.NaN)).toBe(1);
    expect(normalizeSeed(3.9)).toBe(3);
    expect(normalizeSeed(-1)).toBe(4294967295);
    expect(parseBooleanToken('YES', false)).toBe(true);
    expect(parseBooleanToken('off', true)).toBe(false);
    expect(parseBooleanToken('nope', true)).toBe(true);
    expect(parseBooleanToken(undefined, false)).toBe(false);
  });
});

describe('deterministic random', () => {
  it('replays the same sequence for the same seed', () => {
    const first = mulberry32(7);
    const second = mulberry32(7);
    const a = Array.from({ length: 8 }, () => first());
    const b = Array.from({ length: 8 }, () => second());
    expect(a).toEqual(b);
    expect(new Set(a).size).toBeGreaterThan(1);
    expect(a.every((value) => value >= 0 && value < 1)).toBe(true);
  });

  it('diverges for different seeds and hashes stably', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
    expect(hashSeed('battle.sandbox')).toBe(hashSeed('battle.sandbox'));
    expect(hashSeed('battle.sandbox')).not.toBe(hashSeed('battle.other'));
  });

  it('randomInt stays in the inclusive range', () => {
    const next = mulberry32(11);
    for (let index = 0; index < 200; index += 1) {
      const value = randomInt(next, 3, 5);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(5);
    }
    expect(randomInt(next, 4, 4)).toBe(4);
  });
});
