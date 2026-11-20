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
  /**
   * 这一行显示时附带的**一次性音效**（Phaser 音频 cache key）。
   *
   * 不做状态：跳过这一行就不该再响（「带鼾声配音」没被听见，就不需要事后补一声呼噜）。
   * 循环音/环境音不要走这里，那些属于场景音频（`audioDirector.playLoop`）。
   */
  readonly sfx?: string;
  /**
   * 切全黑/恢复正常画面：`true` = 世界层压黑（只留角色与特效），`false` = 恢复。
   *
   * 属于**表现型**：只有这一行真的被看见才有意义，跳过时不补演；
   * 但「已经黑掉的画面」必须在对话收尾时无条件恢复（`finishDialogue()`），
   * 否则跳过会把结束卡/下一节压在黑屏上。
   */
  readonly blackout?: boolean;
}

/**
 * 一行台词能携带的 cue key。
 *
 * **新增 cue 字段时先加到这里，再到 `DIALOGUE_CUE_KINDS` 里表态**：新 cue 到底属于
 * 「状态型」还是「表现型」。下面用 `satisfies` 兜住，漏分类直接编译失败。
 */
export type DialogueCueKey = 'cg' | 'fx' | 'bgm' | 'emotion' | 'sfx' | 'blackout';

/**
 * 行 cue 的两类语义（这是机制，不是补丁）。
 *
 * - **状态型 stateful**：这行只是「在这里把状态改成 X」。玩家可能永远看不到这行
 *   （点「跳过」、自动播放、节点被其它流程推过去），但状态必须生效。跳过时要**补**。
 * - **表现型 expressive**：这行真的被看到才有意义（CG、镜头特效、表情气泡）。
 *   跳过时不补播，否则跳过会闪一张 CG / 冒一个气泡。
 *
 * 判定标准一句话：**「这行没被看见，世界还该不该变？」** 该变 → 状态型。
 */
export const DIALOGUE_CUE_KINDS = {
  bgm: 'stateful',
  cg: 'expressive',
  fx: 'expressive',
  emotion: 'expressive',
  sfx: 'expressive',
  blackout: 'expressive',
} as const satisfies Readonly<Record<DialogueCueKey, 'stateful' | 'expressive'>>;

export type DialogueCueKind = (typeof DIALOGUE_CUE_KINDS)[DialogueCueKey];

/** 状态型 cue 的 key 集合（编译期从分类表推出来，不手写第二份）。 */
export type StatefulCueKey = {
  readonly [K in DialogueCueKey]: (typeof DIALOGUE_CUE_KINDS)[K] extends 'stateful' ? K : never;
}[DialogueCueKey];

/** 表现型 cue 的 key 集合（同上）。 */
export type ExpressiveCueKey = {
  readonly [K in DialogueCueKey]: (typeof DIALOGUE_CUE_KINDS)[K] extends 'expressive' ? K : never;
}[DialogueCueKey];

export function cueKeysOfKind(kind: DialogueCueKind): readonly DialogueCueKey[] {
  return (Object.keys(DIALOGUE_CUE_KINDS) as DialogueCueKey[]).filter(
    (key) => DIALOGUE_CUE_KINDS[key] === kind,
  );
}

/** 状态型 cue 的归约结果；以后加 objective/checkpoint 就往这里加字段。 */
export interface DialogueStateCues {
  /** 这段对话结束（跳过也算）后应该生效的 BGM。 */
  readonly bgm?: BgmId;
}

/** 空状态：常量复用，避免每行都建对象。 */
export const EMPTY_STATE_CUES: DialogueStateCues = Object.freeze({});

/** 单独一行携带的状态型 cue。 */
export function stateCuesOfLine(line: DialogueLine): DialogueStateCues {
  return line.bgm === undefined ? EMPTY_STATE_CUES : { bgm: line.bgm };
}

/** 后者覆盖前者：同一状态多行设置时，以更靠后的为准。 */
export function mergeStateCues(
  base: DialogueStateCues,
  next: DialogueStateCues,
): DialogueStateCues {
  if (next.bgm === undefined) return base;
  return { ...base, bgm: next.bgm };
}

/**
 * 「从 `fromIndex`（含）到末尾还没生效的状态型 cue」。
 *
 * - 跳过时从**当前游标**开始归约，补上被跨过的行；
 * - 自然过完时游标已经在末尾，归约结果为空 → 行为与改动前一致；
 * - 纯函数：同样的入参永远同样的结果，多次调用不会累积（幂等）。
 */
export function reduceStateCues(
  lines: readonly DialogueLine[],
  fromIndex = 0,
): DialogueStateCues {
  const start = clampCueIndex(fromIndex, lines.length);
  let cues = EMPTY_STATE_CUES;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    if (line !== undefined) cues = mergeStateCues(cues, stateCuesOfLine(line));
  }
  return cues;
}

function clampCueIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), length);
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

/**
 * 小白的显示名（会随剧情变）：刚出场是「？？？」，寝室那轮叫「莫名其妙出现的白色小娃娃」，
 * 金殿过场换成「莫名其妙出现的白色小精灵」，揭示后才是「小白」。
 * 这里的名字只影响**没传 `role` 的老台词**兜底推断；带 `role: 'xiaobai'` 的行不看名字。
 * 加新名字记得同步 `test/speaker-tone.test.ts` 与 `test/type-voice.test.ts`。
 */
const XIAOBAI_NAMES = [
  '小白',
  '？？？',
  '莫名其妙出现的白色小娃娃',
  '莫名其妙出现的白色小精灵',
  '白色小精灵',
  'TEAR-27',
  'TEAR',
];
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
