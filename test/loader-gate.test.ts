import { describe, expect, it } from 'vitest';
import type { LoadState } from '../src/assets/types';
import { loaderVisibility, PREFETCH_LOAD_OPTIONS, revealState } from '../src/resource/gate';

const IDLE: LoadState = {
  phase: 'idle',
  bundles: [],
  progress: 0,
  currentKey: null,
  currentLabel: '',
  label: '',
  loaded: 0,
  total: 0,
  bytesLoaded: 0,
  bytesTotal: 0,
  startedAt: 0,
  show: 'auto',
  holdMs: 0,
  error: null,
};

const state = (patch: Partial<LoadState>): LoadState => ({ ...IDLE, ...patch });

/**
 * 加载页可见性。
 *
 * 守两件事：
 * 1. 过场期间的**预取**（`show: 'never'`）绝不能把加载页弹到 CG 上，失败也不能；
 * 2. 内容场景门禁（`show: 'always'`）的观感不变——仍然立刻亮页。
 */
describe('加载页可见性', () => {
  it('预取批次全程静默（loading / error / ready 都不亮页）', () => {
    expect(PREFETCH_LOAD_OPTIONS.show).toBe('never');
    expect(loaderVisibility(state({ phase: 'loading', show: 'never' }))).toBe('hidden');
    expect(loaderVisibility(state({ phase: 'error', show: 'never', error: 'x' }))).toBe('hidden');
    expect(loaderVisibility(state({ phase: 'ready', show: 'never' }))).toBe('hidden');
  });

  it('场景门禁立刻亮页，auto 批次延迟亮页', () => {
    expect(loaderVisibility(state({ phase: 'loading', show: 'always' }))).toBe('instant');
    expect(loaderVisibility(state({ phase: 'error', show: 'always' }))).toBe('instant');
    expect(loaderVisibility(state({ phase: 'loading', show: 'auto' }))).toBe('delayed');
  });
});

describe('预取可以在需要时改亮加载页', () => {
  it('批次进行中：静默切换成立刻亮页', () => {
    const next = revealState(state({ phase: 'loading', show: 'never', progress: 0.42 }));
    expect(next).not.toBeNull();
    expect(next!.show).toBe('always');
    // 进度不能被这次切换清掉——玩家看到的就是这条进度。
    expect(next!.progress).toBe(0.42);
    expect(loaderVisibility(next!)).toBe('instant');
  });

  it('批次还没开始 / 已结束：返回 null，交给门禁自己处理', () => {
    expect(revealState(state({ phase: 'ready', show: 'never' }))).toBeNull();
    expect(revealState(state({ phase: 'idle', show: 'never' }))).toBeNull();
    expect(revealState(state({ phase: 'error', show: 'never' }))).toBeNull();
  });
});
