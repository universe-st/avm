import { describe, expect, it } from 'vitest';
import { CH01_FIRST_BATTLE } from '../src/battle/data/ch01-first';
import { CH01_KITCHEN_BATTLE } from '../src/battle/data/ch01-kitchen';
import { createBattle } from '../src/battle/core/battle';
import { planEnemyIntent } from '../src/battle/core/ai';
import { hitSlotsFor } from '../src/battle/core/slots';
import type { BattleState } from '../src/battle/types';

const base = createBattle(CH01_FIRST_BATTLE);

function atSlot(slot: BattleState['player']['slot']): BattleState {
  return { ...base, player: { ...base.player, slot } };
}

function withCooldowns(cooldowns: Record<string, number>): BattleState {
  return { ...base, enemy: { ...base.enemy, cooldowns } };
}

describe('enemy AI intent', () => {
  it('attacks the front with the single-target skill when the player is in front', () => {
    const intent = planEnemyIntent(base, CH01_FIRST_BATTLE);
    expect(intent).toMatchObject({
      kind: 'skill',
      skillId: 'miner.thrust',
      facing: 'left',
      hitsPlayer: true,
    });
    if (intent.kind === 'skill') {
      expect([...intent.hitSlots].sort()).toEqual(
        ['left', 'lowerLeft', 'upperLeft'].sort(),
      );
      expect(intent.text).toContain('钻头突进');
    }
  });

  it('uses the all-slot quake when the player camps behind', () => {
    const intent = planEnemyIntent(atSlot('right'), CH01_FIRST_BATTLE);
    expect(intent).toMatchObject({
      kind: 'skill',
      skillId: 'miner.quake',
      hitsPlayer: true,
    });
    if (intent.kind === 'skill') {
      expect(intent.hitSlots).toHaveLength(6);
    }
  });

  it('turns toward the player when quake is on cooldown', () => {
    const state = withCooldowns({ 'miner.quake': 3 });
    const intent = planEnemyIntent(
      { ...state, player: { ...state.player, slot: 'right' } },
      CH01_FIRST_BATTLE,
    );
    expect(intent).toMatchObject({
      kind: 'turn',
      facing: 'right',
      targetSlot: 'right',
    });
    expect(intent.text).toContain('转向');
  });

  it('prefers the sweep when the single-target skill is cooling down', () => {
    const state = {
      ...base,
      player: { ...base.player, slot: 'right' as const },
      enemy: { ...base.enemy, facing: 'right' as const, cooldowns: { 'miner.thrust': 2 } },
    };
    const intent = planEnemyIntent(state, CH01_FIRST_BATTLE);
    expect(intent).toMatchObject({ kind: 'skill', skillId: 'miner.sweep' });
  });

  it('uses the kitchen phantom skills with the same rules', () => {
    const kitchen = createBattle(CH01_KITCHEN_BATTLE);
    const front = planEnemyIntent(kitchen, CH01_KITCHEN_BATTLE);
    expect(front).toMatchObject({ kind: 'skill', skillId: 'cook.oil' });

    const behind = planEnemyIntent(
      { ...kitchen, player: { ...kitchen.player, slot: 'right' } },
      CH01_KITCHEN_BATTLE,
    );
    expect(behind).toMatchObject({ kind: 'skill', skillId: 'cook.quake' });
  });

  it('uses the same hit-slot helper as the skills themselves', () => {
    const intent = planEnemyIntent(base, CH01_FIRST_BATTLE);
    if (intent.kind === 'skill') {
      expect(intent.hitSlots).toEqual(hitSlotsFor('left', 'single-front'));
    }
  });
});
