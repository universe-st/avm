import { describe, expect, it } from 'vitest';
import {
  autoAdvanceDelay,
  parseSettings,
  textSpeedFactor,
  type GameSettings,
} from '../src/app/settings';

describe('设置解析（旧存档兼容）', () => {
  it('空/损坏数据回退默认值', () => {
    const defaults = parseSettings(null);
    expect(defaults).toEqual({
      bgm: 0.6,
      sfx: 0.8,
      muted: false,
      textSpeed: 'normal',
      autoAdvance: false,
      motion: 'system',
    });
    expect(parseSettings('not json')).toEqual(defaults);
    expect(parseSettings('null')).toEqual(defaults);
    expect(parseSettings('[]')).toEqual(defaults);
  });

  it('旧版只有音量字段时补齐新字段', () => {
    const parsed = parseSettings(JSON.stringify({ bgm: 0.2, sfx: 0.4, muted: true }));
    expect(parsed).toEqual({
      bgm: 0.2,
      sfx: 0.4,
      muted: true,
      textSpeed: 'normal',
      autoAdvance: false,
      motion: 'system',
    });
  });

  it('非法枚举/越界数值被归一化', () => {
    const parsed = parseSettings(
      JSON.stringify({
        bgm: 3,
        sfx: -2,
        muted: 'yes',
        textSpeed: 'turbo',
        autoAdvance: 1,
        motion: 'less',
      }),
    );
    expect(parsed.bgm).toBe(1);
    expect(parsed.sfx).toBe(0);
    expect(parsed.muted).toBe(false);
    expect(parsed.textSpeed).toBe('normal');
    expect(parsed.autoAdvance).toBe(false);
    expect(parsed.motion).toBe('system');
  });

  it('保留合法的新字段', () => {
    const settings: GameSettings = {
      bgm: 0.1,
      sfx: 0.9,
      muted: false,
      textSpeed: 'instant',
      autoAdvance: true,
      motion: 'reduced',
    };
    expect(parseSettings(JSON.stringify(settings))).toEqual(settings);
  });
});

describe('逐字与自动播放节奏', () => {
  it('速度倍率单调递增', () => {
    expect(textSpeedFactor('slow')).toBeGreaterThan(textSpeedFactor('normal'));
    expect(textSpeedFactor('normal')).toBeGreaterThan(textSpeedFactor('fast'));
    expect(textSpeedFactor('fast')).toBeGreaterThan(textSpeedFactor('instant'));
    expect(textSpeedFactor('instant')).toBe(0);
  });

  it('自动播放停留随字数增长但夹在区间内', () => {
    const short = autoAdvanceDelay(2, 'normal');
    const medium = autoAdvanceDelay(30, 'normal');
    const long = autoAdvanceDelay(400, 'normal');
    expect(short).toBeGreaterThanOrEqual(950);
    expect(medium).toBeGreaterThan(short);
    expect(long).toBeLessThanOrEqual(2900);
    expect(autoAdvanceDelay(30, 'slow')).toBeGreaterThan(medium);
    expect(autoAdvanceDelay(30, 'fast')).toBeLessThan(medium);
    // 立即显示时也要留出阅读时间，不能是 0
    expect(autoAdvanceDelay(30, 'instant')).toBeGreaterThan(400);
  });
});
