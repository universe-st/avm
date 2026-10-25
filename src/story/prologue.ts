/**
 * 开幕剧情：文案、配图与节奏的唯一真值。
 *
 * 这个文件刻意不依赖 Phaser，便于在 Node 里单测「文案是否与用户原文一致」
 * 和「逐字/停顿时间」。场景只消费这里的数据与纯函数。
 *
 * 2026-10-25：按用户要求删掉开场「深夜天幕，一颗流星划过」的舞台提示小字幕，
 * 第一句直接从「你，有做过梦吗？」开始；夜空与流星仍由 `meteor` 动画保留。
 */

/** 开幕剧情使用的配图 key，必须与 `cutscene.prologue` bundle 一致。 */
export type PrologueImageKey =
  | 'img.prologue.sky'
  | 'img.prologue.dream'
  | 'img.prologue.disaster'
  | 'img.prologue.war'
  | 'img.prologue.school';

export type PrologueTone = 'paper' | 'gold';

/** `line` 是普通台词；`card` 是最后的日期/校名卡，使用独立排版。 */
export type PrologueCueKind = 'line' | 'card';

export interface PrologueCue {
  readonly id: string;
  readonly image: PrologueImageKey;
  /** 已按 720 设计宽手工断行；拼接后必须与用户原文一致。 */
  readonly lines: readonly string[];
  readonly kind?: PrologueCueKind;
  readonly tone?: PrologueTone;
  /** 主文字字号；默认 38。长句用 34 保证不溢出。 */
  readonly size?: number;
  /** 打字完成后的停留时间（自动模式）。默认 DEFAULT_HOLD_MS。 */
  readonly holdMs?: number;
  /** 进入这一 cue 时扫过一道流星（只在夜空开场用）。 */
  readonly meteor?: boolean;
}

/** 每字 55ms：中文阅读节奏，约 18 字/秒。 */
export const TYPE_MS = 55;
/** 一句话淡出到下一句之间的空档。 */
export const EXIT_MS = 280;
export const DEFAULT_HOLD_MS = 1200;

export const PROLOGUE_CUES: readonly PrologueCue[] = [
  {
    id: 'sky-question',
    image: 'img.prologue.sky',
    lines: ['你，有做过梦吗？'],
    tone: 'gold',
    holdMs: 1400,
    meteor: true,
  },
  {
    id: 'sky-dream',
    image: 'img.prologue.sky',
    lines: ['梦，无可捉摸，虚无缥缈。'],
    holdMs: 1400,
  },
  {
    id: 'dream-root',
    image: 'img.prologue.dream',
    lines: ['它根植于人的内心，', '人却从未真正了解过它。'],
    holdMs: 1600,
  },
  {
    id: 'dreamfall-disaster',
    image: 'img.prologue.disaster',
    lines: [
      '但当它成为一场席卷了地球的灾难，',
      '人类被迫参加了一场',
      '他们未曾好好准备的战争。',
    ],
    size: 34,
    holdMs: 1800,
  },
  {
    id: 'hidden-war',
    image: 'img.prologue.war',
    lines: ['而大多数人都不知道，', '这场战争，早就已经开始了。'],
    holdMs: 1800,
  },
  {
    id: 'school-beginning',
    image: 'img.prologue.school',
    lines: ['我们的故事，从一所学校开始。'],
    holdMs: 1500,
  },
  {
    id: 'school-card',
    image: 'img.prologue.school',
    lines: ['20x5年9月7日。', '明山县·群英高级中学。'],
    kind: 'card',
    holdMs: 2200,
  },
];

/** 一行 cue 的完整文本（多行用 \n 连接）。 */
export function cueText(cue: PrologueCue): string {
  return cue.lines.join('\n');
}

/** 按码点拆分，中文/标点/换行都不会被拆坏。 */
export function charsOf(text: string): readonly string[] {
  return Array.from(text);
}

/**
 * 打字机显示文本：已显示部分保留原文，未显示部分用全角空格占位。
 *
 * 固定宽度的文本盒 + 全角占位，可以让逐字过程不改变行数与行高，
 * 避免「每打一个字整段文字就跳一下」。
 */
export function maskText(full: string, revealed: number): string {
  const chars = charsOf(full);
  const count = Number.isFinite(revealed)
    ? Math.min(chars.length, Math.max(0, Math.floor(revealed)))
    : 0;
  return chars
    .map((char, index) => {
      if (index < count) return char;
      return char === '\n' ? '\n' : '\u3000';
    })
    .join('');
}

/** 一个 cue 打完需要的毫秒数。 */
export function revealMs(cue: PrologueCue): number {
  return charsOf(cueText(cue)).length * TYPE_MS;
}

/** 一个 cue 打完后停留的毫秒数。 */
export function holdMs(cue: PrologueCue): number {
  const value = cue.holdMs ?? DEFAULT_HOLD_MS;
  return Number.isFinite(value) ? Math.max(0, value) : DEFAULT_HOLD_MS;
}

/** 自动模式下整段剧情的大致时长（含每个 cue 的淡出空档），用于文档与验收。 */
export function totalMs(cues: readonly PrologueCue[] = PROLOGUE_CUES): number {
  return cues.reduce((sum, cue) => sum + revealMs(cue) + holdMs(cue) + EXIT_MS, 0);
}
