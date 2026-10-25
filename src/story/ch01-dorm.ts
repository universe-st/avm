import { CH01_ASSET_KEYS } from '../assets/keys';
import type { DialogueLine } from './dialogue';

/**
 * 第一章第一节《寝室》的文案唯一真值。
 *
 * 蓝本：`reference/刺客与矿工/第001章-天子.txt`、`第002章-小白.txt`。
 * 为游戏节奏做了压缩与交互扩写；战斗为原创补充，登记在 `docs/STORY-BIBLE.md` §8.2。
 * 场景里不得再硬编码台词。
 */

export type Ch01NodeId =
  | 'intro'
  | 'zheng'
  | 'zheng-repeat'
  | 'phone-locked'
  | 'phone'
  | 'dream'
  | 'after'
  | 'complete'
  | 'desk'
  | 'window'
  | 'door';

export interface Ch01Node {
  readonly id: Ch01NodeId;
  readonly lines: readonly DialogueLine[];
  /** 对话结束后要更新的目标。 */
  readonly objective?: string;
  /** 对话结束后的下一个节点；省略时回到自由探索。 */
  readonly next?: Ch01NodeId;
  /** 对话结束后进入的战斗 id。 */
  readonly battle?: string;
  /** 可选交互可以重复看；必需节点只触发一次。 */
  readonly repeatable?: boolean;
}

export const CH01_BATTLE_ID = 'battle.ch01.first';

export const CH01_OBJECTIVES = {
  wakeZheng: '叫醒郑卿',
  findPhone: '找到手机，叫救护车',
  listen: '听听这个外星小东西怎么说',
  survive: '在梦里活下来',
  afterBattle: '听小白说完',
  complete: '第一节完成',
} as const;

export const CH01_CHAPTER_CARD = ['第一章 天子', '第一节 · 寝室'] as const;

export const CH01_END_CARD = {
  title: '第一节 · 寝室',
  subtitle: '第一章《天子》未完待续',
  hint: '下一次，小白会给他「解」。',
} as const;

export const CH01_INTERACTABLE_PROMPTS = {
  zheng: '叫醒郑卿',
  phone: '查看手机',
  desk: '翻看小说',
  window: '看向窗外',
  door: '试着开门',
} as const;

export type Ch01InteractableId = keyof typeof CH01_INTERACTABLE_PROMPTS;

export const CH01_INTERACTABLE_NODES: Readonly<Record<Ch01InteractableId, Ch01NodeId>> = {
  zheng: 'zheng',
  phone: 'phone',
  desk: 'desk',
  window: 'window',
  door: 'door',
};

export const CH01_NODES: Readonly<Record<Ch01NodeId, Ch01Node>> = {
  intro: {
    id: 'intro',
    lines: [
      { speaker: '旁白', text: '九月，开学后的第一个周六。宿舍闷热，窗外的蝉叫得人心烦。' },
      { speaker: '周全', text: '老郑，你是猪吗？都快下午了。', emotion: 'annoyed' },
      { speaker: '旁白', text: '郑卿四仰八叉地瘫在靠窗的单人床上，口水洇湿了半个枕头。' },
      { speaker: '周全', text: '另外两个家伙回家了，四张床空了两张，就剩我守着你。' },
    ],
  },
  zheng: {
    id: 'zheng',
    objective: CH01_OBJECTIVES.findPhone,
    lines: [
      { speaker: '周全', text: '老郑！醒醒！你都睡一天了！' },
      { speaker: '旁白', text: '只有更响的呼噜。眼皮焊得死死的。' },
      { speaker: '周全', text: '十六个小时了……温度也正常。' },
      { speaker: '旁白', text: '校门口小报的标题闪过：沉睡症全球蔓延，患者莫名长眠不醒。' },
      { speaker: '周全', text: '靠。不会真中招了吧？', emotion: 'surprised' },
      { speaker: '旁白', text: '周末宿舍只有他俩，老师不在，校医院也没辙。' },
      { speaker: '周全', text: '叫救护车！' },
    ],
  },
  'zheng-repeat': {
    id: 'zheng-repeat',
    repeatable: true,
    lines: [
      { speaker: '旁白', text: '呼噜噜——咯。' },
      { speaker: '周全', text: '……行，你睡。' },
    ],
  },
  'phone-locked': {
    id: 'phone-locked',
    lines: [
      { speaker: '周全', text: '手机压在桌上那摞书下面。先看看老郑怎么了。' },
    ],
  },
  phone: {
    id: 'phone',
    objective: CH01_OBJECTIVES.listen,
    next: 'dream',
    lines: [
      { speaker: '旁白', text: '周全从桌上那摞书底下摸出手机。' },
      { speaker: '周全', text: '开机……开机啊！' },
      { speaker: '旁白', text: '没反应。插上充电线，屏幕依旧死寂。' },
      { speaker: '周全', text: '偏偏这时候坏？！' },
      { speaker: '旁白', text: '嗡——白光爆开，手机悬在半空。', cg: CH01_ASSET_KEYS.cg.phone, fx: 'glitch' },
      { speaker: '周全', text: '鬼、鬼啊！', cg: CH01_ASSET_KEYS.cg.phone, emotion: 'surprised' },
      { speaker: '旁白', text: '白光凝成一张面无表情的娃娃脸。', cg: CH01_ASSET_KEYS.cg.phone },
      { speaker: '小白', text: '目标行星：地球。发现基础逻辑碳基生物。命名：ETH-HB-001A。' },
      { speaker: '小白', text: 'ETH-HB-001B，状态：意识能量持续萃取中。即所谓，沉睡症。' },
      { speaker: '周全', text: '偷……偷脑子？老郑醒不过来，是因为被「偷电」了？', emotion: 'confused' },
      { speaker: '小白', text: '比喻不严谨，但有效。非法操作者：因泰里文明。' },
      { speaker: '周全', text: '怎么证明？' },
      { speaker: '小白', text: '视觉确认。' },
      { speaker: '旁白', text: '小白伸手一指。宿舍、床铺、郑卿——全被白光吞没。', fx: 'flash' },
    ],
  },
  dream: {
    id: 'dream',
    battle: CH01_BATTLE_ID,
    lines: [
      { speaker: '旁白', text: '白光褪去。周全跪在冰冷的地板上。', fx: 'flash' },
      { speaker: '旁白', text: '金殿，红柱，高台。龙椅上坐着穿龙袍的郑卿。' },
      { speaker: '周全', text: '老郑？！' },
      { speaker: '楚公公', text: '有刺客！护驾！' },
      { speaker: '郑卿（梦中）', text: '哼。谁派你来的？' },
      { speaker: '旁白', text: '太监的皮肉裂开，露出铁骨和猩红电子眼。', fx: 'shake' },
      { speaker: '矿工', text: '入侵单元确认。执行矿场清除协议。' },
      { speaker: '小白', text: '建议：先活下来。' },
    ],
  },
  after: {
    id: 'after',
    objective: CH01_OBJECTIVES.afterBattle,
    next: 'complete',
    lines: [
      { speaker: '旁白', text: '呼——！周全趴在寝室地板上，左手还向前伸着。', cg: CH01_ASSET_KEYS.cg.wake },
      { speaker: '周全', text: '假的……都是假的……', cg: CH01_ASSET_KEYS.cg.wake, emotion: 'sad' },
      { speaker: '小白', text: '精神体会被强制踢出梦域。你会在此处醒来。' },
      { speaker: '周全', text: '那几个铁皮怪物是什么？' },
      { speaker: '小白', text: '因泰里「矿工」。守卫矿点，清除干扰源。' },
      { speaker: '周全', text: '老郑一直睡下去会怎样？' },
      { speaker: '小白', text: '矿点建设约30天，40天不可逆，150天死亡率超过99.7%。' },
      { speaker: '周全', text: '一百五十天……老郑会死在梦里？', emotion: 'surprised' },
      { speaker: '小白', text: '依据《灵能族战时管理条例》，现对你发起强制征召。任务：进入郑卿的梦域，解离其精神体核心。' },
      { speaker: '周全', text: '你让我杀了老郑？！', emotion: 'angry' },
      { speaker: '小白', text: '比喻失败。不会物理死亡；会切断链接，让他醒来。' },
      { speaker: '周全', text: '为什么找我？' },
      { speaker: '小白', text: '你对切断工具「解」的适配性极高。' },
      { speaker: '周全', text: '……行吧。不过得答应我几个条件。第一，我们有名字，我叫周全，他叫郑卿。' },
      { speaker: '小白', text: '允许。' },
      { speaker: '周全', text: '第二，别笑得那么瘆人。第三，你叫小白。', emotion: 'annoyed' },
      { speaker: '小白', text: '「小白」……采纳。下一次进入梦域，我会赋予你「解」。' },
      { speaker: '旁白', text: '床上的郑卿翻了个身，呼噜声重新响起。' },
      { speaker: '周全', text: '老郑，等我。' },
    ],
  },
  complete: {
    id: 'complete',
    lines: [],
  },
  desk: {
    id: 'desk',
    repeatable: true,
    lines: [
      { speaker: '旁白', text: '桌上摊着一本《剑与笑傲》，翻到折角那页。' },
      { speaker: '周全', text: '主角正被反派按在地上……你突然不想看了。' },
    ],
  },
  window: {
    id: 'window',
    repeatable: true,
    lines: [
      { speaker: '旁白', text: '窗外是空荡荡的操场。' },
      { speaker: '周全', text: '明明是周六，连个打球的人都没有。' },
    ],
  },
  door: {
    id: 'door',
    repeatable: true,
    lines: [
      { speaker: '旁白', text: '门没锁。可走廊里安静得让人不想出去。' },
      { speaker: '周全', text: '……算了。先管老郑。' },
    ],
  },
};

/** 战斗场景的战前/战败短句；战斗玩法数据在 `src/battle/`。 */
export const CH01_BATTLE_BANNER = {
  title: '梦域 · 金殿',
  subtitle: '矿工·清除单元',
  intro: [
    '铁皮摩擦声从四面八方逼近。',
    '你还没有「解」。你只有一双拳头。',
  ],
  defeat: [
    '铁臂合拢。你听见自己的心跳，像隔着一层水。',
    '小白：准备脱离梦域。',
  ],
} as const;

export function nodeLines(nodeId: Ch01NodeId): readonly DialogueLine[] {
  return CH01_NODES[nodeId].lines;
}
