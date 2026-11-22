import type {
  BattleAction,
  BattleActionResult,
  BattleEvent,
  BattleLogEntry,
  BattleLogTone,
  BattlePartySetup,
  BattleSetup,
  BattleState,
  BattleUnit,
  EnemyIntent,
  Facing8,
  SlotId,
  Zone,
} from '../types';
import { planEnemyIntent, planEnemyIntents } from './ai';
import { computeDamage, zoneLabel } from './damage';
import { planNextActor } from './gauge';
import { getSkill, resolveSkill } from '../data/skills';
import { placeUnits } from './placement';
import {
  facingFromPoints,
  facingLabel,
  isAdjacentSlot,
  isBackstabPoint,
  mirrorSlot,
  slotLabel,
  zoneOfPoint,
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
  extras: {
    readonly slot: SlotId;
    readonly facing?: Facing8;
    readonly art?: BattleUnit['art'];
    readonly behavior?: BattleUnit['behavior'];
  },
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
    slot: extras.slot,
    facing: extras.facing ?? null,
    cooldowns: {},
    ...(extras.art === undefined ? {} : { art: extras.art }),
    ...(extras.behavior === undefined ? {} : { behavior: extras.behavior }),
  };
}

function initialEnemyFacing(enemySlot: SlotId, partySlot: SlotId): Facing8 {
  return enemySlot === partySlot ? 'down' : facingFromPoints(enemySlot, partySlot);
}

export function createBattle(setup: BattleSetup, seed = 1): BattleState {
  if (setup.party.length === 0) throw new Error(`[battle] ${setup.id} 没有 party`);
  if (setup.enemies.length === 0) throw new Error(`[battle] ${setup.id} 没有 enemies`);
  for (const enemy of setup.enemies) {
    if (enemy.skills.length === 0) {
      throw new Error(`[battle] ${setup.id} 的 ${enemy.id} 没有技能`);
    }
  }

  const placement = placeUnits(setup, seed);
  const firstPartySlot = placement.partySlots[0]!;
  const party = setup.party.map((unit, index) =>
    makeUnit(unit, 'party', { slot: placement.partySlots[index]! }),
  );
  const enemies = setup.enemies.map((unit, index) => {
    const slot = placement.enemySlots[index]!;
    return makeUnit(unit, 'enemy', {
      slot,
      facing: initialEnemyFacing(slot, firstPartySlot),
      art: unit.art,
      behavior: unit.behavior ?? 'chaser',
    });
  });

  const base: BattleState = {
    encounterId: setup.id,
    title: setup.title,
    seed,
    phase: 'player',
    activeId: null,
    party,
    enemies,
    intents: {},
    enemyActions: 0,
    seq: 0,
    log: appendLog([], 0, `${enemies.map((enemy) => enemy.name).join('、')}挡住了去路。`, 'normal'),
  };
  return { ...base, intents: planEnemyIntents(base, setup) };
}

function unitById(state: BattleState, id: string): BattleUnit | null {
  return (
    state.party.find((unit) => unit.id === id) ??
    state.enemies.find((unit) => unit.id === id) ??
    null
  );
}

function replaceUnit(state: BattleState, unit: BattleUnit): BattleState {
  if (unit.team === 'party') {
    return { ...state, party: state.party.map((current) => (current.id === unit.id ? unit : current)) };
  }
  return {
    ...state,
    enemies: state.enemies.map((current) => (current.id === unit.id ? unit : current)),
  };
}

function applyGauges(
  state: BattleState,
  gauges: Readonly<Record<string, number>>,
): BattleState {
  const apply = (unit: BattleUnit): BattleUnit => {
    const gauge = gauges[unit.id];
    return gauge === undefined ? unit : { ...unit, gauge };
  };
  return {
    ...state,
    party: state.party.map(apply),
    enemies: state.enemies.map(apply),
  };
}

function livingParty(state: BattleState): readonly BattleUnit[] {
  return state.party.filter((unit) => unit.hp > 0);
}

function livingEnemies(state: BattleState): readonly BattleUnit[] {
  return state.enemies.filter((unit) => unit.hp > 0);
}

export function isSlotOccupied(state: BattleState, slot: SlotId): boolean {
  return [...state.party, ...state.enemies].some((unit) => unit.hp > 0 && unit.slot === slot);
}

function partySetup(setup: BattleSetup, id: string): BattlePartySetup | undefined {
  return setup.party.find((unit) => unit.id === id);
}

function activeParty(state: BattleState): BattleUnit | null {
  const active = state.activeId ? unitById(state, state.activeId) : null;
  if (active?.team === 'party') return active;
  return livingParty(state)[0] ?? null;
}

function allEnemiesDead(state: BattleState): boolean {
  return state.enemies.every((unit) => unit.hp <= 0);
}

function allPartyDead(state: BattleState): boolean {
  return state.party.every((unit) => unit.hp <= 0);
}

/**
 * 推进到下一个行动者（不结算行动）。
 *
 * - 已经有一个 `activeId` 时不做任何事（防止场景重复调用把回合吞掉）；
 * - 玩家新回合开始时清掉自己的防御状态；
 * - 怪物新回合开始时该怪物所有技能冷却 −1。
 */
export function startNextTurn(state: BattleState, setup: BattleSetup): BattleActionResult {
  if (state.phase === 'victory' || state.phase === 'defeat') {
    return { state, events: [] };
  }
  if (state.activeId !== null) {
    return { state, events: [] };
  }
  if (allEnemiesDead(state)) {
    const text = setup.victory.text;
    return {
      state: {
        ...state,
        phase: 'victory',
        activeId: null,
        intents: {},
        log: appendLog(state.log, state.seq, text, 'player'),
      },
      events: [{ kind: 'victory', text }],
    };
  }
  if (allPartyDead(state)) {
    const text = setup.defeat.text;
    return {
      state: {
        ...state,
        phase: 'defeat',
        activeId: null,
        intents: {},
        log: appendLog(state.log, state.seq, text, 'danger'),
      },
      events: [{ kind: 'defeat', cause: 'hp', text }],
    };
  }

  const advance = planNextActor(state);
  if (advance.actorId === null) return { state, events: [] };
  const actor = unitById(state, advance.actorId);
  if (!actor) return { state, events: [] };

  let next = applyGauges(state, advance.gauges);
  const updated = unitById(next, actor.id);
  if (!updated) return { state, events: [] };

  if (updated.team === 'party') {
    next = replaceUnit(next, { ...updated, guarding: false });
  } else {
    next = replaceUnit(next, {
      ...updated,
      cooldowns: decrementCooldowns(updated.cooldowns),
    });
  }

  next = {
    ...next,
    phase: updated.team === 'party' ? 'player' : 'enemy',
    activeId: updated.id,
    log: appendLog(
      next.log,
      next.seq,
      updated.team === 'party' ? '你的回合。' : `${updated.name}的回合。`,
      updated.team === 'party' ? 'player' : 'enemy',
    ),
  };

  if (updated.team === 'enemy' && !next.intents[updated.id]) {
    const planned = planEnemyIntent(next, setup, updated.id);
    if (planned) next = { ...next, intents: { ...next.intents, [updated.id]: planned } };
  }

  return {
    state: next,
    events: [
      {
        kind: 'turn-start',
        actorId: updated.id,
        actorName: updated.name,
        team: updated.team,
      },
    ],
  };
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

  const actor = unitById(state, state.activeId);
  if (!actor) return { state, events: [] };

  if (actor.team === 'party' && action.kind === 'enemy-act') {
    return { state, events: [] };
  }
  if (actor.team === 'enemy' && action.kind !== 'enemy-act') {
    return { state, events: [] };
  }

  return actor.team === 'party'
    ? applyPartyAction(state, action, actor, setup)
    : applyEnemyAction(state, setup, actor);
}

function finishPartyAction(
  state: BattleState,
  player: BattleUnit,
  enemies: readonly BattleUnit[],
  seq: number,
  log: readonly BattleLogEntry[],
  events: readonly BattleEvent[],
  intents: BattleState['intents'] = state.intents,
): BattleActionResult {
  return {
    state: {
      ...state,
      activeId: null,
      party: state.party.map((unit) => (unit.id === player.id ? { ...player, gauge: 0 } : unit)),
      enemies,
      intents,
      seq,
      log,
    },
    events,
  };
}

function applyPartyAction(
  state: BattleState,
  action: BattleAction,
  actor: BattleUnit,
  setup: BattleSetup,
): BattleActionResult {
  if (action.kind === 'move') {
    const from = actor.slot;
    if (
      action.slot === from ||
      !isAdjacentSlot(from, action.slot) ||
      isSlotOccupied(state, action.slot)
    ) {
      return { state, events: [] };
    }
    const seq = state.seq + 1;
    const text = `你闪到${slotLabel(action.slot)}。`;
    return finishPartyAction(
      state,
      { ...actor, slot: action.slot },
      state.enemies,
      seq,
      appendLog(state.log, seq, text, 'player'),
      [{ kind: 'move', actorId: actor.id, from, to: action.slot, text }],
    );
  }

  if (action.kind === 'guard') {
    const seq = state.seq + 1;
    const text = '你护住要害，准备卸掉这一下。';
    return finishPartyAction(
      state,
      { ...actor, guarding: true },
      state.enemies,
      seq,
      appendLog(state.log, seq, text, 'player'),
      [{ kind: 'guard', actorId: actor.id, text }],
    );
  }

  if (action.kind !== 'attack') {
    return { state, events: [] };
  }

  const setupParty = partySetup(setup, actor.id);
  if (!setupParty?.skills.includes(action.skillId)) return { state, events: [] };
  const skill = getSkill(action.skillId);
  if (!skill) return { state, events: [] };

  const target = state.enemies.find((unit) => unit.id === action.targetId && unit.hp > 0);
  if (!target) return { state, events: [] };
  if (!isAdjacentSlot(actor.slot, target.slot)) return { state, events: [] };

  const from = actor.slot;
  const targetFacing = target.facing ?? facingFromPoints(target.slot, from);
  const zone: Zone = zoneOfPoint(from, target.slot, targetFacing);
  const backstab = skill.positional && isBackstabPoint(from, target.slot, targetFacing);
  const amount = computeDamage({
    atk: actor.atk,
    power: skill.power,
    backstab,
    ...(skill.backstabMultiplier === undefined
      ? {}
      : { backstabMultiplier: skill.backstabMultiplier }),
    guarding: false,
  });
  const targetHp = Math.max(0, target.hp - amount);
  const targetSurvives = targetHp > 0;
  const counterFacing = facingFromPoints(target.slot, from);
  const updatedTarget: BattleUnit = {
    ...target,
    hp: targetHp,
    ...(targetSurvives ? { facing: counterFacing } : {}),
  };

  const mirror = mirrorSlot(from);
  const mirrorFree = mirror !== from && !isSlotOccupied(state, mirror);
  const wantsTeleport = !backstab && skill.teleport === 'mirror-if-front';
  const teleported = wantsTeleport && mirrorFree;
  const teleportBlocked = wantsTeleport && mirror !== from && !mirrorFree;
  const to = teleported ? mirror : from;

  const seq = state.seq + 1;
  let text = backstab
    ? `${skill.name}从背后扎进去（-${amount} · 背袭 ×1.5）。`
    : `${skill.name}命中${zoneLabel(zone)}（-${amount}）。`;
  if (teleported) {
    text = `${skill.name}命中${zoneLabel(zone)}（-${amount}），你借势闪到${slotLabel(to)}。`;
  } else if (teleportBlocked) {
    text = `${skill.name}命中${zoneLabel(zone)}（-${amount}），但落点被占，你留在原地。`;
  }

  const enemies = state.enemies.map((unit) => (unit.id === target.id ? updatedTarget : unit));
  const events: BattleEvent[] = [
    {
      kind: 'attack',
      actorId: actor.id,
      targetId: target.id,
      targetSlot: target.slot,
      skillId: skill.id,
      skillName: skill.name,
      amount,
      zone,
      backstab,
      targetHp,
      from,
      to,
      teleported,
      text,
    },
  ];
  let log = appendLog(state.log, seq, text, backstab ? 'danger' : 'player');

  if (targetSurvives) {
    events.push({
      kind: 'enemy-face',
      actorId: target.id,
      facing: counterFacing,
      reason: 'hit',
      text: `${target.name}转过身，面朝${slotLabel(from)}。`,
    });
    log = appendLog(
      log,
      seq,
      `${target.name}转过身，面朝${slotLabel(from)}。`,
      'enemy',
    );
  }

  if (allEnemiesDead({ ...state, enemies })) {
    const victoryText = setup.victory.text;
    log = appendLog(log, seq, victoryText, 'player');
    return {
      state: {
        ...state,
        phase: 'victory',
        activeId: null,
        party: state.party.map((unit) =>
          unit.id === actor.id ? { ...unit, slot: to, gauge: 0 } : unit,
        ),
        enemies,
        intents: {},
        seq,
        log,
      },
      events: [...events, { kind: 'victory', text: victoryText }],
    };
  }

  if (!targetSurvives) {
    log = appendLog(log, seq, `${target.name}散尽了。`, 'player');
  }

  const intents = { ...state.intents };
  delete intents[target.id];

  return finishPartyAction(
    state,
    { ...actor, slot: to },
    enemies,
    seq,
    log,
    events,
    intents,
  );
}

function applyEnemyAction(
  state: BattleState,
  setup: BattleSetup,
  enemy: BattleUnit,
): BattleActionResult {
  if (allPartyDead(state)) {
    const text = setup.defeat.text;
    return {
      state: {
        ...state,
        phase: 'defeat',
        activeId: null,
        intents: {},
        log: appendLog(state.log, state.seq, text, 'danger'),
      },
      events: [{ kind: 'defeat', cause: 'hp', text }],
    };
  }

  let intent = state.intents[enemy.id];
  if (!intent) {
    const planned = planEnemyIntent(state, setup, enemy.id);
    if (!planned) {
      return { state: { ...state, activeId: null }, events: [] };
    }
    intent = planned;
    state = { ...state, intents: { ...state.intents, [enemy.id]: planned } };
  }

  const seq = state.seq + 1;

  if (intent.kind === 'move') {
    const blocked = isSlotOccupied(state, intent.to);
    const facing = intent.facing;
    const nextEnemy: BattleUnit = {
      ...enemy,
      slot: blocked ? enemy.slot : intent.to,
      facing,
      gauge: 0,
    };
    const text = blocked
      ? `${enemy.name}想挪到${slotLabel(intent.to)}，被你挡住了。`
      : `${enemy.name}挪到${slotLabel(intent.to)}，面朝${facingLabel(facing)}。`;
    const events: BattleEvent[] = [
      {
        kind: 'enemy-move',
        actorId: enemy.id,
        from: enemy.slot,
        to: intent.to,
        facing,
        blocked,
        text,
      },
    ];
    const next: BattleState = {
      ...state,
      activeId: null,
      enemies: state.enemies.map((unit) => (unit.id === enemy.id ? nextEnemy : unit)),
      enemyActions: state.enemyActions + 1,
      seq,
      log: appendLog(state.log, seq, text, 'enemy'),
    };
    return finishEnemyAction(next, setup, events, enemy.id);
  }

  const skill = resolveSkill(intent.skillId);
  const target = state.party.find((unit) => unit.id === intent.targetId && unit.hp > 0) ?? null;
  const targetSlot = target?.slot ?? intent.targetSlot;
  const hit = target !== null && intent.hitSlots.includes(target.slot);
  const amount =
    hit && target
      ? computeDamage({
          atk: enemy.atk,
          power: skill.power,
          backstab: false,
          guarding: target.guarding,
        })
      : 0;
  const targetHp = target ? Math.max(0, target.hp - amount) : 0;
  const targetSurvives = target !== null && targetHp > 0;

  const nextEnemy: BattleUnit = {
    ...enemy,
    facing: intent.facing,
    gauge: 0,
    cooldowns:
      skill.cooldown === undefined || skill.cooldown <= 0
        ? { ...enemy.cooldowns }
        : { ...enemy.cooldowns, [skill.id]: skill.cooldown },
  };
  const party = target
    ? state.party.map((unit) => (unit.id === target.id ? { ...unit, hp: targetHp } : unit))
    : state.party;

  const text = hit
    ? `${skill.name}命中${slotLabel(targetSlot)}（-${amount}${
        target?.guarding ? ' · 防御减半' : ''
      }）。`
    : `${skill.name}扫过${slotLabel(targetSlot)}，打空了。`;
  const events: BattleEvent[] = [
    {
      kind: 'enemy-face',
      actorId: enemy.id,
      facing: intent.facing,
      reason: 'aim',
      text: `${enemy.name}转身，面朝${slotLabel(intent.aim)}。`,
    },
    {
      kind: 'enemy-skill',
      actorId: enemy.id,
      targetId: target?.id ?? intent.targetId,
      targetSlot,
      skillId: skill.id,
      skillName: skill.name,
      from: enemy.slot,
      aim: intent.aim,
      facing: intent.facing,
      hitSlots: intent.hitSlots,
      hit,
      amount,
      targetHp,
      aoe: intent.aoe,
      text,
    },
  ];
  let log = appendLog(state.log, seq, text, hit ? 'enemy' : 'normal');

  if (target && !targetSurvives) {
    if (party.every((unit) => unit.hp <= 0)) {
      const defeatText = setup.defeat.text;
      log = appendLog(log, seq, defeatText, 'danger');
      return {
        state: {
          ...state,
          phase: 'defeat',
          activeId: null,
          party,
          enemies: state.enemies.map((unit) => (unit.id === enemy.id ? nextEnemy : unit)),
          intents: {},
          enemyActions: state.enemyActions + 1,
          seq,
          log,
        },
        events: [...events, { kind: 'defeat', cause: 'hp', text: defeatText }],
      };
    }
    log = appendLog(log, seq, `${target.name}倒下了。`, 'danger');
  }

  const next: BattleState = {
    ...state,
    activeId: null,
    party,
    enemies: state.enemies.map((unit) => (unit.id === enemy.id ? nextEnemy : unit)),
    enemyActions: state.enemyActions + 1,
    seq,
    log,
  };
  return finishEnemyAction(next, setup, events, enemy.id);
}

/**
 * 怪物行动后的统一收尾：先判清除协议，再只重算**这只怪**的下一意图
 * （其他怪物的意图保持锁定）。
 */
function finishEnemyAction(
  state: BattleState,
  setup: BattleSetup,
  events: readonly BattleEvent[],
  enemyId: string,
): BattleActionResult {
  const protocol = maybeProtocol(state, setup, events);
  if (protocol) return protocol;

  const current = state.enemies.find((unit) => unit.id === enemyId);
  const intents = { ...state.intents };
  if (current && current.hp > 0) {
    const planned = planEnemyIntent(state, setup, enemyId);
    if (planned) intents[enemyId] = planned;
    else delete intents[enemyId];
  } else {
    delete intents[enemyId];
  }
  return { state: { ...state, intents }, events };
}

function maybeProtocol(
  state: BattleState,
  setup: BattleSetup,
  events: readonly BattleEvent[],
): BattleActionResult | null {
  const script = setup.script;
  if (!script) return null;
  if (state.enemyActions < script.protocolAfterEnemyActions) return null;

  const text = script.protocolText;
  let log = appendLog(state.log, state.seq, text, 'danger');
  log = appendLog(log, state.seq, setup.defeat.text, 'danger');
  return {
    state: {
      ...state,
      phase: 'defeat',
      activeId: null,
      party: state.party.map((unit) => ({
        ...unit,
        hp: 0,
        gauge: 0,
        guarding: false,
      })),
      intents: {},
      log,
    },
    events: [
      ...events,
      { kind: 'protocol', amount: script.protocolDamage, text },
      { kind: 'defeat', cause: 'protocol', text: setup.defeat.text },
    ],
  };
}

/** 这台战斗玩家能不能攻击（第一场没有「解」）。 */
export function playerCanAttack(setup: BattleSetup, partyId?: string): boolean {
  const party = partyId
    ? setup.party.find((unit) => unit.id === partyId)
    : setup.party[0];
  return (party?.skills.length ?? 0) > 0;
}

export interface PlayerAttackPreview {
  readonly skillId: string;
  readonly skillName: string;
  readonly zone: Zone;
  readonly backstab: boolean;
  readonly amount: number;
  readonly from: SlotId;
  readonly to: SlotId;
  readonly teleported: boolean;
  readonly teleportBlocked: boolean;
}

/** HUD 用的攻击预览。技能没解锁/目标不存在/不相邻时返回 null。 */
export function previewPlayerAttack(
  state: BattleState,
  setup: BattleSetup,
  skillId: string,
  targetId: string,
): PlayerAttackPreview | null {
  const actor = activeParty(state);
  if (!actor) return null;
  const setupParty = partySetup(setup, actor.id);
  if (!setupParty?.skills.includes(skillId)) return null;
  const skill = getSkill(skillId);
  if (!skill) return null;

  const target = state.enemies.find((unit) => unit.id === targetId && unit.hp > 0);
  if (!target) return null;
  if (!isAdjacentSlot(actor.slot, target.slot)) return null;

  const from = actor.slot;
  const targetFacing = target.facing ?? facingFromPoints(target.slot, from);
  const zone = zoneOfPoint(from, target.slot, targetFacing);
  const backstab = skill.positional && isBackstabPoint(from, target.slot, targetFacing);
  const amount = computeDamage({
    atk: actor.atk,
    power: skill.power,
    backstab,
    ...(skill.backstabMultiplier === undefined
      ? {}
      : { backstabMultiplier: skill.backstabMultiplier }),
    guarding: false,
  });
  const mirror = mirrorSlot(from);
  const mirrorFree = mirror !== from && !isSlotOccupied(state, mirror);
  const wantsTeleport = !backstab && skill.teleport === 'mirror-if-front';
  const teleported = wantsTeleport && mirrorFree;
  return {
    skillId: skill.id,
    skillName: skill.name,
    zone,
    backstab,
    amount,
    from,
    to: teleported ? mirror : from,
    teleported,
    teleportBlocked: wantsTeleport && mirror !== from && !mirrorFree,
  };
}

/** 测试/调试：当前是否有可用的攻击技能。 */
export function attackSkillIds(setup: BattleSetup, partyId?: string): readonly string[] {
  const party = partyId
    ? setup.party.find((unit) => unit.id === partyId)
    : setup.party[0];
  return party?.skills ?? [];
}

/** 测试/调试：某只怪物的当前意图（没有时返回 null）。 */
export function currentIntent(state: BattleState, enemyId?: string): EnemyIntent | null {
  if (enemyId) return state.intents[enemyId] ?? null;
  return Object.values(state.intents)[0] ?? null;
}

export { livingEnemies, livingParty };
