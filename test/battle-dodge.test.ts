import { describe, expect, it } from 'vitest';
import type { BattleSetup, BattleState } from '../src/battle/types';
import { CH01_FIRST_BATTLE } from '../src/battle/data/ch01-first';
import { CH01_KITCHEN_BATTLE } from '../src/battle/data/ch01-kitchen';
import { createBattle, applyBattleAction } from '../src/battle/core/battle';
import { dodgeChance, dodgePercent } from '../src/battle/core/dodge';

function withPartySlot(setup: BattleSetup, slot: BattleState['party'][number]['slot']): BattleSetup {
  return {
    ...setup,
    party: setup.party.map((unit, index) => (index === 0 ? { ...unit, slot } : unit)),
  };
}

function atEnemyTurn(state: BattleState, enemyId: string): BattleState {
  return { ...state, phase: 'enemy', activeId: enemyId };
}

function enemyAt(
  state: BattleState,
  enemyId: string,
  slot: BattleState['enemies'][number]['slot'],
): BattleState {
  return {
    ...state,
    enemies: state.enemies.map((enemy) =>
      enemy.id === enemyId ? { ...enemy, slot, facing: 'left' } : enemy,
    ),
  };
}

describe('dodge（闪避）', () => {
  it('uses 1 - 200/(3x+200), never reaching 100%', () => {
    expect(dodgeChance(0)).toBe(0);
    expect(dodgeChance(100)).toBeCloseTo(0.6, 8);
    expect(dodgePercent(100)).toBe(100 - 40);
    expect(dodgeChance(10000)).toBeGreaterThan(0.99);
    expect(dodgeChance(10000)).toBeLessThan(1);
    expect(dodgeChance(-10)).toBe(0);
  });

  it('dodges a normal enemy attack when an adjacent empty slot exists', () => {
    let found: { state: BattleState; result: ReturnType<typeof applyBattleAction> } | null = null;
    for (let seed = 1; seed <= 120 && !found; seed += 1) {
      const state = atEnemyTurn(createBattle(CH01_KITCHEN_BATTLE, seed), 'cook-phantom-a');
      const result = applyBattleAction(state, { kind: 'enemy-act' }, CH01_KITCHEN_BATTLE);
      if (result.events.some((event) => event.kind === 'dodge')) found = { state, result };
    }
    expect(found).not.toBeNull();
    const { state, result } = found!;
    const dodge = result.events.find((event) => event.kind === 'dodge');
    const enemySkill = result.events.find((event) => event.kind === 'enemy-skill');
    expect(dodge).toMatchObject({ kind: 'dodge', attackerId: 'cook-phantom-a', aoe: false });
    expect(enemySkill).toMatchObject({ kind: 'enemy-skill', hit: false, dodged: true, amount: 0 });
    expect(result.state.party[0]!.hp).toBe(state.party[0]!.hp);
    expect(result.state.party[0]!.slot).not.toBe(state.party[0]!.slot);
  });

  it('does not dodge when all adjacent slots are occupied', () => {
    const setup: BattleSetup = {
      ...CH01_KITCHEN_BATTLE,
      enemies: [
        { ...CH01_KITCHEN_BATTLE.enemies[0]!, slot: 'center' },
        { ...CH01_KITCHEN_BATTLE.enemies[1]!, id: 'upper-blocker', slot: 'upperLeft' },
        { ...CH01_KITCHEN_BATTLE.enemies[1]!, id: 'lower-blocker', slot: 'lowerLeft' },
      ],
    };
    const created = createBattle(setup, 7);
    const state = atEnemyTurn(created, 'cook-phantom-a');
    const result = applyBattleAction(state, { kind: 'enemy-act' }, setup);
    expect(result.events.some((event) => event.kind === 'dodge')).toBe(false);
    const enemySkill = result.events.find((event) => event.kind === 'enemy-skill');
    expect(enemySkill).toMatchObject({ kind: 'enemy-skill', hit: true });
    expect(result.state.party[0]!.hp).toBeLessThan(state.party[0]!.hp);
  });

  it('can dodge an all-slot attack when an adjacent empty slot exists', () => {
    const setup = withPartySlot(CH01_FIRST_BATTLE, 'left');
    let found: ReturnType<typeof applyBattleAction> | null = null;
    for (let seed = 1; seed <= 160 && !found; seed += 1) {
      let state = createBattle(setup, seed);
      state = enemyAt(state, 'miner.clear-unit', 'upperRight');
      state = atEnemyTurn(state, 'miner.clear-unit');
      const result = applyBattleAction(state, { kind: 'enemy-act' }, setup);
      if (result.events.some((event) => event.kind === 'dodge')) found = result;
    }
    expect(found).not.toBeNull();
    const dodge = found!.events.find((event) => event.kind === 'dodge');
    const enemySkill = found!.events.find((event) => event.kind === 'enemy-skill');
    expect(dodge).toMatchObject({ kind: 'dodge', aoe: true });
    expect(enemySkill).toMatchObject({ kind: 'enemy-skill', hit: false, dodged: true, aoe: true });
    expect(found!.state.party[0]!.hp).toBe(setup.party[0]!.hp);
  });

  it('does not deliberately attack empty points: an enemy with no in-range target waits', () => {
    const setup = withPartySlot(CH01_FIRST_BATTLE, 'left');
    let state = createBattle(setup, 3);
    state = enemyAt(state, 'miner.clear-unit', 'upperRight');
    state = {
      ...state,
      enemies: state.enemies.map((enemy) => ({
        ...enemy,
        cooldowns: { 'miner.quake': 3 },
      })),
    };
    state = atEnemyTurn(state, 'miner.clear-unit');
    const result = applyBattleAction(state, { kind: 'enemy-act' }, setup);
    expect(result.events.some((event) => event.kind === 'enemy-skill')).toBe(false);
    expect(result.events.some((event) => event.kind === 'enemy-move')).toBe(false);
    expect(result.events.some((event) => event.kind === 'log')).toBe(true);
    expect(result.state.enemyActions).toBe(1);
  });
});
