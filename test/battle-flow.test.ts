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
  it('front hit deals 16, blinks to the mirror slot, and the enemy turns to the attack origin', () => {
    const state = atPlayerTurn(CH01_KITCHEN_BATTLE);
    expect(state.activeId).toBe(state.party[0]!.id);
    const target = state.enemies.find((enemy) => enemy.id === 'cook-phantom-a')!;

    const result = applyBattleAction(
      state,
      { kind: 'attack', skillId: 'player.jielitusi', targetId: target.id },
      CH01_KITCHEN_BATTLE,
    );
    expect(result.state.party[0]!.slot).toBe('right');
    const attacked = result.state.enemies.find((enemy) => enemy.id === target.id)!;
    expect(attacked.hp).toBe(target.hp - 16);
    // 玩家闪到右边，但怪物面向的是攻击来向（左），不是闪现后的落点。
    expect(attacked.facing).toBe('left');
    const attack = findAttack(result.events);
    expect(attack).toMatchObject({
      targetId: target.id,
      targetSlot: 'center',
      amount: 16,
      zone: 'front',
      backstab: false,
      from: 'left',
      to: 'right',
      teleported: true,
    });
    const face = result.events.find(
      (event) => event.kind === 'enemy-face' && event.actorId === target.id,
    );
    expect(face).toMatchObject({ reason: 'hit', facing: 'left' });
  });

  it('backstab deals 24, stays in place, and turns the enemy toward the attacker', () => {
    const setup = withPartySlot(CH01_KITCHEN_BATTLE, 'right');
    const state = atPlayerTurn(setup);
    const target = state.enemies.find((enemy) => enemy.id === 'cook-phantom-a')!;
    expect(target.facing).toBe('right');

    // 手工把目标转向左，制造“从背后砍”的局面（真实流程里是绕位/闪现得到）。
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
    expect(attacked.hp).toBe(target.hp - 24);
    expect(result.state.party[0]!.slot).toBe('right');
    expect(attacked.facing).toBe('right');
    const attack = findAttack(result.events);
    expect(attack).toMatchObject({
      amount: 24,
      zone: 'back',
      backstab: true,
      teleported: false,
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

  it('fails a monster move when the destination is occupied', () => {
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
    const moved = result.state.enemies.find((enemy) => enemy.id === b.id)!;
    expect(moved.slot).toBe('upperRight');
    expect(result.events.find((event) => event.kind === 'enemy-move')).toMatchObject({
      blocked: true,
      to: 'upperLeft',
    });
    expect(result.state.enemyActions).toBe(1);
  });

  it('does not end the battle after only one enemy dies', () => {
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
    expect(first.state.party[0]!.slot).toBe('right');

    const secondState: BattleState = {
      ...first.state,
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
