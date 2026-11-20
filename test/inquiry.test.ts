import { describe, expect, it } from 'vitest';
import {
  hasAsked,
  initialInquiryState,
  inquiryMenuItems,
  isInquiryComplete,
  markAsked,
  questionById,
  remainingQuestions,
  type InquiryScript,
} from '../src/story/inquiry';
import type { DialogueLine } from '../src/story/dialogue';

/** 一个最小脚本：三条问题 + 收尾文案。 */
const script: InquiryScript<'a' | 'b' | 'c'> = {
  closingLabel: '继续。',
  questions: [
    { id: 'a', label: 'A？', lines: [{ text: '答 A' }] },
    { id: 'b', label: 'B？', lines: [{ text: '答 B' }] },
    { id: 'c', label: 'C？', lines: [{ text: '答 C' }] },
  ],
};

const lineText = (line: DialogueLine): string => line.text;

describe('提问菜单状态机（纯逻辑）', () => {
  it('初始：三个问题都可问，还没问完', () => {
    const state = initialInquiryState<'a' | 'b' | 'c'>();
    expect(state.asked).toEqual([]);
    expect(remainingQuestions(script, state).map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(isInquiryComplete(script, state)).toBe(false);
    expect(inquiryMenuItems(script, state)).toEqual([
      { id: 'a', label: 'A？', closing: false },
      { id: 'b', label: 'B？', closing: false },
      { id: 'c', label: 'C？', closing: false },
    ]);
  });

  it('任意顺序提问：问过的从菜单移除，剩下的顺序仍照剧本', () => {
    let state = initialInquiryState<'a' | 'b' | 'c'>();
    state = markAsked(script, state, 'b');
    expect(hasAsked(state, 'b')).toBe(true);
    expect(inquiryMenuItems(script, state).map((item) => item.id)).toEqual(['a', 'c']);

    state = markAsked(script, state, 'c');
    state = markAsked(script, state, 'a');
    expect(state.asked).toEqual(['b', 'c', 'a']);
    expect(remainingQuestions(script, state)).toEqual([]);
    expect(isInquiryComplete(script, state)).toBe(true);
    // 三个都问完 → 只剩收尾选项，不是「没有选项」。
    expect(inquiryMenuItems(script, state)).toEqual([
      { id: 'closing', label: '继续。', closing: true },
    ]);
  });

  it('重复标记幂等；未知 id 不写进状态', () => {
    const once = markAsked(script, initialInquiryState<'a' | 'b' | 'c'>(), 'a');
    expect(markAsked(script, once, 'a')).toBe(once);
    // 编译期不让传未知 id，这里用 any 模拟「改稿后的坏存档」。
    const bad = markAsked(script, once, 'nope' as 'a');
    expect(bad).toBe(once);
    expect(bad.asked).toEqual(['a']);
  });

  it('不修改入参（状态是可序列化的不可变值）', () => {
    const state = initialInquiryState<'a' | 'b' | 'c'>();
    markAsked(script, state, 'a');
    expect(state.asked).toEqual([]);
  });

  it('按 id 取问题；未知 id 返回 null', () => {
    expect(questionById(script, 'b')?.lines.map(lineText)).toEqual(['答 B']);
    expect(questionById(script, 'nope' as 'a')).toBeNull();
  });

  it('收尾文案与问题文案分开：问完之前不会提前出现', () => {
    let state = initialInquiryState<'a' | 'b' | 'c'>();
    for (const id of ['a', 'b'] as const) {
      state = markAsked(script, state, id);
      expect(inquiryMenuItems(script, state).some((item) => item.closing)).toBe(false);
    }
    state = markAsked(script, state, 'c');
    expect(inquiryMenuItems(script, state).map((item) => item.id)).toEqual(['closing']);
  });
});
