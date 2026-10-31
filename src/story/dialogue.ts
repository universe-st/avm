import type { BgmId } from '../audio/bgm-tracks';

/**
 * 地图内对话的纯数据与打字机工具。
 *
 * 不依赖 Phaser：场景只负责把 `DialoguePlayer` 的事件画出来。
 */

export type DialogueFx = 'flash' | 'shake' | 'glitch';
export type EmotionKind = 'confused' | 'angry' | 'happy' | 'surprised' | 'sad' | 'annoyed';
export type EmotionTarget = 'zhou' | 'zheng' | 'xiaobai';

/**
 * 稳定角色 id：显示名会变，身份不变。
 *
 * 小白的名字是剧情里现给的（先是「？？？」，再是「莫名其妙出现的白色小娃娃」，
 * 最后才定成「小白」），但声线、立绘、表情气泡不能跟着改名失效。
 */
export type DialogueRole = 'xiaobai';

export interface DialogueLine {
  /** 省略时按旁白处理。这是**显示名**，可以随剧情变。 */
  readonly speaker?: string;
  /** 稳定角色 id；省略时按显示名推断。 */
  readonly role?: DialogueRole;
  readonly text: string;
  /** 本句显示的全屏 CG key；没有就隐藏上一张 CG。 */
  readonly cg?: string;
  /** 本句附带的镜头/画面特效。 */
  readonly fx?: DialogueFx;
  /** 本句切换 BGM（`BGM_TRACKS` 的 id）；省略时保持当前曲目。 */
  readonly bgm?: BgmId;
  /** 说话人头顶先冒出的表情气泡，再开始打字。 */
  readonly emotion?: EmotionKind;
  /** 表情气泡挂在谁头上；省略时按说话人推断。 */
  readonly emotionBy?: EmotionTarget;
}

/** 地图对话比开幕稍快；55ms 在逐句点击时显得拖。 */
export const DIALOGUE_TYPE_MS = 32;

export function charsOf(text: string): readonly string[] {
  return Array.from(text);
}

/**
 * 打字机显示文本：已显示部分保留原文，未显示部分用全角空格占位。
 * 固定文本盒 + 全角占位可以避免逐字时行数/行高变化。
 */
export function maskDialogueText(full: string, revealed: number): string {
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

export function dialogueLineText(line: DialogueLine): string {
  return line.text;
}

/**
 * 说话人的语义色档位（不直接给颜色值，UI 层再映射到主题色）。
 *
 * 这样纯逻辑可以单测，也不必让剧情模块 import 主题/Phaser。
 */
export type SpeakerTone = 'narration' | 'zhou' | 'zheng' | 'xiaobai' | 'miner' | 'default';

const XIAOBAI_NAMES = ['小白', '？？？', '莫名其妙出现的白色小娃娃', 'TEAR-27', 'TEAR'];
const MINER_NAMES = ['矿工', '因泰里', '清除单元'];

function includesAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

/**
 * 按稳定 role 优先、显示名兜底推断语义色。
 *
 * - 省略 speaker 或「旁白」→ narration（不显示说话人，文字用天蓝）；
 * - 小白的名字会变（？？？ → 长名字 → 小白），靠 role 保持同色；
 * - 矿工/因泰里 → danger。
 */
export function speakerTone(speaker?: string, role?: DialogueRole): SpeakerTone {
  if (role === 'xiaobai') return 'xiaobai';
  const name = (speaker ?? '').trim();
  if (name === '' || name === '旁白') return 'narration';
  if (includesAny(name, XIAOBAI_NAMES)) return 'xiaobai';
  if (includesAny(name, MINER_NAMES)) return 'miner';
  if (name.includes('郑卿')) return 'zheng';
  if (name.includes('周全')) return 'zhou';
  return 'default';
}

/** 旁白不显示「旁白」两个字；其他角色原样显示。 */
export function speakerLabel(speaker?: string): string {
  const name = (speaker ?? '').trim();
  return name === '旁白' ? '' : name;
}


/**
 * 把一行过长的对话按标点折成两行，避免最后一行只剩一个「。」。
 *
 * 面板宽 628、字号 34，一行约 18 个汉字；Phaser 的自动换行会在任意字处断，
 * 21 字的句子常把句号单独挤到第二行。这里在接近 18 字的标点后手动换行，
 * 第二行至少带走一个词。**只在显式开启时使用**，不改变 `paginateText` 的字数语义。
 */
export function balanceDialogueLine(text: string, maxChars = 18): string {
  const chars = charsOf(text);
  if (chars.length <= maxChars || text.includes('\n')) return text;
  const BREAKS = new Set(['。', '！', '？', '；', '，', '、', '…', '—']);
  let cut = -1;
  let best = Number.POSITIVE_INFINITY;
  const limit = Math.min(chars.length - 1, maxChars + 6);
  for (let index = 1; index <= limit; index += 1) {
    if (!BREAKS.has(chars[index - 1] as string)) continue;
    const distance = Math.abs(index - maxChars);
    if (distance < best) {
      best = distance;
      cut = index;
    }
  }
  if (cut <= 0 || cut >= chars.length) cut = Math.min(maxChars, chars.length - 1);
  const head = chars.slice(0, cut);
  const tail = chars.slice(cut);
  // 不让第二行以标点开头（避头尾）：把尾部的标点挪回第一行。
  while (tail.length > 0 && BREAKS.has(tail[0] as string)) {
    head.push(tail.shift() as string);
  }
  if (head.length === 0 || tail.length === 0) return text;
  return `${head.join('')}\n${tail.join('')}`;
}
