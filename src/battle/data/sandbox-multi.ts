import type { BattleSetup } from '../types';
import { COOK_SKILLS, PLAYER_SKILL_JIE } from './skills';

/**
 * DEV 多怪沙盒：厨房舞台、3 只厨系幻影、**不写初始点位**。
 *
 * 用来验收：随机点位不重叠/同 seed 可复现、3 行意图（rail 116）、
 * 追击/堵路/目标切换/只杀一只不胜利。只在舞台目录出现，不进正式剧情。
 */
export const BATTLE_SANDBOX_MULTI_ID = 'battle.sandbox.multi';

export const BATTLE_SANDBOX_MULTI: BattleSetup = {
  id: BATTLE_SANDBOX_MULTI_ID,
  title: '沙盒 · 三怪',
  arena: 'kitchen',
  party: [
    {
      id: 'zhou-quan',
      name: '周全',
      hp: 90,
      atk: 16,
      spd: 14,
      dodge: 1,
      skills: [PLAYER_SKILL_JIE],
      slot: 'left',
    },
  ],
  enemies: [
    {
      id: 'sandbox.cook-a',
      name: '御厨·甲',
      hp: 36,
      atk: 8,
      spd: 12,
      defense: 2,
      skills: [COOK_SKILLS[0]!, COOK_SKILLS[1]!],
      art: 'cook',
      behavior: 'chaser',
    },
    {
      id: 'sandbox.cook-b',
      name: '帮厨·乙',
      hp: 30,
      atk: 7,
      spd: 10,
      defense: 1,
      skills: [COOK_SKILLS[0]!, COOK_SKILLS[1]!],
      art: 'cook',
      behavior: 'chaser',
    },
    {
      id: 'sandbox.cook-c',
      name: '杂役·丙',
      hp: 24,
      atk: 6,
      spd: 9,
      defense: 1,
      skills: [COOK_SKILLS[0]!, COOK_SKILLS[2]!],
      art: 'cook',
      behavior: 'chaser',
    },
  ],
  intro: {
    badge: 'SANDBOX / MULTI',
    title: '沙盒 · 三怪',
    target: '御厨·甲 / 帮厨·乙 / 杂役·丙',
    lines: ['三只幻影从不同点位醒来。', '用来验收多怪与追击，不是正式剧情。'],
    ruleText: '点敌人切换目标；只打相邻点位。3 只怪随机点位，同 seed 可复现。',
  },
  victory: {
    text: '沙盒清空。',
    lines: ['三只幻影都散尽了。'],
  },
  defeat: {
    text: '沙盒把你按倒了。',
    lines: ['调整数值后，从最近的落脚处再来。'],
  },
};
