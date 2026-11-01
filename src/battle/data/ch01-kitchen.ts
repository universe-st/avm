import type { ScriptedBattleSetup } from '../types';
import { CH01_FIRST_BATTLE } from './ch01-first';

/**
 * 御膳房遭遇战：被巡逻的御厨/太监发现。
 *
 * 与金殿那场「打不赢」的剧情战不同：这是一场**打得赢的短仗**，
 * 目的只是让"被发现"有代价、有回响，而不是直接判负。
 * 数值刻意压低（3 刀解决），避免打断探索节奏。
 */
export const CH01_KITCHEN_BATTLE_ID = 'battle.ch01.kitchen';

export const CH01_KITCHEN_BATTLE: ScriptedBattleSetup = {
  id: CH01_KITCHEN_BATTLE_ID,
  title: '御膳房 · 惊动',
  player: {
    id: 'zhou-quan',
    name: '周全',
    hp: 60,
    attackDamage: 12,
  },
  enemy: {
    id: 'dream.cook-phantom',
    name: '御厨·幻影',
    hp: 30,
    attackDamage: 9,
  },
  maxRounds: 6,
  protocolDamage: 999,
  damageRule: 'use-attack',
  attackBarks: [
    '「解」的白光切进幻影的肩头，油烟味散了一瞬。',
    '它像被戳破的灯笼，边缘开始漏光。',
    '最后一刀——幻影碎成齑粉，飘回这一夜的梦里。',
  ],
  guardText: '你侧身卸力，铁锅擦着耳边过去。',
  enemyAttackText: '一把铁勺砸在你背上，烫得发麻。',
  protocolText: '灶火忽然窜高——',
  defeatText: '你被按进了滚烫的灶台。',
  victoryText: '幻影散尽。灶房重新安静下来。',
};

/** 按 id 取遭遇战配置；未知 id 回退到金殿那场必败仗。 */
export function resolveBattleSetup(encounterId: string | undefined): ScriptedBattleSetup {
  if (encounterId === CH01_KITCHEN_BATTLE_ID) return CH01_KITCHEN_BATTLE;
  return CH01_FIRST_BATTLE;
}
