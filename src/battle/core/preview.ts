import type { BattleAction, BattleSetup, BattleState, SlotId } from '../types';
import {
  applyBattleAction,
  createBattle,
  isSlotOccupied,
  livingEnemies,
  startNextTurn,
} from './battle';
import { isAdjacentSlot, pointDistance, shortestStepToward } from './slots';

/**
 * 舞台预览用的「把战斗推进到某个画面」。
 *
 * 和真实流程共用同一个 reducer，所以预览里看到的意图/站位/HP 都是真算出来的，
 * 不是摆拍。预览模式本身不写存档（由场景负责）。
 */
export type BattlePreviewPhase = 'opening' | 'mid' | 'victory' | 'defeat';

export function buildPreviewState(
  setup: BattleSetup,
  phase: BattlePreviewPhase,
  seed = 1,
): BattleState {
  if (phase === 'opening') return createBattle(setup, seed);

  if (phase === 'mid') {
    if (setup.party[0]!.skills.length === 0) return driveToPlayerTurn(setup, seed);
    // 御膳房/沙盒：把玩家放到右侧、中心怪转向左，直接展示“背后一刀 + 双怪目标”。
    const atRight = withPartySlot(setup, 'right');
    let state = createBattle(atRight, seed);
    state = {
      ...state,
      enemies: state.enemies.map((enemy, index) =>
        index === 0 ? { ...enemy, facing: 'left' as const } : enemy,
      ),
    };
    return startNextTurn(state, atRight).state;
  }

  if (phase === 'victory') {
    if (setup.party[0]!.skills.length === 0) {
      // 第一场没有「解」，不可能赢；预览回退到中局，别给一个假胜利。
      return driveToPlayerTurn(setup, seed);
    }
    return drive(setup, seed, (state) => previewCombatAction(state, setup));
  }

  return drive(setup, seed, () => ({ kind: 'guard' }));
}

function withPartySlot(setup: BattleSetup, slot: SlotId): BattleSetup {
  return {
    ...setup,
    party: setup.party.map((unit, index) => (index === 0 ? { ...unit, slot } : unit)),
  };
}

function driveToPlayerTurn(setup: BattleSetup, seed: number): BattleState {
  let state = createBattle(setup, seed);
  let playerTurns = 0;

  for (let guard = 0; guard < 48; guard += 1) {
    if (state.phase === 'victory' || state.phase === 'defeat') return state;

    // 攻击后的落点选择：预览自动选第一个落点（没有就留在原地）。
    if (state.pendingMove) {
      const slot = state.pendingMove.slots[0] ?? state.party[0]!.slot;
      state = applyBattleAction(state, { kind: 'post-move', slot }, setup).state;
      continue;
    }

    if (state.activeId === null) {
      state = startNextTurn(state, setup).state;
      continue;
    }

    if (state.activeId === state.party[0]!.id) {
      playerTurns += 1;
      if (playerTurns === 1) {
        const from = state.party[0]!.slot;
        const target = isAdjacentSlot(from, 'upperLeft') && !isSlotOccupied(state, 'upperLeft')
          ? 'upperLeft'
          : null;
        if (target) {
          state = applyBattleAction(state, { kind: 'move', slot: target }, setup).state;
          continue;
        }
      }
      // 第二回合停在玩家行动前：画面里正好能看到怪物意图与新的站位。
      return state;
    }

    state = applyBattleAction(state, { kind: 'enemy-act' }, setup).state;
  }

  return state;
}

function drive(
  setup: BattleSetup,
  seed: number,
  decide: (state: BattleState) => BattleAction,
): BattleState {
  let state = createBattle(setup, seed);

  for (let guard = 0; guard < 240; guard += 1) {
    if (state.phase === 'victory' || state.phase === 'defeat') return state;

    if (state.pendingMove) {
      const slot = state.pendingMove.slots[0] ?? state.party[0]!.slot;
      state = applyBattleAction(state, { kind: 'post-move', slot }, setup).state;
      continue;
    }

    if (state.activeId === null) {
      state = startNextTurn(state, setup).state;
      continue;
    }

    const action: BattleAction =
      state.activeId === state.party[0]!.id ? decide(state) : { kind: 'enemy-act' };
    state = applyBattleAction(state, action, setup).state;
  }

  return state;
}

/** 预览胜利用：打相邻最低 HP；没有相邻目标就走一步靠近最近敌人；否则防御。 */
function previewCombatAction(state: BattleState, setup: BattleSetup): BattleAction {
  const actor = state.party[0]!;
  const skillId = setup.party[0]!.skills[0];
  if (!skillId) return { kind: 'guard' };

  const adjacent = livingEnemies(state)
    .filter((enemy) => isAdjacentSlot(actor.slot, enemy.slot))
    .sort((a, b) => a.hp - b.hp || (a.id < b.id ? -1 : 1));
  const target = adjacent[0];
  if (target) return { kind: 'attack', skillId, targetId: target.id };

  const nearest = [...livingEnemies(state)].sort((a, b) => {
    const da = pointDistance(actor.slot, a.slot);
    const db = pointDistance(actor.slot, b.slot);
    if (da !== db) return da - db;
    return a.hp - b.hp || (a.id < b.id ? -1 : 1);
  })[0];
  if (!nearest) return { kind: 'guard' };

  const blocked = new Set<SlotId>(
    [...state.party, ...state.enemies]
      .filter((unit) => unit.hp > 0)
      .map((unit) => unit.slot),
  );
  blocked.delete(actor.slot);
  const step = shortestStepToward(actor.slot, nearest.slot, blocked);
  if (step) return { kind: 'move', slot: step };
  return { kind: 'guard' };
}
