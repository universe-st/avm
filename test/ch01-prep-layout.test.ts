import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CH01_STAND_HEAD_CENTER_OFFSET,
  CH01_XIAOBAI_HEAD_OFFSET_PX,
  CH01_XIAOBAI_OFFSET,
  prepXiaobaiSpot,
  xiaobaiHeadAnchorY,
} from '../src/story/ch01-performance';

/**
 * 准备阶段（进入御膳房前的自由活动）小白的构图回归护栏（2026-11-28 用户报的 bug）。
 *
 * 现象：「按正常游戏流程走到这里」和「读取存档到这里」，小白站的位置不一样
 * （正常流程停在主角 +100px 的趴地收尾点；读档停在 +65px；玩家恰好在书桌旁存档时
 * 她甚至留在手机/书桌上）。
 *
 * 根因有两条，都是「构图靠距离启发式 + 自由漂浮状态」造成的：
 * 1. `layoutPrep()` 只在「离锚点 > 180px」时才挪人，于是黑场收尾的补间可以事后把她拉回旧位置；
 * 2. 读档回来的锚点离手机位置「不够远」时，她根本不会被挪走。
 *
 * 分两层守：
 * 1. 纯函数：`prepXiaobaiSpot()` 是唯一真值（正常流程与读档都只认它）；
 * 2. 源码护栏：场景里必须调它、必须先杀掉挂在她身上的位移 tween，且不许再出现距离阈值/手写像素。
 */

function source(file: string): string {
  return readFileSync(file, 'utf8');
}

/** 取出方法体（签名后第一个位于行尾的 `{` 到配对的 `}`），与 `scene-lifecycle.test.ts` 同一套。 */
function bodyOf(text: string, signature: string): string {
  const start = text.indexOf(signature);
  expect(start, `没找到 ${signature}`).toBeGreaterThanOrEqual(0);
  let open = -1;
  for (let cursor = text.indexOf('{', start); cursor >= 0; cursor = text.indexOf('{', cursor + 1)) {
    if (text[cursor + 1] === '\n' || text[cursor + 1] === '\r') {
      open = cursor;
      break;
    }
  }
  expect(open, `${signature} 没有方法体`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let cursor = open; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, cursor + 1);
    }
  }
  throw new Error(`${signature} 的花括号没有闭合`);
}

const TILE = 720 / 33;

describe('prepXiaobaiSpot：准备阶段构图的唯一真值', () => {
  it('主角右上方、与头部中线齐平（横向沿用「右 3 格」的偏移语义）', () => {
    const spot = prepXiaobaiSpot({ x: 360, y: 782 }, TILE);
    expect(spot.x).toBeCloseTo(360 + CH01_XIAOBAI_OFFSET[0] * TILE, 6);
    expect(spot.x - 360).toBeGreaterThan(40);
    expect(spot.x - 360).toBeLessThan(90);
    expect(spot.y).toBeCloseTo(
      782 - CH01_STAND_HEAD_CENTER_OFFSET + CH01_XIAOBAI_HEAD_OFFSET_PX,
      6,
    );
  });

  it('同一个玩家位置必然给出同一个落点（不吃「她之前在哪」这种自由状态）', () => {
    const player = { x: 240, y: 640 };
    expect(prepXiaobaiSpot(player, TILE)).toEqual(prepXiaobaiSpot(player, TILE));
    // 两条历史路径的旧落点（+100 与 +65）都必须收敛到同一处：函数只认玩家脚底。
    expect(prepXiaobaiSpot({ ...player, x: player.x + 100 }, TILE).x - (player.x + 100)).toBeCloseTo(
      prepXiaobaiSpot(player, TILE).x - player.x,
      6,
    );
  });

  it('头高锚点与起身漂浮的 head 锚点同源', () => {
    expect(xiaobaiHeadAnchorY(782)).toBe(782 - CH01_STAND_HEAD_CENTER_OFFSET);
  });
});

describe('寝室场景：摆位必须收敛，不许再用距离阈值', () => {
  const sceneSource = source('src/scenes/ch01-dorm-scene.ts');

  it('layoutPrep 走 placeXiaobaiForPrep（没有第二套构图）', () => {
    const layout = bodyOf(sceneSource, 'private layoutPrep(): void {');
    expect(layout).toContain('this.placeXiaobaiForPrep();');
    expect(layout).not.toMatch(/>\s*180/);
  });

  it('placeXiaobaiForPrep：先清位移 tween，再落到 prepXiaobaiSpot', () => {
    const place = bodyOf(sceneSource, 'private placeXiaobaiForPrep(): void {');
    expect(place).toContain('prepXiaobaiSpot(');
    // 黑场收尾/起身漂浮的 tween 会在进入 prep 之后继续跑，必须杀掉。
    expect(place).toContain('this.tweens.killTweensOf(xiaobai)');
    // 杀 tween 会连淡入一起杀掉：可见的人必须补回不透明，别停在半透明。
    expect(place).toContain('xiaobai.setAlpha(1)');
    expect(place).not.toMatch(/>\s*180/);
  });

  it('场景里不再手写小白的锚点像素（+62 / +65 这类历史数字）', () => {
    expect(sceneSource).not.toContain('player.position.x + 62');
    expect(sceneSource).not.toContain('xiaobai.x + 65');
    expect(sceneSource).not.toContain('xiaobai.x + 62');
  });

  it('浮动 tween 必须给落位补间让位，否则两条 tween 抢同一个 y', () => {
    const bob = bodyOf(sceneSource, 'private startXiaobaiBob(): void {');
    expect(bob).toContain('this.prepSettle');
  });

  it('收尾/重开都要把落位补间清掉（场景实例会被 restart 复用）', () => {
    const shutdown = bodyOf(sceneSource, 'private onShutdown(): void {');
    expect(shutdown).toContain('this.prepSettle?.remove();');
    const reset = bodyOf(sceneSource, 'private resetState(): void {');
    expect(reset).toContain('this.prepSettle?.remove();');
  });
});
