import type { BattleAction, BattleSetup, BattleState } from '../types';
import {
  applyBattleAction,
  createBattle,
  startNextTurn,
} from './battle';

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
    if (setup.player.skills.length > 0) {
      // 御膳房预览：玩家已经绕到右侧背面，直接展示背袭；不再用「一步跨到对面」的旧移动。
      const behind: BattleSetup = {
        ...setup,
        player: { ...setup.player, slot: 'right' },
      };
      return startNextTurn(createBattle(behind, seed)).state;
    }
    return driveToPlayerTurn(setup, seed);
  }

  if (phase === 'victory') {
    if (setup.player.skills.length === 0) {
      // 第一场没有「解」，不可能赢；预览回退到中局，别给一个假胜利。
      return driveToPlayerTurn(setup, seed);
    }
    // 从右侧背面开局，直接展示背袭三刀；移动限制由正式流程/测试覆盖。
    const behind: BattleSetup = {
      ...setup,
      player: { ...setup.player, slot: 'right' },
    };
    return drive(behind, seed, () => ({
      kind: 'attack',
      skillId: setup.player.skills[0]!,
    }));
  }

  return drive(setup, seed, () => ({ kind: 'guard' }));
}

function driveToPlayerTurn(setup: BattleSetup, seed: number): BattleState {
  let state = createBattle(setup, seed);
  let playerTurns = 0;

  for (let guard = 0; guard < 24; guard += 1) {
    if (state.phase === 'victory' || state.phase === 'defeat') return state;

    if (state.activeId === null) {
      state = startNextTurn(state).state;
      continue;
    }

    if (state.activeId === state.player.id) {
      playerTurns += 1;
      if (playerTurns === 1) {
        const target = setup.player.skills.length > 0 ? 'right' : 'upperLeft';
        state = applyBattleAction(state, { kind: 'move', slot: target }, setup).state;
        continue;
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

  for (let guard = 0; guard < 120; guard += 1) {
    if (state.phase === 'victory' || state.phase === 'defeat') return state;

    if (state.activeId === null) {
      state = startNextTurn(state).state;
      continue;
    }

    const action: BattleAction =
      state.activeId === state.player.id ? decide(state) : { kind: 'enemy-act' };
    state = applyBattleAction(state, action, setup).state;
  }

  return state;
}
