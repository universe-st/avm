import { describe, expect, it } from 'vitest';
import { Ch01Flow, normalizeCh01FlowSnapshot, type Ch01FlowSnapshot } from '../src/story/ch01-flow';
import { CH01_OBJECTIVES } from '../src/story/ch01-dorm';

const types = (events: readonly { type: string }[]): string[] => events.map((event) => event.type);

describe('Ch01Flow · 可序列化快照（正式存档用）', () => {
  it('snapshot() 取出目标/叫醒/手机/phase', () => {
    const flow = new Ch01Flow({ previewPhase: 'explore' });
    flow.start();
    expect(flow.snapshot()).toEqual({
      phase: 'explore',
      objective: CH01_OBJECTIVES.wakeZheng,
      talkedZheng: false,
      phoneFound: false,
    });

    flow.interact('zheng');
    flow.nodeCompleted();
    const afterTalk = flow.snapshot();
    expect(afterTalk.talkedZheng).toBe(true);
    expect(afterTalk.phase).toBe('explore');
    expect(afterTalk.objective).not.toBe(CH01_OBJECTIVES.wakeZheng);
  });

  it('快照往返：新实例只发目标事件，状态逐字段相等', () => {
    const flow = new Ch01Flow({ previewPhase: 'explore' });
    flow.start();
    flow.interact('zheng');
    flow.nodeCompleted();
    const saved = flow.snapshot();

    const restored = new Ch01Flow({ snapshot: JSON.parse(JSON.stringify(saved)) as Ch01FlowSnapshot });
    const events = restored.start();
    expect(types(events)).toEqual(['objective']);
    expect(restored.state.phase).toBe('explore');
    expect(restored.state.objective).toBe(saved.objective);
    expect(restored.state.talkedZheng).toBe(true);
    expect(restored.state.phoneFound).toBe(saved.phoneFound);
    expect(restored.state.currentNode).toBeNull();
    // 幂等：再 start 一次不会重发事件
    expect(restored.start()).toEqual([]);
  });

  it('快照优先于 resume 检查点（更细粒度的状态不能被粗粒度覆盖）', () => {
    const snapshot: Ch01FlowSnapshot = {
      phase: 'explore',
      objective: '自定义目标',
      talkedZheng: true,
      phoneFound: true,
    };
    const flow = new Ch01Flow({ resume: 'afterBattle', snapshot });
    const events = flow.start();
    expect(types(events)).toEqual(['objective']);
    expect(flow.state.objective).toBe('自定义目标');
    expect(flow.state.talkedZheng).toBe(true);
    expect(flow.state.phoneFound).toBe(true);
  });

  it('prep 快照回到准备阶段（不重播战后征召，也不再进结束卡）', () => {
    const flow = new Ch01Flow({
      snapshot: {
        phase: 'prep',
        objective: CH01_OBJECTIVES.prepare,
        talkedZheng: true,
        phoneFound: true,
      },
    });
    const events = flow.start();
    expect(types(events)).toEqual(['objective']);
    expect(flow.state.phase).toBe('prep');
    expect(flow.state.currentNode).toBeNull();
    expect(flow.state.objective).toBe(CH01_OBJECTIVES.prepare);
    // 准备阶段只有小白可交互，其它对象不响应。
    expect(flow.interact('zheng')).toEqual([]);
    expect(types(flow.interact('xiaobai'))).toEqual(['complete']);
    expect(flow.state.phase).toBe('complete');
  });

  it('complete 快照直接出结束卡', () => {
    const flow = new Ch01Flow({
      snapshot: {
        phase: 'complete',
        objective: CH01_OBJECTIVES.complete,
        talkedZheng: true,
        phoneFound: true,
      },
    });
    expect(types(flow.start())).toEqual(['complete']);
    expect(flow.state.phase).toBe('complete');
  });

  it('非法快照回退普通开场（章节卡 → 目标 → 对话）', () => {
    const flow = new Ch01Flow({ snapshot: { phase: 'nope', objective: 'x' } as unknown as Ch01FlowSnapshot });
    expect(types(flow.start())).toEqual(['chapter-card', 'objective', 'dialogue']);
    expect(flow.state.phase).toBe('intro');
  });

  it('normalizeCh01FlowSnapshot 只放行合法 phase/字符串目标', () => {
    expect(normalizeCh01FlowSnapshot(null)).toBeNull();
    expect(normalizeCh01FlowSnapshot({ phase: 'explore' })).toBeNull();
    expect(normalizeCh01FlowSnapshot({ phase: 'explore', objective: 1 })).toBeNull();
    expect(
      normalizeCh01FlowSnapshot({ phase: 'explore', objective: 'x', talkedZheng: 'yes' }),
    ).toEqual({ phase: 'explore', objective: 'x', talkedZheng: false, phoneFound: false });
  });

  it('旧调用方式不受影响（无 snapshot 参数）', () => {
    const flow = new Ch01Flow();
    expect(types(flow.start())).toEqual(['chapter-card', 'objective', 'dialogue']);
    const resumed = new Ch01Flow({ resume: 'explore' });
    expect(types(resumed.start())).toEqual(['objective']);
  });
});
