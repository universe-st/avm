import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CH01_AFTER_ALL_LINES,
  CH01_AFTER_CLOSING,
  CH01_AFTER_FINALE,
  CH01_AFTER_HANDOFF,
  CH01_AFTER_INQUIRY,
  CH01_AFTER_INTRO,
} from '../src/story/ch01-after';
import { CH01_ASSET_KEYS } from '../src/assets/keys';
import { CH01_NODES } from '../src/story/ch01-dorm';
import type { DialogueLine } from '../src/story/dialogue';

/**
 * 「从宫殿逃出之后」剧本回归：逐句原文、分支菜单、演出 cue。
 *
 * 用户 2026-11-20 给的是**定稿台词**，所以这里锁到「说话人 + 逐字文本」，
 * 而不是只锁几个关键词；改稿时必须同步改这份镜像（与 `drama/交付/已落地剧本-对白与场景.md` 一致）。
 */

const XIAOBAI = '白色小精灵';

/** `[说话人, 台词]` 的紧凑镜像。 */
type Say = readonly [speaker: string, text: string];

const INTRO: readonly Say[] = [
  ['旁白', '你从地板上坐起来，身上全是冷汗。'],
  ['周全', '什么情况……刚才……是我做了个梦吗？'],
  [XIAOBAI, '否定。做梦的并不是你，而是ETH-HB-001B。'],
  ['周全', '001B？'],
  [XIAOBAI, '此为自动生成的编号，指代那位被你称为“老郑”的地球智慧生物。'],
  ['旁白', '你看了一眼那个呼呼大睡的舍友，郑卿，不知为什么，心里冒出一阵无名之火。'],
  ['周全', '他有名字！他叫郑卿！'],
  [XIAOBAI, '该星球有约5382个被称为“郑卿”的生物，使用编号称呼能减少歧义。'],
  ['周全', '……你……'],
  ['旁白', '她的话让你哑口无言。但这似乎并不是最要紧的事。小家伙注意到了你欲言又止的表情。'],
  [XIAOBAI, '你似乎还没有充分理解情况，根据相关规定，我有义务向你解释清楚。你可以进行提问。'],
];

const BRANCH_ZHENG: readonly Say[] = [
  ['旁白', '你伸手指了指躺在床上的郑卿。'],
  ['周全', '所以，他到底怎么了？'],
  [XIAOBAI, '他正因为意识能量被开采而陷入深度睡眠状态。'],
  ['周全', '意识能量到底是什么，很有用吗？'],
  [XIAOBAI, '在宇宙内，意识能量确实是一种重要的能源，它从智慧生物的思维活动中诞生，蜷缩在一个特殊的维度空间。'],
  ['周全', '是谁在开采它？'],
  [XIAOBAI, '因泰里文明。它们使用了一百二十六艘矿艇，以1.65光年为半径围绕地球，持续对地球上的智慧生物产生影响。'],
  ['周全', '……因泰里。原来最近新闻上说的“沉睡症”，是外星人搞的鬼吗？'],
  [XIAOBAI, '确定。'],
];

const BRANCH_SCENE: readonly Say[] = [
  ['周全', '那么刚才，你把我带去那个地方，是哪里？'],
  [XIAOBAI, 'ETH-HB-001B的梦域空间。'],
  ['周全', '梦域空间？'],
  [XIAOBAI, '由人类的梦境为基底，在因泰里的技术下筑造而成的空间。'],
  ['周全', '那几个铁皮怪物是？'],
  [XIAOBAI, '因泰里文明的矿工。信息态模因机器人。职责：守卫矿点，清除干扰源，确保“意识能量”持续开采'],
  ['周全', '他们要怎么开采意识能量？'],
  [XIAOBAI, '通过梦域中的行为不断刺激梦主的欲望。'],
  ['周全', '他的欲望？'],
  ['旁白', '你的耳边传来一阵鼾声，伴随着吞咽口水的声音。'],
  ['周全', '他是想当皇帝还是想把班主任当太监使唤？'],
  [XIAOBAI, '这个问题我无法解答。'],
  ['周全', '那为什么他在梦里不认识我？'],
  [XIAOBAI, '梦主在自身梦域拥有绝对认知主导权。你作为外来者，身份未被其梦域逻辑接纳。'],
];

const BRANCH_IDENTITY: readonly Say[] = [
  ['周全', '那么，你是谁？为什么会从我的手机里钻出来？'],
  [XIAOBAI, '我是灵能族为抵抗因泰里的扩张，派往各个星球的指引者，编号TEAR-27。灵能族属于能量生命，其生命本质是宇宙空间中以复杂的组合频率振动的谐波。我可以借助你们的通讯设备在一定范围内穿行。'],
  ['周全', '那么，你想做什么？'],
  [XIAOBAI, '指引地球上的智慧生命，协助切断因泰里的意识能量供应渠道。'],
  ['周全', '……'],
];

const CLOSING: readonly Say[] = [
  ['周全', '所以，我能怎么帮你？'],
  [XIAOBAI, '潜入ETH-HB-001B的梦境，将他杀死。'],
  ['周全', '你让我杀人？！那不可能！'],
  [XIAOBAI, '杀死梦中的精神体不会导致其在现实中死亡，相反，会令其脱离梦境，并很难再次陷入沉睡症状态。'],
  ['旁白', '你松了一口气，但还是盯着这个小家伙，眼中的疑惑更甚。'],
  ['周全', '那么为什么找我？你们外星人想拯救地球，不应该去找国家领袖、军队、联合国吗？我只是一个学生而已。'],
  [XIAOBAI, '你提及的种群内具备高权力的组织和个体，思维模式往往固化严重，沟通成本过高，效率低下。且此任务性质特殊。若惊动人类大规模行动，其非理性且易引发混乱的决策模式，将严重阻碍任务进程。'],
  ['周全', '勉强说的通。那为什么偏偏是我？'],
  [XIAOBAI, '初步扫描显示，你对执行此任务所需的“精神链接切断工具”——代号“解”——适配性极高。通俗解释：你的体质特殊，是目前唯一能执行此操作的人选。'],
  ['旁白', '你低头看看自己跑两步就喘的小身板，一脸狐疑。'],
  ['周全', '体质特殊？真的假的？'],
  [XIAOBAI, '还有，数据分析表明，你与目标郑卿存在强烈的社会情感联结。你主动放弃任务、坐视其死亡的概率低于32.47%。'],
  ['周全', '剩下不到70%？你也太小看我了。但是，如果我不答应会怎样？'],
  [XIAOBAI, '……'],
  ['旁白', '白色小精灵沉默了一瞬。而你突然感到一阵汗毛倒竖。'],
  ['周全', '呃……'],
  ['旁白', '你感觉似乎有一双无形的大手扼住了你全身，五脏六腑都要被挤压在一起。'],
  ['周全', '什么……情况……啊……好难受……'],
  [XIAOBAI, '依据《灵能族战时管理条例》，我有权对阻碍任务执行的碳基生命体实施必要强制措施。'],
  ['周全', '哇啊啊啊……停……停下！姑奶奶……我错了……您……您说啥是啥！！'],
  ['旁白', '那无处不在的压迫感骤然消失，你大口喘着粗气，头上冒出细汗。'],
  ['周全', '呼哧……'],
  [XIAOBAI, '另外，如果拖延太久，清除因泰里矿点的难度会指数级上升。40地球日后，目标生命体征开始不可逆恶化。150地球日后，生命终结概率超过99.7%。'],
  ['周全', '（喘粗气）你的意思是……他会死？'],
  [XIAOBAI, '我等待你的抉择。'],
];

const HANDOFF: readonly Say[] = [
  ['周全', '行吧。不过，你得答应我三个条件。'],
  [XIAOBAI, '允许。'],
  ['周全', '首先，我们是有名字的，我叫周全，他叫郑卿，你不要拿那一串代号来称呼我们。'],
  [XIAOBAI, '没有问题。'],
  ['周全', '还有，不要一言不合就对我使用刚才那招啊！'],
  [XIAOBAI, '理解，下次我会提前予以警告。'],
  ['周全', '警告不听还是要整我是吧？！'],
  ['旁白', '你只感觉一阵冷风从脖颈吹过。记忆中那压抑的感觉仿佛又涌上心头。'],
  ['周全', '好……好吧……那么第三个条件。你的那个名字，TEAR什么的，我不会念。以后我就叫你小白吧。'],
  [XIAOBAI, '小白……'],
  ['旁白', '这白色的小家伙似乎陷入了思索，银白色的光雾瞬间在小天使头顶剧烈翻涌，凝聚成几个不断扭曲、坍塌的复杂数学符号，又猛地消散。'],
  [XIAOBAI, '“小白”发音与“TEAR-27”相似度低于7%。该称谓在哺乳动物生物学中具有特定指代，存在误导性……'],
  ['周全', '用得着这么严肃吗……'],
  [XIAOBAI, '但……根据碳基文明非正式命名行为对“亲和力”及“合作意愿”存在正向加成的数据模型……采纳此命名造成的效率损失……处于可容忍阈值内。'],
  ['旁白', '光雾平息。小天使平静地悬浮着。'],
  ['小白', '代号更新确认。‘小白’，接受此非正式命名。'],
  ['周全', '好耶！'],
  ['旁白', '你不知道为何，有些激动。或许是你的恶趣味得逞，又或者是因为你竟然在和一个比你强大的多的生物的博弈中取得了些微优势……也许吧。'],
  ['周全', '咳……那么，我们什么时候开始？'],
  ['小白', '你可以做一些准备。准备完成之后，在这里跟我对话。我会带你再次进入郑卿的梦域空间。'],
];

function saysOf(lines: readonly DialogueLine[]): Say[] {
  return lines.map((line) => [line.speaker ?? '', line.text] as const);
}

describe('战后剧本 · 原文与顺序', () => {
  it('第一段（醒来与编号之争）逐字一致', () => {
    expect(saysOf(CH01_AFTER_INTRO)).toEqual(INTRO);
  });

  it('三个提问分支逐字一致，选项顺序与文案照稿', () => {
    expect(CH01_AFTER_INQUIRY.questions.map((question) => question.label)).toEqual([
      '郑卿怎么了？',
      '刚才是怎么回事？',
      '你是谁？',
    ]);
    expect(CH01_AFTER_INQUIRY.closingLabel).toBe('你想让我做什么。');
    const byId = new Map(CH01_AFTER_INQUIRY.questions.map((question) => [question.id, question]));
    expect(saysOf(byId.get('zheng')?.lines ?? [])).toEqual(BRANCH_ZHENG);
    expect(saysOf(byId.get('scene')?.lines ?? [])).toEqual(BRANCH_SCENE);
    expect(saysOf(byId.get('identity')?.lines ?? [])).toEqual(BRANCH_IDENTITY);
  });

  it('新稿收尾段逐字一致，最后一句是「我等待你的抉择。」', () => {
    expect(saysOf(CH01_AFTER_CLOSING)).toEqual(CLOSING);
    expect(CH01_AFTER_CLOSING.at(-1)?.text).toBe('我等待你的抉择。');
  });

  it('衔接段逐字照 2026-11-26 新稿（三个条件 → 定名 → 约定下次进梦域）', () => {
    expect(saysOf(CH01_AFTER_HANDOFF)).toEqual(HANDOFF);
    // 显示名只在「代号更新确认」那一行切成「小白」：之前一律是「白色小精灵」。
    const namedAt = CH01_AFTER_HANDOFF.findIndex((line) => line.speaker === '小白');
    expect(namedAt).toBeGreaterThan(0);
    expect(CH01_AFTER_HANDOFF[namedAt]?.text).toContain('代号更新确认');
    for (const line of CH01_AFTER_HANDOFF.slice(0, namedAt)) {
      expect(line.speaker).not.toBe('小白');
    }
    // 新稿里已经说过的内容不再抄一遍（150 天 / 为什么找我 / 杀死精神体）。
    const newText = CH01_AFTER_ALL_LINES.slice(
      0,
      CH01_AFTER_ALL_LINES.length - HANDOFF.length,
    ).map((line) => line.text);
    for (const line of CH01_AFTER_HANDOFF) {
      expect(newText, `衔接段重复了新稿：${line.text}`).not.toContain(line.text);
    }
  });

  it('播放顺序 = intro → 三个分支 → 收尾段（含衔接段）', () => {
    expect(CH01_AFTER_FINALE).toEqual([...CH01_AFTER_CLOSING, ...CH01_AFTER_HANDOFF]);
    expect(CH01_AFTER_ALL_LINES).toEqual([
      ...CH01_AFTER_INTRO,
      ...(CH01_AFTER_INQUIRY.questions[0]?.lines ?? []),
      ...(CH01_AFTER_INQUIRY.questions[1]?.lines ?? []),
      ...(CH01_AFTER_INQUIRY.questions[2]?.lines ?? []),
      ...CH01_AFTER_FINALE,
    ]);
    // 三个分支的排布也和镜像一致（防止有人调换问题顺序却没改文档）。
    expect(CH01_AFTER_INQUIRY.questions[0]?.id).toBe('zheng');
    expect(CH01_AFTER_INQUIRY.questions[1]?.id).toBe('scene');
    expect(CH01_AFTER_INQUIRY.questions[2]?.id).toBe('identity');
  });

  it('台词不跟本节其它节点重复（不把同一句再说一遍）', () => {
    // 和本节其它节点比（after 自己就是这段剧本，不能拿它跟自己比）。
    const others = Object.entries(CH01_NODES)
      .filter(([id]) => id !== 'after')
      .flatMap(([, node]) => node.lines)
      .map((line) => line.text);
    for (const line of CH01_AFTER_ALL_LINES) {
      if (line.text === '……') continue; // 省略号是语气，不算「同一句」
      expect(others, `重复了本节已有台词：${line.text}`).not.toContain(line.text);
    }
    // 同一段内部也不重复（省略号除外）。
    const seen = new Set<string>();
    for (const line of CH01_AFTER_ALL_LINES) {
      if (line.text === '……') continue;
      expect(seen.has(line.text), `剧本内部重复：${line.text}`).toBe(false);
      seen.add(line.text);
    }
  });

  it('after 节点只放第一段；分支与收尾不能被流程当直线播出去', () => {
    expect(CH01_NODES.after.lines).toBe(CH01_AFTER_INTRO);
    const nodeTexts = CH01_NODES.after.lines.map((line) => line.text);
    expect(nodeTexts).not.toContain(CLOSING[0]?.[1]);
    expect(nodeTexts).not.toContain(BRANCH_ZHENG[0]?.[1]);
  });
});

describe('战后剧本 · 演出 cue', () => {
  it('小白的每一句都带 role（显示名会从「白色小精灵」变成「小白」，身份不变）', () => {
    const xiaobaiLines = CH01_AFTER_ALL_LINES.filter(
      (line) => line.speaker === XIAOBAI || line.speaker === '小白',
    );
    expect(xiaobaiLines.length).toBeGreaterThan(0);
    for (const line of xiaobaiLines) {
      expect(line.role, `小白台词缺 role：${line.text}`).toBe('xiaobai');
    }
    expect(
      CH01_AFTER_ALL_LINES.some((line) => line.speaker === '？？？'),
      '这一段不该再出现「？？？」',
    ).toBe(false);
  });

  it('BGM 三次切换：进场景校园日常 → 黑屏危机降临 → 闪开切回校园日常', () => {
    expect(CH01_AFTER_INTRO[0]?.bgm).toBe('ch01Dorm');
    const cueLines = CH01_AFTER_ALL_LINES.filter((line) => line.bgm !== undefined);
    expect(cueLines.map((line) => line.bgm)).toEqual(['ch01Dorm', 'ch01Crisis', 'ch01Dorm']);
    expect(cueLines[1]?.blackout).toBe(true);
    expect(cueLines[2]?.blackout).toBe(false);
    // 「闪开」那行要有一记白闪，且它确实排在黑屏行之后。
    expect(cueLines[2]?.fx).toBe('flash');
    expect(CH01_AFTER_ALL_LINES.indexOf(cueLines[2]!)).toBeGreaterThan(
      CH01_AFTER_ALL_LINES.indexOf(cueLines[1]!),
    );
  });

  it('三处愤怒气泡都挂在周全头上', () => {
    const angry = CH01_AFTER_ALL_LINES.filter((line) => line.emotion === 'angry');
    expect(angry.map((line) => line.text)).toEqual([
      '他有名字！他叫郑卿！',
      '你让我杀人？！那不可能！',
      '警告不听还是要整我是吧？！',
    ]);
    for (const line of angry) {
      expect(line.emotionBy).toBe('zhou');
    }
  });

  it('命名段的演出 cue：冷风 / 光雾三拍 / 星火 / 确认音各就各位', () => {
    const chill = CH01_AFTER_HANDOFF.find((line) => line.fx === 'chill');
    expect(chill?.sfx).toBe(CH01_ASSET_KEYS.audio.coldWind);
    expect(chill?.text).toContain('一阵冷风');

    const naming = CH01_AFTER_HANDOFF.filter((line) =>
      ['naming', 'naming-collapse', 'naming-settle'].includes(line.fx ?? ''),
    );
    expect(naming.map((line) => line.fx)).toEqual(['naming', 'naming-collapse', 'naming-settle']);
    // 翻涌从「小白……」那一行起，坍塌在「但……」那行，平息在「光雾平息」旁白。
    expect(naming[0]?.text).toBe('小白……');
    expect(naming[1]?.text).toContain('可容忍阈值');
    expect(naming[2]?.text).toContain('光雾平息');
    // 光雾数据流音效只挂在描述光雾的旁白上，且只挂一次。
    const compute = CH01_AFTER_ALL_LINES.filter(
      (line) => line.sfx === CH01_ASSET_KEYS.audio.xiaobaiCompute,
    );
    expect(compute).toHaveLength(1);
    expect(compute[0]?.speaker).toBe('旁白');

    // 「好耶！」= 星火 + 开心气泡；确认音挂在「代号更新确认」那一行。
    const happy = CH01_AFTER_HANDOFF.find((line) => line.fx === 'sparkle');
    expect(happy?.text).toBe('好耶！');
    expect(happy?.emotion).toBe('happy');
    const confirm = CH01_AFTER_HANDOFF.filter(
      (line) => line.sfx === CH01_ASSET_KEYS.audio.namingConfirm,
    );
    expect(confirm).toHaveLength(1);
    expect(confirm[0]?.text).toContain('代号更新确认');
  });

  it('分支 2 的鼾声行真的挂了鼾声音效，且只挂一次', () => {
    const snore = CH01_AFTER_ALL_LINES.filter(
      (line) => line.sfx === CH01_ASSET_KEYS.audio.snore,
    );
    expect(snore).toHaveLength(1);
    expect(snore[0]?.text).toContain('鼾声');
    expect(snore[0]?.speaker).toBe('旁白');
  });

  it('黑屏 cue 只有「进入/恢复」两行，且都在收尾段', () => {
    const blackout = CH01_AFTER_ALL_LINES.filter((line) => line.blackout !== undefined);
    expect(blackout.map((line) => line.blackout)).toEqual([true, false]);
    expect(CH01_AFTER_CLOSING).toContain(blackout[0]);
    expect(CH01_AFTER_CLOSING).toContain(blackout[1]);
  });
});

describe('场景接线（源码护栏）', () => {
  const scene = readFileSync('src/scenes/ch01-dorm-scene.ts', 'utf8');

  it('选项菜单走 inquiry 纯模型 + 可复用 UI，场景里不出现第二份选项文案', () => {
    expect(scene).toContain("from '../ui/story-choice'");
    expect(scene).toContain('inquiryMenuItems(CH01_AFTER_INQUIRY');
    expect(scene).toContain('markAsked(CH01_AFTER_INQUIRY');
    expect(scene).toContain('questionById(CH01_AFTER_INQUIRY');
    // 选项文案只能在 story 数据里；场景写死文案就说明又造了一套。
    expect(scene).not.toContain('郑卿怎么了？');
    expect(scene).not.toContain('你想让我做什么');
  });

  it('黑场胁迫段的压迫演出接在场景生命周期上（建/收/拆都在同一处）', () => {
    expect(scene).toContain("from '../ui/dark-pressure'");
    expect(scene).toContain('new DarkPressureRig(');
    // 自然过完 / 跳过 / 切场都要收：setBlackout(false) 与 SHUTDOWN/resetState。
    expect(scene).toContain('this.releaseDarkPressure()');
    expect(scene).toContain('this.dark?.destroy()');
  });

  it('命名段光雾运算接在场景生命周期上（建 / 收 / 拆同一处）', () => {
    expect(scene).toContain("from '../ui/naming-fx'");
    expect(scene).toContain('new NamingFxRig(');
    // 自然播完 / 跳过 / 切场都要拆：finishDialogue 与 SHUTDOWN 各一处。
    expect(scene).toContain('this.namingFx?.destroy()');
    // 命名播完交回自由活动，玩家自己找小白开口才进结束卡。
    expect(scene).toContain('this.flow.beginPrep()');
    expect(scene).toContain('this.flow.finishPrep()');
  });

  it('三个问题都问完才播收尾段（afterStage 只有 closing 才推进节点）', () => {
    expect(scene).toContain("this.afterStage = 'closing'");
    expect(scene).toContain('this.startDialogue(CH01_AFTER_FINALE)');
    // 「先记已问、再播分支」：跳过也算问过，菜单不会重复列出来。
    const markAt = scene.indexOf('markAsked(CH01_AFTER_INQUIRY');
    const playAt = scene.indexOf('this.startDialogue(question.lines)');
    expect(markAt).toBeGreaterThanOrEqual(0);
    expect(playAt).toBeGreaterThan(markAt);
  });
});

describe('docs 台词镜像（drama/交付/已落地剧本-对白与场景.md）', () => {
  const mirror = readFileSync('drama/交付/已落地剧本-对白与场景.md', 'utf8');

  it('新稿每一句都同步进了镜像', () => {
    for (const line of CH01_AFTER_ALL_LINES) {
      if (line.text === '……') continue;
      expect(mirror, `镜像缺这句：${line.text}`).toContain(line.text);
    }
  });

  it('三个选项、收尾选项与三次 BGM/黑屏提示都在镜像里', () => {
    for (const question of CH01_AFTER_INQUIRY.questions) {
      expect(mirror).toContain(question.label);
    }
    expect(mirror).toContain(CH01_AFTER_INQUIRY.closingLabel);
    expect(mirror).toContain('BGM 切回《校园日常》');
    expect(mirror).toContain('场景突然全黑');
  });
});
