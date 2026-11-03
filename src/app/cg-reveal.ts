/**
 * 「门禁撤罩之后再起播开场 CG」的纯逻辑（不 import Phaser / DOM）。
 *
 * ## 要解决的问题
 *
 * 2026-11-03 反馈：进 `ch01-opening` 时门禁遮罩（`show:'always'`，holdMs 520ms + 200ms 淡出）
 * 还盖着，视频在 `create` 里就已经 `play()` 了；遮罩撤掉时 CG 已经播掉近 1 秒，
 * 玩家看到的是「中途切入」而不是第 0 秒的构图。
 *
 * ## 时间线
 *
 * ```text
 * create            视频挂上、preload 解码首帧，但保持 paused；先 hold 住门禁
 * loadeddata        首帧就绪 → release()（门禁立刻撤罩，跳过 holdMs / 淡出）
 * overlay hidden    遮罩完全撤掉 → play()（currentTime 从 0 开始走）
 * ```
 *
 * 三条硬约束：
 *
 * 1. **遮罩没撤掉之前绝不 `play()`**（否则又变成遮罩后面偷偷播掉一段）。
 * 2. **撤罩时首帧必须已经解码**，否则撤罩瞬间是黑的：门禁的自动撤罩先被 `hold()` 压住，
 *    慢网下它会一直停在加载页，直到首帧就绪（这正是玩家想看的进度）。
 * 3. **不能白等**：首帧一就绪就 `release()`，而不是等门禁自己的 520ms+200ms 节奏；
 *    首帧迟迟不来时（慢网 / 解码失败）有 `frameTimeoutMs` 兜底，门禁迟迟不撤有
 *    `gateTimeoutMs` 兜底——宁可起播晚一点，也不能把玩家锁在加载页上。
 *
 * 没有遮罩的路径（遮罩已经撤掉，例如直接 `scene.start`）保持旧行为：立刻起播。
 */
export interface CgRevealDeps {
  readonly isGateHidden: () => boolean;
  readonly whenGateHidden: () => Promise<void>;
  readonly isFirstFrameReady: () => boolean;
  readonly whenFirstFrameReady: () => Promise<void>;
  /** 首帧没就绪之前压住门禁，别让它按 holdMs 自动撤罩（撤了就是黑一下）。 */
  readonly holdGate: () => void;
  /** 首帧已就绪：放行门禁，`LoaderScene` 会立刻撤罩（跳过 holdMs / 淡出）。 */
  readonly releaseGate: () => void;
  /** 起播（失败由实现方自己降级，这里不关心 reject）。 */
  readonly play: () => Promise<void>;
  /** 兜底计时器；默认 `setTimeout`（单测可换掉）。 */
  readonly waitMs?: (ms: number) => Promise<void>;
  /** 首帧等待上限，默认 `CG_FRAME_TIMEOUT_MS`。 */
  readonly frameTimeoutMs?: number;
  /** 遮罩撤除等待上限，默认 `CG_GATE_TIMEOUT_MS`。 */
  readonly gateTimeoutMs?: number;
  /** 超时/异常告警（不改流程）。 */
  readonly onWarn?: (message: string) => void;
}

export type CgRevealPhase = 'waiting-frame' | 'waiting-gate' | 'playing' | 'cancelled';

export interface CgRevealHandle {
  readonly phase: CgRevealPhase;
  /** 流程走完（起播 or 取消）；永不 reject。 */
  readonly done: Promise<void>;
  /** 场景 shutdown / 跳过时取消：之后绝不会再调 `play()`。 */
  cancel(): void;
}

/** 首帧等待上限：超过就当作「先撤罩、能播就播」。 */
export const CG_FRAME_TIMEOUT_MS = 3000;
/** 遮罩撤除等待上限：门禁信号异常时也不把玩家锁在加载页。 */
export const CG_GATE_TIMEOUT_MS = 2000;

export function startCgWhenRevealed(deps: CgRevealDeps): CgRevealHandle {
  const waitMs =
    deps.waitMs ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const frameTimeoutMs = deps.frameTimeoutMs ?? CG_FRAME_TIMEOUT_MS;
  const gateTimeoutMs = deps.gateTimeoutMs ?? CG_GATE_TIMEOUT_MS;

  let phase: CgRevealPhase = 'waiting-frame';
  let cancelled = false;

  const run = async (): Promise<void> => {
    if (!deps.isGateHidden()) {
      // 先压住门禁：首帧没解码就把遮罩撤掉，玩家会看到一瞬间的黑底。
      deps.holdGate();
      if (!deps.isFirstFrameReady()) {
        phase = 'waiting-frame';
        await Promise.race([deps.whenFirstFrameReady(), waitMs(frameTimeoutMs)]);
        if (cancelled) {
          deps.releaseGate();
          return;
        }
        if (!deps.isFirstFrameReady()) {
          deps.onWarn?.(`首帧等待超过 ${frameTimeoutMs}ms，先行撤罩`);
        }
      }
      if (cancelled) {
        deps.releaseGate();
        return;
      }
      phase = 'waiting-gate';
      deps.releaseGate();
      await Promise.race([deps.whenGateHidden(), waitMs(gateTimeoutMs)]);
      if (cancelled) return;
      if (!deps.isGateHidden()) {
        deps.onWarn?.(`遮罩超过 ${gateTimeoutMs}ms 仍未撤掉，强行起播`);
      }
    }
    if (cancelled) return;
    phase = 'playing';
    try {
      await deps.play();
    } catch {
      // 播放失败由调用方通过 video 元素的 paused 状态出「轻触屏幕」提示。
    }
  };

  const handle: CgRevealHandle = {
    get phase(): CgRevealPhase {
      return phase;
    },
    get done(): Promise<void> {
      return done;
    },
    cancel(): void {
      if (cancelled) return;
      cancelled = true;
      phase = 'cancelled';
      // 被跳过时必须放行门禁，否则「进入寝室」的那次门禁会被一直压着。
      deps.releaseGate();
    },
  };
  const done = run().catch(() => {
    // run() 内部已把异常吞掉；这里只是兜底，保证 done 永不 reject。
  });
  return handle;
}
