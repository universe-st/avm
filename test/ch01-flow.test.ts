import { describe, expect, it } from 'vitest';
import {
  CH01_PREVIEW_PHASES,
  Ch01Flow,
  isCh01ResumeData,
  normalizeCh01PreviewPhase,
} from '../src/story/ch01-flow';
import { CH01_OBJECTIVES } from '../src/story/ch01-dorm';

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
    expect(normalizeCh01PreviewPhase('complete')).toBe('complete');
    expect(normalizeCh01PreviewPhase('nope')).toBe('opening');
    expect(CH01_PREVIEW_PHASES).toContain('opening');

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
});
