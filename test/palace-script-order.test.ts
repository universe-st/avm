import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CH01_NODES } from '../src/story/ch01-dorm';
import { PALACE_BEATS, PALACE_TEXTURES } from '../src/story/ch01-palace';
import type { PalaceBeat, PalaceSay } from '../src/story/palace-player';

/**
 * 金殿对白顺序（2026-11-18 用户邮件给定剧本）的护栏。
 *
 * 背景：上一版把「你不是罪该万死吗，饶什么命啊？」「你爸知道你这么牛x吗？！」当两句孤立嘴硬，
 * 中间没有郑卿的反应，玩家读起来是「接不上」。用户给了完整的一段，这里逐句锁死：
 *
 *   周全（心里）：你不是罪该万死吗 → 不对不对，是吐槽这个的时候吗？
 *   周全：老郑！你到底什么情况？！
 *   郑卿：你这刺客……竟敢跟朕称兄道弟起来了？
 *   周全：谁和你称兄道弟了？你想当我儿子我还不乐意呢！
 *   旁白：你看到郑卿脸上青筋暴起。 → 〔郑卿·愤怒气泡〕
 *   郑卿：……哼，真是不知天高地厚！拖出午门，砍了吧！
 *   侍卫：是！
 *   旁白：你只感觉边上两个侍卫狠狠拉扯你的双臂，就要把你拽出去。 → 〔周全·震惊气泡〕
 *   周全：疯了吧你？！你在这儿玩什么cosplay！你爸知道你这么牛x吗？
 *   旁白：轰隆——……
 *
 * 顺序断言只看 `say` 序列：任何漏句、并句、重复句都会让数组对不上。
 * 气泡与立绘是 `act` 拍，用「夹在哪两句之间」来锁（它们必须真的挂在那两句中间）。
 */

interface ScriptLine {
  readonly speaker: string;
  readonly text: string;
}

const SCRIPT: readonly ScriptLine[] = [
  { speaker: '周全', text: '（……你不是罪该万死吗，饶什么命啊？）' },
  { speaker: '周全', text: '（……不对不对，是吐槽这个的时候吗？）' },
  { speaker: '周全', text: '老郑！你到底什么情况？！' },
  { speaker: '郑卿', text: '你这刺客，好大的胆子！竟敢跟朕称兄道弟起来了？' },
  { speaker: '周全', text: '谁和你称兄道弟了？你想当我儿子我还不乐意呢！' },
  { speaker: '旁白', text: '你看到郑卿脸上青筋暴起。' },
  { speaker: '郑卿', text: '……哼，真是不知天高地厚！拖出午门，砍了吧！' },
  { speaker: '侍卫', text: '是！' },
  { speaker: '旁白', text: '你只感觉边上两个侍卫狠狠拉扯你的双臂，就要把你拽出去。' },
  { speaker: '周全', text: '疯了吧你？！你在这儿玩什么cosplay！你爸知道你这么牛x吗？' },
  {
    speaker: '旁白',
    text: '轰隆——整座大殿像地震一样剧烈一晃，龙椅上的皇帝瞬间石化，脸上那丝满足的笑僵住了。',
  },
];

const isAct = (beat: PalaceBeat): beat is Extract<PalaceBeat, { kind: 'act' }> =>
  beat.kind === 'act';

const isSay = (beat: PalaceBeat): beat is PalaceSay => beat.kind === 'say';

const sayIndexOf = (needle: string): number =>
  PALACE_BEATS.findIndex((beat) => isSay(beat) && beat.text.includes(needle));

/** 第 index 拍之后、endIndex 之前的第一拍 act；找不到返回 -1。 */
const actBetween = (index: number, endIndex: number): number =>
  PALACE_BEATS.findIndex((beat, at) => at > index && at < endIndex && isAct(beat));

describe('金殿对白顺序：用户给定剧本逐句对', () => {
  it('这 11 句按顺序、按说话人完全一致（中间不许多一句）', () => {
    const start = sayIndexOf('饶什么命');
    const end = sayIndexOf('轰隆——');
    expect(start, '找不到「你不是罪该万死吗」').toBeGreaterThanOrEqual(0);
    expect(end, '找不到「轰隆——」').toBeGreaterThan(start);

    const block = PALACE_BEATS.slice(start, end + 1)
      .filter(isSay)
      .map((beat) => ({ speaker: beat.speaker, text: beat.text }));
    expect(block).toEqual(SCRIPT);
  });

  it('合入旧句时没有重复：心里那句、爆发那句各只出现一次', () => {
    const says = PALACE_BEATS.filter(isSay);
    expect(says.filter((beat) => beat.text.includes('你不是罪该万死吗')).length).toBe(1);
    expect(says.filter((beat) => beat.text.includes('你爸知道')).length).toBe(1);
    expect(says.filter((beat) => beat.text.includes('老郑！你到底什么情况')).length).toBe(1);
    // 上一版的两句孤句不许残留
    expect(says.some((beat) => beat.text === '你不是罪该万死吗，饶什么命啊？')).toBe(false);
    expect(says.some((beat) => beat.text === '你爸知道你这么牛x吗？！')).toBe(false);
  });

  it('「你爸知道你这么牛x吗？」的下一句台词就是「轰隆——」，中间不断链', () => {
    const dad = sayIndexOf('你爸知道');
    const next = PALACE_BEATS.slice(dad + 1).find(isSay);
    expect(next?.text).toContain('轰隆——');
    // 中间只允许「收立绘 + 震屏」这一拍演出，不允许再插台词/别的说话人
    const between = PALACE_BEATS.slice(dad + 1, sayIndexOf('轰隆——'));
    expect(between.every(isAct)).toBe(true);
  });
});

describe('金殿：侍卫应命「是！」', () => {
  it('说话人「侍卫」只说这一句，位置在郑卿喝令之后', () => {
    const says = PALACE_BEATS.filter(isSay);
    expect(says.filter((beat) => beat.speaker === '侍卫').map((beat) => beat.text)).toEqual(['是！']);
    // 按「台词序列」比，不是按拍子下标：两句之间还夹着一拍换立绘
    const sayTexts = says.map((beat) => beat.text);
    const at = sayTexts.indexOf('是！');
    expect(at).toBeGreaterThan(0);
    expect(sayTexts[at - 1]).toContain('拖出午门');
  });

  it('开口前弹出侍卫立绘、说完立刻收起', () => {
    const line = sayIndexOf('是！');
    const before = PALACE_BEATS[line - 1];
    expect(before && isAct(before)).toBe(true);
    if (!before || !isAct(before)) return;
    expect(
      before.actions.some(
        (action) => action.kind === 'portrait' && action.key === PALACE_TEXTURES.portraitShiwei,
      ),
      '侍卫那一句前面没挂 party 立绘',
    ).toBe(true);
    // 左边入画：右侧留给郑卿，两个脑袋不能叠在一起
    expect(
      before.actions.some(
        (action) => action.kind === 'portrait' && action.key === PALACE_TEXTURES.portraitShiwei && action.side === 'left',
      ),
    ).toBe(true);

    const after = PALACE_BEATS[line + 1];
    expect(after && isAct(after)).toBe(true);
    if (!after || !isAct(after)) return;
    expect(after.actions.some((action) => action.kind === 'portraitHide')).toBe(true);
  });

  it('立绘是专用大图（720×900），不是把 200×420 的精灵图放大', () => {
    expect(PALACE_TEXTURES.portraitShiwei).toBe('img.char.palace.portrait_shiwei');
    expect(PALACE_TEXTURES.portraitShiwei).not.toBe(PALACE_TEXTURES.eunuch);
  });
});

describe('金殿：两条表情气泡真的挂在该挂的地方', () => {
  const emotionActs = (): Array<{ at: number; by: string; emotion: string }> =>
    PALACE_BEATS.map((beat, at) =>
      isAct(beat)
        ? beat.actions
            .filter((action) => action.kind === 'emotion')
            .map((action) =>
              action.kind === 'emotion'
                ? { at, by: action.by as string, emotion: action.emotion as string }
                : { at, by: '', emotion: '' },
            )
        : [],
    ).flat();

  it('郑卿 = 愤怒：在「青筋暴起」之后、「拖出午门」之前', () => {
    const anger = emotionActs().filter((entry) => entry.by === 'zheng');
    expect(anger.map((entry) => entry.emotion)).toEqual(['angry']);
    const at = anger[0]?.at ?? -1;
    expect(at).toBeGreaterThan(sayIndexOf('青筋暴起'));
    expect(at).toBeLessThan(sayIndexOf('拖出午门'));
  });

  it('周全 = 震惊：在「两个侍卫狠狠拉扯」之后、「疯了吧你」之前', () => {
    const shock = emotionActs().filter((entry) => entry.by === 'zhou');
    expect(shock.map((entry) => entry.emotion)).toEqual(['surprised']);
    const at = shock[0]?.at ?? -1;
    expect(at).toBeGreaterThan(sayIndexOf('狠狠拉扯'));
    expect(at).toBeLessThan(sayIndexOf('疯了吧你'));
  });

  it('气泡只给这两个人、不夹在台词中间（是独立一拍 act，先冒泡再开口）', () => {
    for (const entry of emotionActs()) {
      expect(['zhou', 'zheng']).toContain(entry.by);
      const beat = PALACE_BEATS[entry.at];
      expect(beat && isAct(beat)).toBe(true);
    }
    // 「旁白说青筋 → 气泡 → 郑卿发火」之间不许有别的说话动作
    expect(actBetween(sayIndexOf('青筋暴起'), sayIndexOf('拖出午门'))).toBeGreaterThanOrEqual(0);
  });
});

describe('金殿：现场立绘都走同一套对位（源码护栏）', () => {
  const source = readFileSync('src/scenes/ch01-palace-scene.ts', 'utf8');

  it('表情气泡按贴图头顶表定位，不许写成固定的「落点上移 xxx」', () => {
    expect(source).toContain('palaceHeadPointFor(');
    expect(source).toContain('case \'emotion\':');
    expect(source).not.toMatch(/actor\.y\s*-\s*\d{3}/);
  });

  it('气泡挂在世界层角色的头顶（先套 worldRoot 的缩放/位移，镜头推近才不会飘）', () => {
    expect(source).toMatch(/const scale = root\?\.scaleX \?\? 1;/);
    expect(source).toMatch(/\(actor\.y \+ head\.offsetY\) \* scale/);
    expect(source).toMatch(/\(actor\.x \+ head\.offsetX\) \* scale/);
  });

  it('SHUTDOWN 里销毁气泡（否则切战斗后定时器还指着旧场景）', () => {
    expect(source).toMatch(/this\.emotionBubble\?\.destroy\(\);[\s\S]*?this\.emotionBubble = null;/);
  });
});

describe('台词镜像与寝室改稿（用户 2026-11-18 邮件）', () => {
  const mirror = readFileSync('drama/交付/已落地剧本-对白与场景.md', 'utf8');

  it('drama 台词镜像收录了金殿当前剧本的每一句台词（镜像不许落后）', () => {
    const missing = PALACE_BEATS.filter(isSay)
      .map((beat) => beat.text)
      .filter((text) => !mirror.includes(text));
    expect(missing, '这些台词没同步进 drama 镜像').toEqual([]);
  });

  it('寝室书桌那句改成「老郑呼噜打的震天响，搞得我一个字也看不进去。」，说话人仍是周全', () => {
    const desk = CH01_NODES.desk.lines;
    const line = desk.find((entry) => entry.text.includes('呼噜'));
    expect(line?.speaker).toBe('周全');
    expect(line?.text).toBe('老郑呼噜打的震天响，搞得我一个字也看不进去。');
    expect(desk.some((entry) => entry.text.includes('主角正被反派按在地上'))).toBe(false);
  });

  it('drama 镜像里也是这句新的，旧句已删', () => {
    expect(mirror).toContain('老郑呼噜打的震天响，搞得我一个字也看不进去。');
    expect(mirror).not.toContain('主角正被反派按在地上');
  });
});
