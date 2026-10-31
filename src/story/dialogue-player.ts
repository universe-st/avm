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
  /** 当前页的字符数（分页后，不是整句）。 */
  readonly totalChars: number;
  /** 当前是这一句的第几页（0 起）。 */
  readonly pageIndex: number;
  /** 这一句一共几页。 */
  readonly pageCount: number;
  readonly speaker?: string;
}

export type DialogueEvent =
  | {
      readonly type: 'line';
      readonly index: number;
      readonly line: DialogueLine;
      readonly pageIndex: number;
      readonly pageCount: number;
      readonly speaker?: string;
    }
  | {
      readonly type: 'type';
      readonly index: number;
      readonly text: string;
      readonly done: boolean;
      readonly typedCount: number;
      readonly pageIndex: number;
      readonly pageCount: number;
      readonly speaker?: string;
    }
  | { readonly type: 'complete' };

/**
 * 把一句文本切成若干页，每页不超过 `pageChars` 个字符。
 *
 * 断点优先落在中文标点后面（`。！？；，、`），避免把「沉睡症全球蔓延，患者莫名长」这种
 * 半句话从中间切开；找不到合适的标点就硬切。`pageChars <= 0` 时不分页。
 */
export function paginateText(text: string, pageChars: number): readonly string[] {
  const chars = charsOf(text);
  if (!Number.isFinite(pageChars) || pageChars <= 0 || chars.length <= pageChars) {
    return [text];
  }
  const BREAK = new Set(['。', '！', '？', '；', '，', '、', '…', '—', '\n']);
  const pages: string[] = [];
  let start = 0;
  while (start < chars.length) {
    const limit = Math.min(chars.length, start + pageChars);
    if (limit >= chars.length) {
      pages.push(chars.slice(start).join(''));
      break;
    }
    // 在 [limit-8, limit] 里往回找最近的标点；找不到就用硬上限。
    let cut = limit;
    for (let i = limit; i > Math.max(start, limit - 8); i -= 1) {
      if (BREAK.has(chars[i - 1] as string)) {
        cut = i;
        break;
      }
    }
    pages.push(chars.slice(start, cut).join(''));
    start = cut;
  }
  // 硬切可能把句尾标点单独剩成一页（例如整句 69 字、上限 68，最后一页只有「。」）。
  // 这种只剩标点的尾页并回上一页，宁可让上一页多两个字，也不要出现只有标点的一页。
  while (pages.length > 1) {
    const last = pages[pages.length - 1] ?? '';
    const tail = Array.from(last);
    if (tail.length > 2 || !tail.every((char) => BREAK.has(char))) break;
    pages.splice(pages.length - 2, 2, `${pages[pages.length - 2] ?? ''}${last}`);
  }
  return pages;
}

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
  /** 每页最多显示的字符数；`0` = 不分页（一整句一页）。 */
  private readonly pageChars: number;
  private lineIndex = -1;
  private pageIndex = 0;
  private pages: readonly string[] = [];
  private phase: DialoguePhase = 'idle';
  private typedCount = 0;
  private accumulator = 0;
  private started = false;

  constructor(lines: readonly DialogueLine[], options: { typeMs?: number; pageChars?: number } = {}) {
    this.lines = lines;
    // `typeMs: 0` 是显式「整句立即显示」；省略或负数才回退默认值。
    this.typeMs =
      options.typeMs === 0
        ? 0
        : Number.isFinite(options.typeMs) && (options.typeMs ?? 0) > 0
          ? Math.trunc(options.typeMs as number)
          : DIALOGUE_TYPE_MS;
    this.pageChars = Number.isFinite(options.pageChars) && (options.pageChars ?? 0) > 0
      ? Math.trunc(options.pageChars as number)
      : 0;
  }

  get state(): DialogueState {
    const page = this.pageText;
    return {
      lineIndex: this.lineIndex,
      phase: this.phase,
      typedCount: this.typedCount,
      totalChars: page === '' ? 0 : charsOf(page).length,
      pageIndex: this.pageIndex,
      pageCount: Math.max(1, this.pages.length),
      ...(this.currentLine?.speaker === undefined ? {} : { speaker: this.currentLine.speaker }),
    };
  }

  /** 当前页的文本（分页后的那一段）。 */
  get pageText(): string {
    return this.pages[this.pageIndex] ?? '';
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
    // 立即显示模式：enterLine 已经把整句吐完，不进逐字阶段。
    if (this.typeMs <= 0) return [];

    this.accumulator += deltaMs;
    if (!this.currentLine) return [];
    const total = charsOf(this.pageText).length;

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
      if (!this.currentLine) return [];
      this.typedCount = charsOf(this.pageText).length;
      this.accumulator = 0;
      this.phase = 'waiting';
      return [this.typeEvent(true)];
    }

    // 这一句还有下一页：翻页重新逐字，不跳到下一句。
    if (this.pageIndex + 1 < this.pages.length) {
      return this.enterPage(this.pageIndex + 1);
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

    this.pages = paginateText(line.text, this.pageChars);
    this.pageIndex = 0;
    const total = charsOf(this.pageText).length;
    const instant = this.typeMs <= 0;
    if (instant) this.typedCount = total;
    this.phase = total === 0 || instant ? 'waiting' : 'typing';
    const events: DialogueEvent[] = [
      {
        type: 'line',
        index,
        line,
        pageIndex: 0,
        pageCount: this.pages.length,
        ...(line.speaker === undefined ? {} : { speaker: line.speaker }),
      },
    ];
    events.push(this.typeEvent(total === 0 || instant));
    return events;
  }

  /** 翻到同一句的下一页，从头逐字。 */
  private enterPage(index: number): DialogueEvent[] {
    this.pageIndex = index;
    this.typedCount = 0;
    this.accumulator = 0;
    const line = this.currentLine;
    if (!line) {
      this.phase = 'complete';
      return [{ type: 'complete' }];
    }
    const total = charsOf(this.pageText).length;
    const instant = this.typeMs <= 0;
    if (instant) this.typedCount = total;
    this.phase = total === 0 || instant ? 'waiting' : 'typing';
    return [
      { type: 'line', index: this.lineIndex, line, pageIndex: index, pageCount: this.pages.length, ...(line.speaker === undefined ? {} : { speaker: line.speaker }) },
      this.typeEvent(total === 0 || instant),
    ];
  }

  private typeEvent(done: boolean): DialogueEvent {
    const line = this.currentLine;
    const text = this.pageText;
    return {
      type: 'type',
      index: this.lineIndex,
      pageIndex: this.pageIndex,
      pageCount: Math.max(1, this.pages.length),
      text: done ? text : maskDialogueText(text, this.typedCount),
      done,
      typedCount: this.typedCount,
      ...(line?.speaker === undefined ? {} : { speaker: line.speaker }),
    };
  }
}
