import type { PortraitEmotion, SpeakerTone } from './dialogue';

/**
 * 第一章金殿剧情战（第一场）的教程对话。
 *
 * 第一场没有「解」，本来是一场「必败」的剧情战；2026-11-24 用户给了完整的
 * 战斗中插入对话。这里只放**文案与节拍**，场景负责把 enemy-attack / punch
 * 换成真实战斗动作和动画。
 *
 * **首次移动 / 首次防御的矿工回手**（2026-11-25）：11 点位之后玩家一步就能走出矿工
 * 近战范围，普通招式会打空但剧本照旧播「痛」——所以场景把这两拍强制打成全站位
 * （`miner.quake` 核心脉冲，`BattleAction.forceSkillId`），保证台词与伤害一致。
 */
export type FirstBattleTalkLine = {
  readonly speaker: string;
  readonly text: string;
  readonly tone: SpeakerTone;
  /** 对话立绘的情绪差分（周全用；机器人没有差分）。 */
  readonly portraitEmotion?: PortraitEmotion;
};

export type FirstBattleTalkBeat =
  | { readonly kind: 'line'; readonly line: FirstBattleTalkLine }
  | { readonly kind: 'enemy-attack' }
  | { readonly kind: 'punch' };

const zhou = (text: string, portraitEmotion?: PortraitEmotion): FirstBattleTalkLine => ({
  speaker: '周全',
  text,
  tone: 'zhou',
  ...(portraitEmotion === undefined ? {} : { portraitEmotion }),
});
const robot = (text: string): FirstBattleTalkLine => ({ speaker: '侍卫机器人', text, tone: 'miner' });
const xiaobai = (text: string): FirstBattleTalkLine => ({ speaker: '白色小精灵', text, tone: 'xiaobai' });
const narration = (text: string): FirstBattleTalkLine => ({ speaker: '旁白', text, tone: 'narration' });

/** 进入战斗：机器人先打一下，再给「移动」提示。 */
export const FIRST_BATTLE_ENTER_BEATS: readonly FirstBattleTalkBeat[] = [
  { kind: 'line', line: zhou('喂喂喂！这到底什么情况？机器人？', 'shocked') },
  { kind: 'line', line: robot('清除协议，执行！') },
  { kind: 'enemy-attack' },
  { kind: 'line', line: zhou('哎呦！痛！一言不合就开打？', 'awkward') },
  { kind: 'line', line: xiaobai('优先策略：通过“移动”躲避矿工的攻击。') },
];

/** 第一次点「攻击」：打铁皮怪物一拳，无效，随后按钮灰掉。 */
export const FIRST_BATTLE_ATTACK_BEATS: readonly FirstBattleTalkBeat[] = [
  { kind: 'line', line: narration('不知道为何，你的心里突然冒出这样的想法：也许你该教训一下这个铁皮怪物。') },
  { kind: 'line', line: zhou('拼了！我……', 'frown') },
  { kind: 'punch' },
  { kind: 'line', line: narration('你猛猛的一拳砸在机器人的外壳上，一阵剧痛传来，你尖叫出声。') },
  { kind: 'line', line: zhou('哎呦……', 'awkward') },
  { kind: 'line', line: xiaobai('提醒：当前无法对敌方造成有效伤害。') },
];

/** 第一次成功移动：矿工转身攻击一次。 */
export const FIRST_BATTLE_MOVE_PRE_LINES: readonly FirstBattleTalkLine[] = [
  zhou('惹不起我还躲不起吗？', 'awkward'),
];
export const FIRST_BATTLE_MOVE_POST_LINES: readonly FirstBattleTalkLine[] = [
  zhou('哎哟！混蛋……躲不开啊……', 'awkward'),
  xiaobai('敌方速度较快，攻击无法规避。'),
  zhou('……有完没完啊？', 'frown'),
];

/** 第一次防御：矿工攻击一次。 */
export const FIRST_BATTLE_GUARD_PRE_LINES: readonly FirstBattleTalkLine[] = [
  zhou('你，你不要过来啊！', 'shocked'),
];
export const FIRST_BATTLE_GUARD_POST_LINES: readonly FirstBattleTalkLine[] = [
  zhou('哎哟，痛，痛……', 'awkward'),
  xiaobai('粗劣的防御姿势，不足以抵抗伤害。'),
  zhou('你就这么看着吗？！', 'frown'),
];
