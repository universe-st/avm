import { describe, expect, it, vi } from 'vitest';
import { GateOverlaySignal } from '../src/resource/gate-overlay';

/**
 * 加载页遮罩信号。
 *
 * 守的是开场 CG 的三条时序：遮罩「完全撤掉」之后才能起播；首帧没解码之前压住门禁
 * （不然撤罩瞬间是黑的）；首帧一就绪就放行门禁（不等 holdMs，否则会拉长整条流程）。
 */
describe('加载页遮罩信号', () => {
  it('没有遮罩时 whenHidden 立即 resolve（不会卡住没有门禁的路径）', async () => {
    const signal = new GateOverlaySignal();
    expect(signal.isVisible).toBe(false);
    await expect(signal.whenHidden()).resolves.toBeUndefined();
  });

  it('遮罩亮起后 whenHidden 要等到 markHidden', async () => {
    const signal = new GateOverlaySignal();
    const resolved = vi.fn();
    signal.markShown();
    expect(signal.isVisible).toBe(true);

    const waiting = signal.whenHidden().then(resolved);
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled();

    signal.markHidden();
    await waiting;
    expect(resolved).toHaveBeenCalledTimes(1);
    expect(signal.isVisible).toBe(false);
  });

  it('多个等待者都会被唤醒，且只唤醒一次', async () => {
    const signal = new GateOverlaySignal();
    signal.markShown();
    const first = vi.fn();
    const second = vi.fn();
    const waiters = [signal.whenHidden().then(first), signal.whenHidden().then(second)];

    signal.markHidden();
    signal.markHidden();
    await Promise.all(waiters);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('hold 压住门禁，release 才通知 LoaderScene 补撤', () => {
    const signal = new GateOverlaySignal();
    const handler = vi.fn();
    signal.setReleaseHandler(handler);
    signal.markShown();

    signal.hold();
    expect(signal.isHeld).toBe(true);
    expect(handler).not.toHaveBeenCalled();

    signal.release();
    expect(signal.isHeld).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);

    // 幂等：没 hold 过 / 重复 release 都不会再通知。
    signal.release();
    signal.hold();
    signal.release();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('LoaderScene shutdown 摘掉通道后 release 不报错', () => {
    const signal = new GateOverlaySignal();
    signal.hold();
    signal.setReleaseHandler(null);
    expect(() => signal.release()).not.toThrow();
    expect(signal.isHeld).toBe(false);
  });
});
