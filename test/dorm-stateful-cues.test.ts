import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CH01_ASSET_KEYS } from '../src/assets/keys';
import { CH01_NODES, type Ch01NodeId } from '../src/story/ch01-dorm';
import { CH01_AFTER_FINALE, CH01_AFTER_INQUIRY } from '../src/story/ch01-after';
import {
  DIALOGUE_CUE_KINDS,
  EMPTY_STATE_CUES,
  cueKeysOfKind,
  mergeStateCues,
  reduceStateCues,
  stateCuesOfLine,
  type DialogueCueKey,
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
  it('bgm 是状态型；cg / fx / emotion / sfx / blackout 是表现型', () => {
    expect(DIALOGUE_CUE_KINDS.bgm).toBe('stateful');
    expect(DIALOGUE_CUE_KINDS.cg).toBe('expressive');
    expect(DIALOGUE_CUE_KINDS.fx).toBe('expressive');
    expect(DIALOGUE_CUE_KINDS.emotion).toBe('expressive');
    // 2026-11-20 新剧本引入的两类表现型 cue：黑屏演出与一次性音效（鼾声）。
    expect(DIALOGUE_CUE_KINDS.sfx).toBe('expressive');
    expect(DIALOGUE_CUE_KINDS.blackout).toBe('expressive');
  });

  it('按分类取 key（分类表是唯一真值，不手写第二份）', () => {
    // 不写死 key 列表：两张按类别取出来的表必须正好是分类表的全部 key（互斥且不丢）。
    const all = Object.keys(DIALOGUE_CUE_KINDS) as DialogueCueKey[];
    expect([...cueKeysOfKind('stateful'), ...cueKeysOfKind('expressive')].sort()).toEqual(
      [...all].sort(),
    );
    // 状态型目前只有 BGM；以后加 objective/checkpoint 时这里会显式失败，逼着改文档与归约。
    expect(cueKeysOfKind('stateful')).toEqual(['bgm']);
    // 每个 key 都必须出现在它自己那一类里（漏分类 typecheck 会拦，这里兜运行时）。
    for (const key of all) {
      expect(cueKeysOfKind(DIALOGUE_CUE_KINDS[key]), key).toContain(key);
    }
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

  it('战后「逃出宫殿之后」：BGM 是状态型（校园 → 危机 → 校园），不是行情上的表现', () => {
    // 第一段（醒来与编号之争）明确回到校园日常。
    expect(reduceStateCues(CH01_NODES.after.lines, 0).bgm).toBe('ch01Dorm');
    // 黑屏胁迫那一段切到《危机降临》，「画面闪开」再切回校园日常——
    // 所以整段自然播完的最终状态仍是校园日常（让玩家在结束卡前回到日常氛围）。
    const crisisAt = CH01_AFTER_FINALE.findIndex((line) => line.bgm === 'ch01Crisis');
    expect(crisisAt).toBeGreaterThan(0);
    expect(CH01_AFTER_FINALE[crisisAt]?.blackout).toBe(true);
    expect(reduceStateCues(CH01_AFTER_FINALE, 0).bgm).toBe('ch01Dorm');
    // 从黑屏那一行开始归约：先危机、后又被「闪开」那行覆盖回日常。
    expect(reduceStateCues(CH01_AFTER_FINALE, crisisAt).bgm).toBe('ch01Dorm');
  });

  it('战后多段剧本：任意跳过点补出的 BGM 与自然过完一致（含每个提问分支）', () => {
    const segments: readonly { readonly label: string; readonly lines: readonly DialogueLine[] }[] =
      [
        { label: 'after.intro', lines: CH01_NODES.after.lines },
        ...CH01_AFTER_INQUIRY.questions.map((question) => ({
          label: `after.${question.id}`,
          lines: question.lines,
        })),
        { label: 'after.finale', lines: CH01_AFTER_FINALE },
      ];
    for (const segment of segments) {
      const natural = reduceStateCues(segment.lines, 0);
      for (let skipAt = 0; skipAt <= segment.lines.length; skipAt += 1) {
        expect(
          stateAfterSkipping(segment.lines, skipAt),
          `${segment.label} 在第 ${skipAt} 行跳过`,
        ).toEqual(natural);
      }
    }
  });

  it('黑屏与鼾声是表现型：只有它们的行不会被当状态补播', () => {
    const snore = CH01_AFTER_INQUIRY.questions
      .find((question) => question.id === 'scene')
      ?.lines.find((line) => line.sfx !== undefined);
    expect(snore, '分支 2 的鼾声行不见了').toBeDefined();
    // 只有 sfx 的行归约为空 → 跳过时不补响。
    expect(stateCuesOfLine(snore as DialogueLine)).toEqual(EMPTY_STATE_CUES);
    // 黑屏那一行同时带 bgm：只取 bgm，blackout 本身不参与归约。
    const blackoutLine = CH01_AFTER_FINALE.find((line) => line.blackout === true);
    expect(blackoutLine).toBeDefined();
    expect(stateCuesOfLine(blackoutLine as DialogueLine)).toEqual({ bgm: 'ch01Crisis' });
    expect(Object.keys(stateCuesOfLine(blackoutLine as DialogueLine))).toEqual(['bgm']);
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

  it('黑屏是表现型：行显示时执行，收尾无条件恢复（且在推进节点之前）', () => {
    expect(applyLineCue).toContain('this.setBlackout(line.blackout)');
    expect(finishDialogue).toContain('this.setBlackout(false);');
    const restoreAt = finishDialogue.indexOf('this.setBlackout(false);');
    const completedAt = finishDialogue.indexOf('this.flow.nodeCompleted()');
    expect(restoreAt, 'skip 收尾没有恢复黑屏').toBeGreaterThanOrEqual(0);
    expect(completedAt, '恢复黑屏必须在推进节点之前').toBeGreaterThan(restoreAt);
  });

  it('战后多段剧本：intro/分支结束先回提问菜单，只有收尾段才推进节点', () => {
    expect(finishDialogue).toContain("this.afterStage !== 'closing'");
    expect(finishDialogue).toContain('this.openInquiryMenu();');
    const menuAt = finishDialogue.indexOf('this.openInquiryMenu();');
    const completedAt = finishDialogue.indexOf('this.flow.nodeCompleted()');
    expect(menuAt, 'finishDialogue 没有回提问菜单').toBeGreaterThanOrEqual(0);
    expect(completedAt, '提问菜单必须先于节点推进').toBeGreaterThan(menuAt);
  });
});
