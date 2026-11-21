import type {
  BattleSetup,
  BattleState,
  EnemyIntent,
  Facing8,
  SkillDef,
  SlotId,
} from '../types';
import { resolveSkill } from '../data/skills';
import {
  SLOT_FACING,
  facingLabel,
  formatSlots,
  hitSlotsFor,
  slotLabel,
  zoneOfSlot,
} from './slots';

/**
 * 怪物 AI（纯函数，确定性）。
 *
 * 目标不是「最优解」，而是**可读**：玩家能从意图条读出它下一步要干什么，
 * 再用移动/防御做应对。规则：
 *
 * 1. 玩家在侧面/背面：震地冷却好了 → 震地（惩罚贴背站桩）；
 *    否则 → 转向玩家当前站位（转向占一次行动，这是玩家绕背的收益）。
 * 2. 玩家在正面：突进冷却好了 → 突进；否则 → 横扫。
 * 3. 兜底 → 转向。
 *
 * 意图在怪物行动**结束后**锁定，玩家移动不会改它；所以挪出高亮格就能看它打空。
 */
export function planEnemyIntent(state: BattleState, setup: BattleSetup): EnemyIntent {
  const facing = state.enemy.facing ?? setup.enemy.facing;
  const slot = state.player.slot ?? setup.player.slot;
  const zone = zoneOfSlot(slot, facing);

  const skills = setup.enemy.skills.map((id) => resolveSkill(id));
  const ready = (skill: SkillDef): boolean => (state.enemy.cooldowns[skill.id] ?? 0) <= 0;

  const quake = skills.find((skill) => skill.hit === 'all-slots' && ready(skill));
  const thrust = skills.find((skill) => skill.hit === 'single-front' && ready(skill));
  const sweep = skills.find((skill) => skill.hit === 'front-arc' && ready(skill));

  if (zone === 'back' || zone === 'side') {
    if (quake) return skillIntent(quake, facing, slot);
    return turnIntent(slot);
  }

  if (thrust) return skillIntent(thrust, facing, slot);
  if (sweep) return skillIntent(sweep, facing, slot);
  if (quake) return skillIntent(quake, facing, slot);
  return turnIntent(slot);
}

function turnIntent(slot: SlotId): EnemyIntent {
  const facing = SLOT_FACING[slot];
  return {
    kind: 'turn',
    facing,
    targetSlot: slot,
    text: `转向 · 面朝${slotLabel(slot)}`,
  };
}

function skillIntent(
  skill: SkillDef,
  facing: Facing8,
  playerSlot: SlotId,
): EnemyIntent {
  const hitSlots = hitSlotsFor(facing, skill.hit);
  return {
    kind: 'skill',
    skillId: skill.id,
    skillName: skill.name,
    facing,
    hitSlots,
    hitsPlayer: hitSlots.includes(playerSlot),
    text: `${skill.name} · 命中 ${formatSlots(hitSlots)}`,
  };
}

/**
 * 给 HUD 的「它现在面朝哪、下一步打哪」的一行摘要。
 * 意图为空（已结束/刚行动完）时回退到当前朝向。
 */
export function formatIntent(intent: EnemyIntent | null): string {
  if (!intent) return '——';
  if (intent.kind === 'turn') {
    return `转向 · 面朝${facingLabel(intent.facing)}`;
  }
  return `${intent.skillName} · 命中 ${formatSlots(intent.hitSlots)}`;
}
