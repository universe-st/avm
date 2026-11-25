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
import { MINER_QUAKE_SKILL, resolveSkill } from '../src/battle/data/skills';
import { applyBattleAction, createBattle } from '../src/battle/core/battle';
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

describe('第一场教程回手：11 点位后必须真打到人', () => {
  // 玩家站在 `upperFarLeft`（离中心 1.73 格）——11 点位之后一步就能走出矿工近战范围；
  // 核心脉冲又在冷却（前面某拍已经放过），于是普通回合只能干等——用户看到的正是这一拍。
  const cornerState = () => {
    const state = createBattle(CH01_FIRST_BATTLE, 1);
    const player = state.party[0]!;
    const enemy = state.enemies[0]!;
    return {
      ...state,
      phase: 'enemy' as const,
      activeId: enemy.id,
      party: state.party.map((unit) =>
        unit.id === player.id
          ? { ...unit, slot: 'upperFarLeft' as const, dodge: 0 }
          : unit,
      ),
      enemies: state.enemies.map((unit) =>
        unit.id === enemy.id
          ? { ...unit, cooldowns: { ...unit.cooldowns, [MINER_QUAKE_SKILL]: 3 } }
          : unit,
      ),
    };
  };

  it('普通回合够不到就等待，不空放（这是用户报的 bug 的来源）', () => {
    const result = applyBattleAction(cornerState(), { kind: 'enemy-act' }, CH01_FIRST_BATTLE);
    expect(result.state.party[0]!.hp).toBe(90);
    expect(result.state.enemyActions).toBe(1);
    expect(
      result.events.some((event) => event.kind === 'log' && event.text.includes('按住阵脚')),
    ).toBe(true);
  });

  it('教程回手指定全站位：站在远角也真打到（对话里的「痛」不再落空）', () => {
    const result = applyBattleAction(
      cornerState(),
      { kind: 'enemy-act', forceSkillId: MINER_QUAKE_SKILL },
      CH01_FIRST_BATTLE,
    );
    expect(result.state.party[0]!.hp).toBeLessThan(90);
    expect(result.state.enemyActions).toBe(1);
    const skill = result.events.find((event) => event.kind === 'enemy-skill');
    expect(skill?.kind === 'enemy-skill' ? skill.skillId : null).toBe(MINER_QUAKE_SKILL);
    expect(skill?.kind === 'enemy-skill' ? skill.aoe : null).toBe(true);
    expect(skill?.kind === 'enemy-skill' ? skill.hit : null).toBe(true);
    // 这个指定招式必须是全站位，否则远角仍然打空。
    expect(resolveSkill(MINER_QUAKE_SKILL).hit).toBe('all-slots');
  });

  it('指定招式不在该敌人的技能里时回落到正常 AI（不会凭空放招）', () => {
    const result = applyBattleAction(
      cornerState(),
      { kind: 'enemy-act', forceSkillId: 'cook.oil' },
      CH01_FIRST_BATTLE,
    );
    expect(result.state.party[0]!.hp).toBe(90);
  });
});
