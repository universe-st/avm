import { describe, expect, it } from 'vitest';
import { computeDamage, formatDamagePreview } from '../src/battle/core/damage';
import { CH01_KITCHEN_BATTLE } from '../src/battle/data/ch01-kitchen';
import {
  createBattle,
  previewPlayerAttack,
  startNextTurn,
} from '../src/battle/core/battle';

describe('battle damage (flat defense)', () => {
  it('subtracts defense after the backstab multiplier and before guard ×0.5', () => {
    expect(
      computeDamage({ atk: 16, power: 1, backstab: false, guarding: false }),
    ).toBe(16);
    expect(
      computeDamage({ atk: 16, power: 1, backstab: true, guarding: false }),
    ).toBe(24);
    expect(
      computeDamage({ atk: 16, power: 1, backstab: false, guarding: false, defense: 4 }),
    ).toBe(12);
    expect(
      computeDamage({ atk: 16, power: 1, backstab: true, guarding: false, defense: 4 }),
    ).toBe(20);
    // 背袭 + 穿防 0.5：24 - 4×0.5 = 22
    expect(
      computeDamage({
        atk: 16,
        power: 1,
        backstab: true,
        guarding: false,
        defense: 4,
        backstabDefensePierce: 0.5,
      }),
    ).toBe(22);
    // 防御动作在平减之后再 ×0.5：12 × 0.5 = 6
    expect(
      computeDamage({ atk: 16, power: 1, backstab: false, guarding: true, defense: 4 }),
    ).toBe(6);
    // 22.5 × 0.5 = 11.25 → 11
    expect(
      computeDamage({
        atk: 16,
        power: 1,
        backstab: true,
        guarding: true,
        defense: 4,
        backstabDefensePierce: 0.5,
      }),
    ).toBe(11);
  });

  it('never deals zero or negative damage', () => {
    expect(computeDamage({ atk: 0, power: 1, backstab: false, guarding: false })).toBe(1);
    expect(computeDamage({ atk: 16, power: 0, backstab: false, guarding: false })).toBe(1);
    expect(
      computeDamage({ atk: 3, power: 0.1, backstab: false, guarding: true, defense: 99 }),
    ).toBe(1);
  });

  it('uses a skill-specific backstab multiplier when provided', () => {
    expect(
      computeDamage({
        atk: 10,
        power: 1,
        backstab: true,
        backstabMultiplier: 2,
        guarding: false,
      }),
    ).toBe(20);
  });

  it('previews the front hit with target defense, without teleport fields', () => {
    const state = startNextTurn(createBattle(CH01_KITCHEN_BATTLE), CH01_KITCHEN_BATTLE).state;
    expect(state.activeId).toBe(state.party[0]!.id);
    const target = state.enemies.find((enemy) => enemy.id === 'cook-phantom-a')!;
    const preview = previewPlayerAttack(
      state,
      CH01_KITCHEN_BATTLE,
      'player.jielitusi',
      target.id,
    );
    expect(preview).toMatchObject({
      zone: 'front',
      backstab: false,
      amount: 13,
      from: 'left',
    });
    expect(preview).not.toHaveProperty('to');
    expect(preview).not.toHaveProperty('teleported');
  });

  it('previews backstab with half defense: 24 - 1.5 = 23', () => {
    const active = startNextTurn(createBattle(CH01_KITCHEN_BATTLE), CH01_KITCHEN_BATTLE).state;
    const state = {
      ...active,
      party: active.party.map((unit) => ({ ...unit, slot: 'right' as const })),
    };
    const target = state.enemies.find((enemy) => enemy.id === 'cook-phantom-a')!;
    const preview = previewPlayerAttack(
      state,
      CH01_KITCHEN_BATTLE,
      'player.jielitusi',
      target.id,
    );
    expect(preview).toMatchObject({
      zone: 'back',
      backstab: true,
      amount: 23,
      from: 'right',
    });
  });

  it('returns null when the skill is not unlocked in this battle', () => {
    const firstState = startNextTurn(createBattle(CH01_KITCHEN_BATTLE), CH01_KITCHEN_BATTLE).state;
    const firstBattle = {
      ...CH01_KITCHEN_BATTLE,
      party: CH01_KITCHEN_BATTLE.party.map((unit) => ({ ...unit, skills: [] })),
    };
    const target = firstState.enemies.find((enemy) => enemy.id === 'cook-phantom-a')!;
    expect(
      previewPlayerAttack(firstState, firstBattle, 'player.jielitusi', target.id),
    ).toBeNull();
  });

  it('formats the preview label', () => {
    expect(formatDamagePreview(13, 23)).toBe('正面 13 · 背袭 23');
  });
});
