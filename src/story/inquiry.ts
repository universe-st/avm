import type { DialogueLine } from './dialogue';

/**
 * 最小的「可反复提问 → 问完再收尾」选项模型（纯逻辑，无 Phaser）。
 *
 * 用途：一段对话里给玩家若干条可点的问题，顺序随意、每条只问一次；
 * 全部问完之后只剩一个「继续」选项，点它进入收尾段。
 *
 * 设计取舍：
 * - 状态只有 `asked` 一个数组，可序列化、可单测，不掺 UI 状态；
 * - **问过的问题从菜单里消失**（不是置灰）：玩家的视线不会被已经听过的答案占着；
 * - 收尾选项不是「第四个问题」，它由 `closingLabel` 单独给出，避免和问题数组混在一起；
 * - 不认识的 id 直接忽略，坏存档/改稿不会把状态机弄坏。
 *
 * UI 在 `src/ui/story-choice.ts`，场景只在「一段台词说完」时调这里拿下一步。
 */
export interface InquiryQuestion<Id extends string = string> {
  /** 稳定 id；菜单点击与 `asked` 记录都用它。 */
  readonly id: Id;
  /** 菜单按钮上的文案；不带编号（编号由 UI 故意不画，见 `story-choice.ts`）。 */
  readonly label: string;
  /** 点开这个问题后要播的台词。 */
  readonly lines: readonly DialogueLine[];
}

export interface InquiryScript<Id extends string = string> {
  readonly questions: readonly InquiryQuestion<Id>[];
  /** 全部问完后唯一选项的文案。 */
  readonly closingLabel: string;
}

export interface InquiryState<Id extends string = string> {
  /** 已经问过的 id（按提问顺序；只用于展示进度与测试，不参与排序）。 */
  readonly asked: readonly Id[];
}

export function initialInquiryState<Id extends string = string>(): InquiryState<Id> {
  return { asked: [] };
}

export function hasAsked<Id extends string>(state: InquiryState<Id>, id: Id): boolean {
  return state.asked.includes(id);
}

export function questionById<Id extends string>(
  script: InquiryScript<Id>,
  id: Id,
): InquiryQuestion<Id> | null {
  return script.questions.find((question) => question.id === id) ?? null;
}

/** 还没问的问题，按剧本顺序。 */
export function remainingQuestions<Id extends string>(
  script: InquiryScript<Id>,
  state: InquiryState<Id>,
): readonly InquiryQuestion<Id>[] {
  return script.questions.filter((question) => !hasAsked(state, question.id));
}

/** 三个（或 N 个）问题是否都问完了。 */
export function isInquiryComplete<Id extends string>(
  script: InquiryScript<Id>,
  state: InquiryState<Id>,
): boolean {
  return remainingQuestions(script, state).length === 0;
}

/**
 * 标记某题已问。
 *
 * - 重复标记幂等（不会出现两条相同 id）；
 * - 不认识的 id 不写进状态（以后删题/改 id 不会留下脏数据）。
 */
export function markAsked<Id extends string>(
  script: InquiryScript<Id>,
  state: InquiryState<Id>,
  id: Id,
): InquiryState<Id> {
  if (questionById(script, id) === null || hasAsked(state, id)) return state;
  return { asked: [...state.asked, id] };
}

/** 菜单的一项；`closing: true` 表示这是「问完了，继续」那一个。 */
export interface InquiryMenuItem<Id extends string = string> {
  readonly id: Id | 'closing';
  readonly label: string;
  readonly closing: boolean;
}

/**
 * 当前该显示的菜单项。
 *
 * - 还有没问的 → 只列没问的问题（顺序照剧本）；
 * - 全问完 → 只剩 `closingLabel` 一项（剧本：「三个都问完之后，出现单个选项」）。
 */
export function inquiryMenuItems<Id extends string>(
  script: InquiryScript<Id>,
  state: InquiryState<Id>,
): readonly InquiryMenuItem<Id>[] {
  const remaining = remainingQuestions(script, state);
  if (remaining.length === 0) {
    return [{ id: 'closing', label: script.closingLabel, closing: true }];
  }
  return remaining.map((question) => ({
    id: question.id,
    label: question.label,
    closing: false,
  }));
}
