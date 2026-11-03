/**
 * 「加载页遮罩是否还盖着」的进程内信号（纯逻辑，不 import Phaser / DOM）。
 *
 * ## 为什么需要它
 *
 * 2026-11-03 反馈：开场 CG 进入时有约 0.84~0.96s 被加载页盖住。原因是视频在场景 `create`
 * 里就 `play()` 了，而门禁遮罩还要走 `holdMs 520ms + 120ms 排队 + 200ms 淡出` 才完全撤掉——
 * 玩家看到的是「中途切入」的 CG，而不是第 0 秒的构图。
 *
 * 遮罩的状态只有 `LoaderScene` 自己知道（`overlayVisible` / 淡出 tween 结束），
 * 所以由它上报给这里；CG 场景只需要 `whenHidden()` 等一个 promise，不需要复制门禁的时间表。
 *
 * ## 反向通道：hold / release
 *
 * 「等遮罩撤掉再起播」不能变成「遮罩撤了但视频还没解码」——那样会先黑一下。
 * 过场场景进来时先 `hold()` 把门禁的自动撤罩压住，等首帧解码好（或超时）再 `release()`：
 * `LoaderScene` 收到 release 会**立刻**撤罩（跳过 holdMs 与淡出），这样既不会在遮罩后面偷播，
 * 也不会把整条流程拉长一个门禁的时长。
 *
 * 约定：
 * - 遮罩「完全撤掉」才 `markHidden()`（淡出 tween 结束 / 立刻隐藏时同步调用）；
 * - `whenHidden()` 在遮罩未显示时立即 resolve，所以没有门禁的路径（例如直接 `scene.start`）不会卡住；
 * - `hold()` / `release()` 幂等；`release()` 在没 hold 过时不做事；
 * - 过场场景被跳过时必须 `release()`（`CgRevealHandle.cancel()` 会做），否则下一个门禁撤不掉。
 */
export class GateOverlaySignal {
  private visible = false;
  private held = false;
  private waiters: Array<() => void> = [];
  private releaseHandler: (() => void) | null = null;

  get isVisible(): boolean {
    return this.visible;
  }

  /** 是否有过场压着门禁不让撤罩。 */
  get isHeld(): boolean {
    return this.held;
  }

  /** `LoaderScene`：遮罩亮起（`showNow`）。重复调用无副作用。 */
  markShown(): void {
    this.visible = true;
  }

  /** `LoaderScene`：遮罩完全撤掉。唤醒所有等待者。 */
  markHidden(): void {
    this.visible = false;
    if (this.waiters.length === 0) return;
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }

  /** 等遮罩彻底撤掉；已经撤掉时立即 resolve。 */
  whenHidden(): Promise<void> {
    if (!this.visible) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  /** 过场场景：首帧就绪之前别撤罩（否则撤罩瞬间是黑的）。 */
  hold(): void {
    this.held = true;
  }

  /** 过场场景：首帧已就绪（或被跳过），放行门禁——`LoaderScene` 会立刻撤罩。 */
  release(): void {
    if (!this.held) return;
    this.held = false;
    this.releaseHandler?.();
  }

  /** `LoaderScene` 注册「release 后立刻撤罩」通道。 */
  setReleaseHandler(handler: (() => void) | null): void {
    this.releaseHandler = handler;
  }
}

/** 全局单例：`LoaderScene` 上报，过场场景消费。 */
export const gateOverlay = new GateOverlaySignal();
