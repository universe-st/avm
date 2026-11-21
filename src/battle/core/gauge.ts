import type { BattleState } from '../types';

/**
 * 跑条（行动条）的纯数学。
 *
 * `gauge` 0..1000，每个逻辑 tick 累积 `spd` 点；先到 1000 的单位行动，
 * 行动后归零。这是**离散、确定性**的「ATB 顺序」，不读真实时间，
 * 所以同一 seed/同一操作序列永远得到同一顺序（可回放、可单测）。
 *
 * 注意：因为到顶会截断（1000 封顶），速度比不是严格的每次交替；
 * 20 vs 14 在 7 次行动里大约是 4:3，偶尔会出现怪物连续行动两次。
 * 这是设计允许的「它比你快」的直观表现。
 */

export const GAUGE_MAX = 1000;

export interface GaugeAdvance {
  readonly actorId: string;
  /** 推进到本次行动所经过的 tick 数（调试/UI 用）。 */
  readonly ticks: number;
  readonly playerGauge: number;
  readonly enemyGauge: number;
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
 * 平局裁决：先后到者必赢；同一 tick 到顶时，
 * 速度高者优先 → 敌方优先 → id 字典序（稳定、可复现）。
 */
function pickWinner(actors: readonly GaugeActor[]): GaugeActor {
  const reached = actors.filter((actor) => actor.alive && actor.gauge >= GAUGE_MAX);
  if (reached.length === 0) {
    // 理论上不会发生：调用方总是把至少一个活着的单位推进到顶。
    return [...actors].filter((actor) => actor.alive).sort((a, b) => b.spd - a.spd)[0]!;
  }
  return [...reached].sort((a, b) => {
    if (b.spd !== a.spd) return b.spd - a.spd;
    if (a.team !== b.team) return a.team === 'enemy' ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0]!;
}

function toActors(state: BattleState): { player: GaugeActor; enemy: GaugeActor } {
  return {
    player: {
      id: state.player.id,
      team: state.player.team,
      spd: state.player.spd,
      gauge: state.player.gauge,
      alive: state.player.hp > 0,
    },
    enemy: {
      id: state.enemy.id,
      team: state.enemy.team,
      spd: state.enemy.spd,
      gauge: state.enemy.gauge,
      alive: state.enemy.hp > 0,
    },
  };
}

/** 推进到下一个行动者（不真正行动，只算 gauge）。 */
export function planNextActor(state: BattleState): GaugeAdvance {
  const { player, enemy } = toActors(state);
  const ticks = Math.min(ticksToFull(player), ticksToFull(enemy));
  const safeTicks = Number.isFinite(ticks) ? ticks : 1;

  const playerGauge = Math.min(GAUGE_MAX, player.gauge + player.spd * safeTicks);
  const enemyGauge = Math.min(GAUGE_MAX, enemy.gauge + enemy.spd * safeTicks);

  const winner = pickWinner([
    { ...player, gauge: playerGauge },
    { ...enemy, gauge: enemyGauge },
  ]);

  return {
    actorId: winner.id,
    ticks: safeTicks,
    playerGauge,
    enemyGauge,
  };
}

/**
 * 预测未来 `count` 次行动顺序（含当前已锁定、尚未行动的 active actor）。
 *
 * HUD 的「接下来」条用它；纯模拟，不修改 state。
 */
export function previewOrder(state: BattleState, count: number): string[] {
  let playerGauge = state.player.gauge;
  let enemyGauge = state.enemy.gauge;
  const playerAlive = state.player.hp > 0;
  const enemyAlive = state.enemy.hp > 0;

  const playerActor = (): GaugeActor => ({
    id: state.player.id,
    team: state.player.team,
    spd: state.player.spd,
    gauge: playerGauge,
    alive: playerAlive,
  });
  const enemyActor = (): GaugeActor => ({
    id: state.enemy.id,
    team: state.enemy.team,
    spd: state.enemy.spd,
    gauge: enemyGauge,
    alive: enemyAlive,
  });

  const order: string[] = [];
  let active = state.activeId;
  const total = Math.max(0, Math.floor(count));

  for (let index = 0; index < total; index += 1) {
    if (active !== null) {
      order.push(active);
      if (active === state.player.id) playerGauge = 0;
      if (active === state.enemy.id) enemyGauge = 0;
      active = null;
      continue;
    }

    const ticks = Math.min(ticksToFull(playerActor()), ticksToFull(enemyActor()));
    if (!Number.isFinite(ticks)) break;
    playerGauge = Math.min(GAUGE_MAX, playerGauge + state.player.spd * ticks);
    enemyGauge = Math.min(GAUGE_MAX, enemyGauge + state.enemy.spd * ticks);

    const winner = pickWinner([playerActor(), enemyActor()]);
    order.push(winner.id);
    if (winner.id === state.player.id) playerGauge = 0;
    if (winner.id === state.enemy.id) enemyGauge = 0;
  }

  return order;
}
