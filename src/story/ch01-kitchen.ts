import type { DialogueLine } from './dialogue';

/**
 * 第一章第二节《御膳房》的文案真值（P1 白盒）。
 *
 * 蓝本：`reference/刺客与矿工/第003章-疯狂的御膳房.txt`。
 * 用户 2026-10-31 决定删除「锚点」说法：入口改成小白直接送回御膳房。
 * 设计：`docs/DESIGN-CH01-EXPLORE.md`；地图：`docs/DESIGN-KITCHEN-MAP.md`。
 */

export type KitchenNodeId =
  | 'intro'
  | 'gate'
  | 'pair-enter'
  | 'stove'
  | 'takedown'
  | 'backdoor'
  | 'stove-loot'
  | 'gate-repeat';

export interface KitchenNode {
  readonly id: KitchenNodeId;
  readonly lines: readonly DialogueLine[];
  readonly objective?: string;
  readonly next?: KitchenNodeId;
}

export const KITCHEN_OBJECTIVES = {
  explore: '摸清御膳房，找到通往前殿的路',
  gate: '门从外面闩着——等有人来开',
  hide: '躲起来',
  follow: '跟住他们，别被看见',
  haystack: '赶在老肯之前躲进干草堆',
  done: '第二节 · 白盒到此',
} as const;

export const KITCHEN_CHAPTER_CARD = ['第一章 权力之梦', '第二节 · 御膳房'] as const;

export const KITCHEN_END_CARD = {
  kicker: '第一章 · 权力之梦',
  title: '第二节 · 御膳房',
  subtitle: '第二节 · 完',
  hint: '你已经变成了老肯。下一节接着演：跟着老麦传膳出门，把这张脸用到底。',
} as const;

export const KITCHEN_INTERACTABLE_PROMPTS = {
  backdoor: '查看后门',
  gate: '查看传膳门',
  'stove.west.1': '掀锅盖',
  'stove.west.2': '掀锅盖',
  'stove.west.3': '掀锅盖',
  'stove.east.1': '掀锅盖',
  'stove.east.2': '掀锅盖',
} as const;

export type KitchenInteractableId = keyof typeof KITCHEN_INTERACTABLE_PROMPTS;

export const KITCHEN_HIDE_PROMPTS = {
  'hide.hay': '躲进干草堆',
  'hide.cabinet': '躲进橱柜',
  'hide.screen': '躲在屏风后',
} as const;

const STOVE_LINES: readonly DialogueLine[] = [
  { speaker: '周全', text: '吮指原味鸡？' },
  { speaker: '周全', text: '黄金脆皮鸡？劲爆鸡米花？新奥尔良烤翅？' },
  { speaker: '周全', text: '鳕鱼堡……脆皮甜筒也能放锅里煮？' },
  { speaker: '周全', text: '这锅黑乎乎的是……可乐？这合理吗？' },
  {
    role: 'xiaobai',
    speaker: '小白',
    text: '梦域空间是现实欲望的投射。推测：碳基个体郑卿对此类食品有深度渴望。',
  },
  {
    speaker: '周全',
    text: '……可怜啊。看给这家伙馋的。等哪天请他吃疯狂星期四吧。',
  },
];

export const KITCHEN_NODES: Readonly<Record<KitchenNodeId, KitchenNode>> = {
  intro: {
    id: 'intro',
    lines: [
      { text: '白光点点消散。你踩在冰凉的青砖上，鼻子里全是油烟和肉香。' },
      { role: 'xiaobai', speaker: '小白', text: '已抵达：八月初六巳时，御膳房。' },
      { speaker: '周全', text: '这次怎么进来的？上次那个金殿……' },
      {
        role: 'xiaobai',
        speaker: '小白',
        text: '同一段梦会重演。上次你在金殿留下的痕迹已经抹平了，但梦主记住了「有刺客」。御膳房他不会来。',
      },
      { speaker: '周全', text: '所以就挑这儿？行吧，至少锅多，饿不死。' },
      { role: 'xiaobai', speaker: '小白', text: '补充：本次授予工具「解」。' },
      { text: '右手发烫。一把没有柄的匕首握在掌心，刃上流转着白光。' },
      {
        role: 'xiaobai',
        speaker: '小白',
        text: '提醒：被梦域幻影发现，你会被强制踢出。届时我可以再送你进来。',
      },
      { speaker: '周全', text: '……你就不能说得吉利点？' },
      { role: 'xiaobai', speaker: '小白', text: '不能。' },
      {
        text: '你只能看见面朝方向的一扇范围。墙和柜子会挡住视线；从背后靠近，按「偷袭」。',
      },
    ],
    objective: KITCHEN_OBJECTIVES.explore,
  },
  gate: {
    id: 'gate',
    lines: [
      { text: '你摸到传膳门。门从外面闩着，推不开。' },
      { role: 'xiaobai', speaker: '小白', text: '门从外面闩着。等有人来开。' },
      { speaker: '周全', text: '等？等谁？' },
      { role: 'xiaobai', speaker: '小白', text: '警告：门外有脚步声。建议：先躲起来。' },
    ],
    objective: KITCHEN_OBJECTIVES.gate,
  },
  'pair-enter': {
    id: 'pair-enter',
    lines: [
      { text: '门闩响了。门缝里透进一线光。' },
      { text: '一个圆头圆脑的矿工门卫先走进来，猩红的眼睛扫过走廊。' },
      {
        speaker: '老麦',
        text: '老肯，咱们这回可真发达了……这御膳房就成咱俩的天下了！',
      },
      {
        speaker: '老肯',
        text: '可不是嘛，老麦……太上皇？就让他在大安宫呆着吧！',
      },
      { role: 'xiaobai', speaker: '小白', text: '保持距离。别让他们看见你的脸。' },
    ],
    objective: KITCHEN_OBJECTIVES.follow,
  },
  stove: {
    id: 'stove',
    lines: [
      { speaker: '老麦', text: '这锅有人动过吧？' },
      { speaker: '老肯', text: '没见人进来啊，难不成是耗子？' },
      { speaker: '老麦', text: '可我看这草也被人动过……' },
      {
        role: 'xiaobai',
        speaker: '小白',
        text: '干草堆被发现概率 52.10%。若听完建议躲入橱柜，概率将降至 15.68%。',
      },
      { speaker: '周全', text: '还用你废话？外星来的小蠢货。' },
      {
        role: 'xiaobai',
        speaker: '小白',
        text: '另，你的智力商值以灵能族标准计算约为 0.025，故「蠢货」称呼不成立。',
      },
      { text: '老肯朝干草堆走来。' },
    ],
    objective: KITCHEN_OBJECTIVES.haystack,
  },
  takedown: {
    id: 'takedown',
    lines: [
      { text: '老肯探头进草堆的一瞬，你扣住他的手腕，白光没入他的腰侧。' },
      { text: '他的身体像溶解般淡去。你握住他掉下来的那口气，脸慢慢变白，鼻子变红……' },
      { role: 'xiaobai', speaker: '小白', text: '善变已激活。持续时间：十分钟。' },
      { speaker: '老麦', text: '老肯？你蹲那儿干嘛？走了，传膳去。' },
    ],
  },
  backdoor: {
    id: 'backdoor',
    lines: [
      { text: '后门从外面闩着。门缝里只有一片白。' },
      { speaker: '周全', text: '得，又是死路。' },
    ],
  },
  'stove-loot': {
    id: 'stove-loot',
    lines: STOVE_LINES,
  },
  'gate-repeat': {
    id: 'gate-repeat',
    lines: [{ text: '门还是从外面闩着。等有人来开。' }],
  },
};

export const KITCHEN_HIDE_IDS = ['hide.hay', 'hide.cabinet', 'hide.screen'] as const;
