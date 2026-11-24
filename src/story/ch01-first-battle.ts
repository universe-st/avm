import type { SpeakerTone } from './dialogue';

/**
 * 第一章金殿剧情战（第一场）的教程对话。
 *
 * 第一场没有「解」，本来是一场「必败」的剧情战；2026-11-24 用户给了完整的
 * 战斗中插入对话。这里只放**文案与节拍**，场景负责把 enemy-attack / punch
 * 换成真实战斗动作和动画。
 */
export type FirstBattleTalkLine = {
  readonly speaker: string;
  readonly text: string;
  readonly tone: SpeakerTone;
};

export type FirstBattleTalkBeat =
  | { readonly kind: 'line'; readonly line: FirstBattleTalkLine }
  | { readonly kind: 'enemy-attack' }
  | { readonly kind: 'punch' };

const zhou = (text: string): FirstBattleTalkLine => ({ speaker: '周全', text, tone: 'zhou' });
const robot = (text: string): FirstBattleTalkLine => ({ speaker: '侍卫机器人', text, tone: 'miner' });
const xiaobai = (text: string): FirstBattleTalkLine => ({ speaker: '白色小精灵', text, tone: 'xiaobai' });
const narration = (text: string): FirstBattleTalkLine => ({ speaker: '旁白', text, tone: 'narration' });

/** 进入战斗：机器人先打一下，再给「移动」提示。 */
export const FIRST_BATTLE_ENTER_BEATS: readonly FirstBattleTalkBeat[] = [
  { kind: 'line', line: zhou('喂喂喂！这到底什么情况？机器人？') },
  { kind: 'line', line: robot('清除协议，执行！') },
  { kind: 'enemy-attack' },
  { kind: 'line', line: zhou('哎呦！痛！一言不合就开打？') },
  { kind: 'line', line: xiaobai('优先策略：通过“移动”躲避矿工的攻击。') },
];

/** 第一次点「攻击」：打铁皮怪物一拳，无效，随后按钮灰掉。 */
export const FIRST_BATTLE_ATTACK_BEATS: readonly FirstBattleTalkBeat[] = [
  { kind: 'line', line: narration('不知道为何，你的心里突然冒出这样的想法：也许你该教训一下这个铁皮怪物。') },
  { kind: 'line', line: zhou('拼了！我……') },
  { kind: 'punch' },
  { kind: 'line', line: narration('你猛猛的一拳砸在机器人的外壳上，一阵剧痛传来，你尖叫出声。') },
  { kind: 'line', line: zhou('哎呦……') },
  { kind: 'line', line: xiaobai('提醒：当前无法对敌方造成有效伤害。') },
];

/** 第一次成功移动：矿工转身攻击一次。 */
export const FIRST_BATTLE_MOVE_PRE_LINES: readonly FirstBattleTalkLine[] = [
  zhou('惹不起我还躲不起吗？'),
];
export const FIRST_BATTLE_MOVE_POST_LINES: readonly FirstBattleTalkLine[] = [
  zhou('哎哟！混蛋……躲不开啊……'),
  xiaobai('敌方速度较快，攻击无法规避。'),
  zhou('……有完没完啊？'),
];

/** 第一次防御：矿工攻击一次。 */
export const FIRST_BATTLE_GUARD_PRE_LINES: readonly FirstBattleTalkLine[] = [
  zhou('你，你不要过来啊！'),
];
export const FIRST_BATTLE_GUARD_POST_LINES: readonly FirstBattleTalkLine[] = [
  zhou('哎哟，痛，痛……'),
  xiaobai('粗劣的防御姿势，不足以抵抗伤害。'),
  zhou('你就这么看着吗？！'),
];
