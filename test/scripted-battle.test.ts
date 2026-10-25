import { describe, expect, it } from 'vitest';
import {
  advanceForPreview,
  applyBattleAction,
  createBattle,
} from '../src/battle/core/scripted-battle';
import {
  CH01_FIRST_BATTLE,
  CH01_FIRST_PLAYER_DAMAGE,
} from '../src/battle/data/ch01-first';
import type { BattleAction, BattleState } from '../src/battle/types';

const SETUP = CH01_FIRST_BATTLE;

function run(actions: readonly BattleAction[]): Map<string, BattleState> {
  const states = new Map<string, BattleState>();
  let state = createBattle(SETUP);
  states.set('start', state);
  actions.forEach((action, index) => {
    if (state.phase === 'player') {
      state = applyBattleAction(state, action, SETUP).state;
    }
    states.set(`after-${index}`, state);
  });
  return states;
}

describe('scripted first battle', () => {
  it('deals exactly 1 damage per player attack, regardless of stats', () => {
    const state = createBattle(SETUP);
    const result = applyBattleAction(state, 'attack', SETUP);
    expect(result.state.enemy.hp).toBe(SETUP.enemy.hp - 1);
    expect(result.state.playerAttacks).toBe(1);
    const attack = result.events.find((event) => event.type === 'player-attack');
    expect(attack).toMatchObject({ amount: CH01_FIRST_PLAYER_DAMAGE });
    expect(attack?.amount).toBe(1);
    expect(result.state.player.hp).toBe(SETUP.player.hp - SETUP.enemy.attackDamage);
  });

  it('halves enemy damage when guarding', () => {
    const state = createBattle(SETUP);
    const result = applyBattleAction(state, 'guard', SETUP);
    expect(result.state.player.hp).toBe(
      SETUP.player.hp - Math.floor(SETUP.enemy.attackDamage / 2),
    );
    expect(result.state.enemy.hp).toBe(SETUP.enemy.hp);
    expect(result.events.some((event) => event.type === 'guard')).toBe(true);
  });

  it('always ends in defeat for every three-action sequence', () => {
    const sequences: BattleAction[][] = [];
    for (const a of ['attack', 'guard'] as const) {
      for (const b of ['attack', 'guard'] as const) {
        for (const c of ['attack', 'guard'] as const) {
          sequences.push([a, b, c]);
        }
      }
    }

    for (const sequence of sequences) {
      const states = run(sequence);
      const end = states.get('after-2');
      expect(end, sequence.join(',')).toBeDefined();
      expect(end?.phase, sequence.join(',')).toBe('defeat');
      expect(end?.player.hp, sequence.join(',')).toBe(0);
    }
  });

  it('uses the protocol to finish a guard-heavy run at the round cap', () => {
    const result = run(['guard', 'guard', 'guard']);
    const end = result.get('after-2');
    expect(end?.phase).toBe('defeat');
    expect(end?.player.hp).toBe(0);
    expect(end?.log.some((entry) => entry.text.includes('清除协议'))).toBe(true);
  });

  it('leaves a visible 117/120 shell after three attacks', () => {
    const result = run(['attack', 'attack', 'attack']);
    const end = result.get('after-2');
    expect(end?.enemy.hp).toBe(117);
    expect(end?.enemy.maxHp).toBe(120);
    expect(end?.playerAttacks).toBe(3);
  });

  it('never reports victory', () => {
    for (const sequence of [
      ['attack', 'attack', 'attack'],
      ['guard', 'attack', 'guard'],
      ['guard', 'guard', 'guard'],
    ] as const) {
      const end = run(sequence).get('after-2');
      expect(end?.phase).not.toBe('victory');
    }
  });

  it('ignores actions after defeat and is deterministic', () => {
    let state = createBattle(SETUP);
    for (const action of ['attack', 'attack', 'attack'] as const) {
      state = applyBattleAction(state, action, SETUP).state;
    }
    const after = applyBattleAction(state, 'attack', SETUP);
    expect(after.events).toEqual([]);
    expect(after.state).toBe(state);

    const first = run(['attack', 'guard', 'attack']);
    const second = run(['attack', 'guard', 'attack']);
    expect(first.get('after-2')?.log).toEqual(second.get('after-2')?.log);
  });

  it('advances one round for the preview mid snapshot', () => {
    const mid = advanceForPreview(createBattle(SETUP), SETUP, 1);
    expect(mid.round).toBe(2);
    expect(mid.phase).toBe('player');
    expect(mid.enemy.hp).toBe(119);
    expect(mid.player.hp).toBe(60);
  });
});
