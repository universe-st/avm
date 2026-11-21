import type { BattleSetup } from '../types';
import { CH01_FIRST_BATTLE, CH01_FIRST_BATTLE_ID } from './ch01-first';
import { COOK_SKILLS, PLAYER_SKILL_JIE } from './skills';

/**
 * 御膳房遭遇战：被巡逻的御厨/太监发现。
 *
 * 与金殿那场「打不赢」的剧情战不同：这是**有「解」之后的第一场完整战斗**。
 * 目标是让玩家在一个短遭遇里学会：看意图 → 移动 → 解离突刺的正面闪现 / 背袭 +50%。
 * 数值刻意压低（3 刀解决），避免打断探索节奏。
 */
export const CH01_KITCHEN_BATTLE_ID = 'battle.ch01.kitchen';

export const CH01_KITCHEN_BATTLE: BattleSetup = {
  id: CH01_KITCHEN_BATTLE_ID,
  title: '御膳房 · 惊动',
  player: {
    id: 'zhou-quan',
    name: '周全',
    hp: 90,
    atk: 16,
    spd: 14,
    skills: [PLAYER_SKILL_JIE],
    slot: 'left',
  },
  enemy: {
    id: 'dream.cook-phantom',
    name: '御厨·幻影',
    hp: 56,
    atk: 12,
    spd: 12,
    skills: [...COOK_SKILLS],
    facing: 'left',
    art: 'cook',
  },
  intro: {
    badge: 'ENCOUNTER / DREAM',
    title: '御膳房 · 惊动',
    target: '御厨·幻影',
    lines: [
      '它是梦里的人，被惊醒时会露出铁皮。',
      '「解」已经在你手里。',
    ],
    ruleText: '攻击 = 解离突刺。正面命中后你会在它对面出现；从背后命中伤害 +50%。',
  },
  victory: {
    text: '幻影散尽。',
    lines: ['幻影碎成齑粉，飘回这一夜的梦里。', '灶房重新安静下来。'],
  },
  defeat: {
    text: '你被按进了滚烫的灶台。',
    lines: ['眼前一黑。', '（从最近的落脚处再来一次。）'],
  },
};

/** 按 id 取遭遇战配置；未知 id 回退到金殿那场必败仗。 */
export function resolveBattleSetup(encounterId: string | undefined): BattleSetup {
  if (encounterId === CH01_KITCHEN_BATTLE_ID) return CH01_KITCHEN_BATTLE;
  return CH01_FIRST_BATTLE;
}

export { CH01_FIRST_BATTLE_ID };
