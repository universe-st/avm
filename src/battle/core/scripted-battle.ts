import type {
  BattleAction,
  BattleEvent,
  BattleLogEntry,
  BattleState,
  ScriptedBattleSetup,
} from '../types';

const MAX_LOG = 16;

function pushLog(
  log: readonly BattleLogEntry[],
  round: number,
  text: string,
  tone: BattleLogEntry['tone'],
): BattleLogEntry[] {
  return [...log, { round, text, tone }].slice(-MAX_LOG);
}

export function createBattle(setup: ScriptedBattleSetup): BattleState {
  return {
    encounterId: setup.id,
    round: 1,
    phase: 'player',
    player: {
      id: setup.player.id,
      name: setup.player.name,
      team: 'party',
      hp: setup.player.hp,
      maxHp: setup.player.hp,
    },
    enemy: {
      id: setup.enemy.id,
      name: setup.enemy.name,
      team: 'enemy',
      hp: setup.enemy.hp,
      maxHp: setup.enemy.hp,
    },
    guarding: false,
    playerAttacks: 0,
    log: [{ round: 1, text: '战斗开始。', tone: 'normal' }],
    events: [],
  };
}

/**
 * 一次玩家行动 + 一次敌方行动。
 *
 * 本场战斗的核心约束：
 * - 主角攻击伤害恒为 1（直接写死，不读 ATK/DEF）；
 * - 第 `maxRounds` 回合结束仍未战败 → 强制「清除协议」，必定 defeat；
 * - 不存在 victory 分支。
 *
 * 返回新 state（不修改传入对象），场景按 events 播放动画。
 */
export function applyBattleAction(
  state: BattleState,
  action: BattleAction,
  setup: ScriptedBattleSetup,
): { readonly state: BattleState; readonly events: readonly BattleEvent[] } {
  if (state.phase !== 'player') {
    return { state, events: [] };
  }

  const events: BattleEvent[] = [];
  let log = state.log;
  let enemyHp = state.enemy.hp;
  let playerHp = state.player.hp;
  let playerAttacks = state.playerAttacks;
  let guarding = false;

  if (action === 'attack') {
    // 剧情规则：固定 1，不读任何属性。
    const amount = 1 as const;
    enemyHp = Math.max(0, enemyHp - amount);
    playerAttacks += 1;
    const bark = setup.attackBarks[Math.min(playerAttacks - 1, setup.attackBarks.length - 1)]
      ?? setup.attackBarks[setup.attackBarks.length - 1]
      ?? '你的攻击只留下 1 点划痕。';
    events.push({ type: 'player-attack', amount, targetHp: enemyHp, text: bark });
    log = pushLog(log, state.round, bark, 'player');
  } else {
    guarding = true;
    events.push({ type: 'guard', text: setup.guardText });
    log = pushLog(log, state.round, setup.guardText, 'normal');
  }

  const incoming = guarding
    ? Math.max(0, Math.floor(setup.enemy.attackDamage / 2))
    : setup.enemy.attackDamage;
  playerHp = Math.max(0, playerHp - incoming);
  events.push({
    type: 'enemy-attack',
    amount: incoming,
    playerHp,
    text: setup.enemyAttackText,
  });
  log = pushLog(log, state.round, `${setup.enemyAttackText}（-${incoming}）`, 'enemy');

  if (playerHp <= 0) {
    events.push({ type: 'defeat', text: setup.defeatText });
    log = pushLog(log, state.round, setup.defeatText, 'danger');
    return {
      state: {
        ...state,
        phase: 'defeat',
        player: { ...state.player, hp: playerHp },
        enemy: { ...state.enemy, hp: enemyHp },
        guarding: false,
        playerAttacks,
        log,
        events,
      },
      events,
    };
  }

  if (state.round >= setup.maxRounds) {
    const protocolAmount = setup.protocolDamage;
    events.push({
      type: 'protocol',
      amount: protocolAmount,
      playerHp: 0,
      text: setup.protocolText,
    });
    log = pushLog(log, state.round, setup.protocolText, 'danger');
    events.push({ type: 'defeat', text: setup.defeatText });
    log = pushLog(log, state.round, setup.defeatText, 'danger');
    return {
      state: {
        ...state,
        phase: 'defeat',
        player: { ...state.player, hp: 0 },
        enemy: { ...state.enemy, hp: enemyHp },
        guarding: false,
        playerAttacks,
        log,
        events,
      },
      events,
    };
  }

  const nextRound = state.round + 1;
  events.push({ type: 'round', round: nextRound });
  log = pushLog(log, nextRound, `第 ${nextRound} 回合。`, 'normal');
  return {
    state: {
      ...state,
      round: nextRound,
      phase: 'player',
      player: { ...state.player, hp: playerHp },
      enemy: { ...state.enemy, hp: enemyHp },
      guarding: false,
      playerAttacks,
      log,
      events,
    },
    events,
  };
}

/** 预览 `phase=mid` 用：从开局推进 1 个攻击回合；失败时返回原状态。 */
export function advanceForPreview(
  state: BattleState,
  setup: ScriptedBattleSetup,
  rounds: number,
): BattleState {
  let current = state;
  for (let index = 0; index < rounds; index += 1) {
    if (current.phase !== 'player') break;
    current = applyBattleAction(current, 'attack', setup).state;
  }
  return current;
}
