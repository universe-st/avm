import { describe, expect, it } from 'vitest';
import { CH01_FIRST_BATTLE } from '../src/battle/data/ch01-first';
import { CH01_KITCHEN_BATTLE } from '../src/battle/data/ch01-kitchen';
import { buildPreviewState } from '../src/battle/core/preview';
import { previewPlayerAttack } from '../src/battle/core/battle';

describe('battle preview states', () => {
  it('starts the kitchen mid preview already behind the monster', () => {
    const state = buildPreviewState(CH01_KITCHEN_BATTLE, 'mid');
    expect(state.player.slot).toBe('right');
    expect(state.activeId).toBe(state.player.id);
    expect(state.enemy.facing).toBe('left');
    const preview = previewPlayerAttack(state, CH01_KITCHEN_BATTLE, 'player.jielitusi');
    expect(preview).toMatchObject({ zone: 'back', backstab: true, amount: 24 });
  });

  it('starts the first-battle mid preview on a player turn with attack locked', () => {
    const state = buildPreviewState(CH01_FIRST_BATTLE, 'mid');
    expect(state.activeId).toBe(state.player.id);
    expect(state.player.slot).toBe('upperLeft');
  });

  it('builds a real victory state for the kitchen preview', () => {
    const state = buildPreviewState(CH01_KITCHEN_BATTLE, 'victory');
    expect(state.phase).toBe('victory');
    expect(state.enemy.hp).toBe(0);
  });

  it('falls back to mid for the unwinnable first battle', () => {
    const state = buildPreviewState(CH01_FIRST_BATTLE, 'victory');
    expect(state.phase).not.toBe('victory');
    expect(state.activeId).toBe(state.player.id);
  });
});
