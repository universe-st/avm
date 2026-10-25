import { describe, expect, it } from 'vitest';
import {
  buildStageUrl,
  parseStageQuery,
  stageQueryToRunOptions,
  STAGE_QUERY_KEY,
} from '../src/dev/stage-query';

describe('parseStageQuery', () => {
  it('returns no request for a normal launch', () => {
    expect(parseStageQuery('')).toEqual({ request: null, error: null });
    expect(parseStageQuery('?foo=1')).toEqual({ request: null, error: null });
    expect(parseStageQuery('?stage=')).toEqual({ request: null, error: null });
  });

  it('parses the reserved parameters and keeps extras', () => {
    const parsed = parseStageQuery(
      '?stage=scene.prologue&seed=42&skip=1&frame=2&hud=0&enemies=miner.mask,miner.core',
    );
    expect(parsed.error).toBeNull();
    expect(parsed.request).toEqual({
      stageId: 'scene.prologue',
      seed: 42,
      skip: true,
      frame: 2,
      hud: false,
      params: { enemies: 'miner.mask,miner.core' },
    });
  });

  it('defaults hud on and skip off, and normalizes case', () => {
    const parsed = parseStageQuery('?stage=CG.ProLogue.SKY');
    expect(parsed.request?.stageId).toBe('cg.prologue.sky');
    expect(parsed.request?.hud).toBe(true);
    expect(parsed.request?.skip).toBe(false);
    expect(parsed.request?.seed).toBeNull();
    expect(parsed.request?.frame).toBeNull();
  });

  it('ignores invalid seed/frame instead of blocking the launch', () => {
    const parsed = parseStageQuery('?stage=scene.prologue&seed=abc&frame=-4');
    expect(parsed.request?.seed).toBeNull();
    expect(parsed.request?.frame).toBe(0);
    expect(parsed.error).toBeNull();
  });

  it('normalizes negative seeds to uint32', () => {
    const parsed = parseStageQuery('?stage=battle.sandbox&seed=-3');
    expect(parsed.request?.seed).toBe(4294967293);
  });

  it('rejects ids that do not follow the kind prefix rules', () => {
    const parsed = parseStageQuery('?stage=prologue');
    expect(parsed.request).toBeNull();
    expect(parsed.error).toContain('舞台 id 不合法');
  });

  it('maps to launcher options without leaking nulls', () => {
    const parsed = parseStageQuery('?stage=battle.sandbox&seed=7&turns=3&hud=0');
    expect(parsed.request).not.toBeNull();
    const options = stageQueryToRunOptions(parsed.request!);
    expect(options).toEqual({
      seed: 7,
      skip: false,
      frame: undefined,
      params: { turns: '3' },
      origin: 'url',
      hud: false,
    });
  });
});

describe('buildStageUrl', () => {
  it('keeps the current path and replaces the query', () => {
    const url = buildStageUrl('https://example.test/game/index.html?old=1#frag', 'cg.prologue.sky');
    expect(url).toBe('https://example.test/game/index.html?stage=cg.prologue.sky');
  });

  it('round-trips through parseStageQuery', () => {
    const url = buildStageUrl('https://example.test/', 'battle.sandbox', {
      seed: -3,
      skip: true,
      frame: 4,
      hud: false,
      params: { enemies: 'a,b', turns: '12' },
    });
    const parsed = parseStageQuery(new URL(url).search);
    expect(parsed.request).toEqual({
      stageId: 'battle.sandbox',
      seed: 4294967293,
      skip: true,
      frame: 4,
      hud: false,
      params: { enemies: 'a,b', turns: '12' },
    });
    expect(new URL(url).searchParams.get(STAGE_QUERY_KEY)).toBe('battle.sandbox');
  });

  it('omits default hud and false skip', () => {
    const url = buildStageUrl('https://example.test/', 'scene.title', { hud: true, skip: false });
    expect(new URL(url).searchParams.has('hud')).toBe(false);
    expect(new URL(url).searchParams.has('skip')).toBe(false);
  });

  it('refuses to build a URL for an invalid id', () => {
    expect(() => buildStageUrl('https://example.test/', 'not-a-stage')).toThrow('舞台 id 不合法');
  });
});
