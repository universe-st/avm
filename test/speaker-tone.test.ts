import { describe, expect, it } from 'vitest';
import { speakerLabel, speakerTone } from '../src/story/dialogue';
import { DialogueHistory } from '../src/story/dialogue-history';

describe('说话人语义色', () => {
  it('旁白（省略 speaker 或写着旁白）统一识别', () => {
    expect(speakerTone(undefined)).toBe('narration');
    expect(speakerTone('')).toBe('narration');
    expect(speakerTone('旁白')).toBe('narration');
    expect(speakerLabel('旁白')).toBe('');
  });

  it('小白靠稳定 role 保持同色，名字变化不影响', () => {
    expect(speakerTone('？？？', 'xiaobai')).toBe('xiaobai');
    expect(speakerTone('莫名其妙出现的白色小娃娃', 'xiaobai')).toBe('xiaobai');
    expect(speakerTone('小白')).toBe('xiaobai');
  });

  it('主角、梦中郑卿、矿工各有独立色档', () => {
    expect(speakerTone('周全')).toBe('zhou');
    expect(speakerTone('郑卿')).toBe('zheng');
    expect(speakerTone('郑卿（梦中）')).toBe('zheng');
    expect(speakerTone('矿工')).toBe('miner');
    expect(speakerTone('因泰里')).toBe('miner');
    expect(speakerTone('楚公公')).toBe('default');
    expect(speakerTone('男主持')).toBe('default');
  });

  it('显示名原样保留（除旁白）', () => {
    expect(speakerLabel('周全')).toBe('周全');
    expect(speakerLabel('？？？')).toBe('？？？');
    expect(speakerLabel(undefined)).toBe('');
  });
});

describe('对话记录环形缓冲', () => {
  it('按顺序保存并在超限时丢弃最旧一条', () => {
    const history = new DialogueHistory(3);
    for (let i = 0; i < 5; i += 1) {
      history.push({ speaker: '周全', text: `第 ${i} 句`, narration: false, at: i });
    }
    expect(history.size).toBe(3);
    expect(history.entries.map((entry) => entry.text)).toEqual(['第 2 句', '第 3 句', '第 4 句']);
  });

  it('clear 后为空；非法 limit 回退默认', () => {
    const history = new DialogueHistory(0);
    history.push({ speaker: '', text: '旁白一句', narration: true, at: 1 });
    expect(history.entries[0]?.narration).toBe(true);
    history.clear();
    expect(history.size).toBe(0);
  });
});
