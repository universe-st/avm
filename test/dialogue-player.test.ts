import { describe, expect, it } from 'vitest';
import { DIALOGUE_TYPE_MS, maskDialogueText, type DialogueLine } from '../src/story/dialogue';
import { DialoguePlayer } from '../src/story/dialogue-player';

const lines: readonly DialogueLine[] = [
  { speaker: '周全', text: '你好' },
  { speaker: '小白', text: '否定。' },
];

const types = (events: readonly { type: string }[]): string[] => events.map((event) => event.type);

describe('DialoguePlayer', () => {
  it('starts with a line event and a masked type event', () => {
    const player = new DialoguePlayer(lines);
    const events = player.start();
    expect(types(events)).toEqual(['line', 'type']);
    expect(player.state).toMatchObject({
      lineIndex: 0,
      phase: 'typing',
      typedCount: 0,
      totalChars: 2,
      speaker: '周全',
    });
    expect(player.start()).toEqual([]);
  });

  it('types one codepoint per type tick', () => {
    const player = new DialoguePlayer(lines);
    player.start();
    const first = player.tick(DIALOGUE_TYPE_MS);
    expect(types(first)).toEqual(['type']);
    const event = first[0];
    if (event?.type !== 'type') throw new Error('expected type');
    expect(event.text).toBe('你\u3000');
    expect(event.done).toBe(false);

    const second = player.tick(DIALOGUE_TYPE_MS);
    const done = second[0];
    if (done?.type !== 'type') throw new Error('expected type');
    expect(done.text).toBe('你好');
    expect(done.done).toBe(true);
    expect(player.state.phase).toBe('waiting');
    expect(player.tick(10_000)).toEqual([]);
  });

  it('completes the line on first advance and moves on with the second', () => {
    const player = new DialoguePlayer(lines);
    player.start();
    const reveal = player.requestAdvance();
    const typeEvent = reveal[0];
    if (typeEvent?.type !== 'type') throw new Error('expected type');
    expect(typeEvent.done).toBe(true);
    expect(typeEvent.text).toBe('你好');

    const next = player.requestAdvance();
    expect(types(next)).toEqual(['line', 'type']);
    expect(player.state.lineIndex).toBe(1);
    expect(player.state.speaker).toBe('小白');

    const finishLine = player.requestAdvance();
    expect(finishLine[0]?.type).toBe('type');
    const last = player.requestAdvance();
    expect(last).toEqual([{ type: 'complete' }]);
    expect(player.isComplete).toBe(true);
    expect(player.requestAdvance()).toEqual([]);
  });

  it('waits for a final confirmation after the last line', () => {
    const player = new DialoguePlayer([{ text: '好' }]);
    player.start();
    player.requestAdvance();
    expect(player.state.phase).toBe('waiting');
    expect(types(player.requestAdvance())).toEqual(['complete']);
    expect(player.state.phase).toBe('complete');
  });

  it('handles empty lines without getting stuck', () => {
    const player = new DialoguePlayer([{ text: '' }, { text: '下一句' }]);
    const start = player.start();
    expect(types(start)).toEqual(['line', 'type']);
    const event = start[1];
    if (event?.type !== 'type') throw new Error('expected type');
    expect(event.done).toBe(true);
    expect(player.state.phase).toBe('waiting');
    expect(types(player.requestAdvance())).toEqual(['line', 'type']);
  });

  it('ignores ticks before start and after completion', () => {
    const player = new DialoguePlayer(lines);
    expect(player.tick(1000)).toEqual([]);
    player.start();
    player.requestAdvance();
    player.requestAdvance();
    player.requestAdvance();
    player.requestAdvance();
    expect(player.isComplete).toBe(true);
    expect(player.tick(1000)).toEqual([]);
  });

  it('does not split surrogate pairs while masking', () => {
    const full = '𠮷野家\n好';
    for (let count = 0; count <= Array.from(full).length; count += 1) {
      const masked = maskDialogueText(full, count);
      expect(masked.split('\n')).toHaveLength(2);
      expect(Array.from(masked)).toHaveLength(Array.from(full).length);
    }
  });
});
