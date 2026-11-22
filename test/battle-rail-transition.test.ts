import { describe, expect, it } from 'vitest';
import {
  railMotionAlpha,
  railTransition,
  type RailSlotMotion,
} from '../src/battle/core/rail-transition';

const P = 'zhou-quan';
const E = 'miner.clear-unit';

function motionOf(
  motions: readonly RailSlotMotion[],
  predicate: (motion: RailSlotMotion) => boolean,
): RailSlotMotion {
  const found = motions.filter(predicate);
  expect(found).toHaveLength(1);
  return found[0]!;
}

describe('railTransition（行动条前移）', () => {
  it('相同序列完全不动：不重播、每格 alpha 都是 1', () => {
    const order = [P, E, P, E, P, E];
    const result = railTransition(order, [...order]);
    expect(result.changed).toBe(false);
    expect(result.shift).toBe(0);
    expect(result.motions).toHaveLength(6);
    for (const [index, motion] of result.motions.entries()) {
      expect(motion).toMatchObject({
        from: index,
        to: index,
        fromAlpha: 1,
        toAlpha: 1,
        enter: false,
        exit: false,
      });
    }
  });

  it('整体前移一格：最左向左滑出渐隐，其余左移一格，末位从右侧 +1 格渐现', () => {
    const prev = [P, E, P, E, P, E];
    const next = [E, P, E, P, E, P];
    const result = railTransition(prev, next);
    expect(result.changed).toBe(true);
    expect(result.shift).toBe(1);

    const exit = motionOf(result.motions, (motion) => motion.exit);
    expect(exit).toEqual({
      id: P,
      from: 0,
      to: -1,
      fromAlpha: 1,
      toAlpha: 0,
      enter: false,
      exit: true,
    });

    const enter = motionOf(result.motions, (motion) => motion.enter);
    expect(enter).toEqual({
      id: P,
      from: 6,
      to: 5,
      fromAlpha: 0,
      toAlpha: 1,
      enter: true,
      exit: false,
    });

    // 其余 5 个整体左移一格，且不淡出。
    const moved = result.motions.filter((motion) => !motion.exit && !motion.enter);
    expect(moved).toHaveLength(5);
    for (const [index, motion] of moved.entries()) {
      expect(motion.to).toBe(index);
      expect(motion.from).toBe(index + 1);
      expect(motion.fromAlpha).toBe(1);
      expect(motion.toAlpha).toBe(1);
    }
  });

  it('一次跨两格：两个最左退场、两个新末位进场，只产生一轮运动', () => {
    const result = railTransition(['A', 'B', 'C', 'D', 'E', 'F'], ['C', 'D', 'E', 'F', 'G', 'H']);
    expect(result.shift).toBe(2);
    expect(result.changed).toBe(true);

    const exits = result.motions.filter((motion) => motion.exit);
    expect(exits.map((motion) => [motion.from, motion.to])).toEqual([
      [0, -2],
      [1, -1],
    ]);
    expect(exits.every((motion) => motion.fromAlpha === 1 && motion.toAlpha === 0)).toBe(true);

    const enters = result.motions.filter((motion) => motion.enter);
    expect(enters.map((motion) => [motion.to, motion.from])).toEqual([
      [4, 5],
      [5, 6],
    ]);
    expect(enters.every((motion) => motion.fromAlpha === 0 && motion.toAlpha === 1)).toBe(true);
    // 只播一轮：没有「先移一格再移一格」的第二组运动。
    expect(result.motions).toHaveLength(8);
  });

  it('序列变短：共同前缀留在原地，尾部原地渐隐', () => {
    const result = railTransition([P, E, P, E], [P, E]);
    expect(result.shift).toBe(0);
    expect(result.changed).toBe(true);
    expect(result.motions.filter((motion) => !motion.exit && !motion.enter)).toHaveLength(2);
    const exits = result.motions.filter((motion) => motion.exit);
    expect(exits.map((motion) => [motion.id, motion.from, motion.to])).toEqual([
      [P, 2, 2],
      [E, 3, 3],
    ]);
    expect(exits.every((motion) => motion.toAlpha === 0)).toBe(true);
  });

  it('变短且前移：留下的头左移，前面退场、后面原地渐隐', () => {
    const result = railTransition([P, E, P, E], [E, P]);
    expect(result.shift).toBe(1);
    const exitSlots = result.motions
      .filter((motion) => motion.exit)
      .map((motion) => [motion.from, motion.to]);
    expect(exitSlots).toEqual([
      [0, -1],
      [3, 2],
    ]);
    expect(result.motions.filter((motion) => motion.enter)).toHaveLength(0);
  });

  it('序列变长：新增 chip 依次从右侧 +1 格渐现', () => {
    const result = railTransition([P, E], [P, E, P, E]);
    expect(result.shift).toBe(0);
    const enters = result.motions.filter((motion) => motion.enter);
    expect(enters.map((motion) => [motion.to, motion.from])).toEqual([
      [2, 3],
      [3, 4],
    ]);
    expect(result.motions.filter((motion) => motion.exit)).toHaveLength(0);
  });

  it('空序列：从无到有全部进场，从有到无全部退场，空对空不动', () => {
    const grown = railTransition([], [P, E]);
    expect(grown.changed).toBe(true);
    expect(grown.shift).toBe(0);
    expect(grown.motions.map((motion) => [motion.to, motion.from, motion.enter])).toEqual([
      [0, 1, true],
      [1, 2, true],
    ]);

    const emptied = railTransition([P, E], []);
    expect(emptied.changed).toBe(true);
    expect(emptied.shift).toBe(2);
    expect(emptied.motions.map((motion) => [motion.from, motion.to, motion.exit])).toEqual([
      [0, -2, true],
      [1, -1, true],
    ]);

    const empty = railTransition([], []);
    expect(empty).toEqual({ shift: 0, changed: false, motions: [] });
  });

  it('顺序互换（两人交替跑条）：让右侧的头滑到最左，不整排交叉淡入', () => {
    const result = railTransition([P, E], [E, P]);
    expect(result.changed).toBe(true);
    // 平分时取更小的 shift：E 从 slot1 滑到 slot0，P 从 slot2 进场、旧 P 从 slot0 退场。
    expect(result.shift).toBe(1);
    expect(result.motions.map((motion) => [motion.id, motion.from, motion.to])).toEqual([
      [E, 1, 0],
      [P, 2, 1],
      [P, 0, -1],
    ]);
  });

  it('完全没有重叠：旧 chip 原地渐隐，新 chip 从右侧 +1 格进场', () => {
    const result = railTransition(['A', 'B'], ['C', 'D']);
    expect(result.shift).toBe(0);
    expect(result.motions.map((motion) => [motion.id, motion.from, motion.to])).toEqual([
      ['C', 1, 0],
      ['D', 2, 1],
      ['A', 0, 0],
      ['B', 1, 1],
    ]);
  });

  it('alpha 只在 progress=1 才到终值（渐隐/渐现线性铺满全程）', () => {
    const result = railTransition([P, E, P, E, P, E], [E, P, E, P, E, P]);
    const enter = motionOf(result.motions, (motion) => motion.enter);
    const exit = motionOf(result.motions, (motion) => motion.exit);

    for (const motion of [enter, exit]) {
      expect(railMotionAlpha(motion, 0)).toBe(motion.fromAlpha);
      expect(railMotionAlpha(motion, 0.26)).toBeCloseTo(
        motion.fromAlpha + (motion.toAlpha - motion.fromAlpha) * 0.26,
        6,
      );
      // 26% / 99% 都还没落定：不能像旧实现那样前 1/4 就淡完。
      expect(railMotionAlpha(motion, 0.26)).not.toBe(motion.toAlpha);
      expect(railMotionAlpha(motion, 0.99)).not.toBe(motion.toAlpha);
      expect(railMotionAlpha(motion, 1)).toBe(motion.toAlpha);
    }

    expect(railMotionAlpha(enter, 0.5)).toBeCloseTo(0.5, 6);
    expect(railMotionAlpha(exit, 0.5)).toBeCloseTo(0.5, 6);
    // 时钟越界时夹到 0..1，避免 alpha 冲过终值。
    expect(railMotionAlpha(enter, -1)).toBe(0);
    expect(railMotionAlpha(enter, 2)).toBe(1);
  });

  it('不修改输入序列', () => {
    const prev = [P, E, P];
    const next = [E, P, E];
    railTransition(prev, next);
    expect(prev).toEqual([P, E, P]);
    expect(next).toEqual([E, P, E]);
  });

  it('works for a 3-unit order (player + two enemies)', () => {
    const p = 'zhou-quan';
    const a = 'cook-phantom-a';
    const b = 'cook-phantom-b';
    const result = railTransition([p, a, b], [a, b, p]);
    expect(result.changed).toBe(true);
    expect(result.shift).toBe(1);
    expect(result.motions.map((motion) => motion.id)).toContain(p);
    expect(result.motions.map((motion) => motion.id)).toContain(a);
    expect(result.motions.map((motion) => motion.id)).toContain(b);
    expect(result.motions.filter((motion) => motion.exit)).toHaveLength(1);
    expect(result.motions.filter((motion) => motion.enter)).toHaveLength(1);
  });
});
