import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CG_FRAME_TIMEOUT_MS,
  CG_GATE_TIMEOUT_MS,
  startCgWhenRevealed,
  type CgRevealDeps,
} from '../src/app/cg-reveal';

/**
 * 开场 CG 的起播时机。
 *
 * 守的是 2026-11-03 那条反馈的不变量：**加载页遮罩完全撤掉之前不得 `play()`**，
 * 否则 CG 会在遮罩后面偷偷播掉开头近 1 秒，玩家看到的是「中途切入」。
 * 同时：撤罩前首帧必须已经解码（不然黑一下），首帧一就绪就放行门禁（不能白等），
 * 任何等待都有兜底上限。
 */
interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value?: T): void;
  reject(error: unknown): void;
}

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value?: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = (value?: T) => res(value as T);
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 让已经排队的 promise 续体跑完（fake timers 下 advance(0) 会 flush microtasks）。 */
const flush = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

interface Harness {
  readonly deps: CgRevealDeps;
  readonly play: ReturnType<typeof vi.fn>;
  readonly hold: ReturnType<typeof vi.fn>;
  readonly release: ReturnType<typeof vi.fn>;
  readonly warn: ReturnType<typeof vi.fn>;
  readonly frame: Deferred<void>;
  readonly gate: Deferred<void>;
  setFrameReady(value: boolean): void;
  setGateHidden(value: boolean): void;
}

function harness(patch: Partial<CgRevealDeps> = {}): Harness {
  const frame = deferred<void>();
  const gate = deferred<void>();
  let frameReady = false;
  let gateHidden = false;
  const play = vi.fn(() => Promise.resolve());
  const hold = vi.fn();
  const release = vi.fn();
  const warn = vi.fn();
  const deps: CgRevealDeps = {
    isGateHidden: () => gateHidden,
    whenGateHidden: () => gate.promise,
    isFirstFrameReady: () => frameReady,
    whenFirstFrameReady: () => frame.promise,
    holdGate: hold,
    releaseGate: release,
    play,
    onWarn: warn,
    ...patch,
  };
  return {
    deps,
    play,
    hold,
    release,
    warn,
    frame,
    gate,
    setFrameReady: (value) => {
      frameReady = value;
    },
    setGateHidden: (value) => {
      gateHidden = value;
    },
  };
}

describe('开场 CG 起播时机', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('遮罩完全撤掉之前绝不播放', async () => {
    const h = harness();
    h.setFrameReady(true);
    const handle = startCgWhenRevealed(h.deps);

    await flush();
    // 先压住门禁，再放行：首帧已就绪，release 会立刻撤罩。
    expect(h.hold).toHaveBeenCalledTimes(1);
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.play).not.toHaveBeenCalled();

    h.setGateHidden(true);
    h.gate.resolve();
    await handle.done;
    expect(h.play).toHaveBeenCalledTimes(1);
  });

  it('首帧没解码之前不撤罩也不播放（不然会黑一下）', async () => {
    const h = harness();
    const handle = startCgWhenRevealed(h.deps);

    await flush();
    expect(h.hold).toHaveBeenCalledTimes(1);
    expect(h.release).not.toHaveBeenCalled();
    expect(h.play).not.toHaveBeenCalled();

    h.setFrameReady(true);
    h.frame.resolve();
    await flush();
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.play).not.toHaveBeenCalled();

    h.setGateHidden(true);
    h.gate.resolve();
    await handle.done;
    expect(h.play).toHaveBeenCalledTimes(1);
  });

  it('遮罩已经撤掉（没有门禁的路径）时立刻起播，保持旧行为', async () => {
    const h = harness({ isGateHidden: () => true });
    const handle = startCgWhenRevealed(h.deps);

    await handle.done;
    expect(h.play).toHaveBeenCalledTimes(1);
    expect(h.hold).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
  });

  it('取消（跳过/返回）会放行门禁，且不会起播', async () => {
    const h = harness();
    h.setFrameReady(true);
    const handle = startCgWhenRevealed(h.deps);

    await flush();
    expect(h.release).toHaveBeenCalledTimes(1);

    handle.cancel();
    expect(handle.phase).toBe('cancelled');
    h.setGateHidden(true);
    h.gate.resolve();
    await handle.done;
    expect(h.play).not.toHaveBeenCalled();
    expect(h.release).toHaveBeenCalledTimes(2);
  });

  it('遮罩迟迟不撤：超时兜底起播，不把玩家锁在加载页', async () => {
    const h = harness();
    h.setFrameReady(true);
    const handle = startCgWhenRevealed(h.deps);

    await vi.advanceTimersByTimeAsync(CG_GATE_TIMEOUT_MS + 10);
    expect(h.play).toHaveBeenCalledTimes(1);
    expect(h.warn).toHaveBeenCalled();
    await handle.done;
  });

  it('首帧迟迟不来：超时后放行门禁，撤罩即起播', async () => {
    const h = harness();
    const handle = startCgWhenRevealed(h.deps);

    await vi.advanceTimersByTimeAsync(CG_FRAME_TIMEOUT_MS + 10);
    expect(h.hold).toHaveBeenCalledTimes(1);
    expect(h.release).toHaveBeenCalledTimes(1);
    expect(h.warn).toHaveBeenCalled();
    expect(h.play).not.toHaveBeenCalled();

    h.setGateHidden(true);
    h.gate.resolve();
    await handle.done;
    expect(h.play).toHaveBeenCalledTimes(1);
  });

  it('播放失败（自动播放被拦）不会让流程 reject', async () => {
    const h = harness({ isGateHidden: () => true });
    h.play.mockImplementationOnce(() => Promise.reject(new Error('NotAllowedError')));
    const handle = startCgWhenRevealed(h.deps);
    await expect(handle.done).resolves.toBeUndefined();
  });
});
