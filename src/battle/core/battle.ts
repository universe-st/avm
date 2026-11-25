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
  PendingMove,
  SlotId,
  Zone,
} from '../types';
import { planEnemyIntent, planEnemyIntents, planScriptedSkillIntent } from './ai';
import { computeDamage, zoneLabel } from './damage';
import { dodgeChance } from './dodge';
import { battleRandom } from './rng';
import { planNextActor } from './gauge';
import { getSkill, resolveSkill } from '../data/skills';
import { placeUnits } from './placement';
import {
  adjacentSlots,
  facingFromPoints,
  facingLabel,
  isAdjacentSlot,
  isBackstabPoint,
  pointDistance,
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
    readonly defense?: number;
    readonly dodge?: number;
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
    defense: Math.max(0, setup.defense ?? 0),
    dodge: Math.max(0, Math.round(setup.dodge ?? 0)),
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
    pendingMove: null,
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

interface DodgeResult {
  readonly to: SlotId;
  readonly chance: number;
  readonly roll: number;
}

/**
 * 闪避判定：先确认有相邻空位（没有就不掷骰），再按
 * `1 - 200/(3x+200)` 用战斗 seed 掷骰。成功后向远离攻击者的空位移动。
 */
function tryDodge(
  state: BattleState,
  defender: BattleUnit,
  attacker: BattleUnit,
  skillId: string,
  aoe: boolean,
): DodgeResult | null {
  const chance = dodgeChance(defender.dodge);
  if (chance <= 0) return null;
  const candidates = adjacentSlots(defender.slot).filter(
    (slot) => !isSlotOccupied(state, slot),
  );
  if (candidates.length === 0) return null;

  const ordered = [...candidates].sort((a, b) => {
    const da = pointDistance(attacker.slot, a);
    const db = pointDistance(attacker.slot, b);
    if (da !== db) return db - da;
    return a < b ? -1 : a > b ? 1 : 0;
  });
  const to = ordered[0]!;
  const roll = battleRandom(
    state.seed,
    state.seq + 1,
    `${defender.id}:${attacker.id}:${skillId}:${aoe ? 'aoe' : 'hit'}`,
  );
  return roll < chance ? { to, chance, roll } : null;
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
        pendingMove: null,
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
        pendingMove: null,
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
    pendingMove: null,
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
  // pending 落点选择期间只接受 post-move；其他行动一律拒绝。
  if (state.pendingMove) {
    if (action.kind !== 'post-move') return { state, events: [] };
  } else if (action.kind === 'post-move') {
    return { state, events: [] };
  }
  if (state.activeId === null) {
    return { state, events: [] };
  }

  const actor = unitById(state, state.activeId);
  if (!actor) return { state, events: [] };

  if (state.pendingMove) {
    return actor.team === 'party'
      ? applyPostMove(state, action, actor)
      : { state, events: [] };
  }

  if (actor.team === 'party' && action.kind === 'enemy-act') {
    return { state, events: [] };
  }
  if (actor.team === 'enemy' && action.kind !== 'enemy-act') {
    return { state, events: [] };
  }

  return actor.team === 'party'
    ? applyPartyAction(state, action, actor, setup)
    : applyEnemyAction(state, setup, actor, action.kind === 'enemy-act' ? action.forceSkillId : undefined);
}

/**
 * 落点选择：`slot` 必须是 pending.slots 之一，或玩家当前点（留在原地）。
 * 结算后 gauge 归零、activeId 置空、pending 清空，回到正常回合循环。
 */
function applyPostMove(
  state: BattleState,
  action: BattleAction,
  actor: BattleUnit,
): BattleActionResult {
  const pending = state.pendingMove;
  if (!pending || pending.actorId !== actor.id || action.kind !== 'post-move') {
    return { state, events: [] };
  }
  const from = actor.slot;
  const to = action.slot;
  if (to !== from && !pending.slots.includes(to)) {
    return { state, events: [] };
  }
  const moved = to !== from;
  const seq = state.seq + 1;
  const text = moved ? `你借势落到${slotLabel(to)}。` : '你留在原地。';
  const party = state.party.map((unit) =>
    unit.id === actor.id ? { ...unit, slot: to, gauge: 0 } : unit,
  );
  const events: BattleEvent[] = moved
    ? [{ kind: 'move', actorId: actor.id, from, to, text }]
    : [{ kind: 'log', text, tone: 'player' }];
  return {
    state: {
      ...state,
      activeId: null,
      pendingMove: null,
      party,
      seq,
      log: appendLog(state.log, seq, text, 'player'),
    },
    events,
  };
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
      pendingMove: null,
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

  const dodge = tryDodge(state, target, actor, skill.id, false);
  if (dodge) {
    const seq = state.seq + 1;
    const text = `${skill.name}擦过——${target.name}闪到${slotLabel(dodge.to)}。`;
    const enemies = state.enemies.map((unit) =>
      unit.id === target.id ? { ...unit, slot: dodge.to } : unit,
    );
    const events: BattleEvent[] = [
      {
        kind: 'dodge',
        actorId: target.id,
        attackerId: actor.id,
        skillId: skill.id,
        from: target.slot,
        to: dodge.to,
        aoe: false,
        text: `${target.name}闪到${slotLabel(dodge.to)}。`,
      },
      {
        kind: 'attack',
        actorId: actor.id,
        targetId: target.id,
        targetSlot: target.slot,
        skillId: skill.id,
        skillName: skill.name,
        amount: 0,
        zone,
        backstab,
        targetHp: target.hp,
        from,
        dodged: true,
        text,
      },
    ];
    return finishPartyAction(
      state,
      { ...actor, slot: from },
      enemies,
      seq,
      appendLog(state.log, seq, text, 'enemy'),
      events,
      state.intents,
    );
  }

  const amount = computeDamage({
    atk: actor.atk,
    power: skill.power,
    backstab,
    ...(skill.backstabMultiplier === undefined
      ? {}
      : { backstabMultiplier: skill.backstabMultiplier }),
    defense: target.defense,
    ...(skill.backstabDefensePierce === undefined
      ? {}
      : { backstabDefensePierce: skill.backstabDefensePierce }),
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

  const seq = state.seq + 1;
  const text = backstab
    ? `${skill.name}从背后扎进去（-${amount} · 背袭 ×1.5）。`
    : `${skill.name}命中${zoneLabel(zone)}（-${amount}）。`;

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
        pendingMove: null,
        party: state.party.map((unit) =>
          unit.id === actor.id ? { ...unit, slot: from, gauge: 0 } : unit,
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
  if (!targetSurvives) delete intents[target.id];

  // 非背袭 + near-target：进入落点选择；没有空闲点就按普通行动结束。
  const pendingSlots =
    !backstab && skill.postHitMove === 'near-target'
      ? adjacentSlots(target.slot).filter(
          (slot) => slot !== from && !isSlotOccupied(state, slot),
        )
      : [];
  if (pendingSlots.length > 0) {
    const pending: PendingMove = {
      actorId: actor.id,
      targetId: target.id,
      targetSlot: target.slot,
      slots: pendingSlots,
    };
    return {
      state: {
        ...state,
        activeId: actor.id,
        party: state.party.map((unit) =>
          unit.id === actor.id ? { ...unit, slot: from } : unit,
        ),
        enemies,
        intents,
        pendingMove: pending,
        seq,
        log,
      },
      events,
    };
  }

  return finishPartyAction(
    state,
    { ...actor, slot: from },
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
  forceSkillId?: string,
): BattleActionResult {
  if (allPartyDead(state)) {
    const text = setup.defeat.text;
    return {
      state: {
        ...state,
        phase: 'defeat',
        activeId: null,
        pendingMove: null,
        intents: {},
        log: appendLog(state.log, state.seq, text, 'danger'),
      },
      events: [{ kind: 'defeat', cause: 'hp', text }],
    };
  }

  // 执行时按当前站位重新选目标：玩家移动后不会朝旧点位空放。
  // `forceSkillId` 是教程节拍用的「指定招式」，跳过选招（不看距离/冷却）。
  const planned =
    (forceSkillId ? planScriptedSkillIntent(state, setup, enemy.id, forceSkillId) : null) ??
    planEnemyIntent(state, setup, enemy.id);
  if (!planned) {
    const seq = state.seq + 1;
    const text = `${enemy.name}找不到能攻击到的目标，按住阵脚。`;
    const next: BattleState = {
      ...state,
      activeId: null,
      pendingMove: null,
      enemies: state.enemies.map((unit) =>
        unit.id === enemy.id ? { ...unit, gauge: 0 } : unit,
      ),
      enemyActions: state.enemyActions + 1,
      seq,
      log: appendLog(state.log, seq, text, 'enemy'),
    };
    return finishEnemyAction(next, setup, [{ kind: 'log', text, tone: 'enemy' }], enemy.id);
  }
  const intent = planned;
  state = { ...state, intents: { ...state.intents, [enemy.id]: planned } };

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
      pendingMove: null,
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

  const dodge = hit && target ? tryDodge(state, target, enemy, skill.id, intent.aoe) : null;
  if (dodge && target) {
    const nextEnemy: BattleUnit = {
      ...enemy,
      facing: intent.facing,
      gauge: 0,
      cooldowns:
        skill.cooldown === undefined || skill.cooldown <= 0
          ? { ...enemy.cooldowns }
          : { ...enemy.cooldowns, [skill.id]: skill.cooldown },
    };
    const party = state.party.map((unit) =>
      unit.id === target.id ? { ...unit, slot: dodge.to } : unit,
    );
    const text = `${skill.name}擦过——你闪到${slotLabel(dodge.to)}。`;
    const events: BattleEvent[] = [
      {
        kind: 'enemy-face',
        actorId: enemy.id,
        facing: intent.facing,
        reason: 'aim',
        text: `${enemy.name}转身，面朝${slotLabel(intent.aim)}。`,
      },
      {
        kind: 'dodge',
        actorId: target.id,
        attackerId: enemy.id,
        skillId: skill.id,
        from: targetSlot,
        to: dodge.to,
        aoe: intent.aoe,
        text: `你闪到${slotLabel(dodge.to)}。`,
      },
      {
        kind: 'enemy-skill',
        actorId: enemy.id,
        targetId: target.id,
        targetSlot,
        skillId: skill.id,
        skillName: skill.name,
        from: enemy.slot,
        aim: intent.aim,
        facing: intent.facing,
        hitSlots: intent.hitSlots,
        hit: false,
        amount: 0,
        targetHp: target.hp,
        aoe: intent.aoe,
        dodged: true,
        text,
      },
    ];
    const next: BattleState = {
      ...state,
      activeId: null,
      pendingMove: null,
      party,
      enemies: state.enemies.map((unit) => (unit.id === enemy.id ? nextEnemy : unit)),
      enemyActions: state.enemyActions + 1,
      seq,
      log: appendLog(state.log, seq, text, 'player'),
    };
    return finishEnemyAction(next, setup, events, enemy.id);
  }

  const amount =
    hit && target
      ? computeDamage({
          atk: enemy.atk,
          power: skill.power,
          backstab: false,
          defense: target.defense,
          backstabDefensePierce: 0,
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
          pendingMove: null,
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
    pendingMove: null,
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
  return { state: { ...state, pendingMove: null, intents }, events };
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
      pendingMove: null,
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
    defense: target.defense,
    ...(skill.backstabDefensePierce === undefined
      ? {}
      : { backstabDefensePierce: skill.backstabDefensePierce }),
    guarding: false,
  });
  return {
    skillId: skill.id,
    skillName: skill.name,
    zone,
    backstab,
    amount,
    from,
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
