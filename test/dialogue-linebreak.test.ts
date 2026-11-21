import { describe, expect, it } from 'vitest';
import { CH01_NODES } from '../src/story/ch01-dorm';
import {
  CH01_AFTER_CLOSING,
  CH01_AFTER_HANDOFF,
  CH01_AFTER_INQUIRY,
  CH01_AFTER_INTRO,
} from '../src/story/ch01-after';
import { KITCHEN_NODES } from '../src/story/ch01-kitchen';
import { PALACE_BEATS } from '../src/story/ch01-palace';
import { PROLOGUE_CUES } from '../src/story/prologue';
import { balanceDialogueLine, isForbiddenLineStart } from '../src/story/dialogue';
import { paginateText } from '../src/story/dialogue-player';
// 框架负责「渲染时按宽度折行」的那一半规则：两边的判定必须一致，否则剧情层合规、画面仍会翻车。
import { isForbiddenLineStart as isForbiddenLineStartInWidgets } from '../vendor/phaser-mvvm/packages/widgets/src/text-truncate';

/**
 * 台词换行规则（需求原话）：
 * 「当一名角色单段对话过长需要翻页时，应该在合适的地方断开。并且任何换行的地方，
 *   新行第一个字符不能是除前引号、前书名号之外的任何标点符号。」
 *
 * 这里守三层：
 * 1. 判定函数本身（Unicode 标点分类 + 前引号/前书名号白名单）；
 * 2. 两个换行来源：`paginateText`（翻页）与 `balanceDialogueLine`（页内折行）；
 * 3. 全部剧本数据:每一页、每一行、每个手写 `\n` 都过一遍，新增台词自动受管。
 */

/** 和场景一致的每页字数（`DIALOGUE_PAGE_CHARS`）。 */
const PAGE_CHARS = 68;

/** 一行对话真正会显示的第一行之前，不允许出现「行首标点」。 */
function expectLegalLines(text: string, label: string): void {
  const chars = Array.from(text);
  chars.forEach((char, index) => {
    if (chars[index - 1] !== '\n' || index === 0) return;
    expect(isForbiddenLineStart(char), `${label} 第 ${index + 1} 字「${char}」不能作为行首`).toBe(false);
  });
}

function allStoryTexts(): { id: string; text: string }[] {
  const texts: { id: string; text: string }[] = [];
  for (const node of Object.values(CH01_NODES)) {
    node.lines.forEach((line, index) => texts.push({ id: `dorm/${node.id}[${index}]`, text: line.text }));
  }
  CH01_AFTER_INTRO.forEach((line, index) => texts.push({ id: `after/intro[${index}]`, text: line.text }));
  for (const question of CH01_AFTER_INQUIRY.questions) {
    question.lines.forEach((line, index) =>
      texts.push({ id: `after/${question.id}[${index}]`, text: line.text }),
    );
  }
  CH01_AFTER_CLOSING.forEach((line, index) => texts.push({ id: `after/closing[${index}]`, text: line.text }));
  CH01_AFTER_HANDOFF.forEach((line, index) => texts.push({ id: `after/handoff[${index}]`, text: line.text }));
  for (const node of Object.values(KITCHEN_NODES)) {
    node.lines.forEach((line, index) => texts.push({ id: `kitchen/${node.id}[${index}]`, text: line.text }));
  }
  PALACE_BEATS.forEach((beat, index) => {
    if (beat.kind === 'say') texts.push({ id: `palace/beat[${index}]`, text: beat.text });
  });
  return texts;
}

describe('isForbiddenLineStart · 行首禁则判定', () => {
  it('把中文/英文/全角标点都判成「不能起行」', () => {
    for (const char of ['，', '。', '、', '；', '：', '？', '！', '…', '—', '·', '％', '%', ',', '.', '!', '?', ':', ';', ')', '）', ']', '」', '』', '》', '〉', '】', '〕']) {
      expect(isForbiddenLineStart(char), char).toBe(true);
    }
  });

  it('前引号与前书名号可以起行', () => {
    for (const char of ['「', '『', '《', '〈', '“', '‘']) {
      expect(isForbiddenLineStart(char), char).toBe(false);
    }
  });

  it('普通文字/数字/空白不算标点', () => {
    for (const char of ['周', '全', 'A', '7', ' ', '　', '']) {
      expect(isForbiddenLineStart(char), JSON.stringify(char)).toBe(false);
    }
    expect(isForbiddenLineStart(undefined)).toBe(false);
  });

  it('与框架渲染折行的判定完全一致（防两边漂移）', () => {
    const samples = [
      ...'，。、；：？！…—·％%.,!?:;)]』》〉】〕「『《〈“‘”’（）【】',
      ...'周全小白7A　 ',
    ];
    for (const char of samples) {
      expect(isForbiddenLineStartInWidgets(char), char).toBe(isForbiddenLineStart(char));
    }
  });
});

describe('paginateText · 翻页断点', () => {
  it('优先在句末标点后断，而不是在句子中间硬切', () => {
    const text = '我是灵能族为抵抗因泰里的扩张，派往各个星球的指引者，编号TEAR-27。灵能族属于能量生命，其生命本质是宇宙空间中以复杂的组合频率振动的谐波。';
    const pages = paginateText(text, PAGE_CHARS);
    expect(pages[0]?.endsWith('。')).toBe(true);
    expect(pages.join('')).toBe(text);
    // 句末断点在一页的中后段，不是「切到 68 字为止」。
    expect(Array.from(pages[0] ?? '').length).toBeLessThan(PAGE_CHARS);
  });

  it('下一页绝不能以标点开头：包括百分号、右引号、句号', () => {
    const text = '另外，如果拖延太久，清除因泰里矿点的难度会指数级上升。40地球日后，目标生命体征开始不可逆恶化。150地球日后，生命终结概率超过99.7%。';
    const pages = paginateText(text, PAGE_CHARS);
    expect(pages).toHaveLength(2);
    for (const page of pages) expect(isForbiddenLineStart(Array.from(page)[0])).toBe(false);
    expect(pages[1]?.startsWith('150')).toBe(true);
    expect(pages.join('')).toBe(text);
  });

  it('句尾的右引号/句号会跟上一页走，不单开一页', () => {
    const text = `${'一'.repeat(66)}他说：「走。」`;
    const pages = paginateText(text, PAGE_CHARS);
    expect(pages.join('')).toBe(text);
    expect(isForbiddenLineStart(Array.from(pages[1] ?? '')[0])).toBe(false);
  });

  it('收尾页太短时把断点往前挪，避免点一下只翻出一两个字', () => {
    // 69 字、上限 68：硬切会把一个「二」留成 1 字的下一页，应改为在「。」后断开（31 / 38）。
    const text = `${'一'.repeat(30)}。${'二'.repeat(38)}`;
    const pages = paginateText(text, PAGE_CHARS);
    expect(pages).toHaveLength(2);
    expect(pages[0]?.endsWith('。')).toBe(true);
    expect(Array.from(pages[1] ?? '').length).toBeGreaterThanOrEqual(6);
    expect(pages.join('')).toBe(text);
  });

  it('挪不动断点、又不值得单开一页时，并回上一页（面板放得下就不硬拆）', () => {
    const text = `${'一'.repeat(68)}好。`;
    const pages = paginateText(text, PAGE_CHARS);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toBe(text);
  });

  it('不丢字、不产生空页，短句不分页', () => {
    expect(paginateText('短句。', PAGE_CHARS)).toEqual(['短句。']);
    expect(paginateText('……', 0)).toEqual(['……']);
    const text = '沉睡症全球蔓延，患者莫名长睡不醒，明山县已有十四例，校医院也查不出原因。'.repeat(3);
    const pages = paginateText(text, 20);
    expect(pages.every((page) => page.length > 0)).toBe(true);
    expect(pages.join('')).toBe(text);
  });
});

describe('balanceDialogueLine · 页内折行', () => {
  it('第二行不能以右括号开头（「……？！）」曾把右括号挤到行首）', () => {
    // 20 字：按 19 字折行会把「）」留成 1 字尾行，提前断到「，」后。
    const text = '（……你不是罪该万死吗，饶什么命啊？！）';
    const balanced = balanceDialogueLine(text);
    const lines = balanced.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines.join('')).toBe(text);
    expect(isForbiddenLineStart(Array.from(lines[1] ?? '')[0])).toBe(false);
    expect(lines[1]?.endsWith('）')).toBe(true);
  });

  it('一行放得下（19 字）就不插入换行', () => {
    const text = '（……你不是罪该万死吗，饶什么命啊？）';
    expect(Array.from(text)).toHaveLength(19);
    expect(balanceDialogueLine(text)).toBe(text);
  });

  it('第二行不能只剩一个短词（「斩了！」）', () => {
    const text = '……哼，真是不知天高地厚！拖出午门，斩了！';
    const lines = balanceDialogueLine(text).split('\n');
    expect(lines).toHaveLength(2);
    expect(Array.from(lines[1] ?? '').length).toBeGreaterThanOrEqual(4);
  });

  it('任何折行结果都满足行首禁则', () => {
    for (const { text } of allStoryTexts()) {
      for (const page of paginateText(text, PAGE_CHARS)) {
        const balanced = balanceDialogueLine(page);
        expectLegalLines(balanced, text.slice(0, 12));
      }
    }
  });
});

describe('全部剧本数据 · 换行合规', () => {
  it('每一页、每一行都以非标点起行（只有整句话的第一个字不受限）', () => {
    const problems: string[] = [];
    for (const { id, text } of allStoryTexts()) {
      const pages = paginateText(text, PAGE_CHARS).map((page) => balanceDialogueLine(page));
      expect(pages.join('').replace(/\n/g, '')).toBe(text.replace(/\n/g, ''));
      pages.forEach((page, pageIndex) => {
        const lines = page.split('\n');
        lines.forEach((line, lineIndex) => {
          if (pageIndex === 0 && lineIndex === 0) return; // 整句开头不叫「换行」
          const first = Array.from(line)[0];
          if (isForbiddenLineStart(first)) problems.push(`${id} p${pageIndex + 1}l${lineIndex + 1}「${line.slice(0, 16)}」`);
        });
        // 翻页也不能把页撑到面板之外（68 字上限 + 行末标点最多多带一两个字）。
        expect(Array.from(page).length, `${id} 第 ${pageIndex + 1} 页`).toBeLessThanOrEqual(PAGE_CHARS + 2);
      });
    }
    expect(problems).toEqual([]);
  });

  it('剧本里手写的换行（如果有）同样不能以标点起行', () => {
    for (const { id, text } of allStoryTexts()) expectLegalLines(text, id);
  });

  it('开幕文案的手工断行也合规', () => {
    for (const cue of PROLOGUE_CUES) {
      cue.lines.slice(1).forEach((line, index) => {
        expect(isForbiddenLineStart(Array.from(line)[0]), `${cue.id}[${index + 1}]「${line}」`).toBe(false);
      });
    }
  });
});
