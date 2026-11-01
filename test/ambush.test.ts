import { describe, expect, it } from 'vitest';
import { canBackstab, gradeAmbush, type AmbushInput } from '../src/map/core/ambush';

const TILE = 64;
const enemy = { x: 200, y: 200 };

const input = (patch: Partial<AmbushInput> = {}): AmbushInput => ({
  enemy,
  enemyFacingRad: 0, // 朝右
  player: { x: 150, y: 200 }, // 在敌人背后
  alert: 0.2,
  phase: 'patrol',
  tileSize: TILE,
  ...patch,
});

describe('ambush', () => {
  it('grades behind / side / front by the 120° rear wedge', () => {
    expect(gradeAmbush(input())).toBe('back');
    expect(gradeAmbush(input({ player: { x: 250, y: 200 } }))).toBe('front');
    expect(gradeAmbush(input({ player: { x: 200, y: 140 } }))).toBe('side');
    expect(gradeAmbush(input({ enemyFacingRad: Math.PI }))).toBe('front');
  });

  it('only allows a backstab in the rear window', () => {
    expect(canBackstab(input())).toBe(true);
    expect(canBackstab(input({ alert: 0.6 }))).toBe(false);
    expect(canBackstab(input({ alert: 0.59 }))).toBe(true);
    expect(canBackstab(input({ phase: 'chase' }))).toBe(false);
    expect(canBackstab(input({ phase: 'search' }))).toBe(false);
    expect(canBackstab(input({ player: { x: 250, y: 200 } }))).toBe(false);
  });

  it('rejects targets outside 1.2 tiles', () => {
    expect(canBackstab(input({ player: { x: 130, y: 200 } }))).toBe(true);
    expect(canBackstab(input({ player: { x: 120, y: 200 } }))).toBe(false);
  });
});
