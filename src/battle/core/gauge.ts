import type { BattleState, BattleUnit } from '../types';

/**
 * 跑条（行动条）的纯数学。
 *
 * `gauge` 0..1000，每个逻辑 tick 累积 `spd` 点；先到 1000 的单位行动，
 * 行动后归零。这是**离散、确定性**的「ATB 顺序」，不读真实时间，
 * 所以同一 seed/同一操作序列永远得到同一顺序（可回放、可单测）。
 *
 * v3 起顶部不再画量条，但引擎保留；`previewOrder` 仍然给头像行动表提供顺序。
 */

export const GAUGE_MAX = 1000;

export interface GaugeAdvance {
  readonly actorId: string | null;
  /** 推进到本次行动所经过的 tick 数（调试用）。 */
  readonly ticks: number;
  /** 所有活着的单位 → 推进后的 gauge。 */
  readonly gauges: Readonly<Record<string, number>>;
}

interface GaugeActor {
  readonly id: string;
  readonly team: 'party' | 'enemy';
  readonly spd: number;
  readonly gauge: number;
  readonly alive: boolean;
}

function ticksToFull(actor: GaugeActor): number {
  if (!actor.alive) return Number.POSITIVE_INFINITY;
  const speed = Math.max(1, Math.floor(actor.spd));
  return Math.max(1, Math.ceil((GAUGE_MAX - Math.min(GAUGE_MAX, actor.gauge)) / speed));
}

/**
 * 平局裁决：同一 tick 到顶时，速度高者优先 → 敌方优先 → id 字典序。
 */
function pickWinner(actors: readonly GaugeActor[]): GaugeActor | null {
  const reached = actors.filter((actor) => actor.alive && actor.gauge >= GAUGE_MAX);
  if (reached.length === 0) {
    const alive = actors.filter((actor) => actor.alive);
    if (alive.length === 0) return null;
    return [...alive].sort((a, b) => b.spd - a.spd || (a.id < b.id ? -1 : 1))[0]!;
  }
  return [...reached].sort((a, b) => {
    if (b.spd !== a.spd) return b.spd - a.spd;
    if (a.team !== b.team) return a.team === 'enemy' ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0]!;
}

function livingUnits(state: BattleState): readonly BattleUnit[] {
  return [...state.party, ...state.enemies].filter((unit) => unit.hp > 0);
}

function toGaugeActor(unit: BattleUnit): GaugeActor {
  return {
    id: unit.id,
    team: unit.team,
    spd: unit.spd,
    gauge: unit.gauge,
    alive: unit.hp > 0,
  };
}

/** 推进到下一个行动者（不真正行动，只算 gauge）。 */
export function planNextActor(state: BattleState): GaugeAdvance {
  const units = livingUnits(state);
  const actors = units.map(toGaugeActor);
  if (actors.length === 0) return { actorId: null, ticks: 0, gauges: {} };

  const ticks = Math.min(...actors.map(ticksToFull));
  const safeTicks = Number.isFinite(ticks) ? ticks : 1;
  const advanced = actors.map((actor) => ({
    ...actor,
    gauge: Math.min(GAUGE_MAX, actor.gauge + Math.max(1, Math.floor(actor.spd)) * safeTicks),
  }));
  const winner = pickWinner(advanced);
  if (!winner) return { actorId: null, ticks: safeTicks, gauges: {} };

  const gauges: Record<string, number> = {};
  for (const actor of advanced) gauges[actor.id] = actor.gauge;
  return { actorId: winner.id, ticks: safeTicks, gauges };
}

/**
 * 预测未来 `count` 次行动顺序（含当前已锁定、尚未行动的 active actor）。
 *
 * HUD 的行动表用它；纯模拟，不修改 state。
 */
export function previewOrder(state: BattleState, count: number): string[] {
  const units = livingUnits(state);
  if (units.length === 0) return [];

  const gauges = new Map<string, number>(units.map((unit) => [unit.id, unit.gauge]));
  const actors = units.map((unit) => ({
    id: unit.id,
    team: unit.team,
    spd: unit.spd,
    alive: true,
    gauge: unit.gauge,
  }));

  const order: string[] = [];
  let active = state.activeId;
  const total = Math.max(0, Math.floor(count));

  for (let index = 0; index < total; index += 1) {
    if (active !== null) {
      if (!gauges.has(active)) {
        active = null;
        continue;
      }
      order.push(active);
      gauges.set(active, 0);
      active = null;
      continue;
    }

    const current = actors.map((actor) => ({
      ...actor,
      gauge: gauges.get(actor.id) ?? 0,
    }));
    const ticks = Math.min(...current.map(ticksToFull));
    if (!Number.isFinite(ticks)) break;
    for (const actor of current) {
      gauges.set(
        actor.id,
        Math.min(GAUGE_MAX, actor.gauge + Math.max(1, Math.floor(actor.spd)) * ticks),
      );
    }

    const advanced = current.map((actor) => ({ ...actor, gauge: gauges.get(actor.id) ?? 0 }));
    const winner = pickWinner(advanced);
    if (!winner) break;
    order.push(winner.id);
    gauges.set(winner.id, 0);
  }

  return order;
}
