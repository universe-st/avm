import { describe, expect, it } from 'vitest';
import {
  CH01_AFTER_HANDOFF,
  CH01_AFTER_XIAOBAI_SPEAKER,
} from '../src/story/ch01-after';
import { DIALOGUE_CUE_KINDS, speakerLabel, stateCuesOfLine } from '../src/story/dialogue';
import {
  NAME_RENAME_FROM,
  NAME_RENAME_TIMELINE,
  NAME_RENAME_TO,
  NAME_RENAME_TOTAL_MS,
} from '../src/story/name-rename';

/**
 * 「名字从白色小精灵变成小白」的改名演出护栏（2026-11-27 用户要求）。
 *
 * 这里只测**纯数据**（不启动 Phaser）：剧本里哪一行触发、触发时的显示名对不对、
 * 时间是单调的、cue 的分类是对的。真正的画面在实机上取证
 * （`.evidence/scripts/capture-name-rename-2026-11-27.mjs`）。
 */
describe('name rename fx', () => {
  it('定名前后的显示名常量与剧本用词一致', () => {
    expect(NAME_RENAME_FROM).toBe(CH01_AFTER_XIAOBAI_SPEAKER);
    expect(NAME_RENAME_FROM).toBe('白色小精灵');
    expect(NAME_RENAME_TO).toBe('小白');
  });

  it('「代号更新确认」那一行挂 fx: rename，且说话人已经是小白', () => {
    const index = CH01_AFTER_HANDOFF.findIndex((line) => line.text.startsWith('代号更新确认'));
    expect(index).toBeGreaterThan(0);
    const line = CH01_AFTER_HANDOFF[index];
    expect(line?.fx).toBe('rename');
    expect(speakerLabel(line?.speaker)).toBe(NAME_RENAME_TO);
    // 上一句必须是旁白（显示名为空）：名字确实是「从无到小白」，不是和别的说话人重名
    expect(speakerLabel(CH01_AFTER_HANDOFF[index - 1]?.speaker)).toBe('');
  });

  it('整段剧本里只有这一行演改名', () => {
    const lines = CH01_AFTER_HANDOFF.filter((line) => line.fx === 'rename');
    expect(lines).toHaveLength(1);
  });

  it('rename 属于表现型 cue：跳过不补播，也不改任何状态', () => {
    expect(DIALOGUE_CUE_KINDS.fx).toBe('expressive');
    const line = CH01_AFTER_HANDOFF.find((item) => item.fx === 'rename');
    expect(line).toBeDefined();
    if (line) expect(stateCuesOfLine(line)).toEqual({});
  });

  it('时间线单调递增，总时长在一拍的预算内（≤1.2s）', () => {
    const T = NAME_RENAME_TIMELINE;
    expect(T.sweepDelay).toBeGreaterThanOrEqual(0);
    expect(T.sweep).toBeGreaterThan(0);
    expect(T.corrupt).toBeGreaterThan(0);
    expect(T.glitchTick).toBeGreaterThan(0);
    expect(T.morphStep).toBeGreaterThan(0);
    expect(T.morphSteps).toBeGreaterThan(1);
    expect(T.refineBlock).toBeLessThan(T.block);
    expect(NAME_RENAME_TOTAL_MS).toBe(
      T.sweepDelay +
        T.sweep +
        T.corrupt +
        T.morphStep * T.morphSteps +
        T.refine +
        T.reveal,
    );
    expect(NAME_RENAME_TOTAL_MS).toBeLessThanOrEqual(1200);
    // 抖动至少要跳两下，否则「数据损坏」看不出来
    expect(Math.floor(T.corrupt / T.glitchTick)).toBeGreaterThanOrEqual(2);
  });
});
