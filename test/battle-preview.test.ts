import { describe, expect, it } from 'vitest';
import { CH01_FIRST_BATTLE } from '../src/battle/data/ch01-first';
import { CH01_KITCHEN_BATTLE } from '../src/battle/data/ch01-kitchen';
import { BATTLE_SANDBOX_MULTI } from '../src/battle/data/sandbox-multi';
import { buildPreviewState } from '../src/battle/core/preview';
import { previewPlayerAttack } from '../src/battle/core/battle';

describe('battle preview states', () => {
  it('opens the kitchen with two distinct enemies', () => {
    const state = buildPreviewState(CH01_KITCHEN_BATTLE, 'opening');
    expect(state.enemies).toHaveLength(2);
    expect(new Set(state.enemies.map((enemy) => enemy.slot)).size).toBe(2);
    expect(state.enemies.map((enemy) => enemy.name)).toEqual(['御厨·幻影', '帮厨·幻影']);
  });

  it('starts the kitchen mid preview behind the first enemy with two targets', () => {
    const state = buildPreviewState(CH01_KITCHEN_BATTLE, 'mid');
    expect(state.party[0]!.slot).toBe('right');
    expect(state.activeId).toBe(state.party[0]!.id);
    expect(state.enemies).toHaveLength(2);
    const target = state.enemies.find((enemy) => enemy.id === 'cook-phantom-a')!;
    expect(target.facing).toBe('left');
    const preview = previewPlayerAttack(
      state,
      CH01_KITCHEN_BATTLE,
      'player.jielitusi',
      target.id,
    );
    expect(preview).toMatchObject({ zone: 'back', backstab: true, amount: 23 });
  });

  it('starts the first-battle mid preview on a player turn with attack locked', () => {
    const noDodge = {
      ...CH01_FIRST_BATTLE,
      party: CH01_FIRST_BATTLE.party.map((unit) => ({ ...unit, dodge: 0 })),
    };
    const state = buildPreviewState(noDodge, 'mid');
    expect(state.activeId).toBe(state.party[0]!.id);
    expect(state.party[0]!.slot).toBe('upperLeft');
  });

  it('builds a real victory state for the kitchen preview', () => {
    const state = buildPreviewState(CH01_KITCHEN_BATTLE, 'victory');
    expect(state.phase).toBe('victory');
    expect(state.enemies.every((enemy) => enemy.hp === 0)).toBe(true);
  });

  it('falls back to mid for the unwinnable first battle', () => {
    const state = buildPreviewState(CH01_FIRST_BATTLE, 'victory');
    expect(state.phase).not.toBe('victory');
    expect(state.activeId).toBe(state.party[0]!.id);
  });

  it('places the three sandbox enemies on distinct random points, reproducibly', () => {
    const opening = buildPreviewState(BATTLE_SANDBOX_MULTI, 'opening', 7);
    expect(opening.enemies).toHaveLength(3);
    expect(new Set(opening.enemies.map((enemy) => enemy.slot)).size).toBe(3);
    expect(opening.enemies.map((enemy) => enemy.slot)).not.toContain(
      opening.party[0]!.slot,
    );

    const again = buildPreviewState(BATTLE_SANDBOX_MULTI, 'opening', 7);
    expect(again.enemies.map((enemy) => enemy.slot)).toEqual(
      opening.enemies.map((enemy) => enemy.slot),
    );
  });

  it('builds the sandbox mid state with three intents', () => {
    const state = buildPreviewState(BATTLE_SANDBOX_MULTI, 'mid', 7);
    expect(state.enemies).toHaveLength(3);
    expect(Object.keys(state.intents)).toHaveLength(3);
  });
});
