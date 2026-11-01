import type { MapPoint, PatrolDef, RoomDef } from '../types';
import { tileCenter } from './room';
import { angleOf, normalizeAngle } from './vision';

/**
 * 巡逻/警戒纯状态机（不 import Phaser）。
 *
 * 场景负责三件事：把玩家位置传进来、用视野模块算出 `playerVisible`、
 * 把 `position/facing/phase` 画出来。状态机只决定“走哪、停多久、警戒到哪”。
 *
 * 状态：patrol → suspicious → chase → search → return → patrol。
 */

export type PatrolPhase = 'patrol' | 'suspicious' | 'chase' | 'search' | 'return';

export interface PatrolUpdateContext {
  readonly player: MapPoint;
  /** 玩家是否在视锥 + 视线内；躲藏/伪装时由场景传 false。 */
  readonly playerVisible: boolean;
  /** 走路 1 / 潜行 0.55 / 跑 1.35 / 躲藏或伪装 0。 */
  readonly playerPosture: number;
  readonly dtMs: number;
}

export interface PatrolSnapshot {
  readonly phase: PatrolPhase;
  readonly alert: number;
  readonly position: MapPoint;
  readonly facingRad: number;
  readonly waypoint: number;
  readonly waitMs: number;
  readonly lostMs: number;
  readonly searchMs: number;
  readonly caught: boolean;
}

const SUSPICIOUS_AT = 0.35;
const CHASE_AT = 1;
const ALERT_RATE = 0.85;
const ALERT_DECAY = 0.5;
const CHASE_SPEED_MULTIPLIER = 1.7;
const LOST_BEFORE_SEARCH_MS = 1500;
const SEARCH_MS = 4000;
const CATCH_DISTANCE = 40;
const CATCH_HOLD_MS = 300;
const ARRIVE_DISTANCE = 6;

function distance(a: MapPoint, b: MapPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function moveToward(
  position: MapPoint,
  target: MapPoint,
  speed: number,
  dtSeconds: number,
): { position: MapPoint; arrived: boolean; facingRad: number | null } {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const remaining = Math.hypot(dx, dy);
  if (remaining <= 0.0001) {
    return { position, arrived: true, facingRad: null };
  }
  const facingRad = angleOf(dx, dy);
  const step = Math.max(0, speed) * dtSeconds;
  if (remaining <= Math.max(ARRIVE_DISTANCE, step)) {
    return { position: target, arrived: true, facingRad };
  }
  return {
    position: {
      x: position.x + (dx / remaining) * step,
      y: position.y + (dy / remaining) * step,
    },
    arrived: false,
    facingRad,
  };
}

export class PatrolUnit {
  readonly def: PatrolDef;
  private readonly room: RoomDef;
  private readonly pathPoints: readonly MapPoint[];
  private positionValue: MapPoint;
  private facingValue: number;
  private phaseValue: PatrolPhase = 'patrol';
  private alertValue = 0;
  private waypointValue = 0;
  private waitValue = 0;
  private scanClock = 0;
  private scanBaseFacing = 0;
  private lostMs = 0;
  private searchValue = 0;
  private caughtHoldMs = 0;
  private caughtValue = false;
  private lastSeen: MapPoint | null = null;

  constructor(room: RoomDef, def: PatrolDef) {
    this.room = room;
    this.def = def;
    this.pathPoints = def.path.map(([col, row]) => tileCenter(room, col, row));
    const first = this.pathPoints[0] ?? { x: 0, y: 0 };
    this.positionValue = first;
    this.waypointValue = this.pathPoints.length > 1 ? 1 : 0;
    const next = this.pathPoints[this.waypointValue] ?? first;
    const dx = next.x - first.x;
    const dy = next.y - first.y;
    this.facingValue = Math.hypot(dx, dy) > 0.0001 ? angleOf(dx, dy) : 0;
    this.scanBaseFacing = this.facingValue;
    if (this.pathPoints.length <= 1) {
      this.waitValue = Math.max(0, def.pauseMs);
    }
  }

  get position(): MapPoint {
    return this.positionValue;
  }

  get facingRad(): number {
    return this.facingValue;
  }

  get phase(): PatrolPhase {
    return this.phaseValue;
  }

  get alert(): number {
    return this.alertValue;
  }

  get caught(): boolean {
    return this.caughtValue;
  }

  get waypoint(): number {
    return this.waypointValue;
  }

  get snapshot(): PatrolSnapshot {
    return {
      phase: this.phaseValue,
      alert: this.alertValue,
      position: this.positionValue,
      facingRad: this.facingValue,
      waypoint: this.waypointValue,
      waitMs: this.waitValue,
      lostMs: this.lostMs,
      searchMs: this.searchValue,
      caught: this.caughtValue,
    };
  }

  /** 供失败重开/预览快照用。 */
  reset(): void {
    const first = this.pathPoints[0] ?? { x: 0, y: 0 };
    this.positionValue = first;
    this.waypointValue = this.pathPoints.length > 1 ? 1 : 0;
    this.phaseValue = 'patrol';
    this.alertValue = 0;
    this.waitValue = this.pathPoints.length <= 1 ? Math.max(0, this.def.pauseMs) : 0;
    this.scanClock = 0;
    this.lostMs = 0;
    this.searchValue = 0;
    this.caughtHoldMs = 0;
    this.caughtValue = false;
    this.lastSeen = null;
    const next = this.pathPoints[this.waypointValue] ?? first;
    this.facingValue = Math.hypot(next.x - first.x, next.y - first.y) > 0.0001
      ? angleOf(next.x - first.x, next.y - first.y)
      : 0;
    this.scanBaseFacing = this.facingValue;
  }

  update(context: PatrolUpdateContext): void {
    const dtSeconds = Math.min(100, Math.max(0, context.dtMs)) / 1000;
    if (dtSeconds <= 0 || this.caughtValue) return;

    const distanceToPlayer = distance(this.positionValue, context.player);
    const rangePx = Math.max(1, this.def.vision.rangeTiles * this.room.tileSize);
    const distanceFactor = Math.max(0.35, Math.min(1, 1 - distanceToPlayer / rangePx));
    const visible = context.playerVisible && context.playerPosture > 0;

    if (visible) {
      this.lastSeen = context.player;
      this.alertValue = Math.min(
        CHASE_AT,
        this.alertValue + ALERT_RATE * distanceFactor * context.playerPosture * dtSeconds,
      );
      this.lostMs = 0;
      if (this.alertValue >= CHASE_AT) {
        this.phaseValue = 'chase';
      } else if (this.alertValue >= SUSPICIOUS_AT && this.phaseValue === 'patrol') {
        this.phaseValue = 'suspicious';
        this.waitValue = 0;
      }
    } else if (this.phaseValue === 'chase') {
      this.lostMs += dtSeconds * 1000;
      if (this.lostMs >= LOST_BEFORE_SEARCH_MS) {
        this.phaseValue = 'search';
        this.searchValue = 0;
      }
    } else {
      this.alertValue = Math.max(0, this.alertValue - ALERT_DECAY * dtSeconds);
      if (this.phaseValue === 'suspicious' && this.alertValue < SUSPICIOUS_AT) {
        this.phaseValue = 'patrol';
        this.waypointValue = this.nearestWaypoint();
        this.waitValue = 0;
      }
    }

    switch (this.phaseValue) {
      case 'patrol':
        this.updatePatrol(dtSeconds);
        break;
      case 'suspicious':
        this.updateSuspicious();
        break;
      case 'chase':
        this.updateChase(context, dtSeconds);
        break;
      case 'search':
        this.updateSearch(dtSeconds);
        break;
      case 'return':
        this.updateReturn(dtSeconds);
        break;
    }
  }

  private nearestWaypoint(): number {
    let best = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.pathPoints.length; index += 1) {
      const point = this.pathPoints[index];
      if (!point) continue;
      const dist = distance(this.positionValue, point);
      if (dist < bestDistance) {
        best = index;
        bestDistance = dist;
      }
    }
    return best;
  }

  private updatePatrol(dtSeconds: number): void {
    if (this.pathPoints.length === 0) return;
    if (this.pathPoints.length === 1) {
      this.waitValue = Math.max(0, this.def.pauseMs);
      this.scanAtWaypoint(dtSeconds);
      return;
    }

    const target = this.pathPoints[this.waypointValue];
    if (!target) return;
    if (this.waitValue > 0) {
      this.waitValue = Math.max(0, this.waitValue - dtSeconds * 1000);
      this.scanAtWaypoint(dtSeconds);
      if (this.waitValue <= 0) {
        this.waypointValue = (this.waypointValue + 1) % this.pathPoints.length;
        this.scanClock = 0;
      }
      return;
    }

    const result = moveToward(
      this.positionValue,
      target,
      this.def.speed,
      dtSeconds,
    );
    this.positionValue = result.position;
    if (result.facingRad !== null) this.facingValue = result.facingRad;
    if (result.arrived) {
      this.waitValue = Math.max(0, this.def.pauseMs);
      this.scanClock = 0;
      this.scanBaseFacing = this.facingValue;
    }
  }

  private scanAtWaypoint(dtSeconds: number): void {
    const scanHalf = (Math.max(0, Math.min(180, this.def.scanDeg)) * Math.PI) / 360;
    if (scanHalf <= 0) return;
    this.scanClock += dtSeconds;
    const phase = Math.sin(this.scanClock * 2.2);
    this.facingValue = normalizeAngle(this.scanBaseFacing + phase * scanHalf);
  }

  private updateSuspicious(): void {
    if (!this.lastSeen) return;
    this.facingValue = angleOf(
      this.lastSeen.x - this.positionValue.x,
      this.lastSeen.y - this.positionValue.y,
    );
  }

  private updateChase(context: PatrolUpdateContext, dtSeconds: number): void {
    const target = this.lastSeen ?? context.player;
    const result = moveToward(
      this.positionValue,
      target,
      this.def.speed * CHASE_SPEED_MULTIPLIER,
      dtSeconds,
    );
    this.positionValue = result.position;
    if (result.facingRad !== null) this.facingValue = result.facingRad;
    if (distance(this.positionValue, context.player) < CATCH_DISTANCE) {
      this.caughtHoldMs += dtSeconds * 1000;
      if (this.caughtHoldMs >= CATCH_HOLD_MS) this.caughtValue = true;
    } else {
      this.caughtHoldMs = 0;
    }
    if (this.lostMs >= LOST_BEFORE_SEARCH_MS) {
      this.phaseValue = 'search';
      this.searchValue = 0;
    }
  }

  private updateSearch(dtSeconds: number): void {
    this.searchValue += dtSeconds * 1000;
    if (this.lastSeen) {
      const result = moveToward(this.positionValue, this.lastSeen, this.def.speed, dtSeconds);
      this.positionValue = result.position;
      if (result.facingRad !== null) this.facingValue = result.facingRad;
      if (result.arrived) {
        this.scanClock += dtSeconds;
        this.facingValue = normalizeAngle(
          this.scanBaseFacing + Math.sin(this.scanClock * 2.6) * (Math.PI / 3),
        );
      }
    }
    if (this.searchValue >= SEARCH_MS) {
      this.phaseValue = 'return';
      this.searchValue = 0;
      this.waitValue = 0;
    }
  }

  private updateReturn(dtSeconds: number): void {
    if (this.pathPoints.length === 0) {
      this.phaseValue = 'patrol';
      return;
    }
    const target = this.pathPoints[this.nearestWaypoint()];
    if (!target) {
      this.phaseValue = 'patrol';
      return;
    }
    const result = moveToward(this.positionValue, target, this.def.speed, dtSeconds);
    this.positionValue = result.position;
    if (result.facingRad !== null) this.facingValue = result.facingRad;
    if (result.arrived) {
      this.phaseValue = 'patrol';
      this.waypointValue = this.nearestWaypoint();
      this.waitValue = 0;
      this.lostMs = 0;
      this.searchValue = 0;
      this.alertValue = 0;
    }
  }
}
