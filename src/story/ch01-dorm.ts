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

export const CH01_CHAPTER_CARD = ['第一章 权力之梦', '第一节 · 寝室'] as const;

export const CH01_END_CARD = {
  kicker: '第一章 · 权力之梦',
  title: '第一节 · 寝室',
  subtitle: '第二节 · 待续',
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
      // 开头两句旁白（九月周六下午、郑卿瘫在床上）已经由开场动画演过，这里不再复述。
      { speaker: '周全', text: '老郑，你是猪吗？都睡了一整天了。', emotion: 'annoyed' },
      { speaker: '周全', text: '奇怪，你平时也没这么能睡啊。' },
      // 2026-10-30 用户改稿：开场补四句内心独白，交代「我 / 老郑 / 为什么周六还在校」。
      { speaker: '周全', text: '（我叫周全，是一名普通的高中生。）' },
      { speaker: '周全', text: '（床上躺着的那个家伙，是我的死党舍友，郑卿。我喊他老郑。）' },
      {
        speaker: '周全',
        text: '（今天是星期六，本来应该回家的。但我爸妈不在家，所以就在学校多住两天。）',
      },
      {
        speaker: '周全',
        text: '（老郑和我一样，家里没人，所以也没回。可是他从昨晚一直睡到今天，是不是太离谱了啊？不行，我得叫醒他。）',
      },
    ],
  },
  zheng: {
    id: 'zheng',
    objective: CH01_OBJECTIVES.findPhone,
    lines: [
      { speaker: '周全', text: '老郑！醒醒！你都睡一天了！' },
      { speaker: '旁白', text: '回应你的只有更响的呼噜。眼皮焊得死死的。' },
      { speaker: '旁白', text: '你扑到床边，抓住郑卿的肩膀拼命摇晃。', fx: 'shake' },
      { speaker: '旁白', text: '郑卿像一条软面条，脑袋左摇右摆，呼噜的节奏却半点没乱。' },
      { speaker: '旁白', text: '嘴角甚至还挂着一丝满足的笑。', emotion: 'happy', emotionBy: 'zheng' },
      { speaker: '周全', text: '……这也能睡得着？', emotion: 'annoyed' },
      { speaker: '周全', text: '十六个小时了……让我摸摸额头……温度正常。' },
      { speaker: '周全', text: '怎么回事？难不成……', emotion: 'confused' },
      // 回忆：这是周全想起来的一段旧新闻（家里的电视），不是寝室里正在播放；
      // BGM 切《危机来临》，并且之后不再切回日常。
      {
        speaker: '旁白',
        text: '你脑海里忽然闪出一段画面。几天前，家里的客厅，电视开着，荧光泛着旧胶片似的灰白。',
        cg: CH01_ASSET_KEYS.cg.news,
        bgm: 'ch01Crisis',
      },
      {
        speaker: '男主持',
        text: '于上月发现的“沉睡症”疫情，当前仍在全球多点蔓延。患者长期陷入沉睡，无法自行苏醒。',
        cg: CH01_ASSET_KEYS.cg.news,
      },
      {
        speaker: '女主持',
        text: '多国专家正在积极研判此次疫情，目前仍未取得实质性进展。华夏科学院院士庄图强在国际医学峰会上发表讲话，呼吁加强国际合作，已获多国响应。',
        cg: CH01_ASSET_KEYS.cg.news,
      },
      {
        speaker: '男主持',
        text: '据世界卫生组织统计，当前全球有记录的“沉睡症”患者共 829 人，尚未发现传染性，爆发规律呈随机分布。',
        cg: CH01_ASSET_KEYS.cg.news,
      },
      {
        speaker: '女主持',
        text: '我国境内已发现病例 86 人，各级医疗部门已启动四级应急响应。请广大民众留意身边的人，若出现一睡不起的情况，请及时拨打 120 上报。',
        cg: CH01_ASSET_KEYS.cg.news,
      },
      { speaker: '旁白', text: '画面暗下去。你回过神来，寝室里只剩郑卿的呼噜声。' },
      { speaker: '周全', text: '靠。不会真中招了吧？', emotion: 'surprised' },
      { speaker: '周全', text: '赶紧叫救护车！' },
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
      // 「摸出手机 → 没反应 → 白光 → 小白成形」这一段交给 CG（drama/剧集/EP002，
      // 游戏内 key `video.ch01.phone`，在 ch01-dorm 场景里于本节点开头播放）。
      // 这里只接 CG 之后的反应，避免同一件事说两遍。
      { speaker: '旁白', text: '你瘫坐在地上，后背抵着床沿，一只手还举在半空。' },
      { speaker: '周全', text: '鬼、鬼啊！', emotion: 'surprised' },
      // 名字是慢慢揭出来的：先「？？？」，等他开口问一句才换成临时称呼，最后才定名「小白」。
      { speaker: '？？？', role: 'xiaobai', text: '目标行星：地球。发现基础逻辑碳基生物。命名：ETH-HB-001A。' },
      { speaker: '？？？', role: 'xiaobai', text: 'ETH-HB-001B，状态：意识能量持续萃取中。即所谓，沉睡症。' },
      { speaker: '周全', text: '偷……偷脑子？老郑醒不过来，是因为被「偷电」了？', emotion: 'confused' },
      { speaker: '莫名其妙出现的白色小娃娃', role: 'xiaobai', text: '比喻不严谨，但有效。非法操作者：因泰里文明。' },
      { speaker: '周全', text: '怎么证明？' },
      { speaker: '莫名其妙出现的白色小娃娃', role: 'xiaobai', text: '视觉确认。' },
      { speaker: '旁白', text: '它伸手一指。宿舍、床铺、郑卿——全被白光吞没。' },
    ],
  },
  dream: {
    id: 'dream',
    battle: CH01_BATTLE_ID,
    /**
     * 这里不再复述金殿剧情。
     *
     * 2026-10-31 加入了可演出场景 `scene.ch01.palace`：白光、跪地、老郑、护驾、
     * 楚公公、裂皮变矿工都在那里完整演一遍。本节点只负责把流程推进到战斗，
     * 台词留空由金殿接管，避免同一段剧情说两遍。
     */
    lines: [],
  },
  after: {
    id: 'after',
    objective: CH01_OBJECTIVES.afterBattle,
    next: 'complete',
    lines: [
      { speaker: '旁白', text: '呼——！你趴在寝室地板上，左手还向前伸着。', cg: CH01_ASSET_KEYS.cg.wake },
      { speaker: '周全', text: '假的……都是假的……', cg: CH01_ASSET_KEYS.cg.wake, emotion: 'sad' },
      { speaker: '莫名其妙出现的白色小娃娃', role: 'xiaobai', text: '精神体会被强制踢出梦域。你会在此处醒来。' },
      { speaker: '周全', text: '那几个铁皮怪物是什么？' },
      { speaker: '莫名其妙出现的白色小娃娃', role: 'xiaobai', text: '因泰里「矿工」。守卫矿点，清除干扰源。' },
      { speaker: '周全', text: '老郑一直睡下去会怎样？' },
      { speaker: '莫名其妙出现的白色小娃娃', role: 'xiaobai', text: '矿点建设约30天，40天不可逆，150天死亡率超过99.7%。' },
      { speaker: '周全', text: '一百五十天……老郑会死在梦里？', emotion: 'surprised' },
      { speaker: '莫名其妙出现的白色小娃娃', role: 'xiaobai', text: '依据《灵能族战时管理条例》，现对你发起强制征召。任务：进入郑卿的梦域，解离其精神体核心。' },
      { speaker: '周全', text: '你让我杀了老郑？！', emotion: 'angry' },
      { speaker: '莫名其妙出现的白色小娃娃', role: 'xiaobai', text: '比喻失败。不会物理死亡；会切断链接，让他醒来。' },
      { speaker: '周全', text: '为什么找我？' },
      { speaker: '莫名其妙出现的白色小娃娃', role: 'xiaobai', text: '你对切断工具「解」的适配性极高。' },
      { speaker: '周全', text: '……行吧。不过得答应我几个条件。第一，我们有名字，我叫周全，他叫郑卿。' },
      { speaker: '莫名其妙出现的白色小娃娃', role: 'xiaobai', text: '允许。' },
      { speaker: '周全', text: '第二，别笑得那么瘆人。第三，你叫小白。', emotion: 'annoyed' },
      { speaker: '小白', role: 'xiaobai', text: '「小白」……采纳。下一次进入梦域，我会赋予你「解」。' },
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
      { speaker: '旁白', text: '桌上摊着一本旧平装武侠小说，翻到折角那页。' },
      { speaker: '周全', text: '主角正被反派按在地上……你突然不想看了。' },
    ],
  },
  window: {
    id: 'window',
    repeatable: true,
    lines: [
      { speaker: '旁白', text: '窗外是空荡荡的操场。' },
      { speaker: '周全', text: '明明是周六，连个打球的人都没有。' },
      // 家里的事挪到窗边再说：开场独白不一次倒完，看窗外时补上「反正回去也是一个人」。
      { speaker: '周全', text: '（奶奶也出远门了，家里没人。回去也是一个人，还不如在学校待着。）' },
    ],
  },
  door: {
    id: 'door',
    repeatable: true,
    lines: [
      { speaker: '旁白', text: '门没锁。可走廊里安静得让你不想出去。' },
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
