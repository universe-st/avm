import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PALACE_BEATS,
  PALACE_SPEAKER_PORTRAIT,
  PALACE_TEXTURES,
  palacePortraitForSpeaker,
  reducePortraitForSay,
  XIAOBAI_SPEAKER,
} from '../src/story/ch01-palace';
import type { PalaceBeat, PalaceSay } from '../src/story/palace-player';
import type { PortraitEmotion } from '../src/story/dialogue';

/**
 * 金殿「说话人 ↔ 立绘」对位的护栏。
 *
 * 2026-11-18 用户截图反馈：底部说话人写「周全」，屏幕上却挂着郑卿（黄龙袍小皇帝）的立绘。
 * 根因不是某一句写错，而是**立绘全靠 act 拍手动换**：郑卿说完、周全接话时没人换回来，
 * 于是上一句的脸一直挂着。同类隐患还有「楚……楚老师？！」（挂的是楚公公的脸）、
 * 太监开口时没有立绘、矿工（已补 `portrait_miner`）。
 *
 * 现在的契约（`src/story/ch01-palace.ts`）：
 *   1. 每个说话人都在 `PALACE_SPEAKER_PORTRAIT` 里明确表态（有立绘给 key，没有给 null）；
 *   2. 每句台词开口前跑 `reducePortraitForSay()`——换人必须换脸，没立绘的人不许顶别人的脸；
 *   3. 场景把这条归约接在 say 分支上（静态断言），数据漏写也不会串脸。
 *
 * 这里的「播放」用的是和场景同一个归约函数，不是另写一套判定。
 */

interface PortraitState {
  readonly key: string;
  readonly side: 'left' | 'right';
}

interface PlayedLine {
  readonly at: number;
  readonly speaker: string;
  readonly text: string;
  readonly emotion?: PortraitEmotion;
  readonly portrait: PortraitState | null;
}

const isSay = (beat: PalaceBeat): beat is PalaceSay => beat.kind === 'say';

/** 按场景的真实顺序走一遍：act 先改立绘，台词开口前再过一遍对位归约。 */
function playPortraits(): PlayedLine[] {
  let portrait: PortraitState | null = null;
  const lines: PlayedLine[] = [];
  PALACE_BEATS.forEach((beat, at) => {
    if (beat.kind === 'act') {
      for (const action of beat.actions) {
        if (action.kind === 'portrait') portrait = { key: action.key, side: action.side ?? 'right' };
        else if (action.kind === 'portraitHide') portrait = null;
      }
      return;
    }
    const step = reducePortraitForSay(beat.speaker, portrait, beat.portraitEmotion);
    if (step.action === 'show') portrait = { key: step.key, side: step.side };
    else if (step.action === 'hide') portrait = null;
    lines.push({
      at,
      speaker: beat.speaker ?? '',
      text: beat.text,
      emotion: beat.portraitEmotion,
      portrait,
    });
  });
  return lines;
}

const SPEAKERS_WITHOUT_PORTRAIT = new Set(['旁白']);

describe('金殿：每句台词开口时，立绘就是说话人本人', () => {
  const lines = playPortraits();

  it('所有非旁白说话人都在对位表里表态（新增角色必须补表，不能默认挂别人的脸）', () => {
    const missing = lines
      .map((line) => line.speaker)
      .filter((speaker) => !SPEAKERS_WITHOUT_PORTRAIT.has(speaker))
      .filter((speaker) => palacePortraitForSpeaker(speaker) === undefined);
    expect([...new Set(missing)], '这些说话人没在对位表里表态').toEqual([]);
  });

  it('有立绘的说话人：台词显示那一刻，屏幕上必须是他自己的立绘', () => {
    const wrong = lines
      .map((line) => {
        const entry = palacePortraitForSpeaker(line.speaker, line.emotion);
        if (!entry) return null; // 旁白 / 明确无立绘（矿工）
        return line.portrait?.key === entry.key
          ? null
          : `${line.speaker}「${line.text.slice(0, 12)}」挂的是 ${line.portrait?.key ?? '空'}`;
      })
      .filter((problem): problem is string => problem !== null);
    expect(wrong).toEqual([]);
  });

  it('矿工（裂皮后的铁皮骨架）：有自己的立绘，开口时必须挂 portrait_miner', () => {
    const minerLines = lines.filter((line) => line.speaker === '矿工');
    expect(minerLines.length).toBeGreaterThan(0);
    for (const line of minerLines) {
      expect(line.portrait?.key, `矿工「${line.text}」开口时立绘不对`).toBe(
        PALACE_TEXTURES.portraitMiner,
      );
    }
  });

  it('对位表里 null 只会出现在「台词里没人开口」的角色身上（矿工已补图）', () => {
    const nullSpeakers = Object.entries(PALACE_SPEAKER_PORTRAIT)
      .filter(([, entry]) => entry === null)
      .map(([speaker]) => speaker);
    for (const speaker of nullSpeakers) {
      const saysSomething = lines.some((line) => line.speaker === speaker);
      expect(saysSomething, `${speaker} 在表里是 null 却有台词开口`).toBe(false);
    }
  });

  it('旁白不在对位表里，且开口时收脸（旁白不挂立绘）；未登记的人同样不动立绘', () => {
    expect(palacePortraitForSpeaker('旁白')).toBeUndefined();
    expect(palacePortraitForSpeaker(undefined)).toBeUndefined();
    expect(palacePortraitForSpeaker('没有登记的人')).toBeUndefined();
    expect(reducePortraitForSay('旁白', { key: PALACE_TEXTURES.portraitZheng })).toEqual({
      action: 'hide',
    });
    expect(reducePortraitForSay('没有登记的人', { key: PALACE_TEXTURES.portraitZheng })).toEqual({
      action: 'hide',
    });
  });
});

describe('金殿：2026-11-18 实机串脸的那几句（回归）', () => {
  const byText = (needle: string): PlayedLine => {
    const line = playPortraits().find((entry) => entry.text.includes(needle));
    expect(line, `找不到台词「${needle}」`).toBeDefined();
    return line as PlayedLine;
  };

  it('「谁和你称兄道弟了？…」是周全在说话 → 挂周全的慌张特写（不再是郑卿）', () => {
    const line = byText('谁和你称兄道弟');
    expect(line.speaker).toBe('周全');
    expect(line.portrait?.key).toBe(PALACE_TEXTURES.portraitZhouPanic);
  });

  it('「楚……楚老师？！」是周全在说话 → 挂周全，不挂楚公公', () => {
    const line = byText('楚老师');
    expect(line.speaker).toBe('周全');
    expect(line.portrait?.key).toBe(PALACE_TEXTURES.portraitZhouPanic);
  });

  it('「有刺客！护驾！！」是楚公公在喊 → 挂楚公公立绘', () => {
    const line = byText('有刺客');
    expect(line.speaker).toBe('楚公公');
    expect(line.portrait?.key).toBe(PALACE_TEXTURES.portraitChu);
  });

  it('「是！」是侍卫 → 侍卫立绘；「呔！大胆贼子！」是太监 → 同一对蓝袍壮汉的立绘', () => {
    expect(byText('是！').portrait?.key).toBe(PALACE_TEXTURES.portraitShiwei);
    const eunuch = byText('纳命来');
    expect(eunuch.speaker).toBe('太监');
    expect(eunuch.portrait?.key).toBe(PALACE_TEXTURES.portraitShiwei);
  });

  it('小白的两次开口都是小白立绘（名字是长描述，对位认 speaker 原文）', () => {
    const lines = playPortraits().filter((line) => line.speaker === XIAOBAI_SPEAKER);
    expect(lines.length).toBe(2);
    for (const line of lines) expect(line.portrait?.key).toBe(PALACE_TEXTURES.portraitXiaobai);
  });

  it('矿工「入侵单元确认！」挂矿工立绘（左侧）', () => {
    const line = byText('入侵单元确认');
    expect(line.speaker).toBe('矿工');
    expect(line.portrait?.key).toBe(PALACE_TEXTURES.portraitMiner);
  });

  it('「青筋暴起」是旁白：这句收脸，下一句郑卿开口才重新挂他的脸', () => {
    const lines = playPortraits();
    const narrationAt = lines.findIndex((line) => line.text.includes('青筋暴起'));
    expect(narrationAt).toBeGreaterThanOrEqual(0);
    expect(lines[narrationAt]?.portrait).toBeNull();
    const nextZheng = lines
      .slice(narrationAt + 1)
      .find((line) => line.speaker === '郑卿');
    // 这一句带 portraitEmotion happy（得意），所以挂的是情绪差分而不是基础脸。
    expect(nextZheng?.portrait?.key).toBe('img.char.portrait.zheng_happy');
  });
});

describe('金殿：对位表本身与接线', () => {
  it('表里的立绘 key 全部来自 PALACE_TEXTURES（不许手写字符串）', () => {
    const known = new Set<string>(Object.values(PALACE_TEXTURES));
    for (const [speaker, entry] of Object.entries(PALACE_SPEAKER_PORTRAIT)) {
      if (entry === null) continue;
      expect(known.has(entry.key), `${speaker} 的立绘 key 不在 PALACE_TEXTURES 里`).toBe(true);
      expect(['left', 'right']).toContain(entry.side);
    }
  });

  it('表里没有「台词里根本不存在」的死条目', () => {
    const speakers = new Set(
      PALACE_BEATS.filter(isSay)
        .map((beat) => beat.speaker)
        .filter((speaker): speaker is string => Boolean(speaker)),
    );
    const dead = Object.keys(PALACE_SPEAKER_PORTRAIT).filter((speaker) => !speakers.has(speaker));
    expect(dead).toEqual([]);
  });

  it('场景在 say 分支接上了归约（漏接就等于没有防线）', () => {
    const source = readFileSync('src/scenes/ch01-palace-scene.ts', 'utf8');
    expect(source).toMatch(/this\.alignPortraitForLine\(event\.speaker,\s*event\.portraitEmotion\)/);
    expect(source).toMatch(/reducePortraitForSay\(\s*speaker,/);
  });
});
