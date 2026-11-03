import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CG_HANDOFF_CLEANUP_MS,
  CG_HANDOFF_FADE_MS,
  CG_HANDOFF_HOLD_MS,
  runCgHandoff,
} from '../src/app/cg-handoff';

/**
 * 「CG 结束 → 场景可交互」的收尾时间线。
 *
 * 这些用例守的是 2026-11-03 那个 bug 的**不变量**：
 * 任何一条路径（资源就绪 / 没就绪 / 进入失败 / 进入很慢）下，
 * 全屏过渡层都必须按同样的时间表收掉——它绝不能等 `enter()` 的结果。
 */
describe('CG 收尾时间线', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const schedule = (fn: () => void, ms: number): void => {
    setTimeout(fn, ms);
  };
  /** 测试里没有真实渲染帧：同步「提交一帧」。 */
  const afterPaint = (fn: () => void): void => fn();

  it('全屏定格时长在硬指标内（< 250ms）', () => {
    expect(CG_HANDOFF_HOLD_MS).toBeGreaterThan(0);
    expect(CG_HANDOFF_HOLD_MS).toBeLessThan(250);
  });

  it('资源就绪：不亮加载页，定格后先淡出、再起跑场景切换', async () => {
    const calls: string[] = [];
    const enter = vi.fn(() => {
      calls.push('enter');
      return Promise.resolve();
    });
    void runCgHandoff({
      enter,
      afterPaint,
      isReady: () => true,
      reveal: () => calls.push('reveal'),
      fadeOut: () => calls.push('fade'),
      remove: () => calls.push('remove'),
      schedule,
    });

    // 定格期间什么都不做：场景切换和淡出都不能抢在马赛克出现之前。
    expect(calls).toEqual([]);

    await vi.advanceTimersByTimeAsync(CG_HANDOFF_HOLD_MS);
    // 顺序是有意义的：先让 opacity transition 进合成器，再切场景。
    expect(calls).toEqual(['fade', 'enter']);

    await vi.advanceTimersByTimeAsync(CG_HANDOFF_FADE_MS + CG_HANDOFF_CLEANUP_MS);
    expect(calls).toEqual(['fade', 'enter', 'remove']);
  });

  it('资源没就绪：淡出前先亮加载页，保证玩家能看到进度', async () => {
    const calls: string[] = [];
    void runCgHandoff({
      enter: () => Promise.resolve(),
      afterPaint,
      isReady: () => false,
      reveal: () => calls.push('reveal'),
      fadeOut: () => calls.push('fade'),
      remove: () => calls.push('remove'),
      schedule,
    });

    await vi.advanceTimersByTimeAsync(CG_HANDOFF_HOLD_MS);
    expect(calls.slice(0, 2)).toEqual(['reveal', 'fade']);
  });

  /**
   * 回归用例：旧实现 `await enterModule().then(fade)`，进入失败/卡住时马赛克永远不淡。
   * 现在收尾是定时驱动的，失败只回调 onError。
   */
  it('进入失败：过渡层照样按时收掉，错误只上报一次', async () => {
    const calls: string[] = [];
    const errors: unknown[] = [];
    const done = runCgHandoff({
      enter: () => Promise.reject(new Error('资源加载失败：img.map.ch01.dorm_room')),
      afterPaint,
      isReady: () => false,
      reveal: () => calls.push('reveal'),
      fadeOut: () => calls.push('fade'),
      remove: () => calls.push('remove'),
      schedule,
      onError: (error) => errors.push(error),
    });

    await vi.advanceTimersByTimeAsync(CG_HANDOFF_HOLD_MS);
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain('资源加载失败');
    expect(calls).toEqual(['reveal', 'fade']);

    await vi.advanceTimersByTimeAsync(CG_HANDOFF_FADE_MS + CG_HANDOFF_CLEANUP_MS);
    expect(calls).toEqual(['reveal', 'fade', 'remove']);
    // 时间线走完就 resolve，不会把 reject 透给调用方。
    await expect(done).resolves.toBeUndefined();
  });

  it('进入一直不返回：过渡层也不会等它', async () => {
    const calls: string[] = [];
    const done = runCgHandoff({
      enter: () => new Promise<void>(() => undefined),
      afterPaint,
      isReady: () => true,
      reveal: () => calls.push('reveal'),
      fadeOut: () => calls.push('fade'),
      remove: () => calls.push('remove'),
      schedule,
    });

    await vi.advanceTimersByTimeAsync(CG_HANDOFF_HOLD_MS);
    expect(calls).toEqual(['fade']);

    await vi.advanceTimersByTimeAsync(CG_HANDOFF_FADE_MS + CG_HANDOFF_CLEANUP_MS);
    expect(calls).toEqual(['fade', 'remove']);
    await expect(done).resolves.toBeUndefined();
  });

  it('afterPaint 迟迟不回调时，过渡层也按时间表收掉', async () => {
    const calls: string[] = [];
    const done = runCgHandoff({
      enter: () => {
        calls.push('enter');
        return Promise.resolve();
      },
      // 模拟「浏览器一直没提交帧」：切换永远起不来。
      afterPaint: () => undefined,
      isReady: () => true,
      reveal: () => calls.push('reveal'),
      fadeOut: () => calls.push('fade'),
      remove: () => calls.push('remove'),
      schedule,
    });

    await vi.advanceTimersByTimeAsync(CG_HANDOFF_HOLD_MS);
    expect(calls).toEqual(['fade']);
    await vi.advanceTimersByTimeAsync(CG_HANDOFF_FADE_MS + CG_HANDOFF_CLEANUP_MS);
    expect(calls).toEqual(['fade', 'remove']);
    await expect(done).resolves.toBeUndefined();
  });
});
