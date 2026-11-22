import { describe, expect, it } from 'vitest';
import type { BattleSetup } from '../src/battle/types';
import { CH01_FIRST_BATTLE } from '../src/battle/data/ch01-first';
import { CH01_KITCHEN_BATTLE } from '../src/battle/data/ch01-kitchen';
import { BATTLE_SANDBOX_MULTI } from '../src/battle/data/sandbox-multi';
import { createBattle } from '../src/battle/core/battle';
import { placeUnits } from '../src/battle/core/placement';
import { planEnemyIntents } from '../src/battle/core/ai';
import { isAdjacentSlot } from '../src/battle/core/slots';

describe('battle multi / placement', () => {
  it('uses the configured story points for the kitchen pair', () => {
    const state = createBattle(CH01_KITCHEN_BATTLE);
    expect(state.party[0]!.slot).toBe('left');
    expect(state.enemies.map((enemy) => enemy.slot)).toEqual(['center', 'upperRight']);
    expect(state.enemies.map((enemy) => enemy.name)).toEqual(['御厨·幻影', '帮厨·幻影']);
  });

  it('throws on duplicate unit ids', () => {
    const bad: BattleSetup = {
      ...CH01_FIRST_BATTLE,
      party: [{ ...CH01_FIRST_BATTLE.party[0]!, id: 'same' }],
      enemies: [{ ...CH01_FIRST_BATTLE.enemies[0]!, id: 'same' }],
    };
    expect(() => createBattle(bad)).toThrow(/单位 id 重复/);
  });

  it('throws on duplicate configured points', () => {
    const bad: BattleSetup = {
      ...CH01_KITCHEN_BATTLE,
      enemies: CH01_KITCHEN_BATTLE.enemies.map((enemy) => ({ ...enemy, slot: 'center' as const })),
    };
    expect(() => createBattle(bad)).toThrow(/已被占用/);
  });

  it('throws if an enemy has no skills', () => {
    const bad: BattleSetup = {
      ...CH01_FIRST_BATTLE,
      enemies: [{ ...CH01_FIRST_BATTLE.enemies[0]!, skills: [] }],
    };
    expect(() => createBattle(bad)).toThrow(/没有技能/);
  });

  it('places random sandbox points without overlap and reproducibly', () => {
    const first = placeUnits(BATTLE_SANDBOX_MULTI, 7);
    const second = placeUnits(BATTLE_SANDBOX_MULTI, 7);
    expect(first).toEqual(second);
    const all = [...first.partySlots, ...first.enemySlots];
    expect(new Set(all).size).toBe(all.length);
    expect(first.partySlots[0]).toBe('left');
    expect(all).toHaveLength(4);
  });

  it('varies random placement with the seed', () => {
    const arrangements = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) {
      arrangements.add(placeUnits(BATTLE_SANDBOX_MULTI, seed).enemySlots.join(','));
    }
    expect(arrangements.size).toBeGreaterThan(1);
  });

  it('plans three independent intents for the sandbox', () => {
    const state = createBattle(BATTLE_SANDBOX_MULTI, 11);
    const intents = planEnemyIntents(state, BATTLE_SANDBOX_MULTI);
    expect(Object.keys(intents)).toHaveLength(3);
    for (const enemy of state.enemies) {
      expect(intents[enemy.id]).toBeDefined();
    }
    // 随机点位下至少有一只会因为不相邻而移动（除非它恰好与玩家相邻）。
    const moves = Object.values(intents).filter((intent) => intent.kind === 'move');
    const adjacentCount = state.enemies.filter((enemy) =>
      isAdjacentSlot(state.party[0]!.slot, enemy.slot),
    ).length;
    expect(moves.length).toBeGreaterThanOrEqual(state.enemies.length - adjacentCount - 1);
  });

  it('keeps the first battle exactly one stationary enemy in the center', () => {
    const state = createBattle(CH01_FIRST_BATTLE);
    expect(state.party).toHaveLength(1);
    expect(state.enemies).toHaveLength(1);
    expect(state.enemies[0]!.slot).toBe('center');
    expect(state.enemies[0]!.behavior).toBe('stationary');
  });
});
