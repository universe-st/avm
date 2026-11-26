import { CH01_ASSET_KEYS } from '../assets/keys';
import type { DialogueLine } from './dialogue';
import type { InquiryScript } from './inquiry';

/**
 * 第一章第一节 · 战后「从宫殿逃出之后」的剧本（唯一真值）。
 *
 * 时间点：金殿剧情战失败、被踢出梦域，周全在寝室地板上醒来。
 * 这一段是**多段结构**（不是一条直线），由 `src/scenes/ch01-dorm-scene.ts` 消费：
 *
 * ```
 * intro（醒来 + 编号之争）→ 提问菜单（三选一，顺序随意）
 *   → 每个分支播完回到菜单（问过的消失）
 *   → 三个都问完：菜单只剩「你想让我做什么。」
 *   → closing（收尾段：杀不杀、为什么是我、黑屏胁迫）→ handoff（征召与命名）→ 结束卡
 * ```
 *
 * 为什么 `handoff` 不在新稿原文里：新稿停在「我等待你的抉择。」，
 * 但第二节《御膳房》里它已经被叫作「小白」，且「解」必须在进入梦域前交给他。
 * 这一段沿用上一版已落地的**独有桥段**（不重复新稿已经说过的「征召/寿命/适配性」），
 * 只保留「接受任务 → 命名小白 → 许诺「解」」。要砍掉它只需把 `CH01_AFTER_FINALE`
 * 改成 `CH01_AFTER_CLOSING`（见 docs/CUE-CONTRACT.md 与收工说明）。
 *
 * 演出提示（括号里的舞台指示、BGM 切换、鼾声、黑屏）都落在行 cue 上：
 * - 状态型 `bgm` 走归约，跳过也不丢；
 * - 表现型 `cg` / `fx` / `emotion` / `sfx` / `blackout` / `dark` 只在被看见时执行，跳过不补播。
 *
 * 「黑屏胁迫」那一段的六拍（`dark: 'onset'|'grip'|'squeeze'|'verdict'|'crush'|'release'`）
 * 的数值表在 `src/story/ch01-dark-scene.ts`，表现层在 `src/ui/dark-pressure.ts`：
 * 暗角、两侧夹紧、灵能丝线、小白放大、心跳加速、压迫底噪与攥紧/释压音效。
 */

/**
 * 这一段的显示名。
 *
 * 时间点在「周全给它取名小白」之前，所以照新稿用「白色小精灵」；
 * 语义色/逐字音/立绘只认 `role: 'xiaobai'`，改名不用动声线。
 */
export const CH01_AFTER_XIAOBAI_SPEAKER = '白色小精灵';

const xiaobai = (text: string): DialogueLine => ({
  speaker: CH01_AFTER_XIAOBAI_SPEAKER,
  role: 'xiaobai',
  text,
});

/** 醒来 + 「编号 vs 名字」这一段（提问菜单之前）。 */
export const CH01_AFTER_INTRO: readonly DialogueLine[] = [
  // 「BGM 变回校园日常」写在首行：场景绑定本身也会给 ch01Dorm，
  // 但状态型 cue 让「跳过整段」的收尾同样落在校园日常上（不依赖进场绑定）。
  {
    speaker: '旁白',
    text: '你从地板上坐起来，身上全是冷汗。',
    cg: CH01_ASSET_KEYS.cg.wake,
    bgm: 'ch01Dorm',
  },
  { speaker: '周全', text: '什么情况……刚才……是我做了个梦吗？', portraitEmotion: 'shocked' },
  xiaobai('否定。做梦的并不是你，而是ETH-HB-001B。'),
  { speaker: '周全', text: '001B？', portraitEmotion: 'awkward' },
  xiaobai('此为自动生成的编号，指代那位被你称为“老郑”的地球智慧生物。'),
  {
    speaker: '旁白',
    text: '你看了一眼那个呼呼大睡的舍友，郑卿，不知为什么，心里冒出一阵无名之火。',
  },
  { speaker: '周全', text: '他有名字！他叫郑卿！', emotion: 'angry', emotionBy: 'zhou', portraitEmotion: 'frown' },
  xiaobai('该星球有约5382个被称为“郑卿”的生物，使用编号称呼能减少歧义。'),
  { speaker: '周全', text: '……你……', portraitEmotion: 'awkward' },
  {
    speaker: '旁白',
    text: '她的话让你哑口无言。但这似乎并不是最要紧的事。小家伙注意到了你欲言又止的表情。',
  },
  xiaobai('你似乎还没有充分理解情况，根据相关规定，我有义务向你解释清楚。你可以进行提问。'),
];

/**
 * 三个提问分支 + 收尾选项文案。
 *
 * 按钮上**不写编号**（2026-11-21 用户要求：「选项对话框每个选项前面不用加编号」）；
 * 问过的一项从菜单移除后也不重新编号，剩下的选项就是两个问题本身。
 */
export type Ch01AfterQuestionId = 'zheng' | 'scene' | 'identity';

export const CH01_AFTER_INQUIRY: InquiryScript<Ch01AfterQuestionId> = {
  closingLabel: '你想让我做什么。',
  questions: [
    {
      id: 'zheng',
      label: '郑卿怎么了？',
      lines: [
        { speaker: '旁白', text: '你伸手指了指躺在床上的郑卿。' },
        { speaker: '周全', text: '所以，他到底怎么了？' },
        xiaobai('他正因为意识能量被开采而陷入深度睡眠状态。'),
        { speaker: '周全', text: '意识能量到底是什么，很有用吗？' },
        xiaobai(
          '在宇宙内，意识能量确实是一种重要的能源，它从智慧生物的思维活动中诞生，蜷缩在一个特殊的维度空间。',
        ),
        { speaker: '周全', text: '是谁在开采它？' },
        xiaobai(
          '因泰里文明。它们使用了一百二十六艘矿艇，以1.65光年为半径围绕地球，持续对地球上的智慧生物产生影响。',
        ),
        { speaker: '周全', text: '……因泰里。原来最近新闻上说的“沉睡症”，是外星人搞的鬼吗？', portraitEmotion: 'awkward' },
        xiaobai('确定。'),
      ],
    },
    {
      id: 'scene',
      label: '刚才是怎么回事？',
      lines: [
        { speaker: '周全', text: '那么刚才，你把我带去那个地方，是哪里？' },
        xiaobai('ETH-HB-001B的梦域空间。'),
        { speaker: '周全', text: '梦域空间？' },
        xiaobai('由人类的梦境为基底，在因泰里的技术下筑造而成的空间。'),
        { speaker: '周全', text: '那几个铁皮怪物是？' },
        xiaobai('因泰里文明的矿工。信息态模因机器人。职责：守卫矿点，清除干扰源，确保“意识能量”持续开采'),
        { speaker: '周全', text: '他们要怎么开采意识能量？' },
        xiaobai('通过梦域中的行为不断刺激梦主的欲望。'),
        { speaker: '周全', text: '他的欲望？' },
        // 演出提示「带鼾声配音」：`sfx` 是表现型 cue，只在被看见时响一声。
        // 6 秒的呼噜正好盖住这句旁白到下一句提问之间的停顿。
        {
          speaker: '旁白',
          text: '你的耳边传来一阵鼾声，伴随着吞咽口水的声音。',
          sfx: CH01_ASSET_KEYS.audio.snore,
        },
        { speaker: '周全', text: '他是想当皇帝还是想把班主任当太监使唤？', portraitEmotion: 'awkward' },
        xiaobai('这个问题我无法解答。'),
        { speaker: '周全', text: '那为什么他在梦里不认识我？' },
        xiaobai('梦主在自身梦域拥有绝对认知主导权。你作为外来者，身份未被其梦域逻辑接纳。'),
      ],
    },
    {
      id: 'identity',
      label: '你是谁？',
      lines: [
        { speaker: '周全', text: '那么，你是谁？为什么会从我的手机里钻出来？' },
        xiaobai(
          '我是灵能族为抵抗因泰里的扩张，派往各个星球的指引者，编号TEAR-27。灵能族属于能量生命，其生命本质是宇宙空间中以复杂的组合频率振动的谐波。我可以借助你们的通讯设备在一定范围内穿行。',
        ),
        { speaker: '周全', text: '那么，你想做什么？' },
        xiaobai('指引地球上的智慧生命，协助切断因泰里的意识能量供应渠道。'),
        { speaker: '周全', text: '……', portraitEmotion: 'awkward' },
      ],
    },
  ],
};

/** 收尾段：杀不杀 → 为什么是我 → 黑屏胁迫。 */
export const CH01_AFTER_CLOSING: readonly DialogueLine[] = [
  { speaker: '周全', text: '所以，我能怎么帮你？' },
  xiaobai('潜入ETH-HB-001B的梦境，将他杀死。'),
  { speaker: '周全', text: '你让我杀人？！那不可能！', emotion: 'angry', emotionBy: 'zhou', portraitEmotion: 'frown' },
  xiaobai(
    '杀死梦中的精神体不会导致其在现实中死亡，相反，会令其脱离梦境，并很难再次陷入沉睡症状态。',
  ),
  { speaker: '旁白', text: '你松了一口气，但还是盯着这个小家伙，眼中的疑惑更甚。' },
  {
    speaker: '周全',
    text: '那么为什么找我？你们外星人想拯救地球，不应该去找国家领袖、军队、联合国吗？我只是一个学生而已。',
  },
  xiaobai(
    '你提及的种群内具备高权力的组织和个体，思维模式往往固化严重，沟通成本过高，效率低下。且此任务性质特殊。若惊动人类大规模行动，其非理性且易引发混乱的决策模式，将严重阻碍任务进程。',
  ),
  { speaker: '周全', text: '勉强说的通。那为什么偏偏是我？' },
  xiaobai(
    '初步扫描显示，你对执行此任务所需的“精神链接切断工具”——代号“解”——适配性极高。通俗解释：你的体质特殊，是目前唯一能执行此操作的人选。',
  ),
  { speaker: '旁白', text: '你低头看看自己跑两步就喘的小身板，一脸狐疑。' },
  { speaker: '周全', text: '体质特殊？真的假的？', portraitEmotion: 'awkward' },
  xiaobai(
    '还有，数据分析表明，你与目标郑卿存在强烈的社会情感联结。你主动放弃任务、坐视其死亡的概率低于32.47%。',
  ),
  { speaker: '周全', text: '剩下不到70%？你也太小看我了。但是，如果我不答应会怎样？', portraitEmotion: 'frown' },
  xiaobai('……'),
  { speaker: '旁白', text: '白色小精灵沉默了一瞬。而你突然感到一阵汗毛倒竖。' },
  // 演出提示「场景突然变成全黑，只有周全和小白存在，BGM 切换为危机降临」：
  // BGM 是状态型（跳过也生效，归约会取「闪开」那一行覆盖回校园日常）；
  // 黑屏是表现型（跳过不补演，但收尾时无条件恢复）。
  { speaker: '周全', text: '呃……', bgm: 'ch01Crisis', blackout: true, dark: 'onset', portraitEmotion: 'awkward' },
  {
    speaker: '旁白',
    text: '你感觉似乎有一双无形的大手扼住了你全身，五脏六腑都要被挤压在一起。',
    dark: 'grip',
  },
  { speaker: '周全', text: '什么……情况……啊……好难受……', dark: 'squeeze' },
  {
    ...xiaobai('依据《灵能族战时管理条例》，我有权对阻碍任务执行的碳基生命体实施必要强制措施。'),
    dark: 'verdict',
  },
  {
    speaker: '周全',
    text: '哇啊啊啊……停……停下！姑奶奶……我错了……您……您说啥是啥！！',
    dark: 'crush',
  },
  // 「画面闪开，BGM 切回校园日常」：黑屏恢复 + 一记白闪，BGM 回到日常。
  // 压迫一松，人已经趴在地上：这一行给「大口喘气」的旁白，下一行他喘出声，再起身。
  {
    speaker: '旁白',
    text: '那无处不在的压迫感骤然消失，你大口喘着粗气，头上冒出细汗。',
    bgm: 'ch01Dorm',
    blackout: false,
    fx: 'flash',
    dark: 'release',
  },
  { speaker: '周全', text: '呼哧……', getUp: true },
  {
    speaker: CH01_AFTER_XIAOBAI_SPEAKER,
    role: 'xiaobai',
    text: '另外，如果拖延太久，清除因泰里矿点的难度会指数级上升。40地球日后，目标生命体征开始不可逆恶化。150地球日后，生命终结概率超过99.7%。',
  },
  { speaker: '周全', text: '（喘粗气）你的意思是……他会死？' },
  xiaobai('我等待你的抉择。'),
];

/**
 * 衔接段：沿用上一版独有的「接受任务 → 命名小白 → 许诺「解」」。
 *
 * 新稿停在这里会留下两个断点：第二节里它已经叫「小白」，「解」也必须在进梦域前交给他。
 * 所以把旧稿里**新稿没有重复的部分**接在后面；旧稿里与新稿重复的
 * （征召条款 / 150 天 / 为什么找我 / 杀死精神体）一律不再出现。
 */
export const CH01_AFTER_HANDOFF: readonly DialogueLine[] = [
  { speaker: '周全', text: '……行吧。不过得答应我几个条件。第一，我们有名字，我叫周全，他叫郑卿。' },
  { speaker: '小白', role: 'xiaobai', text: '允许。' },
  { speaker: '周全', text: '第二，别笑得那么瘆人。第三，你叫小白。', emotion: 'annoyed', emotionBy: 'zhou', portraitEmotion: 'frown' },
  { speaker: '小白', role: 'xiaobai', text: '「小白」……采纳。下一次进入梦域，我会赋予你「解」。' },
  { speaker: '旁白', text: '床上的郑卿翻了个身，呼噜声重新响起。' },
  { speaker: '周全', text: '老郑，等我。' },
];

/**
 * 播放的收尾段 = 新稿收尾 + 衔接段（同一条对话，跳过能一次收尾到结束卡）。
 *
 * 想只保留新稿（停在「我等待你的抉择。」）时，把场景里的 `CH01_AFTER_FINALE`
 * 换成 `CH01_AFTER_CLOSING` 即可。
 */
export const CH01_AFTER_FINALE: readonly DialogueLine[] = [
  ...CH01_AFTER_CLOSING,
  ...CH01_AFTER_HANDOFF,
];

/** 全段台词（按播放顺序），供「不重复台词」「每个跳过点」这类测试遍历。 */
export const CH01_AFTER_ALL_LINES: readonly DialogueLine[] = [
  ...CH01_AFTER_INTRO,
  ...CH01_AFTER_INQUIRY.questions.flatMap((question) => question.lines),
  ...CH01_AFTER_FINALE,
];
