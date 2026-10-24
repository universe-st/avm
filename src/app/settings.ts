import { reactive, watch } from '@phaser-mvvm/core';

export interface GameSettings {
  /** BGM 音量 0–1。 */
  bgm: number;
  /** 音效音量 0–1。 */
  sfx: number;
  /** 全局静音。 */
  muted: boolean;
}

export const SETTINGS_KEY = 'avm.settings.v1';

const DEFAULTS: GameSettings = { bgm: 0.6, sfx: 0.8, muted: false };

const clamp01 = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(1, Math.max(0, n));
};

function load(): GameSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      bgm: clamp01(parsed.bgm, DEFAULTS.bgm),
      sfx: clamp01(parsed.sfx, DEFAULTS.sfx),
      muted: parsed.muted === true,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(value: GameSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
  } catch {
    // 隐私模式/存储满：设置只在本次会话生效，不阻塞游戏。
  }
}

/** 全局设置（响应式）；改动会自动写 localStorage。 */
export const settings = reactive<GameSettings>(load());

watch(settings, () => save(settings), { deep: true });

export function resetSettings(): void {
  settings.bgm = DEFAULTS.bgm;
  settings.sfx = DEFAULTS.sfx;
  settings.muted = DEFAULTS.muted;
}
