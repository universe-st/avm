import { reactive, watch } from '@phaser-mvvm/core';

/** 逐字速度档位。`instant` = 整句一次显示，仍保留分页与手动推进。 */
export type TextSpeed = 'slow' | 'normal' | 'fast' | 'instant';

/**
 * 动效偏好。
 *
 * - `system`：跟随系统 `prefers-reduced-motion`（默认）；
 * - `reduced`：强制减弱（保留信息层，去掉位移/抖动/速度线）；
 * - `full`：强制完整动效（用户明确选择时尊重用户）。
 */
export type MotionPreference = 'system' | 'reduced' | 'full';

export interface GameSettings {
  /** BGM 音量 0–1。 */
  bgm: number;
  /** 音效音量 0–1。 */
  sfx: number;
  /** 全局静音。 */
  muted: boolean;
  /** 逐字速度。 */
  textSpeed: TextSpeed;
  /** 对话自动播放（地图对话与金殿过场共用）。 */
  autoAdvance: boolean;
  /** 动效偏好。 */
  motion: MotionPreference;
}

export const SETTINGS_KEY = 'avm.settings.v1';

const DEFAULTS: GameSettings = {
  bgm: 0.6,
  sfx: 0.8,
  muted: false,
  textSpeed: 'normal',
  autoAdvance: false,
  motion: 'system',
};

const TEXT_SPEEDS: readonly TextSpeed[] = ['slow', 'normal', 'fast', 'instant'];
const MOTIONS: readonly MotionPreference[] = ['system', 'reduced', 'full'];

const clamp01 = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(1, Math.max(0, n));
};

function normalizeTextSpeed(value: unknown): TextSpeed {
  return TEXT_SPEEDS.includes(value as TextSpeed) ? (value as TextSpeed) : DEFAULTS.textSpeed;
}

function normalizeMotion(value: unknown): MotionPreference {
  return MOTIONS.includes(value as MotionPreference) ? (value as MotionPreference) : DEFAULTS.motion;
}

/**
 * 把 localStorage 里的原始字符串解析成完整设置。
 *
 * 旧版本只存 `bgm/sfx/muted`，缺的字段一律取默认值，所以升级不需要迁移脚本。
 * 纯函数，方便单测（不读 window）。
 */
export function parseSettings(raw: string | null): GameSettings {
  if (!raw) return { ...DEFAULTS };
  let parsed: Partial<GameSettings>;
  try {
    parsed = JSON.parse(raw) as Partial<GameSettings>;
  } catch {
    return { ...DEFAULTS };
  }
  if (parsed === null || typeof parsed !== 'object') return { ...DEFAULTS };
  return {
    bgm: clamp01(parsed.bgm, DEFAULTS.bgm),
    sfx: clamp01(parsed.sfx, DEFAULTS.sfx),
    muted: parsed.muted === true,
    textSpeed: normalizeTextSpeed(parsed.textSpeed),
    autoAdvance: parsed.autoAdvance === true,
    motion: normalizeMotion(parsed.motion),
  };
}

function readStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(SETTINGS_KEY);
  } catch {
    return null;
  }
}

function load(): GameSettings {
  return parseSettings(readStorage());
}

function save(value: GameSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(value));
  } catch {
    // 隐私模式/存储满：设置只在本次会话生效，不阻塞游戏。
  }
}

/** 全局设置（响应式）；改动会自动写 localStorage。 */
export const settings = reactive<GameSettings>(load());

if (typeof window !== 'undefined') {
  watch(settings, () => save(settings), { deep: true });
}

export function resetSettings(): void {
  settings.bgm = DEFAULTS.bgm;
  settings.sfx = DEFAULTS.sfx;
  settings.muted = DEFAULTS.muted;
  settings.textSpeed = DEFAULTS.textSpeed;
  settings.autoAdvance = DEFAULTS.autoAdvance;
  settings.motion = DEFAULTS.motion;
}

/** 逐字间隔倍率：slow 1.6×、normal 1×、fast 0.55×、instant 0。 */
export function textSpeedFactor(speed: TextSpeed): number {
  switch (speed) {
    case 'slow':
      return 1.6;
    case 'fast':
      return 0.55;
    case 'instant':
      return 0;
    default:
      return 1;
  }
}

/**
 * 自动播放的阅读停留：字越多等越久，但夹在 0.9–2.85 秒；
 * 再乘速度倍率（instant 用 0.6 倍，避免整页瞬间翻过去来不及看）。
 */
export function autoAdvanceDelay(chars: number, speed: TextSpeed): number {
  const count = Number.isFinite(chars) ? Math.max(0, Math.floor(chars)) : 0;
  const base = Math.min(2600, Math.max(700, count * 60));
  const factor = speed === 'instant' ? 0.6 : textSpeedFactor(speed);
  return Math.round((base + 250) * factor);
}

/** 系统是否要求减弱动效（不依赖 Phaser，便于在 Node 里测试）。 */
export function systemPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** 设置与系统偏好的合成结果；场景每次创建特效时都应重新取。 */
export function resolveReducedMotion(): boolean {
  if (settings.motion === 'reduced') return true;
  if (settings.motion === 'full') return false;
  return systemPrefersReducedMotion();
}
