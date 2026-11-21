import { describe, expect, it } from 'vitest';
import { CH01_FIRST_BATTLE } from '../src/battle/data/ch01-first';
import {
  applyBattleAction,
  createBattle,
  startNextTurn,
} from '../src/battle/core/battle';
import { GAUGE_MAX, planNextActor, previewOrder } from '../src/battle/core/gauge';
import type { BattleState } from '../src/battle/types';

function step(state: BattleState): BattleState {
  if (state.activeId === null) return startNextTurn(state).state;
  const action =
    state.activeId === state.player.id
      ? ({ kind: 'guard' } as const)
      : ({ kind: 'enemy-act' } as const);
  return applyBattleAction(state, action, CH01_FIRST_BATTLE).state;
}

describe('battle gauge / turn order', () => {
  it('the faster miner acts first and starts at full gauge', () => {
    const state = createBattle(CH01_FIRST_BATTLE);
    const plan = planNextActor(state);
    expect(plan.actorId).toBe(state.enemy.id);
    expect(plan.playerGauge).toBe(700);
    expect(plan.enemyGauge).toBe(GAUGE_MAX);
  });

  it('startNextTurn locks the active actor and never advances twice', () => {
    const state = createBattle(CH01_FIRST_BATTLE);
    const first = startNextTurn(state);
    expect(first.state.activeId).toBe(state.enemy.id);
    expect(first.state.phase).toBe('enemy');
    expect(first.events[0]).toMatchObject({ kind: 'turn-start', actorId: state.enemy.id });

    const again = startNextTurn(first.state);
    expect(again.state).toBe(first.state);
    expect(again.events).toEqual([]);
  });

  it('resets the gauge after each action and yields E,P,E,P,E over five turns', () => {
    let state = createBattle(CH01_FIRST_BATTLE);
    const order: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      state = startNextTurn(state).state;
      order.push(state.activeId === state.player.id ? 'player' : 'enemy');
      state = step(state);
    }
    expect(order).toEqual(['enemy', 'player', 'enemy', 'player', 'enemy']);
    expect(state.player.gauge).toBeLessThan(GAUGE_MAX);
    expect(state.enemy.gauge).toBeLessThan(GAUGE_MAX);
  });

  it('previewOrder starts with the active actor and is deterministic', () => {
    const state = startNextTurn(createBattle(CH01_FIRST_BATTLE)).state;
    const first = previewOrder(state, 7);
    const second = previewOrder(state, 7);
    expect(first).toEqual(second);
    expect(first[0]).toBe(state.enemy.id);
    const enemyCount = first.filter((id) => id === state.enemy.id).length;
    const playerCount = first.filter((id) => id === state.player.id).length;
    expect(enemyCount).toBeGreaterThan(playerCount);
  });

  it('previewOrder does not mutate the state', () => {
    const state = createBattle(CH01_FIRST_BATTLE);
    const before = `${state.player.gauge}/${state.enemy.gauge}`;
    previewOrder(state, 6);
    expect(`${state.player.gauge}/${state.enemy.gauge}`).toBe(before);
  });

  it('breaks an exact tie in favour of the enemy, then the faster unit', () => {
    const even = {
      ...CH01_FIRST_BATTLE,
      player: { ...CH01_FIRST_BATTLE.player, spd: 10 },
      enemy: { ...CH01_FIRST_BATTLE.enemy, spd: 10 },
    };
    const state = createBattle(even);
    expect(planNextActor(state).actorId).toBe(state.enemy.id);
    expect(planNextActor(state).playerGauge).toBe(GAUGE_MAX);
    expect(planNextActor(state).enemyGauge).toBe(GAUGE_MAX);
  });
});
