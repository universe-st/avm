import { describe, expect, it } from 'vitest';
import {
  FIRST_BATTLE_ATTACK_BEATS,
  FIRST_BATTLE_ENTER_BEATS,
  FIRST_BATTLE_GUARD_POST_LINES,
  FIRST_BATTLE_GUARD_PRE_LINES,
  FIRST_BATTLE_MOVE_POST_LINES,
  FIRST_BATTLE_MOVE_PRE_LINES,
} from '../src/story/ch01-first-battle';
import { CH01_FIRST_BATTLE } from '../src/battle/data/ch01-first';
import { PALACE_BEATS } from '../src/story/ch01-palace';

describe('第一场教程对话', () => {
  it('进入战斗：机器人先出手，再给移动提示', () => {
    expect(FIRST_BATTLE_ENTER_BEATS.map((beat) => beat.kind)).toEqual([
      'line',
      'line',
      'enemy-attack',
      'line',
      'line',
    ]);
    const lines = FIRST_BATTLE_ENTER_BEATS.flatMap((beat) =>
      beat.kind === 'line' ? [beat.line] : [],
    );
    expect(lines.map((line) => line.speaker)).toEqual([
      '周全',
      '侍卫机器人',
      '周全',
      '白色小精灵',
    ]);
    expect(lines.map((line) => line.text)).toEqual([
      '喂喂喂！这到底什么情况？机器人？',
      '清除协议，执行！',
      '哎呦！痛！一言不合就开打？',
      '优先策略：通过“移动”躲避矿工的攻击。',
    ]);
  });

  it('第一次攻击：旁白→周全→一拳→旁白→周全→小白', () => {
    expect(FIRST_BATTLE_ATTACK_BEATS.map((beat) => beat.kind)).toEqual([
      'line',
      'line',
      'punch',
      'line',
      'line',
      'line',
    ]);
    const lines = FIRST_BATTLE_ATTACK_BEATS.flatMap((beat) =>
      beat.kind === 'line' ? [beat.line] : [],
    );
    expect(lines.map((line) => line.speaker)).toEqual([
      '旁白',
      '周全',
      '旁白',
      '周全',
      '白色小精灵',
    ]);
    expect(lines[0]!.text).toContain('也许你该教训一下这个铁皮怪物');
    expect(lines[2]!.text).toContain('一阵剧痛传来');
    expect(lines[4]!.text).toBe('提醒：当前无法对敌方造成有效伤害。');
  });

  it('首次移动 / 首次防御各有前置与后置台词', () => {
    expect(FIRST_BATTLE_MOVE_PRE_LINES.map((line) => line.text)).toEqual([
      '惹不起我还躲不起吗？',
    ]);
    expect(FIRST_BATTLE_MOVE_POST_LINES.map((line) => line.text)).toEqual([
      '哎哟！混蛋……躲不开啊……',
      '敌方速度较快，攻击无法规避。',
      '……有完没完啊？',
    ]);
    expect(FIRST_BATTLE_GUARD_PRE_LINES.map((line) => line.text)).toEqual([
      '你，你不要过来啊！',
    ]);
    expect(FIRST_BATTLE_GUARD_POST_LINES.map((line) => line.text)).toEqual([
      '哎哟，痛，痛……',
      '粗劣的防御姿势，不足以抵抗伤害。',
      '你就这么看着吗？！',
    ]);
  });

  it('金殿收尾建议改成「躲避攻击，保留体力」', () => {
    const advice = PALACE_BEATS.flatMap((beat) =>
      beat.kind === 'say' ? [beat.text] : [],
    ).find((text) => text.startsWith('建议：'));
    expect(advice).toBe('建议：躲避攻击，保留体力。');
  });

  it('第一场攻击按钮可点一次：intro 不再写死「攻击不可用」', () => {
    expect(CH01_FIRST_BATTLE.intro.ruleText).toContain('先试试攻击');
    expect(CH01_FIRST_BATTLE.intro.ruleText).not.toContain('攻击不可用');
  });
});
