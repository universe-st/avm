/**
 * 地图内对话的纯数据与打字机工具。
 *
 * 不依赖 Phaser：场景只负责把 `DialoguePlayer` 的事件画出来。
 */

export type DialogueFx = 'flash' | 'shake' | 'glitch';
export type EmotionKind = 'confused' | 'angry' | 'happy' | 'surprised' | 'sad' | 'annoyed';
export type EmotionTarget = 'zhou' | 'zheng' | 'xiaobai';

export interface DialogueLine {
  /** 省略时按旁白处理。 */
  readonly speaker?: string;
  readonly text: string;
  /** 本句显示的全屏 CG key；没有就隐藏上一张 CG。 */
  readonly cg?: string;
  /** 本句附带的镜头/画面特效。 */
  readonly fx?: DialogueFx;
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
