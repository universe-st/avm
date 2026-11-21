import { describe, expect, it } from 'vitest';
import type { BattleAction, BattleEvent, BattleSetup, BattleState } from '../src/battle/types';
import { CH01_FIRST_BATTLE } from '../src/battle/data/ch01-first';
import { CH01_KITCHEN_BATTLE } from '../src/battle/data/ch01-kitchen';
import {
  applyBattleAction,
  createBattle,
  playerCanAttack,
  startNextTurn,
} from '../src/battle/core/battle';

interface DriveResult {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
  readonly actionCount: number;
}

/**
 * 通用驱动器：每次「轮到谁就按 decide 出招」；怪物永远执行锁定意图。
 * 与场景的回合循环同构，用来验证纯逻辑能走完整场。
 */
function drive(
  setup: BattleSetup,
  decide: (state: BattleState) => BattleAction,
  maxActions = 60,
): DriveResult {
  let state = createBattle(setup);
  const events: BattleEvent[] = [];
  let actionCount = 0;

  for (let guard = 0; guard < maxActions; guard += 1) {
    if (state.phase === 'victory' || state.phase === 'defeat') break;

    if (state.activeId === null) {
      const turn = startNextTurn(state);
      state = turn.state;
      events.push(...turn.events);
      continue;
    }

    const action: BattleAction =
      state.activeId === state.player.id ? decide(state) : { kind: 'enemy-act' };
    const result = applyBattleAction(state, action, setup);
    state = result.state;
    events.push(...result.events);
    actionCount += 1;
  }

  return { state, events, actionCount };
}

describe('first battle: no 解, scripted defeat', () => {
  it('rejects attack because the skill is not unlocked', () => {
    let state = startNextTurn(createBattle(CH01_FIRST_BATTLE)).state;
    state = applyBattleAction(state, { kind: 'enemy-act' }, CH01_FIRST_BATTLE).state;
    state = startNextTurn(state).state;
    expect(state.activeId).toBe(state.player.id);

    const before = state;
    const result = applyBattleAction(
      state,
      { kind: 'attack', skillId: 'player.jielitusi' },
      CH01_FIRST_BATTLE,
    );
    expect(result.state).toBe(before);
    expect(result.events).toEqual([]);
    expect(playerCanAttack(CH01_FIRST_BATTLE)).toBe(false);
  });

  it('ends in the clear protocol on the fourth enemy action, even while guarding', () => {
    const result = drive(CH01_FIRST_BATTLE, () => ({ kind: 'guard' }));
    expect(result.state.phase).toBe('defeat');
    expect(result.state.enemyActions).toBe(4);
    expect(result.state.player.hp).toBe(0);
    expect(result.events.some((event) => event.kind === 'protocol')).toBe(true);
    expect(
      result.events.some(
        (event) => event.kind === 'defeat' && event.cause === 'protocol',
      ),
    ).toBe(true);
    expect(result.events.some((event) => event.kind === 'victory')).toBe(false);
    expect(result.state.log.at(-1)?.text).toBe(CH01_FIRST_BATTLE.defeat.text);
  });

  it('lets the player move without taking a turn away from the monster', () => {
    let state = createBattle(CH01_FIRST_BATTLE);
    state = startNextTurn(state).state;
    state = applyBattleAction(state, { kind: 'enemy-act' }, CH01_FIRST_BATTLE).state;
    state = startNextTurn(state).state;
    expect(state.activeId).toBe(state.player.id);

    const moved = applyBattleAction(
      state,
      { kind: 'move', slot: 'upperLeft' },
      CH01_FIRST_BATTLE,
    );
    expect(moved.state.player.slot).toBe('upperLeft');
    expect(moved.state.activeId).toBeNull();
    expect(moved.state.enemyActions).toBe(1);
  });
});

describe('kitchen battle: 解离突刺', () => {
  it('front hit deals 16 and blinks to the mirror slot', () => {
    const state = startNextTurn(createBattle(CH01_KITCHEN_BATTLE)).state;
    expect(state.activeId).toBe(state.player.id);

    const result = applyBattleAction(
      state,
      { kind: 'attack', skillId: 'player.jielitusi' },
      CH01_KITCHEN_BATTLE,
    );
    expect(result.state.player.slot).toBe('right');
    expect(result.state.enemy.hp).toBe(CH01_KITCHEN_BATTLE.enemy.hp - 16);
    const attack = result.events.find((event) => event.kind === 'attack');
    expect(attack).toMatchObject({
      amount: 16,
      zone: 'front',
      backstab: false,
      from: 'left',
      to: 'right',
      teleported: true,
    });
  });

  it('dodges a committed front attack by moving behind (it misses)', () => {
    let state = startNextTurn(createBattle(CH01_KITCHEN_BATTLE)).state;
    state = applyBattleAction(
      state,
      { kind: 'move', slot: 'right' },
      CH01_KITCHEN_BATTLE,
    ).state;
    state = startNextTurn(state).state;
    expect(state.activeId).toBe(state.enemy.id);

    const result = applyBattleAction(state, { kind: 'enemy-act' }, CH01_KITCHEN_BATTLE);
    const hit = result.events.find((event) => event.kind === 'enemy-skill');
    expect(hit).toMatchObject({ hit: false, amount: 0 });
    expect(result.state.player.hp).toBe(CH01_KITCHEN_BATTLE.player.hp);
  });

  it('halves incoming damage while guarding', () => {
    let state = startNextTurn(createBattle(CH01_KITCHEN_BATTLE)).state;
    state = applyBattleAction(state, { kind: 'guard' }, CH01_KITCHEN_BATTLE).state;
    state = startNextTurn(state).state;
    expect(state.activeId).toBe(state.enemy.id);

    const result = applyBattleAction(state, { kind: 'enemy-act' }, CH01_KITCHEN_BATTLE);
    const hit = result.events.find((event) => event.kind === 'enemy-skill');
    // 12 × 1.1 = 13.2，防御 ×0.5 → 6.6 → 7
    expect(hit).toMatchObject({ hit: true, amount: 7 });
    expect(result.state.player.hp).toBe(CH01_KITCHEN_BATTLE.player.hp - 7);
  });

  it('wins in three attacks: one front blink, then two backstabs', () => {
    let moved = false;
    const result = drive(CH01_KITCHEN_BATTLE, () => {
      if (!moved) {
        moved = true;
        return { kind: 'move', slot: 'right' };
      }
      return { kind: 'attack', skillId: 'player.jielitusi' };
    });

    expect(result.state.phase).toBe('victory');
    expect(result.state.enemy.hp).toBe(0);

    const attacks = result.events.filter(
      (event): event is Extract<BattleEvent, { kind: 'attack' }> => event.kind === 'attack',
    );
    expect(attacks.map((event) => event.amount)).toEqual([24, 24, 16]);
    // 前两刀在背后（+50%），最后一刀从正面收尾并闪现到对侧。
    expect(attacks.filter((event) => event.backstab).length).toBeGreaterThanOrEqual(2);
    expect(attacks.at(-1)).toMatchObject({
      amount: 16,
      backstab: false,
      teleported: true,
    });
    expect(result.state.player.slot).toBe('left');

    // 怪物确实转身过一次，而且转向也算一次行动。
    const turn = result.events.find((event) => event.kind === 'enemy-turn');
    expect(turn).toBeDefined();
    expect(result.state.enemyActions).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic for the same action sequence', () => {
    const run = (): string => {
      let moved = false;
      const result = drive(CH01_KITCHEN_BATTLE, () => {
        if (!moved) {
          moved = true;
          return { kind: 'move', slot: 'right' };
        }
        return { kind: 'attack', skillId: 'player.jielitusi' };
      });
      return JSON.stringify({
        phase: result.state.phase,
        player: result.state.player,
        enemy: result.state.enemy,
        log: result.state.log,
        seq: result.state.seq,
      });
    };
    expect(run()).toBe(run());
  });

  it('can lose by HP when a heavy hit lands', () => {
    const fragile: BattleSetup = {
      ...CH01_KITCHEN_BATTLE,
      player: { ...CH01_KITCHEN_BATTLE.player, hp: 1 },
      enemy: { ...CH01_KITCHEN_BATTLE.enemy, atk: 30 },
    };
    const result = drive(fragile, () => ({ kind: 'guard' }));
    expect(result.state.phase).toBe('defeat');
    expect(
      result.events.some((event) => event.kind === 'defeat' && event.cause === 'hp'),
    ).toBe(true);
  });
});
