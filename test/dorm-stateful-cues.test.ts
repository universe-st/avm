import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CH01_ASSET_KEYS } from '../src/assets/keys';
import { CH01_NODES, type Ch01NodeId } from '../src/story/ch01-dorm';
import {
  DIALOGUE_CUE_KINDS,
  EMPTY_STATE_CUES,
  cueKeysOfKind,
  mergeStateCues,
  reduceStateCues,
  stateCuesOfLine,
  type DialogueLine,
  type DialogueStateCues,
} from '../src/story/dialogue';
import type { BgmId } from '../src/audio/bgm-tracks';

/**
 * 「状态型 cue 不得挂在台词上」的回归护栏（2026-11-15 用户报的 bug）。
 *
 * 寝室 → 探索 → 床边「叫醒郑卿」→ 点「跳过」：BGM 原本不会变成《危机来临》，
 * 因为 `bgm: 'ch01Crisis'` 挂在新闻回忆那一行上，而跳过从不显示那一行。
 *
 * 这里的测试分三层：
 * 1. `reduceStateCues()` 的纯逻辑（无 Phaser）；
 * 2. 把寝室两段对话的**每一个** lineIndex 当跳过点，补出的 BGM 必须与自然过完一致；
 * 3. 反向断言：`cg` / `fx` / `emotion` 是表现型，不会被当状态补播；
 * 4. 源码护栏：场景里不许再把 `bgm` 写在 `applyLineCue()`，跳过路径必须走归约。
 */

/** 模拟「演到第 skipAt 行之前就点跳过」时，最终生效的状态。 */
function stateAfterSkipping(
  lines: readonly DialogueLine[],
  skipAt: number,
): DialogueStateCues {
  let state = EMPTY_STATE_CUES;
  for (let index = 0; index < Math.min(skipAt, lines.length); index += 1) {
    state = mergeStateCues(state, stateCuesOfLine(lines[index] as DialogueLine));
  }
  return mergeStateCues(state, reduceStateCues(lines, skipAt));
}

function bgmAfterSkipping(lines: readonly DialogueLine[], skipAt: number): BgmId | undefined {
  return stateAfterSkipping(lines, skipAt).bgm;
}

describe('行 cue 分类：状态型 vs 表现型', () => {
  it('bgm 是状态型；cg / fx / emotion 是表现型', () => {
    expect(DIALOGUE_CUE_KINDS.bgm).toBe('stateful');
    expect(DIALOGUE_CUE_KINDS.cg).toBe('expressive');
    expect(DIALOGUE_CUE_KINDS.fx).toBe('expressive');
    expect(DIALOGUE_CUE_KINDS.emotion).toBe('expressive');
  });

  it('按分类取 key（分类表是唯一真值，不手写第二份）', () => {
    expect(cueKeysOfKind('stateful')).toEqual(['bgm']);
    expect([...cueKeysOfKind('expressive')].sort()).toEqual(['cg', 'emotion', 'fx']);
  });
});

describe('reduceStateCues：无 Phaser 的纯归约', () => {
  const plain: readonly DialogueLine[] = [
    { speaker: '周全', text: '一' },
    { speaker: '周全', text: '二' },
    { speaker: '周全', text: '三' },
  ];

  it('没有任何状态型 cue → 空状态', () => {
    expect(reduceStateCues(plain, 0)).toEqual(EMPTY_STATE_CUES);
    expect(reduceStateCues([], 0)).toEqual({});
  });

  it('单条 cue：从它之前、它自己、它之后开始', () => {
    const lines: readonly DialogueLine[] = [
      { text: '一' },
      { text: '二', bgm: 'ch01Crisis' },
      { text: '三' },
    ];
    expect(reduceStateCues(lines, 0)).toEqual({ bgm: 'ch01Crisis' });
    expect(reduceStateCues(lines, 1)).toEqual({ bgm: 'ch01Crisis' });
    expect(reduceStateCues(lines, 2)).toEqual({});
  });

  it('多条 cue 后者覆盖前者（同一状态多次设置以靠后的为准）', () => {
    const lines: readonly DialogueLine[] = [
      { text: '一', bgm: 'ch01Dorm' },
      { text: '二' },
      { text: '三', bgm: 'ch01Crisis' },
      { text: '四' },
    ];
    expect(reduceStateCues(lines, 0)).toEqual({ bgm: 'ch01Crisis' });
    // 从中间开始只认后面那些行。
    expect(reduceStateCues(lines, 1)).toEqual({ bgm: 'ch01Crisis' });
    expect(reduceStateCues(lines, 3)).toEqual({});
  });

  it('越界索引：负数/NaN 当 0，超过长度当空', () => {
    const lines: readonly DialogueLine[] = [{ text: '一', bgm: 'ch01Crisis' }];
    expect(reduceStateCues(lines, -5)).toEqual({ bgm: 'ch01Crisis' });
    expect(reduceStateCues(lines, Number.NaN)).toEqual({ bgm: 'ch01Crisis' });
    expect(reduceStateCues(lines, Number.POSITIVE_INFINITY)).toEqual({ bgm: 'ch01Crisis' });
    expect(reduceStateCues(lines, 1)).toEqual({});
    expect(reduceStateCues(lines, 99)).toEqual({});
  });

  it('幂等：同样的入参永远同样的结果', () => {
    const lines = CH01_NODES.zheng.lines;
    for (let index = 0; index <= lines.length; index += 1) {
      const first = reduceStateCues(lines, index);
      expect(reduceStateCues(lines, index)).toEqual(first);
    }
  });

  it('stateCuesOfLine 只取状态型字段；merge 是后者覆盖前者', () => {
    expect(stateCuesOfLine({ text: 'x', bgm: 'ch01Crisis' })).toEqual({ bgm: 'ch01Crisis' });
    expect(stateCuesOfLine({ text: 'x', cg: 'cg.news', emotion: 'happy' })).toEqual({});
    expect(mergeStateCues({ bgm: 'ch01Dorm' }, { bgm: 'ch01Crisis' })).toEqual({
      bgm: 'ch01Crisis',
    });
    expect(mergeStateCues({ bgm: 'ch01Crisis' }, {})).toEqual({ bgm: 'ch01Crisis' });
  });
});

describe('寝室对话：任意跳过点补出的 BGM 都与自然过完一致', () => {
  const nodesWithLines = (Object.keys(CH01_NODES) as Ch01NodeId[]).filter(
    (id) => CH01_NODES[id].lines.length > 0,
  );

  it('所有带台词的节点：逐行跳过都不改变最终状态', () => {
    for (const id of nodesWithLines) {
      const lines = CH01_NODES[id].lines;
      const natural = reduceStateCues(lines, 0);
      for (let skipAt = 0; skipAt <= lines.length; skipAt += 1) {
        expect(stateAfterSkipping(lines, skipAt), `${id} 在第 ${skipAt} 行跳过`).toEqual(natural);
      }
    }
  });

  it('「叫醒郑卿」：在第 0 行就跳过也要切《危机来临》（本次 bug）', () => {
    const lines = CH01_NODES.zheng.lines;
    const crisisAt = lines.findIndex((line) => line.bgm === 'ch01Crisis');
    expect(crisisAt).toBeGreaterThan(0);
    // 跳过点在这行之前（含第 0 行、也就是刚打开对话就跳过）→ 必须补上危机曲。
    for (let skipAt = 0; skipAt <= crisisAt; skipAt += 1) {
      expect(bgmAfterSkipping(lines, skipAt), `第 ${skipAt} 行跳过`).toBe('ch01Crisis');
    }
    // 已经越过这行之后再跳过 → 状态已生效，最终仍是危机曲。
    for (let skipAt = crisisAt + 1; skipAt <= lines.length; skipAt += 1) {
      expect(bgmAfterSkipping(lines, skipAt), `第 ${skipAt} 行跳过`).toBe('ch01Crisis');
    }
  });

  it('「叫醒郑卿」自然过完仍是《危机来临》，且之后不再切回日常', () => {
    expect(reduceStateCues(CH01_NODES.zheng.lines, 0)).toEqual({ bgm: 'ch01Crisis' });
    expect(CH01_NODES.zheng.lines.some((line) => line.bgm === 'ch01Dorm')).toBe(false);
  });

  it('「战后征召」没有 BGM 状态型 cue：跳过不额外切曲', () => {
    const lines = CH01_NODES.after.lines;
    expect(lines.some((line) => line.bgm !== undefined)).toBe(false);
    for (let skipAt = 0; skipAt <= lines.length; skipAt += 1) {
      expect(bgmAfterSkipping(lines, skipAt), `第 ${skipAt} 行跳过`).toBeUndefined();
    }
  });
});

describe('反向断言：表现型 cue 不会被当状态补播', () => {
  it('只有 cg / emotion / fx 的台词，归约结果为空', () => {
    const lines: readonly DialogueLine[] = [
      { text: '一', cg: CH01_ASSET_KEYS.cg.news, emotion: 'surprised', fx: 'shake' },
      { text: '二', emotion: 'happy', emotionBy: 'zheng' },
      { text: '三', fx: 'flash' },
    ];
    expect(reduceStateCues(lines, 0)).toEqual(EMPTY_STATE_CUES);
    expect(bgmAfterSkipping(lines, 0)).toBeUndefined();
  });

  it('新闻回忆那一行同时带 cg 和 bgm：只取 bgm，CG 不会在跳过时补播', () => {
    const memory = CH01_NODES.zheng.lines.find(
      (line) => line.cg === CH01_ASSET_KEYS.cg.news && line.bgm !== undefined,
    );
    expect(memory).toBeDefined();
    expect(stateCuesOfLine(memory as DialogueLine)).toEqual({ bgm: 'ch01Crisis' });
    expect(Object.keys(stateCuesOfLine(memory as DialogueLine))).toEqual(['bgm']);
  });

  it('跳过点落在「只有 CG 的新闻行之后」时，不会因为 CG 行再补一次 BGM', () => {
    const lines = CH01_NODES.zheng.lines;
    const lastNews = lines.map((line) => line.cg).lastIndexOf(CH01_ASSET_KEYS.cg.news);
    expect(lastNews).toBeGreaterThan(0);
    expect(reduceStateCues(lines, lastNews + 1)).toEqual({});
  });
});

function source(file: string): string {
  return readFileSync(file, 'utf8');
}

/** 取出方法体（签名后第一个位于行尾的 `{` 到配对的 `}`）。 */
function bodyOf(text: string, signature: string): string {
  const start = text.indexOf(signature);
  expect(start, `没找到 ${signature}`).toBeGreaterThanOrEqual(0);
  let open = -1;
  for (let cursor = text.indexOf('{', start); cursor >= 0; cursor = text.indexOf('{', cursor + 1)) {
    if (text[cursor + 1] === '\n' || text[cursor + 1] === '\r') {
      open = cursor;
      break;
    }
  }
  expect(open, `${signature} 没有方法体`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let cursor = open; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, cursor + 1);
    }
  }
  throw new Error(`${signature} 的花括号没有闭合`);
}

describe('寝室场景接线护栏（源码）', () => {
  const scene = source('src/scenes/ch01-dorm-scene.ts');
  const applyLineCue = bodyOf(scene, 'private applyLineCue(line: DialogueLine): void');
  const applyStateCueAt = bodyOf(
    scene,
    'private applyStateCueAt(index: number, line: DialogueLine): void',
  );
  const flushStateCues = bodyOf(scene, 'private flushStateCues(): void');
  const finishDialogue = bodyOf(scene, 'private finishDialogue(): void');
  const skipDialogue = bodyOf(scene, 'private skipDialogue(): void');
  const handleDialogueEvents = bodyOf(
    scene,
    'private handleDialogueEvents(events: readonly DialogueEvent[]): void',
  );

  it('表现型 cue 的处理器里不再直接切 BGM（状态型 cue 不许挂在台词显示上）', () => {
    expect(applyLineCue).not.toContain('bgmManager.play(');
    expect(applyLineCue).not.toMatch(/\.bgm\b/);
    expect(applyLineCue, 'applyLineCue 只该管 cg/fx/emotion').not.toContain('line.bgm');
  });

  it('每行显示时用状态型归约推进游标', () => {
    expect(handleDialogueEvents).toContain('this.applyStateCueAt(event.index, event.line);');
    expect(applyStateCueAt).toContain('stateCuesOfLine(');
    expect(applyStateCueAt).toContain('this.stateCueCursor');
  });

  it('finishDialogue() 在推进节点之前补状态型 cue', () => {
    const flushAt = finishDialogue.indexOf('this.flushStateCues();');
    const completedAt = finishDialogue.indexOf('this.flow.nodeCompleted()');
    expect(flushAt, 'finishDialogue 没有补状态型 cue').toBeGreaterThanOrEqual(0);
    expect(completedAt).toBeGreaterThan(flushAt);
  });

  it('补 cue 走通用归约，不是硬编码某首曲子', () => {
    expect(flushStateCues).toContain('reduceStateCues(this.dialogueLines, this.stateCueCursor)');
    expect(flushStateCues).toContain('this.dialogueLines = [];');
    // 场景里不许出现任何 BGM 曲目 id 的字面量：数据驱动，曲目只属于 `src/story/`。
    // （只查有问题的两种写法：`bgmManager.play('id')` 与本次 bug 的危机曲 id；
    //  `'ch01Palace'` 这类同名的模块/场景 key 不算。）
    expect(flushStateCues).not.toMatch(/bgmManager\.play\(\s*['"]/);
    expect(scene).not.toMatch(/bgmManager\.play\(\s*['"]/);
    expect(scene).not.toContain('ch01Crisis');
  });

  it('跳过仍然只走 finishDialogue()，不在跳过里单独补东西', () => {
    expect(skipDialogue).toContain('this.finishDialogue();');
    expect(skipDialogue).not.toContain('bgmManager');
  });
});
