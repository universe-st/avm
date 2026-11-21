import {
  DIALOGUE_TYPE_MS,
  balanceDialogueLine,
  charsOf,
  isForbiddenLineStart,
  isTokenChar,
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

/** 句子结束标点：翻页优先在这些字后面断。 */
const SENTENCE_END: ReadonlySet<string> = new Set(['。', '！', '？', '…', '\n']);
/** 分句标点：找不到句末标点时才退到这里。 */
const CLAUSE_END: ReadonlySet<string> = new Set(['；', '，', '、', '：', '—']);
/** 收尾页少于这个字数就不算一页（宁可把断点往前挪，也不让玩家点一下只看到「好。」）。 */
const MIN_TAIL_CHARS = 6;
/** 一页至少要占满这么多比例，才值得为了句子边界提前断（否则页会太短）。 */
const MIN_PAGE_RATIO = 0.45;

/**
 * 把一句文本切成若干页，每页不超过 `pageChars` 个字符。
 *
 * 断点选择（从好到差）：
 * 1. **句末标点**（`。！？…`）——整段对话里最靠后、又不太靠前的那个，让每页都是完整的句子；
 * 2. **分句标点**（`，；、：—`）——句末标点找不到时的次优断点；
 * 3. 硬切。
 *
 * 无论落在哪一档，都要过**行首禁则**：下一页第一个字符不能是标点
 * （只有前引号/前书名号例外），会把句号、右引号、`％` 这类字符留在上一页末尾。
 * 收尾页太短时（如硬切后只剩「好。」）把断点往前挪，避免点一下只翻出两个字。
 * `pageChars <= 0` 时不分页。
 */
export function paginateText(text: string, pageChars: number): readonly string[] {
  const chars = charsOf(text);
  if (!Number.isFinite(pageChars) || pageChars <= 0 || chars.length <= pageChars) {
    return [text];
  }
  const cuts: number[] = [0];
  let start = 0;
  while (start < chars.length) {
    if (chars.length - start <= pageChars) break;
    const limit = start + pageChars;
    let cut = chooseCut(chars, start, limit);
    cut = snapPastForbiddenStart(chars, cut, chars.length);
    cut = snapPastToken(chars, cut, start, pageChars);
    if (cut <= start) cut = limit;
    // 句末标点后面的右引号可能刚好把这一页推到末尾：那就不再单开一页。
    if (cut >= chars.length) break;
    cuts.push(cut);
    start = cut;
  }

  // 收尾页太短：优先把最后一个断点往前挪到上一个标点；挪不动就并回上一页。
  if (cuts.length > 1) {
    const lastStart = cuts[cuts.length - 1] as number;
    const tailChars = chars.length - lastStart;
    if (tailChars < MIN_TAIL_CHARS) {
      const prevStart = cuts[cuts.length - 2] as number;
      const moved = lastCutBefore(chars, lastStart, prevStart);
      if (moved > prevStart && chars.length - moved >= MIN_TAIL_CHARS) {
        cuts[cuts.length - 1] = moved;
      } else if (chars.length - prevStart <= pageChars + MIN_TAIL_CHARS + 2) {
        cuts.pop();
      }
    }
  }

  return cuts.map((from, index) => chars.slice(from, cuts[index + 1] ?? chars.length).join(''));
}

/** 这一页该在哪里断：优先句末标点，其次分句标点，最后硬切到上限。 */
function chooseCut(chars: readonly string[], start: number, limit: number): number {
  const shortest = start + Math.ceil((limit - start) * MIN_PAGE_RATIO);
  for (let index = limit; index > shortest; index -= 1) {
    if (SENTENCE_END.has(chars[index - 1] as string)) return index;
  }
  for (let index = limit; index > Math.max(start, limit - 8); index -= 1) {
    if (CLAUSE_END.has(chars[index - 1] as string)) return index;
  }
  return limit;
}

/**
 * 不拆数字/英文词：断点落在 token 中间时，把整个 token 留在上一页。
 *
 * 最多往前多带 `TOKEN_SLACK` 个字（面板还有第 5 行的余量）；token 实在太长就把断点挪到
 * 它的开头（整个词进下一页），挪不动（词本身就从页首开始）才允许断开。
 */
function snapPastToken(
  chars: readonly string[],
  cut: number,
  start: number,
  pageChars: number,
): number {
  const TOKEN_SLACK = 8;
  let next = cut;
  while (
    next < chars.length &&
    next - start < pageChars + TOKEN_SLACK &&
    isTokenChar(chars[next]) &&
    isTokenChar(chars[next - 1])
  ) {
    next += 1;
  }
  if (next === cut) return cut;
  if (isTokenChar(chars[next]) && isTokenChar(chars[next - 1])) {
    let back = cut;
    while (back > start + 1 && isTokenChar(chars[back - 1])) back -= 1;
    return back > start ? back : cut;
  }
  return next;
}

/** 行首禁则：断点后面紧跟标点时，把标点留在上一页（返回新的断点）。 */
function snapPastForbiddenStart(chars: readonly string[], from: number, end: number): number {
  let cut = from;
  while (cut < end && isForbiddenLineStart(chars[cut])) cut += 1;
  return cut;
}

/** 在 `(floor, from)` 之间找最后一个标点后的断点，并过一遍行首禁则；找不到返回 `floor`。 */
function lastCutBefore(chars: readonly string[], from: number, floor: number): number {
  for (let index = from - 1; index > floor; index -= 1) {
    const previous = chars[index - 1];
    if (previous === undefined) continue;
    if (!SENTENCE_END.has(previous) && !CLAUSE_END.has(previous)) continue;
    return snapPastForbiddenStart(chars, index, chars.length);
  }
  return floor;
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
  /** 是否在显示层按标点折行，避免第二行只剩标点。 */
  private readonly balanceLines: boolean;
  private lineIndex = -1;
  private pageIndex = 0;
  private pages: readonly string[] = [];
  private phase: DialoguePhase = 'idle';
  private typedCount = 0;
  private accumulator = 0;
  private started = false;

  constructor(
    lines: readonly DialogueLine[],
    options: { typeMs?: number; pageChars?: number; balanceLines?: boolean } = {},
  ) {
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
    this.balanceLines = options.balanceLines === true;
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

    this.pages = paginateText(line.text, this.pageChars).map((page) =>
      this.balanceLines ? balanceDialogueLine(page) : page,
    );
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
