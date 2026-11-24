import { describe, expect, it } from 'vitest';
import type {
  BattleAction,
  BattleEvent,
  BattleSetup,
  BattleState,
  SlotId,
} from '../src/battle/types';
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

function drive(
  setup: BattleSetup,
  decide: (state: BattleState) => BattleAction,
  maxActions = 240,
): DriveResult {
  let state = createBattle(setup);
  const events: BattleEvent[] = [];
  let actionCount = 0;

  for (let guard = 0; guard < maxActions; guard += 1) {
    if (state.phase === 'victory' || state.phase === 'defeat') break;

    if (state.pendingMove) {
      const slot = state.pendingMove.slots[0] ?? state.party[0]!.slot;
      state = applyBattleAction(state, { kind: 'post-move', slot }, setup).state;
      continue;
    }

    if (state.activeId === null) {
      const turn = startNextTurn(state, setup);
      state = turn.state;
      events.push(...turn.events);
      continue;
    }

    const action: BattleAction =
      state.activeId === state.party[0]!.id ? decide(state) : { kind: 'enemy-act' };
    const result = applyBattleAction(state, action, setup);
    state = result.state;
    events.push(...result.events);
    actionCount += 1;
  }

  return { state, events, actionCount };
}

function withPartySlot(setup: BattleSetup, slot: SlotId): BattleSetup {
  return {
    ...setup,
    party: setup.party.map((unit, index) => (index === 0 ? { ...unit, slot } : unit)),
  };
}

function atPlayerTurn(setup: BattleSetup): BattleState {
  return startNextTurn(createBattle(setup), setup).state;
}

function findAttack(events: readonly BattleEvent[]): Extract<BattleEvent, { kind: 'attack' }> {
  const attack = events.find(
    (event): event is Extract<BattleEvent, { kind: 'attack' }> => event.kind === 'attack',
  );
  expect(attack).toBeDefined();
  return attack!;
}

describe('first battle: no 解, scripted defeat', () => {
  it('rejects attack because the skill is not unlocked', () => {
    let state = startNextTurn(createBattle(CH01_FIRST_BATTLE), CH01_FIRST_BATTLE).state;
    state = applyBattleAction(state, { kind: 'enemy-act' }, CH01_FIRST_BATTLE).state;
    state = startNextTurn(state, CH01_FIRST_BATTLE).state;
    expect(state.activeId).toBe(state.party[0]!.id);

    const before = state;
    const result = applyBattleAction(
      state,
      { kind: 'attack', skillId: 'player.jielitusi', targetId: state.enemies[0]!.id },
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
    expect(result.state.party[0]!.hp).toBe(0);
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
    state = { ...state, party: state.party.map((unit) => ({ ...unit, dodge: 0 })) };
    state = startNextTurn(state, CH01_FIRST_BATTLE).state;
    state = applyBattleAction(state, { kind: 'enemy-act' }, CH01_FIRST_BATTLE).state;
    state = startNextTurn(state, CH01_FIRST_BATTLE).state;
    expect(state.activeId).toBe(state.party[0]!.id);

    const moved = applyBattleAction(
      state,
      { kind: 'move', slot: 'upperLeft' },
      CH01_FIRST_BATTLE,
    );
    expect(moved.state.party[0]!.slot).toBe('upperLeft');
    expect(moved.state.activeId).toBeNull();
    expect(moved.state.enemyActions).toBe(1);
  });

  it('can move into the center once it is free', () => {
    const setup = withPartySlot(CH01_KITCHEN_BATTLE, 'left');
    const created = createBattle(setup);
    const state: BattleState = {
      ...created,
      enemies: created.enemies.map((enemy) =>
        enemy.id === 'cook-phantom-a'
          ? { ...enemy, slot: 'upperLeft' }
          : enemy,
      ),
    };
    const turn = startNextTurn(state, setup).state;
    expect(turn.activeId).toBe(turn.party[0]!.id);
    const moved = applyBattleAction(turn, { kind: 'move', slot: 'center' }, setup);
    expect(moved.state.party[0]!.slot).toBe('center');
  });
});

describe('kitchen battle: 解离突刺 / 双怪 / 受击转身', () => {
  it('front hit deals 13, stays in place, and offers a post-hit landing choice', () => {
    const state = atPlayerTurn(CH01_KITCHEN_BATTLE);
    expect(state.activeId).toBe(state.party[0]!.id);
    const target = state.enemies.find((enemy) => enemy.id === 'cook-phantom-a')!;

    const result = applyBattleAction(
      state,
      { kind: 'attack', skillId: 'player.jielitusi', targetId: target.id },
      CH01_KITCHEN_BATTLE,
    );
    // 非背袭命中不再自动闪现：玩家还在左，activeId 仍是玩家，等待落点。
    expect(result.state.party[0]!.slot).toBe('left');
    expect(result.state.activeId).toBe(state.party[0]!.id);
    expect(result.state.pendingMove).not.toBeNull();
    expect(result.state.pendingMove!.targetId).toBe(target.id);
    expect(result.state.pendingMove!.slots).toContain('right');
    const attacked = result.state.enemies.find((enemy) => enemy.id === target.id)!;
    expect(attacked.hp).toBe(target.hp - 13);
    // 受击转向攻击来向（左）。
    expect(attacked.facing).toBe('left');
    const attack = findAttack(result.events);
    expect(attack).toMatchObject({
      targetId: target.id,
      targetSlot: 'center',
      amount: 13,
      zone: 'front',
      backstab: false,
      from: 'left',
    });
    expect(attack).not.toHaveProperty('to');
    expect(attack).not.toHaveProperty('teleported');
    const face = result.events.find(
      (event) => event.kind === 'enemy-face' && event.actorId === target.id,
    );
    expect(face).toMatchObject({ reason: 'hit', facing: 'left' });

    // 选右侧落点后行动才结束、gauge 才归零。
    const landed = applyBattleAction(
      result.state,
      { kind: 'post-move', slot: 'right' },
      CH01_KITCHEN_BATTLE,
    );
    expect(landed.state.party[0]!.slot).toBe('right');
    expect(landed.state.party[0]!.gauge).toBe(0);
    expect(landed.state.activeId).toBeNull();
    expect(landed.state.pendingMove).toBeNull();
    expect(landed.events.some((event) => event.kind === 'move')).toBe(true);
  });

  it('backstab deals 23, stays in place, and does not enter pendingMove', () => {
    const setup = withPartySlot(CH01_KITCHEN_BATTLE, 'right');
    const state = atPlayerTurn(setup);
    const target = state.enemies.find((enemy) => enemy.id === 'cook-phantom-a')!;
    expect(target.facing).toBe('right');

    // 手工把目标转向左，制造“从背后砍”的局面。
    const behind: BattleState = {
      ...state,
      enemies: state.enemies.map((enemy) =>
        enemy.id === target.id ? { ...enemy, facing: 'left' } : enemy,
      ),
    };
    const result = applyBattleAction(
      behind,
      { kind: 'attack', skillId: 'player.jielitusi', targetId: target.id },
      setup,
    );
    const attacked = result.state.enemies.find((enemy) => enemy.id === target.id)!;
    // 24 - 3×0.5 = 22.5 → 23
    expect(attacked.hp).toBe(target.hp - 23);
    expect(result.state.party[0]!.slot).toBe('right');
    expect(result.state.pendingMove).toBeNull();
    expect(result.state.activeId).toBeNull();
    expect(attacked.facing).toBe('right');
    const attack = findAttack(result.events);
    expect(attack).toMatchObject({
      amount: 23,
      zone: 'back',
      backstab: true,
      from: 'right',
    });
  });

  it('rejects moving straight across the arena', () => {
    const state = atPlayerTurn(CH01_KITCHEN_BATTLE);
    const result = applyBattleAction(
      state,
      { kind: 'move', slot: 'right' },
      CH01_KITCHEN_BATTLE,
    );
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });

  it('rejects attacking a non-adjacent enemy', () => {
    const state = atPlayerTurn(CH01_KITCHEN_BATTLE);
    const far = state.enemies.find((enemy) => enemy.id === 'cook-phantom-b')!;
    expect(far.slot).toBe('upperRight');
    const result = applyBattleAction(
      state,
      { kind: 'attack', skillId: 'player.jielitusi', targetId: far.id },
      CH01_KITCHEN_BATTLE,
    );
    expect(result.state).toBe(state);
    expect(result.events).toEqual([]);
  });

  it('moves a monster to an adjacent point and faces the movement direction', () => {
    const created = createBattle(CH01_KITCHEN_BATTLE);
    const b = created.enemies.find((enemy) => enemy.id === 'cook-phantom-b')!;
    const state: BattleState = { ...created, phase: 'enemy', activeId: b.id };
    const result = applyBattleAction(state, { kind: 'enemy-act' }, CH01_KITCHEN_BATTLE);
    const moved = result.state.enemies.find((enemy) => enemy.id === b.id)!;
    expect(moved.slot).toBe('upperLeft');
    expect(moved.facing).toBe('left');
    const event = result.events.find((candidate) => candidate.kind === 'enemy-move');
    expect(event).toMatchObject({
      actorId: b.id,
      from: 'upperRight',
      to: 'upperLeft',
      facing: 'left',
      blocked: false,
    });
  });

  it('does not execute a monster move into an occupied point', () => {
    const created = createBattle(CH01_KITCHEN_BATTLE);
    const b = created.enemies.find((enemy) => enemy.id === 'cook-phantom-b')!;
    const player = created.party[0]!;
    const state: BattleState = {
      ...created,
      phase: 'enemy',
      activeId: b.id,
      party: [{ ...player, slot: 'upperLeft' }],
      intents: {
        ...created.intents,
        [b.id]: {
          kind: 'move',
          from: 'upperRight',
          to: 'upperLeft',
          facing: 'left',
          targetId: player.id,
          text: '移动 · 左上（面朝左）',
        },
      },
    };
    const result = applyBattleAction(state, { kind: 'enemy-act' }, CH01_KITCHEN_BATTLE);
    const move = result.events.find((event) => event.kind === 'enemy-move');
    if (move) {
      expect(move.to).not.toBe('upperLeft');
      expect(move.blocked).toBe(false);
    }
    const moved = result.state.enemies.find((enemy) => enemy.id === b.id)!;
    expect(moved.slot).not.toBe('upperLeft');
    expect(result.state.enemyActions).toBe(1);
  });

  it('does not end the battle after only one enemy dies; the killing blow still offers landing', () => {
    const setup = withPartySlot(CH01_KITCHEN_BATTLE, 'left');
    let state = atPlayerTurn(setup);
    const player = state.party[0]!;
    const a = state.enemies.find((enemy) => enemy.id === 'cook-phantom-a')!;
    const b = state.enemies.find((enemy) => enemy.id === 'cook-phantom-b')!;
    state = {
      ...state,
      enemies: state.enemies.map((enemy) => ({ ...enemy, hp: 1 })),
    };

    const first = applyBattleAction(
      state,
      { kind: 'attack', skillId: 'player.jielitusi', targetId: a.id },
      setup,
    );
    expect(first.state.phase).not.toBe('victory');
    expect(first.state.enemies.find((enemy) => enemy.id === a.id)!.hp).toBe(0);
    expect(first.state.enemies.find((enemy) => enemy.id === b.id)!.hp).toBe(1);
    expect(first.state.intents[a.id]).toBeUndefined();
    expect(first.state.pendingMove?.targetId).toBe(a.id);
    expect(first.state.party[0]!.slot).toBe('left');

    const landed = applyBattleAction(
      first.state,
      { kind: 'post-move', slot: 'right' },
      setup,
    );
    expect(landed.state.pendingMove).toBeNull();
    expect(landed.state.party[0]!.slot).toBe('right');

    const secondState: BattleState = {
      ...landed.state,
      phase: 'player',
      activeId: player.id,
    };
    const second = applyBattleAction(
      secondState,
      { kind: 'attack', skillId: 'player.jielitusi', targetId: b.id },
      setup,
    );
    expect(second.state.phase).toBe('victory');
    expect(second.state.enemies.every((enemy) => enemy.hp === 0)).toBe(true);
    expect(second.events.some((event) => event.kind === 'victory')).toBe(true);
  });

  it('halves incoming damage while guarding', () => {
    const setup = withPartySlot(CH01_KITCHEN_BATTLE, 'left');
    let state = atPlayerTurn(setup);
    state = { ...state, party: state.party.map((unit) => ({ ...unit, dodge: 0 })) };
    state = applyBattleAction(state, { kind: 'guard' }, setup).state;
    state = startNextTurn(state, setup).state;
    expect(state.activeId).toBe(
      state.enemies.find((enemy) => enemy.id === 'cook-phantom-a')!.id,
    );

    const result = applyBattleAction(state, { kind: 'enemy-act' }, setup);
    const hit = result.events.find(
      (event) => event.kind === 'enemy-skill' && event.actorId === 'cook-phantom-a',
    );
    // 10 × 1.1 = 11，防御 ×0.5 → 5.5 → 6
    expect(hit).toMatchObject({ hit: true, amount: 6 });
    expect(result.state.party[0]!.hp).toBe(setup.party[0]!.hp - 6);
  });

  it('can lose by HP when a heavy hit lands', () => {
    const fragile: BattleSetup = {
      ...CH01_KITCHEN_BATTLE,
      party: [{ ...CH01_KITCHEN_BATTLE.party[0]!, hp: 1 }],
      enemies: CH01_KITCHEN_BATTLE.enemies.map((enemy) => ({ ...enemy, atk: 30 })),
    };
    const result = drive(fragile, () => ({ kind: 'guard' }));
    expect(result.state.phase).toBe('defeat');
    expect(
      result.events.some((event) => event.kind === 'defeat' && event.cause === 'hp'),
    ).toBe(true);
  });
});
