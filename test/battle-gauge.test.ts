import { describe, expect, it } from 'vitest';
import { CH01_FIRST_BATTLE } from '../src/battle/data/ch01-first';
import { CH01_KITCHEN_BATTLE } from '../src/battle/data/ch01-kitchen';
import {
  applyBattleAction,
  createBattle,
  startNextTurn,
} from '../src/battle/core/battle';
import { GAUGE_MAX, planNextActor, previewOrder } from '../src/battle/core/gauge';
import type { BattleSetup, BattleState } from '../src/battle/types';

function step(state: BattleState, setup: BattleSetup): BattleState {
  if (state.activeId === null) return startNextTurn(state, setup).state;
  const action =
    state.activeId === state.party[0]!.id
      ? ({ kind: 'guard' } as const)
      : ({ kind: 'enemy-act' } as const);
  return applyBattleAction(state, action, setup).state;
}

function gaugesOf(state: BattleState): Record<string, number> {
  return Object.fromEntries([...state.party, ...state.enemies].map((unit) => [unit.id, unit.gauge]));
}

describe('battle gauge / turn order', () => {
  it('the faster miner acts first and starts at full gauge', () => {
    const state = createBattle(CH01_FIRST_BATTLE);
    const plan = planNextActor(state);
    expect(plan.actorId).toBe(state.enemies[0]!.id);
    expect(plan.gauges[state.party[0]!.id]).toBe(700);
    expect(plan.gauges[state.enemies[0]!.id]).toBe(GAUGE_MAX);
  });

  it('startNextTurn locks the active actor and never advances twice', () => {
    const state = createBattle(CH01_FIRST_BATTLE);
    const first = startNextTurn(state, CH01_FIRST_BATTLE);
    expect(first.state.activeId).toBe(state.enemies[0]!.id);
    expect(first.state.phase).toBe('enemy');
    expect(first.events[0]).toMatchObject({
      kind: 'turn-start',
      actorId: state.enemies[0]!.id,
    });

    const again = startNextTurn(first.state, CH01_FIRST_BATTLE);
    expect(again.state).toBe(first.state);
    expect(again.events).toEqual([]);
  });

  it('resets the gauge after each action and yields E,P,E,P,E over five turns', () => {
    let state = createBattle(CH01_FIRST_BATTLE);
    const order: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      state = startNextTurn(state, CH01_FIRST_BATTLE).state;
      order.push(state.activeId === state.party[0]!.id ? 'player' : 'enemy');
      state = step(state, CH01_FIRST_BATTLE);
    }
    expect(order).toEqual(['enemy', 'player', 'enemy', 'player', 'enemy']);
    expect(state.party[0]!.gauge).toBeLessThan(GAUGE_MAX);
    expect(state.enemies[0]!.gauge).toBeLessThan(GAUGE_MAX);
  });

  it('orders three units by SPD and advances all gauges', () => {
    let state = createBattle(CH01_KITCHEN_BATTLE);
    const order: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      state = startNextTurn(state, CH01_KITCHEN_BATTLE).state;
      order.push(state.activeId!);
      state = step(state, CH01_KITCHEN_BATTLE);
    }
    expect(order).toEqual([
      state.party[0]!.id,
      'cook-phantom-a',
      'cook-phantom-b',
    ]);
    const gauges = gaugesOf(state);
    for (const value of Object.values(gauges)) expect(value).toBeLessThan(GAUGE_MAX);
  });

  it('previewOrder starts with the active actor and is deterministic', () => {
    const state = startNextTurn(createBattle(CH01_FIRST_BATTLE), CH01_FIRST_BATTLE).state;
    const first = previewOrder(state, 7);
    const second = previewOrder(state, 7);
    expect(first).toEqual(second);
    expect(first[0]).toBe(state.enemies[0]!.id);
    const enemyCount = first.filter((id) => id === state.enemies[0]!.id).length;
    const playerCount = first.filter((id) => id === state.party[0]!.id).length;
    expect(enemyCount).toBeGreaterThan(playerCount);
  });

  it('previewOrder does not mutate the state', () => {
    const state = createBattle(CH01_FIRST_BATTLE);
    const before = `${state.party[0]!.gauge}/${state.enemies[0]!.gauge}`;
    previewOrder(state, 6);
    expect(`${state.party[0]!.gauge}/${state.enemies[0]!.gauge}`).toBe(before);
  });

  it('previewOrder includes every living unit and excludes the dead', () => {
    const kitchen = createBattle(CH01_KITCHEN_BATTLE);
    const state: BattleState = {
      ...kitchen,
      enemies: kitchen.enemies.map((enemy) =>
        enemy.id === 'cook-phantom-a' ? { ...enemy, hp: 0 } : enemy,
      ),
    };
    const order = previewOrder(state, 12);
    expect(order).toContain(state.party[0]!.id);
    expect(order).toContain('cook-phantom-b');
    expect(order).not.toContain('cook-phantom-a');
  });

  it('breaks an exact tie in favour of the enemy, then the faster unit', () => {
    const even: BattleSetup = {
      ...CH01_FIRST_BATTLE,
      party: [{ ...CH01_FIRST_BATTLE.party[0]!, spd: 10 }],
      enemies: [{ ...CH01_FIRST_BATTLE.enemies[0]!, spd: 10 }],
    };
    const state = createBattle(even);
    const plan = planNextActor(state);
    expect(plan.actorId).toBe(state.enemies[0]!.id);
    expect(plan.gauges[state.party[0]!.id]).toBe(GAUGE_MAX);
    expect(plan.gauges[state.enemies[0]!.id]).toBe(GAUGE_MAX);
  });
});
