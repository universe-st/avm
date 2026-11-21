import { describe, expect, it } from 'vitest';
import { CH01_AFTER_CLOSING, CH01_AFTER_FINALE } from '../src/story/ch01-after';
import {
  DARK_BEATS,
  DARK_BEAT_ORDER,
  darkBeatAdvances,
  firstDarkLineIndex,
  heartbeatIntervalMs,
  isDarkRelease,
  type DarkBeat,
} from '../src/story/ch01-dark-scene';
import { DIALOGUE_CUE_KINDS } from '../src/story/dialogue';

/**
 * 黑场胁迫段（小白压制周全）的两层护栏：
 * 1. **强度表**：onset→crush 必须单调加压，release 必须归零（改数值不许让威胁「松一下」）；
 * 2. **剧本接线**：六拍在剧本里恰好各一次、顺序正确、从黑屏那一行开始、到「闪开」收尾。
 */
describe('黑场胁迫 · 强度表', () => {
  it('onset → crush 的六项压迫感单调不减', () => {
    const keys = ['vignette', 'squeeze', 'bind', 'heartbeatBpm', 'drone', 'sinkPx'] as const;
    for (let i = 1; i < DARK_BEAT_ORDER.length; i += 1) {
      const prev = DARK_BEATS[DARK_BEAT_ORDER[i - 1] as DarkBeat];
      const next = DARK_BEATS[DARK_BEAT_ORDER[i] as DarkBeat];
      for (const key of keys) {
        expect(next[key], `${DARK_BEAT_ORDER[i]} 的 ${key} 不能比上一拍松`).toBeGreaterThanOrEqual(
          prev[key],
        );
      }
    }
  });

  it('release 把所有项归零：收尾不能留半截黑边/心跳/底噪', () => {
    const release = DARK_BEATS.release;
    expect(release.vignette).toBe(0);
    expect(release.squeeze).toBe(0);
    expect(release.bind).toBe(0);
    expect(release.heartbeatBpm).toBe(0);
    expect(release.drone).toBe(0);
    expect(release.sinkPx).toBe(0);
    expect(release.xiaobaiScale).toBe(1);
    expect(release.shake).toBeUndefined();
    expect(isDarkRelease('release')).toBe(true);
    for (const beat of DARK_BEAT_ORDER) expect(isDarkRelease(beat)).toBe(false);
  });

  it('小白只按整数倍放大（像素图非整数倍会抖）', () => {
    for (const beat of Object.values(DARK_BEATS)) {
      expect(Number.isInteger(beat.xiaobaiScale)).toBe(true);
      expect(beat.xiaobaiScale).toBeGreaterThanOrEqual(1);
    }
  });

  it('心跳间隔随 bpm 变短，bpm=0 不排心跳', () => {
    expect(heartbeatIntervalMs(0)).toBe(0);
    expect(heartbeatIntervalMs(60)).toBe(1000);
    expect(heartbeatIntervalMs(120)).toBe(500);
    expect(heartbeatIntervalMs(66)).toBeGreaterThan(heartbeatIntervalMs(118));
  });

  it('允许同一拍重复，但不允许往回退；release 永远放行', () => {
    expect(darkBeatAdvances(null, 'onset')).toBe(true);
    expect(darkBeatAdvances('onset', 'onset')).toBe(true);
    expect(darkBeatAdvances('grip', 'squeeze')).toBe(true);
    expect(darkBeatAdvances('crush', 'squeeze')).toBe(false);
    expect(darkBeatAdvances('crush', 'release')).toBe(true);
  });
});

describe('黑场胁迫 · 剧本接线', () => {
  const beatsOf = (lines: readonly { readonly dark?: DarkBeat }[]): DarkBeat[] =>
    lines.map((line) => line.dark).filter((beat): beat is DarkBeat => beat !== undefined);

  it('收尾段里的六拍恰好各一次且顺序正确', () => {
    expect(beatsOf(CH01_AFTER_CLOSING)).toEqual([
      'onset',
      'grip',
      'squeeze',
      'verdict',
      'crush',
      'release',
    ]);
  });

  it('第一次出现就是黑屏那一行（「呃……」），最后一拍与 blackout:false 同一行', () => {
    const index = firstDarkLineIndex(CH01_AFTER_FINALE);
    expect(index).toBeGreaterThanOrEqual(0);
    const line = CH01_AFTER_FINALE[index];
    expect(line?.text).toBe('呃……');
    expect(line?.blackout).toBe(true);
    expect(line?.dark).toBe('onset');

    const releaseLine = CH01_AFTER_FINALE.find((entry) => entry.dark === 'release');
    expect(releaseLine?.blackout).toBe(false);
    expect(releaseLine?.fx).toBe('flash');
    // 黑场从 onset 到 release 之间不断档：中间每一行都不带 `blackout`（沿用黑屏状态）。
    const releaseIndex = CH01_AFTER_FINALE.indexOf(releaseLine as (typeof CH01_AFTER_FINALE)[number]);
    for (let i = index + 1; i < releaseIndex; i += 1) {
      expect(CH01_AFTER_FINALE[i]?.blackout).toBeUndefined();
    }
  });

  it('dark 是表现型 cue：跳过不补演（收尾只还原画面与声音）', () => {
    expect(DIALOGUE_CUE_KINDS.dark).toBe('expressive');
  });

  it('压迫解除后先趴着喘两声，再起身：getUp 只挂在「呼哧……」那一行', () => {
    const getUpLines = CH01_AFTER_FINALE.filter((line) => line.getUp === true);
    expect(getUpLines).toHaveLength(1);
    expect(getUpLines[0]?.speaker).toBe('周全');
    expect(getUpLines[0]?.text).toBe('呼哧……');
    expect(DIALOGUE_CUE_KINDS.getUp).toBe('expressive');

    // 顺序：压趴（crush）→ 旁白「压迫感骤然消失」（黑屏结束 + release）→ 呼哧 → 小白继续。
    const indexCrush = CH01_AFTER_FINALE.findIndex((line) => line.dark === 'crush');
    const indexPant = CH01_AFTER_FINALE.findIndex((line) => line.text.startsWith('那无处不在的压迫感'));
    const indexGetUp = CH01_AFTER_FINALE.findIndex((line) => line.getUp === true);
    expect(indexCrush).toBeGreaterThan(-1);
    expect(indexPant).toBe(indexCrush + 1);
    expect(indexGetUp).toBe(indexPant + 1);
    expect(CH01_AFTER_FINALE[indexPant]?.blackout).toBe(false);
    expect(CH01_AFTER_FINALE[indexPant]?.dark).toBe('release');
    expect(CH01_AFTER_FINALE[indexPant]?.bgm).toBe('ch01Dorm');
  });
});
