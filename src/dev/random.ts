/**
 * 预览/战斗沙盒用的确定性随机。
 *
 * 真实战斗和演出接入后，同一 `seed + params` 必须给出同一开局；不要在这类逻辑里
 * 直接调用 `Math.random()`。这里不依赖 Phaser，单测覆盖。
 */

/** mulberry32：32 位状态，序列稳定、实现短，适合回放/验收。 */
export function mulberry32(seed: number): () => number {
  let state = Math.trunc(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** 把任意字符串（关卡 id、敌人组名）稳定映射成种子。 */
export function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** `[min, max]` 闭区间整数。 */
export function randomInt(next: () => number, min: number, max: number): number {
  if (max <= min) return Math.trunc(min);
  return Math.min(max, Math.floor(next() * (max - min + 1)) + min);
}
