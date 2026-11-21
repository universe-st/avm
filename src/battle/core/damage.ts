import type { Zone } from '../types';

/**
 * 伤害公式（v2，确定性）。
 *
 * ```
 * raw = atk × skill.power
 * raw ×= 背袭 ? (skill.backstabMultiplier ?? 1.5) : 1
 * raw ×= 防御 ? 0.5 : 1
 * damage = max(1, round(raw))
 * ```
 *
 * 不做命中率 / 暴击 / ±5% 浮动：手机端要能靠「站位 + 意图」算清楚这一下值多少，
 * 而且预览/验收要求同一操作序列给出同一结果。
 */

export interface DamageInput {
  readonly atk: number;
  readonly power: number;
  readonly backstab: boolean;
  /** 技能自己的背袭倍率；省略 1.5。 */
  readonly backstabMultiplier?: number;
  readonly guarding: boolean;
}

export function computeDamage(input: DamageInput): number {
  const atk = Math.max(0, input.atk);
  const power = Math.max(0, input.power);
  const backstabMultiplier = Math.max(1, input.backstabMultiplier ?? 1.5);

  let raw = atk * power;
  if (input.backstab) raw *= backstabMultiplier;
  if (input.guarding) raw *= 0.5;

  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.max(1, Math.round(raw));
}

/** 区域对伤害的标签（HUD / 日志）。 */
export function zoneLabel(zone: Zone): string {
  if (zone === 'back') return '背袭';
  if (zone === 'side') return '侧面';
  return '正面';
}

/** 给攻击按钮的预览文案：`正面 16 / 背袭 24`。 */
export function formatDamagePreview(
  frontDamage: number,
  backstabDamage: number,
): string {
  return `正面 ${frontDamage} · 背袭 ${backstabDamage}`;
}
