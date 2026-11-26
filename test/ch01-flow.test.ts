import { describe, expect, it } from 'vitest';
import {
  CH01_PREVIEW_PHASES,
  Ch01Flow,
  endCardRestartData,
  isCh01ResumeData,
  normalizeCh01PreviewPhase,
} from '../src/story/ch01-flow';
import { CH01_OBJECTIVES } from '../src/story/ch01-dorm';
import { isStageLaunchContext } from '../src/dev/stage-types';

const types = (events: readonly { type: string }[]): string[] => events.map((event) => event.type);

function startExplore(): Ch01Flow {
  const flow = new Ch01Flow({ previewPhase: 'explore' });
  flow.start();
  return flow;
}

function finishNode(flow: Ch01Flow): void {
  expect(flow.state.currentNode).not.toBeNull();
  flow.nodeCompleted();
}

describe('Ch01Flow', () => {
  it('opens with a chapter card, objective and intro dialogue', () => {
    const flow = new Ch01Flow();
    const events = flow.start();
    expect(types(events)).toEqual(['chapter-card', 'objective', 'dialogue']);
    expect(flow.state).toMatchObject({
      phase: 'intro',
      objective: CH01_OBJECTIVES.wakeZheng,
      talkedZheng: false,
      phoneFound: false,
      currentNode: 'intro',
    });
    expect(flow.start()).toEqual([]);
  });

  it('moves from intro to free exploration', () => {
    const flow = new Ch01Flow();
    flow.start();
    const events = flow.nodeCompleted();
    expect(types(events)).toContain('objective');
    expect(flow.state.phase).toBe('explore');
    expect(flow.state.objective).toBe(CH01_OBJECTIVES.wakeZheng);
  });

  it('only lets the phone progress after Zheng has been checked', () => {
    const flow = startExplore();
    const locked = flow.interact('phone');
    expect(types(locked)).toEqual(['dialogue']);
    const lockedEvent = locked[0];
    if (lockedEvent?.type !== 'dialogue') throw new Error('expected dialogue');
    expect(lockedEvent.nodeId).toBe('phone-locked');
    finishNode(flow);
    expect(flow.state.phase).toBe('explore');
    expect(flow.state.objective).toBe(CH01_OBJECTIVES.wakeZheng);
    expect(flow.state.phoneFound).toBe(false);
  });

  it('runs Zheng -> phone -> dream -> battle in order', () => {
    const flow = startExplore();

    flow.interact('zheng');
    expect(flow.state.talkedZheng).toBe(true);
    flow.nodeCompleted();
    expect(flow.state.phase).toBe('explore');
    expect(flow.state.objective).toBe(CH01_OBJECTIVES.findPhone);

    const phone = flow.interact('phone');
    expect(types(phone)).toEqual(['objective', 'dialogue']);
    expect(flow.state.phoneFound).toBe(true);
    expect(flow.state.phase).toBe('explore');
    expect(flow.state.objective).toBe(CH01_OBJECTIVES.listen);

    const dream = flow.nodeCompleted();
    expect(types(dream)).toEqual(['objective', 'dialogue']);
    expect(flow.state.phase).toBe('dream');

    const battle = flow.nodeCompleted();
    expect(types(battle)).toEqual(['objective', 'battle']);
    expect(flow.state.phase).toBe('battle');
    expect(flow.state.objective).toBe(CH01_OBJECTIVES.survive);
  });

  it('resumes at the after-battle node and finishes the section', () => {
    const flow = new Ch01Flow({ previewPhase: 'explore' });
    flow.start();

    // 直接推到战斗，再模拟战败返回。
    flow.interact('zheng');
    flow.nodeCompleted();
    flow.interact('phone');
    flow.nodeCompleted();
    expect(flow.state.phase).toBe('dream');
    flow.nodeCompleted();
    expect(flow.state.phase).toBe('battle');

    const after = flow.onBattleDefeat();
    expect(types(after)).toEqual(['objective', 'dialogue']);
    expect(flow.state.phase).toBe('after');
    expect(flow.state.objective).toBe(CH01_OBJECTIVES.afterBattle);

    const complete = flow.nodeCompleted();
    expect(types(complete)).toEqual(['objective', 'complete']);
    expect(flow.state.phase).toBe('complete');
  });

  it('starts directly at the after-battle node when resuming', () => {
    const flow = new Ch01Flow({ resume: 'afterBattle' });
    const events = flow.start();
    expect(types(events)).toEqual(['objective', 'dialogue']);
    expect(flow.state.phase).toBe('after');
    expect(flow.state.currentNode).toBe('after');
  });

  it('supports preview phases and falls back to opening', () => {
    expect(normalizeCh01PreviewPhase('explore')).toBe('explore');
    expect(normalizeCh01PreviewPhase('after')).toBe('after');
    // 两个战后单点预览都归一成 after：流程语义复用，场景自己切台词。
    expect(normalizeCh01PreviewPhase('dark')).toBe('after');
    expect(normalizeCh01PreviewPhase('naming')).toBe('after');
    expect(normalizeCh01PreviewPhase('complete')).toBe('complete');
    expect(normalizeCh01PreviewPhase('nope')).toBe('opening');
    expect(CH01_PREVIEW_PHASES).toContain('opening');
    expect(CH01_PREVIEW_PHASES).toContain('naming');

    const naming = new Ch01Flow({ previewPhase: 'naming' });
    expect(types(naming.start())).toEqual(['objective', 'dialogue']);
    expect(naming.state.phase).toBe('after');
    expect(naming.state.currentNode).toBe('after');

    const explore = new Ch01Flow({ previewPhase: 'explore' });
    expect(types(explore.start())).toEqual(['objective']);
    expect(explore.state.phase).toBe('explore');

    const after = new Ch01Flow({ previewPhase: 'after' });
    expect(types(after.start())).toEqual(['objective', 'dialogue']);
    expect(after.state.phase).toBe('after');

    const complete = new Ch01Flow({ previewPhase: 'complete' });
    expect(types(complete.start())).toEqual(['complete']);
    expect(complete.state.phase).toBe('complete');
  });

  it('ignores interactions while a dialogue is open or outside exploration', () => {
    const flow = new Ch01Flow();
    flow.start();
    expect(flow.interact('zheng')).toEqual([]);

    const explore = startExplore();
    explore.interact('desk');
    expect(explore.interact('zheng')).toEqual([]);
  });

  it('keeps optional flavour interactions repeatable and harmless', () => {
    const flow = startExplore();
    const first = flow.interact('desk');
    expect(types(first)).toEqual(['dialogue']);
    finishNode(flow);
    expect(flow.state.objective).toBe(CH01_OBJECTIVES.wakeZheng);
    expect(flow.state.talkedZheng).toBe(false);

    const second = flow.interact('desk');
    expect(types(second)).toEqual(['dialogue']);
  });

  it('recognises the battle-resume payload', () => {
    expect(isCh01ResumeData({ resume: 'afterBattle' })).toBe(true);
    expect(isCh01ResumeData({ resume: 'start' })).toBe(false);
    expect(isCh01ResumeData(null)).toBe(false);
    expect(isCh01ResumeData('afterBattle')).toBe(false);
  });

  it('从标题「继续游戏」可以恢复到探索 / 结束卡', () => {
    const explore = new Ch01Flow({ resume: 'explore' });
    expect(types(explore.start())).toEqual(['objective']);
    expect(explore.state.phase).toBe('explore');
    expect(explore.state.talkedZheng).toBe(false);

    const complete = new Ch01Flow({ resume: 'complete' });
    expect(types(complete.start())).toEqual(['complete']);
    expect(complete.state.phase).toBe('complete');

    expect(isCh01ResumeData({ resume: 'explore' })).toBe(true);
    expect(isCh01ResumeData({ resume: 'complete' })).toBe(true);
  });

  /** 场景 `init()` 的恢复模式判定（与 ch01-dorm-scene 里那行保持一致）。 */
  const resumeModeOf = (
    data: unknown,
  ): 'start' | 'afterBattle' | 'explore' | 'complete' =>
    isCh01ResumeData(data) ? data.resume : 'start';

  it('C3 回归：结束卡「重看本节」不会把旧的 resume:complete 带回 restart', () => {
    // Phaser 的 `restart()` 不传 data 时会沿用上次启动的 data——从「继续游戏」进来就是这个。
    const stale: unknown = { resume: 'complete' };
    expect(isCh01ResumeData(stale)).toBe(true);

    const restart = endCardRestartData();
    expect(restart).toEqual({ resume: 'start' });
    expect(String(restart.resume)).not.toBe('complete');
    // `isCh01ResumeData` 不认 'start'，场景才会回落到「从本节开头重演」。
    expect(isCh01ResumeData(restart)).toBe(false);
    expect(resumeModeOf(restart)).toBe('start');
  });

  it('C3 回归：restart 后状态机从开场重演，不再直接弹结束卡', () => {
    const flow = new Ch01Flow({ resume: resumeModeOf(endCardRestartData()) });
    const events = flow.start();
    expect(types(events)).toEqual(['chapter-card', 'objective', 'dialogue']);
    expect(flow.state.phase).toBe('intro');
    expect(types(events)).not.toContain('complete');
  });

  it('C3 回归：预览会话 restart 后仍认得自己是预览', () => {
    const restart = endCardRestartData({ preview: true });
    expect(restart.preview).toBe(true);
    expect(isCh01ResumeData(restart)).toBe(false);
    expect(resumeModeOf(restart)).toBe('start');
    // 普通对象（无 stageId 等字段）过不了舞台上下文校验，场景靠 preview 标记识别预览。
    expect(isStageLaunchContext(restart)).toBe(false);
  });

  it('C3 回归：正式流程 restart 不带 preview 标记，也不串 seed', () => {
    const normal = endCardRestartData({ preview: false });
    expect('preview' in normal).toBe(false);
    expect('seed' in endCardRestartData()).toBe(false);
    const seeded = endCardRestartData({ preview: true, seed: 7 });
    expect(seeded.seed).toBe(7);
    expect('seed' in endCardRestartData({ seed: Number.NaN })).toBe(false);
  });

  it('dream 节点只负责推进战斗，不复述金殿台词', () => {
    const flow = startExplore();
    flow.interact('zheng');
    flow.nodeCompleted();
    flow.interact('phone');
    flow.nodeCompleted();
    expect(flow.state.currentNode).toBe('dream');
    // 空台词节点：下一拍直接是战斗，不再吐 dialogue 内容。
    const battle = flow.nodeCompleted();
    expect(types(battle)).toEqual(['objective', 'battle']);
    expect(flow.state.phase).toBe('battle');
  });
});
