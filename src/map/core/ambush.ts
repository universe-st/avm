import type { MapPoint } from '../types';
import { angleOf, normalizeAngle } from './vision';

/** 接敌/偷袭角度。背后 120°（cos ≤ -0.5）才算背刺。 */
export type AmbushGrade = 'back' | 'side' | 'front';

export type PatrolPhaseName = 'patrol' | 'suspicious' | 'chase' | 'search' | 'return';

export interface AmbushInput {
  readonly enemy: MapPoint;
  readonly enemyFacingRad: number;
  readonly player: MapPoint;
  readonly alert: number;
  readonly phase: PatrolPhaseName;
  readonly tileSize: number;
}

export const BACKSTAB_RANGE_TILES = 1.2;
export const BACKSTAB_ALERT_MAX = 0.6;

export function gradeAmbush(input: AmbushInput): AmbushGrade {
  const dx = input.player.x - input.enemy.x;
  const dy = input.player.y - input.enemy.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.0001) return 'front';
  const toPlayer = angleOf(dx, dy);
  const facing = normalizeAngle(input.enemyFacingRad);
  const cos = Math.cos(normalizeAngle(toPlayer - facing));
  if (cos <= -0.5) return 'back';
  if (cos >= 0.5) return 'front';
  return 'side';
}

export function canBackstab(input: AmbushInput): boolean {
  if (input.phase !== 'patrol' && input.phase !== 'suspicious') return false;
  if (input.alert >= BACKSTAB_ALERT_MAX) return false;
  const distance = Math.hypot(
    input.player.x - input.enemy.x,
    input.player.y - input.enemy.y,
  );
  if (distance > BACKSTAB_RANGE_TILES * input.tileSize) return false;
  return gradeAmbush(input) === 'back';
}
