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
  | 'holding'
  | 'leaving'
  | 'awaiting-continue'
  | 'complete';

export interface PrologueState {
  readonly cueIndex: number;
  readonly phase: ProloguePhase;
  readonly typedCount: number;
  readonly totalChars: number;
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
 */
export class ProloguePlayer {
  private readonly cues: readonly PrologueCue[];
  private started = false;
  private cueIndex = 0;
  private phase: ProloguePhase = 'typing';
  private typedCount = 0;
  private typeElapsed = 0;
  private holdElapsed = 0;
  private leaveElapsed = 0;

  constructor(cues: readonly PrologueCue[]) {
    if (cues.length === 0) throw new Error('ProloguePlayer: cues 不能为空');
    this.cues = cues;
  }

  get state(): PrologueState {
    return {
      cueIndex: this.cueIndex,
      phase: this.phase,
      typedCount: this.typedCount,
      totalChars: this.totalChars,
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

  /** 开始播放，返回第一批事件（进入第一个 cue + 初始空文本）。 */
  start(): PrologueEvent[] {
    if (this.started) return [];
    this.started = true;
    this.cueIndex = 0;
    this.typedCount = 0;
    this.typeElapsed = 0;
    this.holdElapsed = 0;
    this.leaveElapsed = 0;
    this.phase = 'typing';

    const events: PrologueEvent[] = [{ type: 'enter', cueIndex: 0 }];
    if (this.totalChars === 0) {
      this.phase = 'holding';
      events.push(this.typeEvent(true));
    } else {
      events.push(this.typeEvent(false));
    }
    return events;
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
   * - 停留中：进入下一句（最后一 cue 则等待确认）；
   * - 等待确认：完成整段剧情。
   */
  requestAdvance(): PrologueEvent[] {
    if (!this.started || this.phase === 'complete') return [];

    if (this.phase === 'typing') {
      this.typedCount = this.totalChars;
      this.typeElapsed = 0;
      this.phase = 'holding';
      this.holdElapsed = 0;
      return [this.typeEvent(true)];
    }

    if (this.phase === 'holding') {
      return [this.beginLeaveOrAwait()];
    }

    if (this.phase === 'awaiting-continue') {
      this.phase = 'complete';
      return [{ type: 'complete' }];
    }

    return [];
  }

  private tickTyping(delta: number): PrologueEvent[] {
    this.typeElapsed += delta;
    const total = this.totalChars;
    const next = Math.min(total, Math.floor(this.typeElapsed / TYPE_MS));

    if (next <= this.typedCount) {
      if (total === 0) {
        this.phase = 'holding';
        this.holdElapsed = 0;
        return [this.typeEvent(true)];
      }
      return [];
    }

    this.typedCount = next;
    const done = next >= total;
    if (done) {
      this.phase = 'holding';
      this.holdElapsed = 0;
    }
    return [this.typeEvent(done)];
  }

  private tickHolding(delta: number): PrologueEvent[] {
    this.holdElapsed += delta;
    if (this.holdElapsed < holdMs(this.cue)) return [];
    return [this.beginLeaveOrAwait()];
  }

  private tickLeaving(delta: number): PrologueEvent[] {
    this.leaveElapsed += delta;
    if (this.leaveElapsed < EXIT_MS) return [];

    const nextIndex = this.cueIndex + 1;
    const next = this.cues[nextIndex];
    if (!next) {
      this.phase = 'complete';
      return [{ type: 'complete' }];
    }

    this.cueIndex = nextIndex;
    this.phase = 'typing';
    this.typedCount = 0;
    this.typeElapsed = 0;
    this.holdElapsed = 0;
    this.leaveElapsed = 0;

    const events: PrologueEvent[] = [{ type: 'enter', cueIndex: nextIndex }];
    if (this.totalChars === 0) {
      this.phase = 'holding';
      events.push(this.typeEvent(true));
    } else {
      events.push(this.typeEvent(false));
    }
    return events;
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
