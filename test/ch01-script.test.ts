import { describe, expect, it } from 'vitest';
import { CH01_ASSET_KEYS } from '../src/assets/keys';
import { CH01_NODES } from '../src/story/ch01-dorm';

/**
 * 文案结构回归：摇醒郑卿 → 沉睡症新闻回忆 → 回到寝室。
 *
 * 剧情文本是唯一真值（`src/story/ch01-dorm.ts`），这里只锁「顺序 / CG / BGM」，
 * 不改写台词本身。
 */
describe('第一章寝室 · 郑卿段落', () => {
  const lines = CH01_NODES.zheng.lines;

  it('先摇醒郑卿，再切新闻回忆', () => {
    const shake = lines.findIndex((line) => line.text.includes('拼命摇晃'));
    const memory = lines.findIndex((line) => line.cg === CH01_ASSET_KEYS.cg.news);
    expect(shake).toBeGreaterThanOrEqual(0);
    expect(memory).toBeGreaterThan(shake);
  });

  it('旁白始终用第二人称「你」指代主角，不出现「周全」', () => {
    const allLines = Object.values(CH01_NODES).flatMap((node) => node.lines);
    const narration = allLines.filter((line) => line.speaker === '旁白');
    expect(narration.length).toBeGreaterThan(0);
    for (const line of narration) expect(line.text).not.toContain('周全');
    expect(allLines.find((line) => line.text.includes('扑到床边'))?.text).toContain('你');
    expect(allLines.find((line) => line.text.includes('瘫坐在地上'))?.text).toContain('你');
    expect(allLines.find((line) => line.text.includes('回过神来'))?.text).toContain('你');
  });

  it('新闻是回忆（不是现场播放），切黑白 CG 与《危机来临》，之后维持危机曲', () => {
    const memoryIndex = lines.findIndex((line) => line.cg === CH01_ASSET_KEYS.cg.news);
    const memoryLine = lines[memoryIndex];
    expect(memoryLine?.bgm).toBe('ch01Crisis');
    // 用「脑海里闪出画面 / 几天前」这类措辞明确是回忆，而不是寝室里电视正在播。
    expect(memoryLine?.text).toMatch(/脑海里|记忆|回忆|想起/);
    expect(memoryLine?.text).toContain('几天前');
    expect(lines[memoryIndex - 1]?.text).toContain('难不成');

    const anchors = lines.filter(
      (line) => line.speaker === '男主持' || line.speaker === '女主持',
    );
    expect(anchors).toHaveLength(4);
    expect(anchors.every((line) => line.cg === CH01_ASSET_KEYS.cg.news)).toBe(true);
    expect(anchors[0]?.text).toContain('于上月发现');
    expect(anchors[1]?.text).toContain('庄图强');
    expect(anchors[2]?.text).toContain('829');
    expect(anchors[3]?.text).toContain('86');

    // 回忆结束后不再切回日常曲：整段只有危机曲一个 bgm cue。
    expect(lines.some((line) => line.bgm === 'ch01Dorm')).toBe(false);
    expect(lines.filter((line) => line.bgm !== undefined).map((line) => line.bgm)).toEqual([
      'ch01Crisis',
    ]);
  });
});
