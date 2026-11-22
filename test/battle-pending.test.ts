import { describe, expect, it } from 'vitest';
import type { BattleState } from '../src/battle/types';
import { CH01_FIRST_BATTLE } from '../src/battle/data/ch01-first';
import { CH01_KITCHEN_BATTLE } from '../src/battle/data/ch01-kitchen';
import { BATTLE_SANDBOX_MULTI } from '../src/battle/data/sandbox-multi';
import {
  applyBattleAction,
  createBattle,
  startNextTurn,
} from '../src/battle/core/battle';

function pendingKitchen(): BattleState {
  const state = startNextTurn(createBattle(CH01_KITCHEN_BATTLE), CH01_KITCHEN_BATTLE).state;
  const target = state.enemies.find((enemy) => enemy.id === 'cook-phantom-a')!;
  const result = applyBattleAction(
    state,
    { kind: 'attack', skillId: 'player.jielitusi', targetId: target.id },
    CH01_KITCHEN_BATTLE,
  );
  expect(result.state.pendingMove).not.toBeNull();
  return result.state;
}

describe('pending post-hit landing', () => {
  it('rejects guard / move / attack while pending', () => {
    const pending = pendingKitchen();
    for (const action of [
      { kind: 'guard' as const },
      { kind: 'move' as const, slot: 'upperLeft' as const },
      {
        kind: 'attack' as const,
        skillId: 'player.jielitusi',
        targetId: 'cook-phantom-a',
      },
    ]) {
      const result = applyBattleAction(pending, action, CH01_KITCHEN_BATTLE);
      expect(result.state).toBe(pending);
      expect(result.events).toEqual([]);
    }
  });

  it('can stay in place, ends the action, and emits a log instead of a move', () => {
    const pending = pendingKitchen();
    const result = applyBattleAction(
      pending,
      { kind: 'post-move', slot: 'left' },
      CH01_KITCHEN_BATTLE,
    );
    expect(result.state.party[0]!.slot).toBe('left');
    expect(result.state.party[0]!.gauge).toBe(0);
    expect(result.state.activeId).toBeNull();
    expect(result.state.pendingMove).toBeNull();
    expect(result.events.some((event) => event.kind === 'move')).toBe(false);
    expect(result.events.some((event) => event.kind === 'log')).toBe(true);
  });

  it('rejects a landing slot outside pending.slots and the current point', () => {
    const pending = pendingKitchen();
    // 右上被帮厨占着，不在 pending.slots 里。
    const result = applyBattleAction(
      pending,
      { kind: 'post-move', slot: 'upperRight' },
      CH01_KITCHEN_BATTLE,
    );
    expect(result.state).toBe(pending);
    expect(result.events).toEqual([]);
  });

  it('does not enter pending when every target-adjacent point is occupied', () => {
    const created = createBattle(BATTLE_SANDBOX_MULTI, 7);
    const [a, b, c] = created.enemies;
    const state: BattleState = {
      ...created,
      phase: 'player',
      activeId: created.party[0]!.id,
      party: [{ ...created.party[0]!, slot: 'left', gauge: 1000 }],
      enemies: [
        { ...a!, slot: 'upperLeft', facing: 'downLeft' },
        { ...b!, slot: 'center' },
        { ...c!, slot: 'upperRight' },
      ],
    };
    const target = state.enemies[0]!;
    const result = applyBattleAction(
      state,
      { kind: 'attack', skillId: 'player.jielitusi', targetId: target.id },
      BATTLE_SANDBOX_MULTI,
    );
    expect(result.state.pendingMove).toBeNull();
    expect(result.state.activeId).toBeNull();
    expect(result.state.party[0]!.gauge).toBe(0);
    expect(result.state.enemies[0]!.hp).toBeLessThan(target.hp);
  });

  it('keeps the first battle free of pending (no skills)', () => {
    const first = startNextTurn(createBattle(CH01_FIRST_BATTLE), CH01_FIRST_BATTLE).state;
    expect(first.pendingMove).toBeNull();
  });
});
