import type { EmotionKind } from '../story/dialogue';

/**
 * 表情气泡「冒出」音效的参数（t61）。
 *
 * 六种情绪共用一条音效（`audio.sfx.ch01_bubble_pop`）：短促的「啵」，近场干声。
 * 不按情绪切音频文件，只把 `rate` 做 ±5% 的固定微变——这样连续两行都带 emotion
 * 时不会听起来像同一个采样拷贝，又不用为六个情绪各出一份素材。
 *
 * 这里只放常数、不 import Phaser：单测（`test/emotion-bubble-sfx.test.ts`）可以直接读，
 * 渲染与播放时机在 `emotion-bubble.ts`。
 */
export const BUBBLE_POP_VOLUME = 0.35;

/**
 * 距上一次「啵」不到这么久就再起一记（对话连点/连续两行都有 emotion 时，
 * 避免叠出机关枪，也避免两三个 Sound 同时播把音量堆上去）。
 */
export const BUBBLE_POP_MIN_INTERVAL_MS = 120;

/**
 * 每个情绪一个固定的播放速率（基准 1.0 的 ±5% 以内）。
 * 低一点的（sad 0.96）听起来更闷、更像叹气；高一点的（angry 1.05）更急。
 */
export const BUBBLE_POP_RATE: Readonly<Record<EmotionKind, number>> = {
  confused: 0.97,
  angry: 1.05,
  happy: 1.02,
  surprised: 1.04,
  sad: 0.96,
  annoyed: 0.99,
};
