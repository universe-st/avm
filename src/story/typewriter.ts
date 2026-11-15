import { DIALOGUE_TYPE_MS, charsOf, maskDialogueText } from './dialogue';
import { textSpeedFactor, type TextSpeed } from '../app/settings';

/**
 * 逐字打字机（纯逻辑，不依赖 Phaser，可在 Node 里单测）。
 *
 * 金殿过场没有独立的 `DialoguePlayer`：台词由 `PalacePlayer` 一句一句吐出来，
 * 场景只负责把「已显示几个字」画到 Compose 文本框上。所以这里只抽最核心的一小块：
 *
 * - `start(full, intervalMs)`：开始一句；`intervalMs <= 0`（`instant` 档）时整句立即显示；
 * - `tick(deltaMs)`：喂一帧，返回本帧的可见字数/新增字数/遮罩文本；没有进展时返回 `null`，
 *   场景可以据此跳过整帧的 UI 刷新；
 * - `complete()`：一次补全（点击时用；补全不逐字发声，调用方自己决定要不要播 blip）。
 *
 * 文本用 `maskDialogueText` 把未显示部分换成全角空格，行数/行高在逐字期间不变。
 */
export interface TypewriterStep {
  /** 当前可见字数（0..total）。 */
  readonly revealed: number;
  readonly total: number;
  /** 本次调用新增的可见字数；`start()`/`complete()` 的语义见各自注释。 */
  readonly gained: number;
  readonly done: boolean;
  /** 本轮应显示的文本：未打完时是遮罩文本（等长、换行不变），打完后是整句原文。 */
  readonly text: string;
}

export interface TypewriterState {
  readonly full: string;
  readonly revealed: number;
  readonly total: number;
  /** 是否还在逐字推进。 */
  readonly typing: boolean;
  readonly done: boolean;
  /** 每个字之间的间隔（毫秒）；0 = instant。 */
  readonly intervalMs: number;
}

/** 每个字的间隔：`DIALOGUE_TYPE_MS × textSpeedFactor(speed)`，四舍五入到整毫秒。 */
export function typewriterIntervalMs(speed: TextSpeed): number {
  return Math.round(DIALOGUE_TYPE_MS * textSpeedFactor(speed));
}

export class Typewriter {
  private fullText = '';
  private revealedCount = 0;
  private accumulator = 0;
  private intervalMs = DIALOGUE_TYPE_MS;
  private active = false;

  get state(): TypewriterState {
    const total = this.total;
    return {
      full: this.fullText,
      revealed: this.revealedCount,
      total,
      typing: this.active,
      done: this.revealedCount >= total,
      intervalMs: this.intervalMs,
    };
  }

  /** 还在逐字吐字（`instant` 或已打完时为 false）。 */
  get typing(): boolean {
    return this.active;
  }

  get total(): number {
    return charsOf(this.fullText).length;
  }

  /** 当前应显示的文本（未打完时是遮罩文本）。 */
  get text(): string {
    return this.step(0).text;
  }

  /**
   * 开始一句新的台词。
   *
   * `gained` 恒为 0：`instant` 档整句一次出现，但不算「逐字新增」，
   * 所以不会给玩家播一记逐字音（与寝室/御膳房一致）。
   */
  start(full: string, intervalMs: number = DIALOGUE_TYPE_MS): TypewriterStep {
    this.fullText = full;
    this.intervalMs =
      Number.isFinite(intervalMs) && intervalMs > 0 ? Math.trunc(intervalMs) : 0;
    this.revealedCount = 0;
    this.accumulator = 0;
    const total = this.total;
    // interval 为 0 = instant：整句直接落地，不进打字阶段。
    if (this.intervalMs <= 0 || total === 0) {
      this.revealedCount = total;
      this.active = false;
      return this.step(0);
    }
    this.active = true;
    return this.step(0);
  }

  /**
   * 喂一帧。
   *
   * @returns 有字数推进时的最新状态；未在打字、delta 非正、或这一帧还攒不够一个字时返回 `null`。
   * 一帧补多个字（掉帧）时返回的是合计值，调用方按「一帧最多一次」处理音效。
   */
  tick(deltaMs: number): TypewriterStep | null {
    if (!this.active) return null;
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return null;

    this.accumulator += deltaMs;
    const gained = Math.floor(this.accumulator / this.intervalMs);
    if (gained <= 0) return null;
    this.accumulator -= gained * this.intervalMs;

    const total = this.total;
    const before = this.revealedCount;
    this.revealedCount = Math.min(total, before + gained);
    if (this.revealedCount >= total) {
      this.revealedCount = total;
      this.accumulator = 0;
      this.active = false;
    }
    return this.step(this.revealedCount - before);
  }

  /** 一次补全整句（点击「补全」/场景收尾时用）；`gained` 为本次补上的字数。 */
  complete(): TypewriterStep {
    const before = this.revealedCount;
    this.revealedCount = this.total;
    this.accumulator = 0;
    this.active = false;
    return this.step(this.revealedCount - before);
  }

  /** 清空（切句、跳过、历史弹窗关闭、场景 shutdown）。 */
  reset(): void {
    this.fullText = '';
    this.revealedCount = 0;
    this.accumulator = 0;
    this.active = false;
    this.intervalMs = DIALOGUE_TYPE_MS;
  }

  private step(gained: number): TypewriterStep {
    const total = this.total;
    const done = this.revealedCount >= total;
    return {
      revealed: this.revealedCount,
      total,
      gained,
      done,
      // 打完后直接用原文，避免整句本身以全角空格/换行收尾时出现意外遮罩。
      text: done ? this.fullText : maskDialogueText(this.fullText, this.revealedCount),
    };
  }
}
