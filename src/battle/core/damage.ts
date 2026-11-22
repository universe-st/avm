import type { Zone } from '../types';

/**
 * 伤害公式（v3.1，确定性）。
 *
 * ```
 * raw = atk × skill.power
 * raw ×= 背袭 ? (skill.backstabMultiplier ?? 1.5) : 1
 * defense = 目标防御 × (背袭 ? (1 - backstabDefensePierce) : 1)
 * raw = max(0, raw - defense)
 * raw ×= 防御动作 ? 0.5 : 1
 * damage = max(1, round(raw))
 * ```
 *
 * 防御是**平减法**，不是百分比；`backstabDefensePierce=0.5` 表示背袭只扣一半防御。
 * 不做命中率 / 暴击 / ±5% 浮动：手机端要能靠「站位 + 防御」算清楚这一下值多少，
 * 而且预览/验收要求同一操作序列给出同一结果。
 */

export interface DamageInput {
  readonly atk: number;
  readonly power: number;
  readonly backstab: boolean;
  /** 技能自己的背袭倍率；省略 1.5。 */
  readonly backstabMultiplier?: number;
  /** 目标平减防御；省略 0。 */
  readonly defense?: number;
  /** 背袭时无视目标防御的比例 0..1；省略 0。 */
  readonly backstabDefensePierce?: number;
  readonly guarding: boolean;
}

export function computeDamage(input: DamageInput): number {
  const atk = Math.max(0, input.atk);
  const power = Math.max(0, input.power);
  const backstabMultiplier = Math.max(1, input.backstabMultiplier ?? 1.5);
  const defense = Math.max(0, input.defense ?? 0);
  const pierce = Math.max(0, Math.min(1, input.backstabDefensePierce ?? 0));

  let raw = atk * power;
  if (input.backstab) raw *= backstabMultiplier;
  if (input.backstab) raw -= defense * (1 - pierce);
  else raw -= defense;
  raw = Math.max(0, raw);
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
