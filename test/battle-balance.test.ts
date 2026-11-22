import { describe, expect, it } from 'vitest';
import type { BattleAction, BattleSetup, BattleState, SlotId } from '../src/battle/types';
import { CH01_FIRST_BATTLE } from '../src/battle/data/ch01-first';
import { CH01_KITCHEN_BATTLE } from '../src/battle/data/ch01-kitchen';
import {
  applyBattleAction,
  createBattle,
  isSlotOccupied,
  livingEnemies,
  startNextTurn,
} from '../src/battle/core/battle';
import { isAdjacentSlot, pointDistance, shortestStepToward } from '../src/battle/core/slots';

interface PlayResult {
  readonly state: BattleState;
  readonly playerActions: number;
}

function play(
  setup: BattleSetup,
  decide: (state: BattleState) => BattleAction,
  maxSteps = 240,
): PlayResult {
  let state = createBattle(setup);
  let playerActions = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    if (state.phase === 'victory' || state.phase === 'defeat') break;

    if (state.activeId === null) {
      state = startNextTurn(state, setup).state;
      continue;
    }

    if (state.activeId !== state.party[0]!.id) {
      state = applyBattleAction(state, { kind: 'enemy-act' }, setup).state;
      continue;
    }

    state = applyBattleAction(state, decide(state), setup).state;
    playerActions += 1;
  }

  return { state, playerActions };
}

/** 实机里玩家最自然的打法：低血防御，否则打相邻最低血，够不着就走近。 */
function sensibleAction(state: BattleState): BattleAction {
  const actor = state.party[0]!;
  const skillId = CH01_KITCHEN_BATTLE.party[0]!.skills[0];
  if (!skillId) return { kind: 'guard' };
  if (actor.hp <= 30) return { kind: 'guard' };

  const adjacent = livingEnemies(state)
    .filter((enemy) => isAdjacentSlot(actor.slot, enemy.slot))
    .sort((a, b) => a.hp - b.hp || (a.id < b.id ? -1 : 1));
  if (adjacent[0]) {
    return { kind: 'attack', skillId, targetId: adjacent[0].id };
  }

  const nearest = [...livingEnemies(state)].sort((a, b) => {
    const da = pointDistance(actor.slot, a.slot);
    const db = pointDistance(actor.slot, b.slot);
    return da - db || a.hp - b.hp;
  })[0];
  if (!nearest) return { kind: 'guard' };

  const blocked = new Set<SlotId>(
    [...state.party, ...state.enemies]
      .filter((unit) => unit.hp > 0)
      .map((unit) => unit.slot),
  );
  blocked.delete(actor.slot);
  const step = shortestStepToward(actor.slot, nearest.slot, blocked);
  if (step && !isSlotOccupied(state, step)) return { kind: 'move', slot: step };
  return { kind: 'guard' };
}

describe('battle balance probes', () => {
  it('lets a sensible player win the kitchen duel within 4–6 actions and keep HP >= 20', () => {
    const result = play(CH01_KITCHEN_BATTLE, sensibleAction);
    expect(result.state.phase).toBe('victory');
    expect(result.playerActions).toBeGreaterThanOrEqual(4);
    expect(result.playerActions).toBeLessThanOrEqual(6);
    expect(result.state.party[0]!.hp).toBeGreaterThanOrEqual(20);
  });

  it('lets a guard-only player lose the kitchen duel', () => {
    const result = play(CH01_KITCHEN_BATTLE, () => ({ kind: 'guard' }));
    expect(result.state.phase).toBe('defeat');
  });

  it('never lets the first battle be won', () => {
    const result = play(CH01_FIRST_BATTLE, () => ({ kind: 'guard' }));
    expect(result.state.phase).toBe('defeat');
    expect(result.state.enemyActions).toBe(4);
  });
});
