/**
 * 对话回看（backlog）的纯数据。
 *
 * 只保存「玩家实际看到过」的句子；用环形缓冲限制内存，不依赖 Phaser。
 */
export interface HistoryEntry {
  /** 显示用说话人名；旁白为空字符串。 */
  readonly speaker: string;
  readonly text: string;
  /** 旁白：UI 不显示说话人、文字用天蓝。 */
  readonly narration: boolean;
  /** 收录时间（毫秒），用于「刚刚」排序/调试，不显示给玩家。 */
  readonly at: number;
}

const DEFAULT_LIMIT = 80;

export class DialogueHistory {
  private readonly limit: number;
  private readonly items: HistoryEntry[] = [];

  constructor(limit = DEFAULT_LIMIT) {
    this.limit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : DEFAULT_LIMIT;
  }

  get entries(): readonly HistoryEntry[] {
    return this.items;
  }

  get size(): number {
    return this.items.length;
  }

  push(entry: HistoryEntry): void {
    this.items.push(entry);
    if (this.items.length > this.limit) {
      this.items.splice(0, this.items.length - this.limit);
    }
  }

  clear(): void {
    this.items.length = 0;
  }
}
