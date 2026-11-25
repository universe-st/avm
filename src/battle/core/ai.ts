import type {
  BattleSetup,
  BattleState,
  BattleUnit,
  EnemyIntent,
  SkillDef,
} from '../types';
import { resolveSkill } from '../data/skills';
import {
  adjacentSlots,
  facingFromPoints,
  formatSlots,
  hitPointsFor,
  isAdjacentSlot,
  pointDistance,
  shortestStepToward,
  slotLabel,
  facingLabel,
} from './slots';

/**
 * 怪物 AI（纯函数，确定性）。
 *
 * 规则见 `docs/DESIGN-BATTLE.md` §5：
 * 1. 目标 = 最近的玩家角色（BFS 步数）；平局取 HP 低者 → id 字典序。
 * 2. 目标相邻：按 single-front → front-arc → all-slots 选冷却好的技能；
 *    瞄准确切目标点位，执行时免费转身。
 * 3. 目标不相邻：AOE 冷却好 → AOE；否则 chaser 沿 11 点图走一步缩短距离
 *    （避开占位）；无路可走 → **返回 null（本动等待）**，绝不瞄无人点位空放。
 * 4. stationary 永不移动；没有可命中的目标就等待。
 *
 * 意图不上屏；执行时 `applyEnemyAction` 会按当前站位重新计划，避免玩家移动后
 * 打向旧点位。这里返回的 intent 只是计划/调试，不是锁死目标。
 */
export function planEnemyIntents(
  state: BattleState,
  setup: BattleSetup,
): Record<string, EnemyIntent> {
  const intents: Record<string, EnemyIntent> = {};
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const intent = planEnemyIntent(state, setup, enemy.id);
    if (intent) intents[enemy.id] = intent;
  }
  return intents;
}

export function planEnemyIntent(
  state: BattleState,
  setup: BattleSetup,
  enemyId: string,
): EnemyIntent | null {
  const enemy = state.enemies.find((unit) => unit.id === enemyId);
  if (!enemy || enemy.hp <= 0) return null;
  const target = nearestPartyTarget(state, enemy);
  if (!target) return null;

  const setupEnemy = setup.enemies.find((candidate) => candidate.id === enemyId);
  const skills = (setupEnemy?.skills ?? []).map((id) => resolveSkill(id));
  const ready = (skill: SkillDef): boolean => (enemy.cooldowns[skill.id] ?? 0) <= 0;
  const single = skills.find((skill) => skill.hit === 'single-front' && ready(skill));
  const arc = skills.find((skill) => skill.hit === 'front-arc' && ready(skill));
  const aoe = skills.find((skill) => skill.hit === 'all-slots' && ready(skill));
  const anyReady = skills.find(ready) ?? skills[0];

  const adjacent = isAdjacentSlot(enemy.slot, target.slot);

  if (adjacent) {
    const chosen = single ?? arc ?? aoe ?? anyReady;
    if (chosen) return skillIntent(chosen, enemy, target, target.slot);
    return moveIntentToFreeNeighbour(state, enemy, target);
  }

  // 不相邻：AOE 是唯一能打到远处的招式。
  if (aoe) return skillIntent(aoe, enemy, target, target.slot);

  if ((setupEnemy?.behavior ?? enemy.behavior ?? 'chaser') === 'chaser') {
    const blocked = occupiedPoints(state);
    blocked.delete(enemy.slot);
    const step = shortestStepToward(enemy.slot, target.slot, blocked);
    if (step) return moveIntent(enemy, target, step);
  }

  // 够不着、没有 AOE、也没有可走的追击步：本动等待，绝不空放。
  return null;
}

function nearestPartyTarget(state: BattleState, enemy: BattleUnit): BattleUnit | null {
  const party = state.party.filter((unit) => unit.hp > 0);
  if (party.length === 0) return null;
  return [...party].sort((a, b) => {
    const da = pointDistance(enemy.slot, a.slot);
    const db = pointDistance(enemy.slot, b.slot);
    if (da !== db) return da - db;
    if (a.hp !== b.hp) return a.hp - b.hp;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0]!;
}

function occupiedPoints(state: BattleState): Set<BattleUnit['slot']> {
  return new Set(
    [...state.party, ...state.enemies]
      .filter((unit) => unit.hp > 0)
      .map((unit) => unit.slot),
  );
}

function skillIntent(
  skill: SkillDef,
  enemy: BattleUnit,
  target: BattleUnit,
  aim: BattleUnit['slot'],
  suffix = '',
): EnemyIntent {
  const facing = facingFromPoints(enemy.slot, aim);
  const hitSlots = hitPointsFor(enemy.slot, aim, skill.hit);
  const aoe = skill.hit === 'all-slots';
  const text = aoe
    ? `${skill.name} · 全站位（无法走位躲避）`
    : `${skill.name} · 命中 ${formatSlots(hitSlots)}`;
  return {
    kind: 'skill',
    skillId: skill.id,
    skillName: skill.name,
    origin: enemy.slot,
    aim,
    facing,
    targetId: target.id,
    targetSlot: target.slot,
    hitSlots,
    hitsPlayer: hitSlots.includes(target.slot),
    aoe,
    text: `${text}${suffix}`,
  };
}

function moveIntent(enemy: BattleUnit, target: BattleUnit, to: BattleUnit['slot']): EnemyIntent {
  const facing = facingFromPoints(enemy.slot, to);
  return {
    kind: 'move',
    from: enemy.slot,
    to,
    facing,
    targetId: target.id,
    text: `移动 · ${slotLabel(to)}（面朝${facingLabel(facing)}）`,
  };
}

function moveIntentToFreeNeighbour(
  state: BattleState,
  enemy: BattleUnit,
  target: BattleUnit,
): EnemyIntent | null {
  const blocked = occupiedPoints(state);
  const candidates = adjacentSlots(enemy.slot).filter((slot) => !blocked.has(slot));
  const to = candidates[0];
  return to ? moveIntent(enemy, target, to) : null;
}

/** 给 HUD 的一行摘要。 */
export function formatIntent(intent: EnemyIntent | null | undefined): string {
  if (!intent) return '——';
  if (intent.kind === 'move') {
    return `移动 · ${slotLabel(intent.to)}（面朝${facingLabel(intent.facing)}）`;
  }
  if (intent.aoe) {
    return `${intent.skillName} · 全站位（无法走位躲避）`;
  }
  return `${intent.skillName} · 命中 ${formatSlots(intent.hitSlots)}`;
}
