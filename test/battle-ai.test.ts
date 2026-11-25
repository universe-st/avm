import { describe, expect, it } from 'vitest';
import type { BattleSetup, BattleState, EnemyIntent } from '../src/battle/types';
import { CH01_FIRST_BATTLE } from '../src/battle/data/ch01-first';
import { CH01_KITCHEN_BATTLE } from '../src/battle/data/ch01-kitchen';
import { createBattle } from '../src/battle/core/battle';
import { formatIntent, planEnemyIntent, planEnemyIntents } from '../src/battle/core/ai';
import { hitPointsFor } from '../src/battle/core/slots';

const base = createBattle(CH01_FIRST_BATTLE);
const minerId = base.enemies[0]!.id;
const playerId = base.party[0]!.id;

function intentOf(state: BattleState, setup: BattleSetup, id = minerId): EnemyIntent {
  const intent = planEnemyIntent(state, setup, id);
  expect(intent).not.toBeNull();
  return intent!;
}

function atSlot(slot: BattleState['party'][number]['slot']): BattleState {
  return { ...base, party: base.party.map((unit) => ({ ...unit, slot })) };
}

function enemyAt(slot: BattleState['enemies'][number]['slot']): BattleState {
  return {
    ...base,
    enemies: base.enemies.map((unit) => ({ ...unit, slot, facing: 'left' })),
  };
}

describe('enemy AI intent（v3 追击 / 无转向行动）', () => {
  it('attacks the adjacent target with the single-target skill first', () => {
    const intent = intentOf(base, CH01_FIRST_BATTLE);
    expect(intent).toMatchObject({
      kind: 'skill',
      skillId: 'miner.thrust',
      facing: 'left',
      targetId: playerId,
      targetSlot: 'left',
      hitsPlayer: true,
      aoe: false,
    });
    if (intent.kind === 'skill') {
      // 网格里 ±30° 只剩瞄准的那一个点：突进不再连带左右两个环位。
      expect([...intent.hitSlots]).toEqual(['left']);
      expect(intent.text).toContain('钻头突进');
    }
  });

  it('never produces a standalone turn action', () => {
    const states = [
      base,
      atSlot('upperRight'),
      enemyAt('upperRight'),
      enemyAt('lowerLeft'),
    ];
    for (const state of states) {
      const intent = planEnemyIntent(state, CH01_FIRST_BATTLE, minerId);
      if (intent) expect(['skill', 'move']).toContain(intent.kind);
    }
  });

  it('uses the all-slot quake when the target is out of reach and quake is ready', () => {
    const state = enemyAt('upperRight');
    const intent = intentOf(state, CH01_FIRST_BATTLE);
    expect(intent).toMatchObject({
      kind: 'skill',
      skillId: 'miner.quake',
      hitsPlayer: true,
      aoe: true,
      aim: 'left',
    });
    if (intent.kind === 'skill') expect(intent.hitSlots).toHaveLength(11);
  });

  it('stationary monsters wait instead of aiming at an empty point', () => {
    const state = {
      ...enemyAt('upperRight'),
      enemies: base.enemies.map((unit) => ({
        ...unit,
        slot: 'upperRight' as const,
        cooldowns: { 'miner.quake': 3 },
      })),
    };
    expect(planEnemyIntent(state, CH01_FIRST_BATTLE, minerId)).toBeNull();
  });

  it('chases one free step toward a non-adjacent target', () => {
    const kitchen = createBattle(CH01_KITCHEN_BATTLE);
    const b = kitchen.enemies.find((unit) => unit.id === 'cook-phantom-b')!;
    expect(b.slot).toBe('upperRight');
    const intent = intentOf(kitchen, CH01_KITCHEN_BATTLE, b.id);
    expect(intent).toMatchObject({
      kind: 'move',
      from: 'upperRight',
      to: 'upperLeft',
      facing: 'left',
      targetId: playerId,
    });
  });

  it('does not move if the one-step destination is blocked', () => {
    const kitchen = createBattle(CH01_KITCHEN_BATTLE);
    const blocked = {
      ...kitchen,
      party: kitchen.party.map((unit) => ({ ...unit, slot: 'upperLeft' as const })),
    };
    const b = blocked.enemies.find((unit) => unit.id === 'cook-phantom-b')!;
    // upperLeft 被玩家占了，B 只能绕另一侧或先够不着。
    const intent = planEnemyIntent(blocked, CH01_KITCHEN_BATTLE, b.id);
    expect(intent?.kind === 'move' ? intent.to : null).not.toBe('upperLeft');
  });

  it('falls back to the arc when the single-target skill is cooling down', () => {
    const state = {
      ...base,
      enemies: base.enemies.map((unit) => ({
        ...unit,
        cooldowns: { 'miner.thrust': 2 },
      })),
    };
    expect(intentOf(state, CH01_FIRST_BATTLE)).toMatchObject({
      kind: 'skill',
      skillId: 'miner.sweep',
    });
  });

  it('marks all-slot skills as AOE in the intent text, not an eleven-slot list', () => {
    const intent = intentOf(enemyAt('upperRight'), CH01_FIRST_BATTLE);
    const text = formatIntent(intent);
    expect(text).toContain('全站位');
    expect(text).toContain('无法走位躲避');
    expect(text).not.toContain('命中 右/右上');
  });

  it('uses the same hit-points helper as the skill itself', () => {
    const intent = intentOf(base, CH01_FIRST_BATTLE);
    if (intent.kind === 'skill') {
      expect(intent.hitSlots).toEqual(
        hitPointsFor(intent.origin, intent.aim, 'single-front'),
      );
    }
  });

  it('plans one locked intent per living enemy in the kitchen', () => {
    const kitchen = createBattle(CH01_KITCHEN_BATTLE);
    const intents = planEnemyIntents(kitchen, CH01_KITCHEN_BATTLE);
    expect(Object.keys(intents).sort()).toEqual(['cook-phantom-a', 'cook-phantom-b']);
    expect(intents['cook-phantom-a']!.kind).toBe('skill');
    expect(intents['cook-phantom-b']!.kind).toBe('move');
  });

  it('is deterministic for the same state', () => {
    const first = planEnemyIntents(createBattle(CH01_KITCHEN_BATTLE), CH01_KITCHEN_BATTLE);
    const second = planEnemyIntents(createBattle(CH01_KITCHEN_BATTLE), CH01_KITCHEN_BATTLE);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});
