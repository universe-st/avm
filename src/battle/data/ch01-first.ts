import type { BattleSetup } from '../types';
import { MINER_SKILLS } from './skills';

/**
 * 第一场战斗：梦域金殿 · 矿工清除单元。
 *
 * 设计意图：这不是一场能赢的战斗。周全还没有「解」，攻击按钮不可用，
 * 只能移动与防御；矿工 SPD 20 明显快过周全 14，第 4 次怪物行动执行「清除协议」强制收尾。
 * 所有数值/文案都放在这里，场景/核心不得另写一套。
 */
export const CH01_FIRST_BATTLE_ID = 'battle.ch01.first';

export const CH01_FIRST_BATTLE: BattleSetup = {
  id: CH01_FIRST_BATTLE_ID,
  title: '梦域 · 金殿',
  arena: 'palace',
  party: [
    {
      id: 'zhou-quan',
      name: '周全',
      hp: 90,
      atk: 16,
      spd: 14,
      dodge: 1,
      // 没有「解」：攻击不可用，只能移动/防御。
      skills: [],
      slot: 'left',
    },
  ],
  enemies: [
    {
      id: 'miner.clear-unit',
      name: '矿工·清除单元',
      hp: 120,
      atk: 16,
      spd: 20,
      defense: 4,
      skills: [...MINER_SKILLS],
      slot: 'center',
      art: 'miner',
      behavior: 'stationary',
    },
  ],
  script: {
    protocolAfterEnemyActions: 4,
    protocolDamage: 999,
    protocolText: '清除协议启动。铁臂从两侧合拢——',
  },
  intro: {
    badge: 'PROTOCOL / CLEAR',
    title: '矿场清除协议',
    target: '矿工·清除单元',
    lines: [
      '铁皮摩擦声从四面八方逼近。',
      '你还没有「解」。你只有一双拳头。',
    ],
    ruleText: '先试试攻击；打不动就移动、防御。它比你快——撑过它的行动。',
  },
  victory: {
    text: '铁皮停止转动。',
    lines: ['它停下了。', '可这不是你现在能做到的事。'],
  },
  defeat: {
    text: '精神体受到致命损伤。',
    lines: [
      '铁臂合拢。你听见自己的心跳，像隔着一层水。',
      '小白：准备脱离梦域。',
    ],
  },
};
