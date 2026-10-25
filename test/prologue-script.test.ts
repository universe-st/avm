import { describe, expect, it } from 'vitest';
import { BUNDLES } from '../src/assets/bundles';
import {
  PROLOGUE_CUES,
  cueText,
  holdMs,
  maskText,
  revealMs,
  totalMs,
  type PrologueCue,
} from '../src/story/prologue';

const EXPECTED_SPOKEN =
  '你，有做过梦吗？梦，无可捉摸，虚无缥缈。它根植于人的内心，人却从未真正了解过它。' +
  '但当它成为一场席卷了地球的灾难，人类被迫参加了一场他们未曾好好准备的战争。' +
  '而大多数人都不知道，这场战争，早就已经开始了。我们的故事，从一所学校开始。' +
  '20x5年9月7日。明山县·群英高级中学。';

const cue = (id: string, lines: readonly string[], hold = 1000): PrologueCue => ({
  id,
  image: 'img.prologue.sky',
  lines,
  holdMs: hold,
});

describe('prologue script', () => {
  it('keeps the user-provided copy in order and unchanged', () => {
    const spoken = PROLOGUE_CUES.flatMap((item) => item.lines).join('');
    expect(spoken).toBe(EXPECTED_SPOKEN);
    expect(spoken).toContain('20x5年9月7日');
  });

  it('opens straight on the first line, without the stage-direction caption', () => {
    const first = PROLOGUE_CUES[0];
    expect(first?.id).toBe('sky-question');
    expect(first?.lines).toEqual(['你，有做过梦吗？']);
    // 2026-10-25：开场「深夜天幕，一颗流星划过」的字样已删除，不再有 caption。
    expect(PROLOGUE_CUES.some((item) => 'caption' in item)).toBe(false);
  });

  it('keeps the meteor sweep on the opening cue', () => {
    const meteorCues = PROLOGUE_CUES.filter((item) => item.meteor);
    expect(meteorCues).toHaveLength(1);
    expect(meteorCues[0]?.image).toBe('img.prologue.sky');
  });

  it('uses only keys that the cutscene.prologue bundle declares', () => {
    const keys = new Set(BUNDLES['cutscene.prologue'].assets.map((asset) => asset.key));
    for (const item of PROLOGUE_CUES) {
      expect(keys.has(item.image)).toBe(true);
    }
  });

  it('has a unique, non-empty id for every cue', () => {
    const ids = PROLOGUE_CUES.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.length > 0)).toBe(true);
  });

  it('marks the final cue as the date card', () => {
    const last = PROLOGUE_CUES[PROLOGUE_CUES.length - 1];
    expect(last?.kind).toBe('card');
    expect(last?.lines).toEqual(['20x5年9月7日。', '明山县·群英高级中学。']);
  });
});

describe('typewriter masking', () => {
  const full = '它根植于人的内心，\n人却从未真正了解过它。';

  it('preserves line count and total length while typing', () => {
    const empty = maskText(full, 0);
    expect(empty.split('\n')).toHaveLength(2);
    expect(Array.from(empty)).toHaveLength(Array.from(full).length);
    expect(empty).not.toContain('它');

    const partial = maskText(full, 4);
    expect(partial.startsWith('它根植')).toBe(true);
    expect(partial.split('\n')).toHaveLength(2);
    expect(Array.from(partial)).toHaveLength(Array.from(full).length);
  });

  it('clamps out-of-range reveal counts', () => {
    expect(maskText(full, -10)).toBe(maskText(full, 0));
    expect(maskText(full, 9999)).toBe(full);
    expect(maskText(full, Number.NaN)).toBe(maskText(full, 0));
  });

  it('keeps the exact full text when complete', () => {
    expect(maskText(cueText(cue('x', ['你好', '世界'])), 99)).toBe('你好\n世界');
  });
});

describe('prologue timing', () => {
  it('derives per-cue timing from character count and holdMs', () => {
    const item = cue('x', ['你好'], 500);
    expect(revealMs(item)).toBe(2 * 55);
    expect(holdMs(item)).toBe(500);
    expect(holdMs({ ...item, holdMs: 0 })).toBe(0);
  });

  it('is a 20–30 second opening in auto mode', () => {
    const total = totalMs();
    expect(total).toBeGreaterThan(20_000);
    expect(total).toBeLessThan(30_000);
  });
});
