import { describe, expect, it } from 'vitest';
import { DIALOGUE_TYPE_MS, maskDialogueText, type DialogueLine } from '../src/story/dialogue';
import { DialoguePlayer, paginateText } from '../src/story/dialogue-player';

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

  it('paginates a long line and reveals one page at a time', () => {
    const long = '沉睡症全球蔓延，患者莫名长睡不醒，明山县已有十四例，校医院也查不出原因。'.repeat(2);
    const player = new DialoguePlayer([{ speaker: '周全', text: long }], { pageChars: 20 });
    const first = player.start();
    const line = first[0];
    if (line?.type !== 'line') throw new Error('expected line');
    expect(line.pageCount).toBeGreaterThan(1);

    // 第一页只到 pageChars 以内的标点处
    const page1 = player.pageText;
    expect(Array.from(page1).length).toBeLessThanOrEqual(20);
    expect(player.state.pageIndex).toBe(0);

    // 打字中点一下 = 补全本页，不翻页
    player.requestAdvance();
    expect(player.state.phase).toBe('waiting');
    expect(player.state.pageIndex).toBe(0);

    // 再点 = 翻到下一页，并从 0 重新逐字
    const next = player.requestAdvance();
    expect(types(next)).toEqual(['line', 'type']);
    expect(player.state.pageIndex).toBe(1);
    expect(player.state.phase).toBe('typing');
    expect(player.state.typedCount).toBe(0);
  });

  it('paginateText prefers punctuation and never loses characters', () => {
    const long = '沉睡症全球蔓延，患者莫名长睡不醒，明山县已有十四例。';
    const pages = paginateText(long, 12);
    expect(pages.join('')).toBe(long);
    for (const page of pages) {
      expect(Array.from(page).length).toBeLessThanOrEqual(12);
    }
    // 断点落在标点之后
    expect(pages[0]?.endsWith('，')).toBe(true);

    expect(paginateText('短句', 12)).toEqual(['短句']);
    expect(paginateText(long, 0)).toEqual([long]);
  });

  it('merges an orphan punctuation page back into the previous page', () => {
    // 在 10 字上限处硬切，句尾只剩一个「。」。
    const text = '一二三四五六七八九十。';
    expect(paginateText(text, 10)).toEqual([text]);
  });

  it('advances to the next line only after the last page', () => {
    const linesTwo: readonly DialogueLine[] = [
      { speaker: '周全', text: '第一句比较长，长到需要分成两页才放得下，不然就会溢出面板。' },
      { speaker: '小白', text: '第二句。' },
    ];
    const player = new DialoguePlayer(linesTwo, { pageChars: 16 });
    player.start();
    player.requestAdvance();            // 补全第一页
    player.requestAdvance();            // 翻到第二页
    expect(player.state.pageIndex).toBe(1);
    player.requestAdvance();            // 补全第二页
    player.requestAdvance();            // 换到第二句
    expect(player.state.lineIndex).toBe(1);
    expect(player.state.pageIndex).toBe(0);
  });

  it('does not split surrogate pairs while masking', () => {
    const full = '𠮷野家\n好';
    for (let count = 0; count <= Array.from(full).length; count += 1) {
      const masked = maskDialogueText(full, count);
      expect(masked.split('\n')).toHaveLength(2);
      expect(Array.from(masked)).toHaveLength(Array.from(full).length);
    }
  });

  it('typeMs=0 立即显示整句，但仍要手动推进与分页', () => {
    const player = new DialoguePlayer(
      [{ speaker: '周全', text: '一二三四五六七八九十。' }, { text: '下一句' }],
      { typeMs: 0, pageChars: 5 },
    );
    const start = player.start();
    expect(types(start)).toEqual(['line', 'type']);
    const typed = start[1];
    if (typed?.type !== 'type') throw new Error('expected type');
    expect(typed.done).toBe(true);
    expect(typed.text).toBe(player.pageText);
    expect(player.state.phase).toBe('waiting');
    expect(player.tick(1000)).toEqual([]);

    // 翻页后同样是立即显示
    const nextPage = player.requestAdvance();
    const event = nextPage[1];
    if (event?.type !== 'type') throw new Error('expected type');
    expect(event.done).toBe(true);
    expect(player.state.phase).toBe('waiting');
  });
});
