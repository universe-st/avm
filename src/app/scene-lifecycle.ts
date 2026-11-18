/**
 * 场景实例的「生命周期闩」。
 *
 * ## 为什么需要它
 *
 * Phaser 的 Scene 实例在 `scene.restart()`、以及「离开后再次进入」时是**同一个对象**：
 * 类字段不会自动恢复初始值。`SHUTDOWN` 里置位的 `shuttingDown` 若不在下一次
 * `create()` 清零，这个实例之后的所有异步回调都会被永久判成「场景已关闭」——
 * 2026-11-18「寝室读档后，手机 CG 播完不接小白台词、直接变自由行动」就是这个闩没复位，
 * `playCutsceneVideo()` 的 `onDone` 被 `if (this.shuttingDown) return` 吞掉。
 *
 * ## 用法（每个有异步回调的场景）
 *
 * 1. `create()` 开头（或它的 `resetState()`）调 `beginRun()`：开一轮新运行；
 * 2. `SHUTDOWN` 收尾调 `close()`；
 * 3. 异步回调在**创建时**记下 `runId`，回来第一件事是 `isLive(runId)`：
 *    它同时要求「同一轮」且「没在收尾」，上一轮迟到的回调不可能打进新一局。
 *
 * 这样「忘了复位布尔」不再是一个能悄悄发生的错误：`beginRun()` 是每轮运行的唯一入口，
 * 而 `isLive()` 的 runId 比较还额外挡掉了「旧回调在新一局里生效」这类串轮问题。
 */
export class SceneLifecycle {
  private runIdValue = 0;
  private closing = false;

  /** 开一轮新运行（在 `create()` 里调）。返回本轮 id，供回调记下。 */
  beginRun(): number {
    this.closing = false;
    this.runIdValue += 1;
    return this.runIdValue;
  }

  /** 本轮进入收尾（`SHUTDOWN`）。幂等。 */
  close(): void {
    this.closing = true;
  }

  /** 当前轮的 id；同一场景实例每 `create()` 一次 +1。 */
  get runId(): number {
    return this.runIdValue;
  }

  /** 是否正在收尾（等价于旧代码里的 `shuttingDown`）。 */
  get shuttingDown(): boolean {
    return this.closing;
  }

  /** 这一轮回调还该生效吗：同一轮 + 没在收尾。 */
  isLive(runId: number): boolean {
    return !this.closing && runId === this.runIdValue;
  }
}
