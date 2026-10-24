import { describe, expect, it } from 'vitest';
import { EXIT_MS, TYPE_MS, type PrologueCue } from '../src/story/prologue';
import { ProloguePlayer } from '../src/story/prologue-player';

const cue = (id: string, lines: readonly string[], hold = 0): PrologueCue => ({
  id,
  image: 'img.prologue.sky',
  lines,
  holdMs: hold,
});

const eventTypes = (events: readonly { type: string }[]): string[] =>
  events.map((event) => event.type);

describe('ProloguePlayer', () => {
  it('starts with an enter event and a type event', () => {
    const player = new ProloguePlayer([cue('a', ['你好'])]);
    const events = player.start();
    expect(eventTypes(events)).toEqual(['enter', 'type']);
    expect(player.state).toMatchObject({
      cueIndex: 0,
      phase: 'typing',
      typedCount: 0,
      totalChars: 2,
    });
    expect(player.start()).toEqual([]);
  });

  it('types one codepoint per TYPE_MS and starts holding when done', () => {
    const player = new ProloguePlayer([cue('a', ['你好'])]);
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
    expect(player.state.phase).toBe('holding');
  });

  it('reveals the current line on the first advance, then moves on', () => {
    const player = new ProloguePlayer([cue('a', ['你好']), cue('b', ['再见'])]);
    player.start();

    const reveal = player.requestAdvance();
    expect(eventTypes(reveal)).toEqual(['type']);
    const typeEvent = reveal[0];
    if (typeEvent?.type !== 'type') throw new Error('expected type event');
    expect(typeEvent.done).toBe(true);
    expect(typeEvent.text).toBe('你好');
    expect(player.state.phase).toBe('holding');

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

  it('auto-advances after holdMs and waits on the last cue', () => {
    const player = new ProloguePlayer([cue('a', ['好'], 0)]);
    const start = player.start();
    expect(eventTypes(start)).toEqual(['enter', 'type']);

    // 第一个 tick 打完 1 个字，进入 holding
    const done = player.tick(TYPE_MS);
    expect(eventTypes(done)).toEqual(['type']);
    expect(player.state.phase).toBe('holding');

    // holdMs=0：下一帧进入等待确认
    const awaitEvent = player.tick(1);
    expect(eventTypes(awaitEvent)).toEqual(['await-continue']);
    expect(player.state.phase).toBe('awaiting-continue');
    expect(player.tick(1000)).toEqual([]);

    expect(eventTypes(player.requestAdvance())).toEqual(['complete']);
    expect(player.state.phase).toBe('complete');
    expect(player.requestAdvance()).toEqual([]);
    expect(player.tick(1000)).toEqual([]);
  });

  it('handles a caption-only cue (zero characters) without getting stuck', () => {
    const player = new ProloguePlayer([cue('caption', [], 500), cue('next', ['下一句'])]);
    const start = player.start();
    expect(eventTypes(start)).toEqual(['enter', 'type']);
    expect(player.state.phase).toBe('holding');
    const typeEvent = start[1];
    if (typeEvent?.type !== 'type') throw new Error('expected type event');
    expect(typeEvent.done).toBe(true);
    expect(typeEvent.text).toBe('');

    const leave = player.requestAdvance();
    expect(eventTypes(leave)).toEqual(['leave']);
    const next = player.tick(EXIT_MS);
    expect(eventTypes(next)).toEqual(['enter', 'type']);
    expect(player.state.cueIndex).toBe(1);
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
