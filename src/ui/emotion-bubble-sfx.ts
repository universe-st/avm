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
/**
 * 相对音量（再乘 `settings.sfx`）。
 *
 * 0.18 不是拍脑袋：t67 用「运行时 tap」实测（AudioBuffer 峰值 × 链路增益），
 * 0.35 时「啵」峰值 −16.7 dBFS、旁白逐字 blip −16.3 dBFS，只低 0.4 dB。
 * 逐字音是 30–45ms 的极短音、每句连响二十来次；200ms 的 pop 与它等峰值时
 * 主观明显更响，与「气泡音要垫在打字音下面」的设计相反。
 *
 * t68 按契约反算（pop 峰值至少比旁白低 6 dB、比周全低 10 dB）：
 * 0.22 → −20.7 dBFS（只低 4.4/9.7 dB，不够）；0.18 → −22.5 dBFS
 * （比旁白 −16.3 低 6.1 dB、比周全 −11.0 低 11.5 dB）。
 * 只降增益、不重编源文件：GainNode 不改音色，200ms 的「啵」仍清晰可辨。
 * 护栏 `test/emotion-bubble-sfx.test.ts` 解析三条 voice blip 的 WAV 峰值做数值断言。
 */
export const BUBBLE_POP_VOLUME = 0.18;

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
