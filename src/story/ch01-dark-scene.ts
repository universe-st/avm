/**
 * 战后「黑屏胁迫」段（小白威胁周全）的**演出数据**：每一拍要做到什么程度。
 *
 * 这一段的表现型 cue 是 `DialogueLine.dark`（分类见 `DIALOGUE_CUE_KINDS`，属表现型：
 * 跳过不补演）。剧本里每一行只写「哪一拍」（如 `dark: 'grip'`），
 * 具体多黑、夹多紧、心跳多快、小白放大几倍都在这里，纯数据、无 Phaser。
 *
 * 强度曲线的硬约束（`test/ch01-dark-scene.test.ts` 守着）：
 * `onset → grip → squeeze → verdict → crush` 的压迫感必须**单调不减**，
 * `release` 必须把所有项归零。改数值时别让某一段「松一下」，读者会以为威胁结束了。
 */

/** 黑场胁迫的六个节拍。名字是演出语义，不是台词序号。 */
import type { DarkBeat } from './dialogue';
export type { DarkBeat };

export interface DarkBeatSpec {
  /** 屏幕暗角目标不透明度（0..1，紫黑）。 */
  readonly vignette: number;
  /** 画面左右被夹紧的宽度占设计宽的比例（0..1，单侧）。 */
  readonly squeeze: number;
  /**
   * 小白相对「原显示缩放」的倍数。
   *
   * 原图是像素风，`0.45` 是场景定下的显示基准；倍数取整数（1/2/3）才不会出现半像素抖动。
   */
  readonly xiaobaiScale: number;
  /** 灵能丝线（「无形的大手」的可视化）不透明度（0..1）。 */
  readonly bind: number;
  /** 心跳速度（bpm）；`0` = 不跳。 */
  readonly heartbeatBpm: number;
  /** 压迫底噪目标音量（0..1，相对 `settings.sfx`）。 */
  readonly drone: number;
  /** 周全被压下去的设计像素（正数 = 向下沉）。 */
  readonly sinkPx: number;
  /** 这一拍要不要记一记镜头震动。 */
  readonly shake?: { readonly ms: number; readonly intensity: number };
  /** 一次性音效（语义 id，`src/ui/dark-pressure.ts` 映射到资源 key）。 */
  readonly sting?: 'grip' | 'seal' | 'release';
  /** 小白身上是否「扫开一圈灵能符环」。 */
  readonly sealRing?: boolean;
  /** 是否来一记屏幕边缘的血色脉冲（配合挤压）。 */
  readonly redPulse?: boolean;
}

/**
 * 六拍的强度表。
 *
 * 数值口径：vignette 0.34 起（暗场刚成立就有压迫感），crush 到 0.72（四角几乎全黑，
 * 只剩角色和光池）；夹紧最多单侧 12%（再多会把角色切掉，竖屏左右本来就是安全区边缘）。
 */
export const DARK_BEATS: Readonly<Record<DarkBeat, DarkBeatSpec>> = {
  onset: {
    vignette: 0.34,
    squeeze: 0,
    xiaobaiScale: 2,
    bind: 0,
    heartbeatBpm: 66,
    drone: 0.52,
    sinkPx: 0,
  },
  grip: {
    vignette: 0.5,
    squeeze: 0.04,
    xiaobaiScale: 2,
    bind: 0.55,
    heartbeatBpm: 78,
    drone: 0.64,
    sinkPx: 4,
    shake: { ms: 260, intensity: 0.006 },
    sting: 'grip',
  },
  squeeze: {
    vignette: 0.58,
    squeeze: 0.07,
    xiaobaiScale: 2,
    bind: 0.7,
    heartbeatBpm: 90,
    drone: 0.72,
    sinkPx: 8,
    shake: { ms: 320, intensity: 0.004 },
    redPulse: true,
  },
  verdict: {
    vignette: 0.64,
    squeeze: 0.09,
    xiaobaiScale: 3,
    bind: 0.8,
    heartbeatBpm: 102,
    drone: 0.8,
    sinkPx: 10,
    sealRing: true,
    sting: 'seal',
  },
  crush: {
    vignette: 0.72,
    squeeze: 0.12,
    xiaobaiScale: 3,
    bind: 0.95,
    heartbeatBpm: 118,
    drone: 0.88,
    sinkPx: 14,
    shake: { ms: 420, intensity: 0.01 },
    redPulse: true,
  },
  release: {
    vignette: 0,
    squeeze: 0,
    xiaobaiScale: 1,
    bind: 0,
    heartbeatBpm: 0,
    drone: 0,
    sinkPx: 0,
    sting: 'release',
  },
};

/** 压迫段的先后顺序（测试与「跳过后的收尾」按它判断哪些拍已经过时）。 */
export const DARK_BEAT_ORDER: readonly DarkBeat[] = [
  'onset',
  'grip',
  'squeeze',
  'verdict',
  'crush',
];

/** 某拍是不是「把压迫解除」的那一拍。 */
export function isDarkRelease(beat: DarkBeat): boolean {
  return beat === 'release';
}

/**
 * 从 `current` 到 `next` 是不是在往前推（允许同一拍重复，例如连续两记 crush）。
 *
 * 场景拿它防「剧本被改乱」：往回退会让暗角/夹紧突然松开，比不演更糟。
 * 纯判定，不改状态。
 */
export function darkBeatAdvances(current: DarkBeat | null, next: DarkBeat): boolean {
  if (current === null) return true;
  if (next === 'release') return true;
  const currentIndex = DARK_BEAT_ORDER.indexOf(current);
  const nextIndex = DARK_BEAT_ORDER.indexOf(next);
  if (currentIndex < 0) return true;
  return nextIndex >= currentIndex;
}

/**
 * 剧本里「黑场从哪一行开始」：第一条同时带 `blackout: true` 与 `dark` 的行。
 *
 * 舞台预览 `phase=dark` 从这里切片，正式播放不需要它；找不到返回 -1（调用方原样播整段）。
 */
export function firstDarkLineIndex(
  lines: readonly { readonly blackout?: boolean; readonly dark?: DarkBeat }[],
): number {
  return lines.findIndex((line) => line.blackout === true && line.dark !== undefined);
}

/** 心跳间隔（毫秒）；bpm≤0 时返回 0（调用方据此不排心跳）。 */
export function heartbeatIntervalMs(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 0;
  return Math.round(60000 / bpm);
}
