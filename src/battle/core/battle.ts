import type {
  BattleAction,
  BattleActionResult,
  BattleEvent,
  BattleLogEntry,
  BattleLogTone,
  BattleSetup,
  BattleState,
  BattleUnit,
  EnemyIntent,
  SlotId,
  Zone,
} from '../types';
import { planEnemyIntent } from './ai';
import { computeDamage, zoneLabel } from './damage';
import { planNextActor } from './gauge';
import { getSkill, resolveSkill } from '../data/skills';
import {
  facingLabel,
  isBackstabSlot,
  mirrorSlot,
  slotLabel,
  zoneOfSlot,
} from './slots';

const MAX_LOG = 24;

function appendLog(
  log: readonly BattleLogEntry[],
  seq: number,
  text: string,
  tone: BattleLogTone,
): BattleLogEntry[] {
  return [...log, { seq, text, tone }].slice(-MAX_LOG);
}

function makeUnit(
  setup: {
    readonly id: string;
    readonly name: string;
    readonly hp: number;
    readonly atk: number;
    readonly spd: number;
  },
  team: 'party' | 'enemy',
  extras: { readonly slot?: SlotId; readonly facing?: BattleSetup['enemy']['facing'] },
): BattleUnit {
  return {
    id: setup.id,
    name: setup.name,
    team,
    hp: setup.hp,
    maxHp: setup.hp,
    atk: setup.atk,
    spd: setup.spd,
    gauge: 0,
    guarding: false,
    slot: extras.slot ?? null,
    facing: extras.facing ?? null,
    cooldowns: {},
  };
}

export function createBattle(setup: BattleSetup, seed = 1): BattleState {
  const base: BattleState = {
    encounterId: setup.id,
    title: setup.title,
    seed,
    phase: 'player',
    activeId: null,
    player: makeUnit(setup.player, 'party', { slot: setup.player.slot }),
    enemy: makeUnit(setup.enemy, 'enemy', { facing: setup.enemy.facing }),
    intent: null,
    enemyActions: 0,
    seq: 0,
    log: appendLog([], 0, `${setup.enemy.name}挡住了去路。`, 'normal'),
  };
  return { ...base, intent: planEnemyIntent(base, setup) };
}

/**
 * 推进到下一个行动者（不结算行动）。
 *
 * - 已经有一个 `activeId` 时不做任何事（防止场景重复调用把回合吞掉）；
 * - 单位的新回合开始时清掉它上一轮留下的防御状态；
 * - 怪物回合开始时所有技能冷却 −1。
 */
export function startNextTurn(state: BattleState): BattleActionResult {
  if (state.phase === 'victory' || state.phase === 'defeat') {
    return { state, events: [] };
  }
  if (state.activeId !== null) {
    return { state, events: [] };
  }

  const advance = planNextActor(state);
  const isPlayer = advance.actorId === state.player.id;
  const actor = isPlayer ? state.player : state.enemy;

  const nextPlayer: BattleUnit = isPlayer
    ? { ...state.player, gauge: advance.playerGauge, guarding: false }
    : { ...state.player, gauge: advance.playerGauge };
  const nextEnemy: BattleUnit = isPlayer
    ? { ...state.enemy, gauge: advance.enemyGauge }
    : {
        ...state.enemy,
        gauge: advance.enemyGauge,
        cooldowns: decrementCooldowns(state.enemy.cooldowns),
      };

  const next: BattleState = {
    ...state,
    phase: isPlayer ? 'player' : 'enemy',
    activeId: actor.id,
    player: nextPlayer,
    enemy: nextEnemy,
    log: appendLog(
      state.log,
      state.seq,
      isPlayer ? '你的回合。' : `${actor.name}的回合。`,
      isPlayer ? 'player' : 'enemy',
    ),
  };

  const events: BattleEvent[] = [
    {
      kind: 'turn-start',
      actorId: actor.id,
      actorName: actor.name,
      team: actor.team,
    },
  ];

  return { state: next, events };
}

function decrementCooldowns(
  cooldowns: Readonly<Record<string, number>>,
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [id, value] of Object.entries(cooldowns)) {
    next[id] = Math.max(0, value - 1);
  }
  return next;
}

/**
 * 结算当前行动者的一个行动。
 *
 * 返回新 state + 表现层事件；结算结果是确定的，场景只负责播动画。
 * 行动结束后 `activeId` 置空，由场景调用 `startNextTurn` 继续。
 */
export function applyBattleAction(
  state: BattleState,
  action: BattleAction,
  setup: BattleSetup,
): BattleActionResult {
  if (state.phase === 'victory' || state.phase === 'defeat') {
    return { state, events: [] };
  }
  if (state.activeId === null) {
    return { state, events: [] };
  }

  const playerActing = state.activeId === state.player.id;
  if (playerActing && action.kind === 'enemy-act') {
    return { state, events: [] };
  }
  if (!playerActing && action.kind !== 'enemy-act') {
    return { state, events: [] };
  }

  return playerActing
    ? applyPlayerAction(state, action, setup)
    : applyEnemyAction(state, setup);
}

function finishPlayerAction(
  state: BattleState,
  player: BattleUnit,
  enemy: BattleUnit,
  seq: number,
  log: readonly BattleLogEntry[],
  events: readonly BattleEvent[],
): BattleActionResult {
  return {
    state: {
      ...state,
      activeId: null,
      player: { ...player, gauge: 0 },
      enemy,
      seq,
      log,
    },
    events,
  };
}

function applyPlayerAction(
  state: BattleState,
  action: BattleAction,
  setup: BattleSetup,
): BattleActionResult {
  if (action.kind === 'move') {
    const from = state.player.slot ?? setup.player.slot;
    if (action.slot === from) {
      return { state, events: [] };
    }
    const text = `你闪到${slotLabel(action.slot)}。`;
    const seq = state.seq + 1;
    return finishPlayerAction(
      state,
      { ...state.player, slot: action.slot },
      state.enemy,
      seq,
      appendLog(state.log, seq, text, 'player'),
      [{ kind: 'move', actorId: state.player.id, from, to: action.slot, text }],
    );
  }

  if (action.kind === 'guard') {
    const text = '你护住要害，准备卸掉这一下。';
    const seq = state.seq + 1;
    return finishPlayerAction(
      state,
      { ...state.player, guarding: true },
      state.enemy,
      seq,
      appendLog(state.log, seq, text, 'player'),
      [{ kind: 'guard', actorId: state.player.id, text }],
    );
  }

  if (action.kind !== 'attack') {
    return { state, events: [] };
  }

  // 攻击：必须是这台战斗里真的解锁了的技能（第一场没有「解」）。
  if (!setup.player.skills.includes(action.skillId)) {
    return { state, events: [] };
  }
  const skill = getSkill(action.skillId);
  if (!skill) {
    return { state, events: [] };
  }

  const from = state.player.slot ?? setup.player.slot;
  const facing = state.enemy.facing ?? setup.enemy.facing;
  const zone: Zone = zoneOfSlot(from, facing);
  const backstab = skill.positional && isBackstabSlot(from, facing);
  const amount = computeDamage({
    atk: state.player.atk,
    power: skill.power,
    backstab,
    ...(skill.backstabMultiplier === undefined
      ? {}
      : { backstabMultiplier: skill.backstabMultiplier }),
    guarding: false,
  });
  const enemyHp = Math.max(0, state.enemy.hp - amount);
  const teleported = !backstab && skill.teleport === 'mirror-if-front';
  const to = teleported ? mirrorSlot(from) : from;

  const seq = state.seq + 1;
  const text = backstab
    ? `${skill.name}从背后扎进去（-${amount} · 背袭 ×1.5）。`
    : `${skill.name}命中${zoneLabel(zone)}（-${amount}）${
        teleported ? `，你借势闪到${slotLabel(to)}。` : '。'
      }`;

  const events: BattleEvent[] = [
    {
      kind: 'attack',
      actorId: state.player.id,
      targetId: state.enemy.id,
      skillId: skill.id,
      skillName: skill.name,
      amount,
      zone,
      backstab,
      targetHp: enemyHp,
      from,
      to,
      teleported,
      text,
    },
  ];
  let log = appendLog(state.log, seq, text, backstab ? 'danger' : 'player');

  if (enemyHp <= 0) {
    const victoryText = setup.victory.text;
    log = appendLog(log, seq, victoryText, 'player');
    return {
      state: {
        ...state,
        phase: 'victory',
        activeId: null,
        player: { ...state.player, slot: to, gauge: 0 },
        enemy: { ...state.enemy, hp: 0 },
        intent: null,
        seq,
        log,
      },
      events: [...events, { kind: 'victory', text: victoryText }],
    };
  }

  return finishPlayerAction(
    state,
    { ...state.player, slot: to },
    { ...state.enemy, hp: enemyHp },
    seq,
    log,
    events,
  );
}

function applyEnemyAction(state: BattleState, setup: BattleSetup): BattleActionResult {
  const intent = state.intent;
  if (!intent) {
    return { state, events: [] };
  }

  const enemy = state.enemy;
  const seq = state.seq + 1;

  if (intent.kind === 'turn') {
    const facing = intent.facing;
    const text = `${enemy.name}转过身，面朝${facingLabel(facing)}。`;
    const nextEnemy: BattleUnit = { ...enemy, facing, gauge: 0 };
    const events: BattleEvent[] = [
      { kind: 'enemy-turn', actorId: enemy.id, facing, text },
    ];
    let log = appendLog(state.log, seq, text, 'enemy');
    let enemyActions = state.enemyActions + 1;

    const protocol = maybeProtocol(state, nextEnemy, log, seq, enemyActions, setup, events);
    if (protocol) return protocol;

    const interim: BattleState = {
      ...state,
      activeId: null,
      enemy: nextEnemy,
      enemyActions,
      seq,
      log,
      intent: null,
    };
    const withIntent: BattleState = { ...interim, intent: planEnemyIntent(interim, setup) };
    return { state: withIntent, events };
  }

  const skill = resolveSkill(intent.skillId);
  const hitSlots = intent.hitSlots;
  const playerSlot = state.player.slot ?? setup.player.slot;
  const hit = hitSlots.includes(playerSlot);
  const amount = hit
    ? computeDamage({
        atk: enemy.atk,
        power: skill.power,
        backstab: false,
        guarding: state.player.guarding,
      })
    : 0;
  const playerHp = Math.max(0, state.player.hp - amount);
  const text = hit
    ? `${skill.name}命中${slotLabel(playerSlot)}（-${amount}${
        state.player.guarding ? ' · 防御减半' : ''
      }）。`
    : `${skill.name}扫过${slotLabel(playerSlot)}，打空了。`;

  const nextEnemy: BattleUnit = {
    ...enemy,
    gauge: 0,
    cooldowns:
      skill.cooldown === undefined || skill.cooldown <= 0
        ? { ...enemy.cooldowns }
        : { ...enemy.cooldowns, [skill.id]: skill.cooldown },
  };
  const enemyActions = state.enemyActions + 1;

  const events: BattleEvent[] = [
    {
      kind: 'enemy-skill',
      actorId: enemy.id,
      skillId: skill.id,
      skillName: skill.name,
      hitSlots,
      hit,
      amount,
      playerHp,
      text,
    },
  ];
  let log = appendLog(state.log, seq, text, hit ? 'enemy' : 'normal');
  // 只有行动者重置跑条；被打的人跑条原样保留（否则怪物会永远抢先）。
  const nextPlayer: BattleUnit = { ...state.player, hp: playerHp };

  if (playerHp <= 0) {
    const defeatText = setup.defeat.text;
    log = appendLog(log, seq, defeatText, 'danger');
    return {
      state: {
        ...state,
        phase: 'defeat',
        activeId: null,
        player: nextPlayer,
        enemy: nextEnemy,
        intent: null,
        enemyActions,
        seq,
        log,
      },
      events: [...events, { kind: 'defeat', cause: 'hp', text: defeatText }],
    };
  }

  const protocol = maybeProtocol(state, nextEnemy, log, seq, enemyActions, setup, events);
  if (protocol) return protocol;

  const interim: BattleState = {
    ...state,
    activeId: null,
    player: nextPlayer,
    enemy: nextEnemy,
    intent: null,
    enemyActions,
    seq,
    log,
  };
  const withIntent: BattleState = { ...interim, intent: planEnemyIntent(interim, setup) };
  return { state: withIntent, events };
}

function maybeProtocol(
  state: BattleState,
  enemy: BattleUnit,
  log: readonly BattleLogEntry[],
  seq: number,
  enemyActions: number,
  setup: BattleSetup,
  events: readonly BattleEvent[],
): BattleActionResult | null {
  const script = setup.script;
  if (!script) return null;
  if (enemyActions < script.protocolAfterEnemyActions) return null;

  const text = script.protocolText;
  let nextLog = appendLog(log, seq, text, 'danger');
  nextLog = appendLog(nextLog, seq, setup.defeat.text, 'danger');
  return {
    state: {
      ...state,
      phase: 'defeat',
      activeId: null,
      player: { ...state.player, hp: 0, gauge: 0, guarding: false },
      enemy,
      intent: null,
      enemyActions,
      seq,
      log: nextLog,
    },
    events: [
      ...events,
      { kind: 'protocol', amount: script.protocolDamage, text },
      { kind: 'defeat', cause: 'protocol', text: setup.defeat.text },
    ],
  };
}

/** 这台战斗玩家能不能攻击（第一场没有「解」）。 */
export function playerCanAttack(setup: BattleSetup): boolean {
  return setup.player.skills.length > 0;
}

/** HUD 用的攻击预览。技能没解锁/数据缺失时返回 null。 */
export function previewPlayerAttack(
  state: BattleState,
  setup: BattleSetup,
  skillId: string,
): {
  readonly skillId: string;
  readonly skillName: string;
  readonly zone: Zone;
  readonly backstab: boolean;
  readonly amount: number;
  readonly from: SlotId;
  readonly to: SlotId;
  readonly teleported: boolean;
} | null {
  if (!setup.player.skills.includes(skillId)) return null;
  const skill = getSkill(skillId);
  if (!skill) return null;
  const from = state.player.slot ?? setup.player.slot;
  const facing = state.enemy.facing ?? setup.enemy.facing;
  const zone = zoneOfSlot(from, facing);
  const backstab = skill.positional && isBackstabSlot(from, facing);
  const amount = computeDamage({
    atk: state.player.atk,
    power: skill.power,
    backstab,
    ...(skill.backstabMultiplier === undefined
      ? {}
      : { backstabMultiplier: skill.backstabMultiplier }),
    guarding: false,
  });
  return {
    skillId: skill.id,
    skillName: skill.name,
    zone,
    backstab,
    amount,
    from,
    to: !backstab && skill.teleport === 'mirror-if-front' ? mirrorSlot(from) : from,
    teleported: !backstab && skill.teleport === 'mirror-if-front',
  };
}

/** 测试/调试：当前是否有可用的攻击技能。 */
export function attackSkillIds(setup: BattleSetup): readonly string[] {
  return setup.player.skills;
}

/** 测试/调试：当前意图（没有时回退 null）。 */
export function currentIntent(state: BattleState): EnemyIntent | null {
  return state.intent;
}
