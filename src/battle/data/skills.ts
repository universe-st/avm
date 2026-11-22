import type { SkillDef } from '../types';

/**
 * 战斗技能表（v2 唯一真值）。
 *
 * 数值口径：`power × atk` 后取整；背袭 ×1.5（技能可覆盖）；防御 ×0.5。
 * 第一场没有「解」，所以玩家技能表为空；御膳房遭遇战解锁解离突刺。
 */
export const SKILLS: Readonly<Record<string, SkillDef>> = {
  /** 周全：解离突刺。 */
  'player.jielitusi': {
    id: 'player.jielitusi',
    name: '解离突刺',
    power: 1,
    positional: true,
    backstabMultiplier: 1.5,
    teleport: 'mirror-if-front',
    hit: 'single-front',
    desc: '向怪物发动一次突刺。非背袭命中后闪现到它对侧；背袭伤害 +50%，留在原地。',
  },

  /** 矿工·清除单元。atk 16 → 横扫 10 / 突进 18 / 震地 6。 */
  'miner.sweep': {
    id: 'miner.sweep',
    name: '铁臂横扫',
    power: 0.62,
    positional: false,
    hit: 'front-arc',
    desc: '铁臂横掠正面与侧面；站到它背后就打不到。',
  },
  'miner.thrust': {
    id: 'miner.thrust',
    name: '钻头突进',
    power: 1.12,
    positional: false,
    hit: 'single-front',
    cooldown: 2,
    desc: '只打正面：重击突进，站在侧面或背后会被它打空。',
  },
  'miner.quake': {
    id: 'miner.quake',
    name: '核心脉冲',
    power: 0.4,
    positional: false,
    hit: 'all-slots',
    cooldown: 3,
    desc: '全站位震荡，无法靠走位躲开；用防御减半。',
  },

  /** 御厨·幻影。atk 12 → 横扫 9 / 热油 13 / 震地 4。 */
  'cook.sweep': {
    id: 'cook.sweep',
    name: '菜刀横扫',
    power: 0.75,
    positional: false,
    hit: 'front-arc',
    desc: '菜刀横掠正面与侧面。',
  },
  'cook.oil': {
    id: 'cook.oil',
    name: '热油泼洒',
    power: 1.1,
    positional: false,
    hit: 'single-front',
    cooldown: 2,
    desc: '只打正面；滚油泼在脸上，侧后方安全。',
  },
  'cook.quake': {
    id: 'cook.quake',
    name: '灶台震地',
    power: 0.35,
    positional: false,
    hit: 'all-slots',
    cooldown: 3,
    desc: '整座灶台一颤，全站位都会挨一下。',
  },
};

export function getSkill(id: string): SkillDef | undefined {
  return SKILLS[id];
}

/** 取技能；缺失时给一个只造成 1 点的兜底，避免数据漏项把战斗打崩。 */
export function resolveSkill(id: string): SkillDef {
  return (
    SKILLS[id] ?? {
      id,
      name: '未知招式',
      power: 0,
      positional: false,
      hit: 'single-front',
      desc: '数据缺失（技能表里没有这个 id）。',
    }
  );
}

export const PLAYER_SKILL_JIE = 'player.jielitusi';
export const MINER_SKILLS = ['miner.sweep', 'miner.thrust', 'miner.quake'] as const;
export const COOK_SKILLS = ['cook.sweep', 'cook.oil', 'cook.quake'] as const;
