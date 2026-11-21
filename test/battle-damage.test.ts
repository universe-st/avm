import { describe, expect, it } from 'vitest';
import { computeDamage, formatDamagePreview } from '../src/battle/core/damage';
import { CH01_KITCHEN_BATTLE } from '../src/battle/data/ch01-kitchen';
import {
  createBattle,
  previewPlayerAttack,
  startNextTurn,
} from '../src/battle/core/battle';

describe('battle damage', () => {
  it('applies the front / backstab / guard multipliers exactly', () => {
    expect(computeDamage({ atk: 16, power: 1, backstab: false, guarding: false })).toBe(16);
    expect(computeDamage({ atk: 16, power: 1, backstab: true, guarding: false })).toBe(24);
    expect(computeDamage({ atk: 16, power: 1, backstab: false, guarding: true })).toBe(8);
    expect(computeDamage({ atk: 16, power: 1, backstab: true, guarding: true })).toBe(12);
  });

  it('never deals zero or negative damage', () => {
    expect(computeDamage({ atk: 0, power: 1, backstab: false, guarding: false })).toBe(1);
    expect(computeDamage({ atk: 16, power: 0, backstab: false, guarding: false })).toBe(1);
    expect(computeDamage({ atk: 3, power: 0.1, backstab: false, guarding: true })).toBe(1);
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

  it('previews the mirror teleport from the front', () => {
    const state = startNextTurn(createBattle(CH01_KITCHEN_BATTLE)).state;
    expect(state.activeId).toBe(state.player.id);
    const preview = previewPlayerAttack(state, CH01_KITCHEN_BATTLE, 'player.jielitusi');
    expect(preview).toMatchObject({
      zone: 'front',
      backstab: false,
      amount: 16,
      from: 'left',
      to: 'right',
      teleported: true,
    });
  });

  it('previews backstab +50% without teleporting when already behind', () => {
    const active = startNextTurn(createBattle(CH01_KITCHEN_BATTLE)).state;
    const state = { ...active, player: { ...active.player, slot: 'right' as const } };
    const preview = previewPlayerAttack(state, CH01_KITCHEN_BATTLE, 'player.jielitusi');
    expect(preview).toMatchObject({
      zone: 'back',
      backstab: true,
      amount: 24,
      from: 'right',
      to: 'right',
      teleported: false,
    });
  });

  it('returns null when the skill is not unlocked in this battle', () => {
    const firstState = startNextTurn(createBattle(CH01_KITCHEN_BATTLE)).state;
    // 拿御膳房的状态去查第一场的技能表：第一场没有「解」。
    const firstBattle = {
      ...CH01_KITCHEN_BATTLE,
      player: { ...CH01_KITCHEN_BATTLE.player, skills: [] },
    };
    expect(previewPlayerAttack(firstState, firstBattle, 'player.jielitusi')).toBeNull();
  });

  it('formats the preview label', () => {
    expect(formatDamagePreview(16, 24)).toBe('正面 16 · 背袭 24');
  });
});
