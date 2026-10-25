import {
  EXIT_MS,
  TYPE_MS,
  cueText,
  holdMs,
  maskText,
  type PrologueCue,
} from './prologue';

export type ProloguePhase =
  | 'typing'
  | 'waiting'
  | 'holding'
  | 'leaving'
  | 'awaiting-continue'
  | 'complete';

export interface PrologueState {
  readonly cueIndex: number;
  readonly phase: ProloguePhase;
  readonly typedCount: number;
  readonly totalChars: number;
  readonly auto: boolean;
}

export interface ProloguePlayerOptions {
  /**
   * 自动模式：一句打完后按 holdMs 自己进入下一句。
   * 默认手动——每句都要玩家点一下才继续。
   */
  readonly auto?: boolean;
}

export type PrologueEvent =
  | { type: 'enter'; cueIndex: number }
  | {
      type: 'type';
      cueIndex: number;
      text: string;
      typedCount: number;
      total: number;
      done: boolean;
    }
  | { type: 'leave'; cueIndex: number }
  | { type: 'await-continue'; cueIndex: number }
  | { type: 'complete' };

/**
 * 开幕剧情的纯时间线。
 *
 * 不碰 Phaser、不 setTimeout：场景每帧把 delta 喂进来，玩家在切后台/暂停时
 * 计时自然停住；要跳过整句也只需要调用 `requestAdvance()`。
 *
 * 两种节奏：
 * - 手动（默认）：逐字打完停在 `waiting`，等玩家点击；点一下补全当前句，再点进入下一句。
 * - 自动：逐字打完在 `holding` 停留 holdMs 后自动进入下一句。
 * 最后一句（日期卡）在两种模式下都停在 `awaiting-continue`，不会被自动播完。
 */
export class ProloguePlayer {
  private readonly cues: readonly PrologueCue[];
  private auto: boolean;
  private started = false;
  private cueIndex = 0;
  private phase: ProloguePhase = 'typing';
  private typedCount = 0;
  private typeElapsed = 0;
  private holdElapsed = 0;
  private leaveElapsed = 0;

  constructor(cues: readonly PrologueCue[], options: ProloguePlayerOptions = {}) {
    if (cues.length === 0) throw new Error('ProloguePlayer: cues 不能为空');
    this.cues = cues;
    this.auto = options.auto === true;
  }

  get state(): PrologueState {
    return {
      cueIndex: this.cueIndex,
      phase: this.phase,
      typedCount: this.typedCount,
      totalChars: this.totalChars,
      auto: this.auto,
    };
  }

  get cue(): PrologueCue {
    const cue = this.cues[this.cueIndex];
    if (!cue) throw new Error(`ProloguePlayer: 找不到第 ${this.cueIndex} 个 cue`);
    return cue;
  }

  get totalChars(): number {
    return Array.from(cueText(this.cue)).length;
  }

  get isComplete(): boolean {
    return this.phase === 'complete';
  }

  get isAuto(): boolean {
    return this.auto;
  }

  /**
   * 切换自动/手动。
   *
   * 正在等待玩家点击时打开自动，立刻开始 holdMs 倒计时；
   * 正在倒计时时关掉自动，就停住等玩家点，不会「没收」这一句。
   */
  setAuto(auto: boolean): PrologueEvent[] {
    if (this.auto === auto) return [];
    this.auto = auto;
    if (this.phase === 'waiting' && auto) {
      this.phase = 'holding';
      this.holdElapsed = 0;
    } else if (this.phase === 'holding' && !auto && this.totalChars > 0) {
      this.phase = 'waiting';
      this.holdElapsed = 0;
    }
    return [];
  }

  /** 开始播放，返回第一批事件（进入第一个 cue + 初始空文本）。 */
  start(): PrologueEvent[] {
    if (this.started) return [];
    this.started = true;
    return this.enterCue(0);
  }

  /** 推进时间；返回这一帧发生的事件。delta 由场景钳制（建议 ≤100ms）。 */
  tick(deltaMs: number): PrologueEvent[] {
    if (!this.started || this.phase === 'complete') return [];
    const delta = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
    if (delta === 0) return [];

    switch (this.phase) {
      case 'typing':
        return this.tickTyping(delta);
      case 'holding':
        return this.tickHolding(delta);
      case 'leaving':
        return this.tickLeaving(delta);
      default:
        return [];
    }
  }

  /**
   * 玩家主动推进：
   * - 打字中：补全当前句；
   * - 等待/停留中（waiting/holding）：进入下一句；
   * - 等待确认（最后一句）：完成整段剧情。
   */
  requestAdvance(): PrologueEvent[] {
    if (!this.started || this.phase === 'complete') return [];
    if (this.phase === 'typing') return this.revealAll();
    if (this.phase === 'waiting' || this.phase === 'holding') {
      return [this.beginLeaveOrAwait()];
    }
    if (this.phase === 'awaiting-continue') {
      this.phase = 'complete';
      return [{ type: 'complete' }];
    }
    return [];
  }

  private revealAll(): PrologueEvent[] {
    this.typedCount = this.totalChars;
    this.typeElapsed = 0;
    return this.finishLine();
  }

  /** 这一句显示完整了：进入等待/倒计时，返回 `type(done)` 与必要时的 `await-continue`。 */
  private finishLine(): PrologueEvent[] {
    const phase = this.beginWait();
    const events: PrologueEvent[] = [this.typeEvent(true)];
    if (phase === 'awaiting-continue') {
      events.push({ type: 'await-continue', cueIndex: this.cueIndex });
    }
    return events;
  }

  private enterCue(index: number): PrologueEvent[] {
    this.cueIndex = index;
    this.phase = 'typing';
    this.typedCount = 0;
    this.typeElapsed = 0;
    this.holdElapsed = 0;
    this.leaveElapsed = 0;

    const events: PrologueEvent[] = [{ type: 'enter', cueIndex: index }];
    // 日期卡是整块淡入的，不走逐字；空 cue（纯画面节拍）也不拦人。
    const instant = this.cue.kind === 'card' || this.totalChars === 0;
    if (instant) {
      this.typedCount = this.totalChars;
      events.push(...this.finishLine());
    } else {
      events.push(this.typeEvent(false));
    }
    return events;
  }

  private tickTyping(delta: number): PrologueEvent[] {
    this.typeElapsed += delta;
    const total = this.totalChars;
    const next = Math.min(total, Math.floor(this.typeElapsed / TYPE_MS));

    if (next <= this.typedCount) {
      if (total === 0) return this.finishLine();
      return [];
    }

    this.typedCount = next;
    if (next < total) return [this.typeEvent(false)];
    return this.finishLine();
  }

  private tickHolding(delta: number): PrologueEvent[] {
    this.holdElapsed += delta;
    if (this.holdElapsed < holdMs(this.cue)) return [];
    return [this.beginLeaveOrAwait()];
  }

  private tickLeaving(delta: number): PrologueEvent[] {
    this.leaveElapsed += delta;
    if (this.leaveElapsed < EXIT_MS) return [];
    const next = this.cues[this.cueIndex + 1];
    if (!next) {
      this.phase = 'complete';
      return [{ type: 'complete' }];
    }
    return this.enterCue(this.cueIndex + 1);
  }

  /** 打完一句后进入什么状态：最后一句等人确认，其余按模式等待/倒计时。 */
  private beginWait(): ProloguePhase {
    this.holdElapsed = 0;
    if (this.cueIndex >= this.cues.length - 1) {
      this.phase = 'awaiting-continue';
      return this.phase;
    }
    // 没字的节拍不拦人：即使手动模式也按 holdMs 自己过。
    this.phase = this.auto || this.totalChars === 0 ? 'holding' : 'waiting';
    return this.phase;
  }

  private beginLeaveOrAwait(): PrologueEvent {
    const last = this.cueIndex >= this.cues.length - 1;
    if (last) {
      this.phase = 'awaiting-continue';
      return { type: 'await-continue', cueIndex: this.cueIndex };
    }
    this.phase = 'leaving';
    this.leaveElapsed = 0;
    return { type: 'leave', cueIndex: this.cueIndex };
  }

  private typeEvent(done: boolean): PrologueEvent {
    const full = cueText(this.cue);
    return {
      type: 'type',
      cueIndex: this.cueIndex,
      text: maskText(full, this.typedCount),
      typedCount: this.typedCount,
      total: Array.from(full).length,
      done,
    };
  }
}
