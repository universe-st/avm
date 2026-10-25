import type { ScriptedBattleSetup } from '../types';

/**
 * 第一场战斗：梦域金殿 · 矿工清除单元。
 *
 * 设计意图：这不是一场能赢的战斗。周全还没有「解」，拳头砸在铁皮上只留下 1 点划痕；
 * 战斗最多 3 回合，最后一回合由矿工执行「清除协议」强制收尾，随后小白把周全踢出梦域。
 * 所有数值都放在这里，场景/核心不得另写一套。
 */
export const CH01_FIRST_BATTLE_ID = 'battle.ch01.first';

/** 剧情规则：本场主角每次攻击只造成 1 点伤害，不受任何属性影响。 */
export const CH01_FIRST_PLAYER_DAMAGE = 1 as const;

export const CH01_FIRST_BATTLE: ScriptedBattleSetup = {
  id: CH01_FIRST_BATTLE_ID,
  title: '梦域 · 金殿',
  player: {
    id: 'zhou-quan',
    name: '周全',
    hp: 90,
    attackDamage: CH01_FIRST_PLAYER_DAMAGE,
  },
  enemy: {
    id: 'miner.clear-unit',
    name: '矿工·清除单元',
    hp: 120,
    attackDamage: 30,
  },
  maxRounds: 3,
  protocolDamage: 999,
  attackBarks: [
    '你一拳砸在铁皮上。只留下一道白印。',
    '它甚至没有后退半步。',
    '你终于明白——这不是你能赢的战斗。',
  ],
  guardText: '你护住要害。铁臂的冲击被卸掉一半。',
  enemyAttackText: '铁臂横扫。你被砸得眼前发黑。',
  protocolText: '清除协议启动。铁臂从两侧合拢——',
  defeatText: '精神体受到致命损伤。',
};
