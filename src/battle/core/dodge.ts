/**
 * 闪避（纯函数）。
 *
 * 闪避点 x 为整数，闪避率 = 1 - 200 / (3x + 200)。
 * x=0 → 0%；x=100 → 60%；x→∞ 无限接近 100%，永不达到。
 * 是否成功由战斗 seed 决定；没有相邻空位时**不掷骰**，直接不能闪避。
 */
export function dodgeChance(dodge: number): number {
  const x = Math.max(0, Number.isFinite(dodge) ? dodge : 0);
  if (x <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - 200 / (3 * x + 200)));
}

/** 给 UI 的整数百分比（100 点 → 60）。 */
export function dodgePercent(dodge: number): number {
  return Math.round(dodgeChance(dodge) * 100);
}
