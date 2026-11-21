/**
 * 帧序列的纯时钟（无 Phaser）。
 *
 * 用于解离突刺 12 帧、起身序列这类「按时间取第几帧」的播放；
 * 场景只负责把 `frameIndexAt()` 的结果套到贴图上，帧率/总时长可单测。
 */
export function frameIndexAt(
  elapsedMs: number,
  frameCount: number,
  frameMs: number,
  loop = false,
): number {
  const count = Math.max(0, Math.floor(frameCount));
  if (count === 0) return 0;
  if (count === 1) return 0;

  const step = Math.max(1, Math.floor(frameMs));
  const total = count * step;
  const raw = Number.isFinite(elapsedMs) ? elapsedMs : 0;
  let cursor: number;

  if (loop) {
    cursor = ((raw % total) + total) % total;
  } else {
    cursor = Math.min(Math.max(raw, 0), total - 1);
  }

  return Math.min(count - 1, Math.floor(cursor / step));
}

/** 播放一整段（非循环）需要的毫秒数。 */
export function sequenceDuration(frameCount: number, frameMs: number): number {
  return Math.max(0, Math.floor(frameCount)) * Math.max(1, Math.floor(frameMs));
}
