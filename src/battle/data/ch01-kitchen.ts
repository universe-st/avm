import type { BattleSetup } from '../types';
import { CH01_FIRST_BATTLE, CH01_FIRST_BATTLE_ID } from './ch01-first';
import { BATTLE_SANDBOX_MULTI, BATTLE_SANDBOX_MULTI_ID } from './sandbox-multi';
import { COOK_SKILLS, PLAYER_SKILL_JIE } from './skills';

/**
 * 御膳房遭遇战：被巡逻的御厨/帮厨发现。
 *
 * 与金殿那场「打不赢」的剧情战不同：这是**有「解」之后的第一场完整战斗**。
 * v3 起是双怪：御厨·幻影（中心、站桩）+ 帮厨·幻影（右上、追击）。
 * 目标是让玩家学会：点「攻击」选技能 → 点敌人选目标 → 只打相邻点位 → 正面落点 / 背袭 +50%。
 */
export const CH01_KITCHEN_BATTLE_ID = 'battle.ch01.kitchen';

export const CH01_KITCHEN_BATTLE: BattleSetup = {
  id: CH01_KITCHEN_BATTLE_ID,
  title: '御膳房 · 惊动',
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
      id: 'cook-phantom-a',
      name: '御厨·幻影',
      hp: 40,
      atk: 10,
      spd: 12,
      defense: 3,
      dodge: 2,
      skills: [COOK_SKILLS[0]!, COOK_SKILLS[1]!],
      slot: 'center',
      art: 'cook',
      behavior: 'stationary',
    },
    {
      id: 'cook-phantom-b',
      name: '帮厨·幻影',
      hp: 24,
      atk: 7,
      spd: 10,
      defense: 2,
      skills: [COOK_SKILLS[0]!, COOK_SKILLS[1]!],
      slot: 'upperRight',
      art: 'cook',
      behavior: 'chaser',
    },
  ],
  intro: {
    badge: 'ENCOUNTER / DREAM',
    title: '御膳房 · 惊动',
    target: '御厨·幻影 / 帮厨·幻影',
    lines: [
      '它是梦里的人，被惊醒时会露出铁皮。',
      '「解」已经在你手里。',
    ],
    ruleText:
      '点「攻击」选技能，再点敌人选目标；只打相邻点位。解离突刺：非背袭命中后可选择目标附近点位落地；背袭无视目标一半防御。',
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
  if (encounterId === BATTLE_SANDBOX_MULTI_ID) return BATTLE_SANDBOX_MULTI;
  return CH01_FIRST_BATTLE;
}

export { CH01_FIRST_BATTLE_ID };
