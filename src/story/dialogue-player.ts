import {
  DIALOGUE_TYPE_MS,
  charsOf,
  maskDialogueText,
  type DialogueLine,
} from './dialogue';

export type DialoguePhase = 'idle' | 'typing' | 'waiting' | 'complete';

export interface DialogueState {
  readonly lineIndex: number;
  readonly phase: DialoguePhase;
  readonly typedCount: number;
  readonly totalChars: number;
  readonly speaker?: string;
}

export type DialogueEvent =
  | {
      readonly type: 'line';
      readonly index: number;
      readonly line: DialogueLine;
      readonly speaker?: string;
    }
  | {
      readonly type: 'type';
      readonly index: number;
      readonly text: string;
      readonly done: boolean;
      readonly typedCount: number;
      readonly speaker?: string;
    }
  | { readonly type: 'complete' };

/**
 * 地图对话状态机：逐字 → 等待 → 下一句，最后一句等一次确认后 complete。
 *
 * 与 `prologue-player.ts` 同构，但：
 * - 有 speaker；
 * - 没有自动播放/holdMs，地图对话始终手动；
 * - `requestAdvance` 在打字中只补全，不直接跳句。
 */
export class DialoguePlayer {
  private readonly lines: readonly DialogueLine[];
  private readonly typeMs: number;
  private lineIndex = -1;
  private phase: DialoguePhase = 'idle';
  private typedCount = 0;
  private accumulator = 0;
  private started = false;

  constructor(lines: readonly DialogueLine[], options: { typeMs?: number } = {}) {
    this.lines = lines;
    this.typeMs = Number.isFinite(options.typeMs) && (options.typeMs ?? 0) > 0
      ? Math.trunc(options.typeMs as number)
      : DIALOGUE_TYPE_MS;
  }

  get state(): DialogueState {
    const line = this.currentLine;
    return {
      lineIndex: this.lineIndex,
      phase: this.phase,
      typedCount: this.typedCount,
      totalChars: line ? charsOf(line.text).length : 0,
      ...(line?.speaker === undefined ? {} : { speaker: line.speaker }),
    };
  }

  get currentLine(): DialogueLine | null {
    return this.lines[this.lineIndex] ?? null;
  }

  get isComplete(): boolean {
    return this.phase === 'complete';
  }

  start(): DialogueEvent[] {
    if (this.started) return [];
    this.started = true;
    if (this.lines.length === 0) {
      this.phase = 'complete';
      return [{ type: 'complete' }];
    }
    return this.enterLine(0);
  }

  tick(deltaMs: number): DialogueEvent[] {
    if (this.phase !== 'typing') return [];
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return [];

    this.accumulator += deltaMs;
    const line = this.currentLine;
    if (!line) return [];
    const total = charsOf(line.text).length;

    const gained = Math.floor(this.accumulator / this.typeMs);
    if (gained <= 0) return [];
    this.accumulator -= gained * this.typeMs;
    this.typedCount = Math.min(total, this.typedCount + gained);

    const done = this.typedCount >= total;
    if (done) this.phase = 'waiting';
    return [this.typeEvent(done)];
  }

  requestAdvance(): DialogueEvent[] {
    if (this.phase === 'idle' || this.phase === 'complete') return [];

    if (this.phase === 'typing') {
      const line = this.currentLine;
      if (!line) return [];
      this.typedCount = charsOf(line.text).length;
      this.accumulator = 0;
      this.phase = 'waiting';
      return [this.typeEvent(true)];
    }

    if (this.lineIndex + 1 < this.lines.length) {
      return this.enterLine(this.lineIndex + 1);
    }

    this.phase = 'complete';
    return [{ type: 'complete' }];
  }

  private enterLine(index: number): DialogueEvent[] {
    this.lineIndex = index;
    this.typedCount = 0;
    this.accumulator = 0;
    const line = this.lines[index];
    if (!line) {
      this.phase = 'complete';
      return [{ type: 'complete' }];
    }

    const total = charsOf(line.text).length;
    this.phase = total === 0 ? 'waiting' : 'typing';
    const events: DialogueEvent[] = [
      {
        type: 'line',
        index,
        line,
        ...(line.speaker === undefined ? {} : { speaker: line.speaker }),
      },
    ];
    if (total === 0) events.push(this.typeEvent(true));
    else events.push(this.typeEvent(false));
    return events;
  }

  private typeEvent(done: boolean): DialogueEvent {
    const line = this.currentLine;
    const text = line?.text ?? '';
    return {
      type: 'type',
      index: this.lineIndex,
      text: done ? text : maskDialogueText(text, this.typedCount),
      done,
      typedCount: this.typedCount,
      ...(line?.speaker === undefined ? {} : { speaker: line.speaker }),
    };
  }
}
