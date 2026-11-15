import { describe, expect, it } from 'vitest';
import { charsOf, maskDialogueText } from '../src/story/dialogue';
import { Typewriter, typewriterIntervalMs } from '../src/story/typewriter';
import { PALACE_BEATS } from '../src/story/ch01-palace';
import { textSpeedFactor } from '../src/app/settings';

/**
 * 金殿过场的打字机（t62）。
 *
 * 这里守的是「逐字」这件事本身的数学：四档速度的速率、instant 直接满、
 * 补全后不再增长，以及遮罩前后字数/行数不变（文本框固定，不能逐字跳行）。
 * 场景接线见 `test/palace-typewriter.test.ts`。
 */

const LINE = '白光褪去，你发现自己跪在冰冷光滑的地板上。';

function feed(writer: Typewriter, totalMs: number, stepMs = 1): void {
  const frames = Math.max(1, Math.round(totalMs / stepMs));
  for (let i = 0; i < frames; i += 1) writer.tick(stepMs);
}

describe('typewriterIntervalMs', () => {
  it('按 32ms × 速度倍率换算，四档都落到整毫秒', () => {
    expect(typewriterIntervalMs('normal')).toBe(32);
    expect(typewriterIntervalMs('fast')).toBe(Math.round(32 * textSpeedFactor('fast')));
    expect(typewriterIntervalMs('slow')).toBe(Math.round(32 * textSpeedFactor('slow')));
  });

  it('fast 比 normal 快、slow 比 normal 慢、instant 为 0（不进打字阶段）', () => {
    const slow = typewriterIntervalMs('slow');
    const normal = typewriterIntervalMs('normal');
    const fast = typewriterIntervalMs('fast');
    expect(fast).toBeGreaterThan(0);
    expect(fast).toBeLessThan(normal);
    expect(slow).toBeGreaterThan(normal);
    expect(typewriterIntervalMs('instant')).toBe(0);
  });
});

describe('Typewriter 速率', () => {
  /** 速率用长句量，避免撞上「整句已打完」的钳制（正式台词只有 20 来字）。 */
  const LONG = LINE.repeat(10);

  it('normal 档 1 秒吐出 1000/32 个字', () => {
    const writer = new Typewriter();
    writer.start(LONG, typewriterIntervalMs('normal'));
    expect(writer.typing).toBe(true);
    expect(writer.state.revealed).toBe(0);
    feed(writer, 1000);
    expect(writer.state.revealed).toBe(Math.floor(1000 / 32));
  });

  it('四档同一段时间内 slow < normal < fast（instant 直接满）', () => {
    const count = (speed: Parameters<typeof typewriterIntervalMs>[0]): number => {
      const writer = new Typewriter();
      writer.start(LONG, typewriterIntervalMs(speed));
      feed(writer, 1000);
      return writer.state.revealed;
    };
    const slow = count('slow');
    const normal = count('normal');
    const fast = count('fast');
    expect(slow).toBeLessThan(normal);
    expect(normal).toBeLessThan(fast);
    expect(slow).toBe(Math.floor(1000 / typewriterIntervalMs('slow')));
    expect(fast).toBe(Math.floor(1000 / typewriterIntervalMs('fast')));
    // 1 秒最多也就 55 个字，别把整句一次吐完。
    expect(fast).toBeLessThan(charsOf(LONG).length);
    expect(count('instant')).toBe(charsOf(LONG).length);
  });

  it('短句在 1 秒内就打完（正式台词 21 字 ≈ 0.67s）', () => {
    const writer = new Typewriter();
    writer.start(LINE, typewriterIntervalMs('normal'));
    feed(writer, 1000);
    expect(writer.state.done).toBe(true);
    expect(writer.state.revealed).toBe(charsOf(LINE).length);
  });

  it('累计跨帧余数，不会被逐帧取整吃掉', () => {
    const writer = new Typewriter();
    writer.start('一二三四五', 32);
    expect(writer.tick(16)).toBeNull();
    expect(writer.tick(16)?.gained).toBe(1);
    expect(writer.tick(31)).toBeNull();
    expect(writer.tick(1)?.gained).toBe(1);
    expect(writer.state.revealed).toBe(2);
  });

  it('掉帧一帧补多个字时，gained 是合计值，且不会超过总字数', () => {
    const writer = new Typewriter();
    writer.start('一二三四五', 32);
    const step = writer.tick(500);
    expect(step?.gained).toBe(5);
    expect(step?.revealed).toBe(5);
    expect(step?.done).toBe(true);
    expect(writer.state.typing).toBe(false);
    expect(writer.tick(500)).toBeNull();
  });

  it('打完整句后 tick 不再增长，text 回到原文', () => {
    const writer = new Typewriter();
    writer.start(LINE, 32);
    feed(writer, 60_000);
    expect(writer.state.done).toBe(true);
    expect(writer.state.revealed).toBe(charsOf(LINE).length);
    expect(writer.text).toBe(LINE);
    expect(writer.tick(1000)).toBeNull();
    expect(writer.state.revealed).toBe(charsOf(LINE).length);
  });

  it('空字符串直接完成，不进打字阶段', () => {
    const writer = new Typewriter();
    const step = writer.start('', 32);
    expect(step.done).toBe(true);
    expect(writer.typing).toBe(false);
    expect(writer.text).toBe('');
  });
});

describe('Typewriter 补全与 instant', () => {
  it('instant 档 start() 就整句显示，gained 为 0（不播逐字音）', () => {
    const writer = new Typewriter();
    const step = writer.start(LINE, typewriterIntervalMs('instant'));
    expect(step.done).toBe(true);
    expect(step.gained).toBe(0);
    expect(step.text).toBe(LINE);
    expect(writer.typing).toBe(false);
    expect(writer.tick(16)).toBeNull();
  });

  it('complete() 一次补全，之后的 tick 不再增长', () => {
    const writer = new Typewriter();
    writer.start(LINE, 32);
    feed(writer, 100);
    const before = writer.state.revealed;
    expect(before).toBeGreaterThan(0);
    const step = writer.complete();
    expect(step.done).toBe(true);
    expect(step.text).toBe(LINE);
    expect(step.gained).toBe(charsOf(LINE).length - before);
    expect(writer.typing).toBe(false);
    expect(writer.tick(1000)).toBeNull();
    expect(writer.state.revealed).toBe(charsOf(LINE).length);
  });

  it('reset() 把状态清干净（跳过/切场用）', () => {
    const writer = new Typewriter();
    writer.start(LINE, 32);
    feed(writer, 100);
    writer.reset();
    expect(writer.typing).toBe(false);
    expect(writer.state.full).toBe('');
    expect(writer.state.revealed).toBe(0);
    expect(writer.tick(1000)).toBeNull();
  });
});

describe('遮罩文本不动版式', () => {
  it('逐字过程中字数与换行数与原文一致（行数不跳）', () => {
    const twoLines = '白光褪去，你发现自己跪在冰冷光滑的地板上。\n抬头，龙椅上坐着一个人。';
    const writer = new Typewriter();
    writer.start(twoLines, 32);
    const fullChars = charsOf(twoLines).length;
    const fullBreaks = charsOf(twoLines).filter((char) => char === '\n').length;
    for (const ms of [16, 32, 200, 700]) {
      const step = writer.tick(ms);
      if (!step) continue;
      const shown = charsOf(step.text);
      expect(shown.length).toBe(fullChars);
      expect(shown.filter((char) => char === '\n').length).toBe(fullBreaks);
      // 已显示的部分必须是原文前缀，未显示的是全角空格。
      expect(step.text.startsWith(charsOf(twoLines).slice(0, step.revealed).join(''))).toBe(true);
    }
    expect(maskDialogueText(twoLines, 0)).not.toContain('白');
    expect(charsOf(maskDialogueText(twoLines, 0)).length).toBe(fullChars);
  });

  it('正式剧本的第一句可以逐字打完（真实文案不超框也不卡死）', () => {
    const firstSay = PALACE_BEATS.find((beat) => beat.kind === 'say');
    expect(firstSay).toBeDefined();
    const text = firstSay && firstSay.kind === 'say' ? firstSay.text : '';
    expect(text).toContain('跪在冰冷光滑的地板上');
    const writer = new Typewriter();
    writer.start(text, typewriterIntervalMs('normal'));
    feed(writer, typewriterIntervalMs('normal') * charsOf(text).length + 32);
    expect(writer.state.done).toBe(true);
    expect(writer.text).toBe(text);
  });
});
