/**
 * 战斗用的确定性随机（不依赖 Math.random，预览/测试/读档同 seed 同结果）。
 *
 * 只用整数 hash；同一 seed + seq + key 永远返回同一个 [0,1) 值。
 */
export function battleRandom(seed: number, seq: number, key: string): number {
  let h = (seed | 0) ^ Math.imul((seq + 1) | 0, 0x9e3779b1);
  for (let i = 0; i < key.length; i += 1) {
    h = Math.imul(h ^ key.charCodeAt(i), 0x85ebca6b);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
