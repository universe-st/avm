import { describe, expect, it } from 'vitest';
import { EXIT_MS, TYPE_MS, type PrologueCue } from '../src/story/prologue';
import { ProloguePlayer } from '../src/story/prologue-player';

const cue = (
  id: string,
  lines: readonly string[],
  hold = 0,
  extra: Partial<PrologueCue> = {},
): PrologueCue => ({
  id,
  image: 'img.prologue.sky',
  lines,
  holdMs: hold,
  ...extra,
});

const eventTypes = (events: readonly { type: string }[]): string[] =>
  events.map((event) => event.type);

describe('ProloguePlayer（手动模式，默认）', () => {
  it('starts with an enter event and a type event', () => {
    const player = new ProloguePlayer([cue('a', ['你好']), cue('b', ['再见'])]);
    const events = player.start();
    expect(eventTypes(events)).toEqual(['enter', 'type']);
    expect(player.state).toMatchObject({
      cueIndex: 0,
      phase: 'typing',
      typedCount: 0,
      totalChars: 2,
      auto: false,
    });
    expect(player.start()).toEqual([]);
    expect(player.isAuto).toBe(false);
  });

  it('types one codepoint per TYPE_MS, then stops and waits for a click', () => {
    const player = new ProloguePlayer([cue('a', ['你好']), cue('b', ['再见'])]);
    player.start();

    const first = player.tick(TYPE_MS);
    expect(eventTypes(first)).toEqual(['type']);
    expect(player.state.typedCount).toBe(1);
    expect(player.state.phase).toBe('typing');
    const firstType = first[0];
    if (firstType?.type !== 'type') throw new Error('expected type event');
    expect(firstType.text).toBe('你\u3000');
    expect(firstType.done).toBe(false);

    const second = player.tick(TYPE_MS);
    const secondType = second[0];
    if (secondType?.type !== 'type') throw new Error('expected type event');
    expect(secondType.text).toBe('你好');
    expect(secondType.done).toBe(true);
    expect(player.state.phase).toBe('waiting');

    // 手动模式不按 holdMs 自动过：没有点击就一直停在这一句。
    expect(player.tick(30_000)).toEqual([]);
    expect(player.state.phase).toBe('waiting');
    expect(player.state.cueIndex).toBe(0);
  });

  it('reveals the current line on the first click, then moves on with the second', () => {
    const player = new ProloguePlayer([cue('a', ['你好']), cue('b', ['再见'])]);
    player.start();

    const reveal = player.requestAdvance();
    expect(eventTypes(reveal)).toEqual(['type']);
    const typeEvent = reveal[0];
    if (typeEvent?.type !== 'type') throw new Error('expected type event');
    expect(typeEvent.done).toBe(true);
    expect(typeEvent.text).toBe('你好');
    expect(player.state.phase).toBe('waiting');

    const leave = player.requestAdvance();
    expect(eventTypes(leave)).toEqual(['leave']);
    expect(player.state.phase).toBe('leaving');

    // leaving 中再点不会重复推进
    expect(player.requestAdvance()).toEqual([]);

    const next = player.tick(EXIT_MS);
    expect(eventTypes(next)).toEqual(['enter', 'type']);
    expect(player.state.cueIndex).toBe(1);
    expect(player.state.phase).toBe('typing');
  });

  it('waits on the last cue for confirmation', () => {
    const player = new ProloguePlayer([cue('a', ['好'])]);
    expect(eventTypes(player.start())).toEqual(['enter', 'type']);

    const done = player.tick(TYPE_MS);
    expect(eventTypes(done)).toEqual(['type', 'await-continue']);
    expect(player.state.phase).toBe('awaiting-continue');
    expect(player.tick(1000)).toEqual([]);

    expect(eventTypes(player.requestAdvance())).toEqual(['complete']);
    expect(player.state.phase).toBe('complete');
    expect(player.requestAdvance()).toEqual([]);
    expect(player.tick(1000)).toEqual([]);
  });
});

describe('ProloguePlayer（自动模式）', () => {
  it('advances by itself after holdMs', () => {
    const player = new ProloguePlayer([cue('a', ['好'], 100), cue('b', ['再见'])], {
      auto: true,
    });
    expect(eventTypes(player.start())).toEqual(['enter', 'type']);
    expect(player.state.auto).toBe(true);

    const done = player.tick(TYPE_MS);
    expect(eventTypes(done)).toEqual(['type']);
    expect(player.state.phase).toBe('holding');

    expect(player.tick(99)).toEqual([]);
    expect(eventTypes(player.tick(1))).toEqual(['leave']);
    expect(player.state.phase).toBe('leaving');

    const next = player.tick(EXIT_MS);
    expect(eventTypes(next)).toEqual(['enter', 'type']);
    expect(player.state.cueIndex).toBe(1);
  });

  it('never auto-plays past the final card', () => {
    const player = new ProloguePlayer([cue('a', ['好'], 100)], { auto: true });
    player.start();
    const done = player.tick(TYPE_MS);
    expect(eventTypes(done)).toEqual(['type', 'await-continue']);
    expect(player.state.phase).toBe('awaiting-continue');

    // 即使自动模式也不会自己溜进占位页
    expect(player.tick(60_000)).toEqual([]);
    expect(player.state.phase).toBe('awaiting-continue');
  });

  it('switches between auto and manual without losing the current line', () => {
    const player = new ProloguePlayer([cue('a', ['好'], 100), cue('b', ['再见'])], {
      auto: true,
    });
    player.start();
    player.tick(TYPE_MS);
    expect(player.state.phase).toBe('holding');

    player.setAuto(false);
    expect(player.state.phase).toBe('waiting');
    expect(player.tick(30_000)).toEqual([]);

    player.setAuto(true);
    expect(player.state.phase).toBe('holding');
    expect(eventTypes(player.tick(100))).toEqual(['leave']);

    // 重复设置同一个模式是空操作
    expect(player.setAuto(true)).toEqual([]);
    expect(player.state.phase).toBe('leaving');
  });
});

describe('ProloguePlayer（特殊 cue）', () => {
  it('types the date card instantly and waits for a click', () => {
    const player = new ProloguePlayer([
      cue('a', ['你好']),
      cue('card', ['日期'], 0, { kind: 'card' }),
    ]);
    player.start();
    player.requestAdvance();
    player.requestAdvance();
    const next = player.tick(EXIT_MS);

    expect(eventTypes(next)).toEqual(['enter', 'type', 'await-continue']);
    expect(player.state.cueIndex).toBe(1);
    expect(player.state.phase).toBe('awaiting-continue');
    expect(player.state.typedCount).toBe(2);
    const typeEvent = next[1];
    if (typeEvent?.type !== 'type') throw new Error('expected type event');
    expect(typeEvent.done).toBe(true);
    expect(typeEvent.text).toBe('日期');
  });

  it('lets a zero-character beat pass by itself even in manual mode', () => {
    const player = new ProloguePlayer([cue('beat', [], 300), cue('next', ['下一句'])]);
    const start = player.start();
    expect(eventTypes(start)).toEqual(['enter', 'type']);
    expect(player.state.phase).toBe('holding');

    expect(player.tick(299)).toEqual([]);
    expect(eventTypes(player.tick(1))).toEqual(['leave']);
  });

  it('ignores zero or negative deltas', () => {
    const player = new ProloguePlayer([cue('a', ['你好'])]);
    player.start();
    expect(player.tick(0)).toEqual([]);
    expect(player.tick(-100)).toEqual([]);
    expect(player.state.typedCount).toBe(0);
  });

  it('does nothing before start', () => {
    const player = new ProloguePlayer([cue('a', ['你好'])]);
    expect(player.tick(1000)).toEqual([]);
    expect(player.requestAdvance()).toEqual([]);
  });
});
