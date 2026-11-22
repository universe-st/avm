/**
 * 行动条「接下来」chip 的前移纯逻辑（无 Phaser，可单测）。
 *
 * 输入是上一次已经画出来的顺序 `prev` 与本次 `previewOrder()` 的结果 `next`，
 * 输出**每个 chip 的运动**：从哪个槽位（`from`）移到哪个槽位（`to`）、透明度怎么变、
 * 是进场还是退场。场景只按它做 tween，不再自己算「谁该往左走几格」。
 *
 * 语义（与 `docs/DESIGN-BATTLE.md` §2.1 一致）：
 * - 序列整体前移：丢掉最左边 `shift` 个头，其余左移 `shift` 格（一次跨多格也只播一轮）；
 * - 最左的旧头向左滑出并渐隐；新的末位从右侧 +1 格处渐现（`from = to + 1`）；
 * - 相同序列不产生位移（`changed=false`，场景不重播）；
 * - 变短：共同前缀留在原地，尾部多出来的头原地渐隐；
 * - 空序列：全部退场（`prev` 空则全部进场）。
 *
 * 「第几格」是**槽位序号**（0 起），不是像素；场景用 `firstX + slot * pitch` 换算。
 * 负槽位表示已经滑到最左 chip 的左边（画布外/渐隐中）。
 */

export interface RailSlotMotion {
  /** 这个 chip 画的是谁（unit id）。 */
  readonly id: string;
  /** 起始槽位；< 0 表示从左边画外滑入（当前不会产生，留给以后）。 */
  readonly from: number;
  /** 结束槽位；< 0 表示滑出到最左 chip 的左侧。 */
  readonly to: number;
  readonly fromAlpha: number;
  readonly toAlpha: number;
  /** 新出现（从右侧 +1 格渐现）。 */
  readonly enter: boolean;
  /** 退场（向左滑出/原地渐隐）。 */
  readonly exit: boolean;
}

export interface RailTransition {
  /**
   * 本次从左端丢掉几个头（= 其余 chip 左移的格数）。
   * 相同序列为 0；无重叠时等于 `prev.length`。
   */
  readonly shift: number;
  /** 先按 `next` 的槽位顺序给出在位/进场 chip，再给出退场 chip。 */
  readonly motions: readonly RailSlotMotion[];
  /** `prev` 与 `next` 是否不同；false 时场景必须跳过动画。 */
  readonly changed: boolean;
}

function sameSequence(prev: readonly string[], next: readonly string[]): boolean {
  if (prev.length !== next.length) return false;
  for (let index = 0; index < prev.length; index += 1) {
    if (prev[index] !== next[index]) return false;
  }
  return true;
}

/**
 * 找 `shift`，使 `prev[shift + i] === next[i]` 命中的位置最多。
 *
 * 为什么不是「最长后缀 = 前缀」：那只覆盖整体前移；当 `next` 变短（战斗收尾）
 * 或中间换人时会把本该留下的头也判成退场。这里按命中数打分，并且**平分时取更小的
 * shift**（`[A,B,A] → [A]` 应让第一个 A 留在原地，而不是从第三个 A 滑过来）。
 */
function alignmentShift(prev: readonly string[], next: readonly string[]): number {
  // 空目标：整条退场，全部向左滑出（没有「留在原地」的参照物）。
  if (next.length === 0) return prev.length;

  let bestShift = 0;
  let bestScore = -1;
  for (let shift = 0; shift <= prev.length; shift += 1) {
    let score = 0;
    for (let index = 0; index < next.length; index += 1) {
      const source = shift + index;
      if (source < prev.length && prev[source] === next[index]) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestShift = shift;
    }
  }
  return bestShift;
}

/**
 * 计算 `prev → next` 的 chip 位移。
 *
 * 复杂度 O(prev.length × next.length)，两个序列都 ≤ 6，可以忽略。
 */
export function railTransition(
  prev: readonly string[],
  next: readonly string[],
): RailTransition {
  if (sameSequence(prev, next)) {
    return {
      shift: 0,
      changed: false,
      motions: next.map((id, index) => ({
        id,
        from: index,
        to: index,
        fromAlpha: 1,
        toAlpha: 1,
        enter: false,
        exit: false,
      })),
    };
  }

  const shift = alignmentShift(prev, next);
  const motions: RailSlotMotion[] = [];
  const retained = new Set<number>();

  for (let index = 0; index < next.length; index += 1) {
    const source = index + shift;
    const id = next[index]!;
    if (source < prev.length && prev[source] === id) {
      retained.add(source);
      motions.push({
        id,
        from: source,
        to: index,
        fromAlpha: 1,
        toAlpha: 1,
        enter: false,
        exit: false,
      });
      continue;
    }
    // 没有对应旧 chip：从右侧 +1 格处渐现（末位从画布右缘进来）。
    motions.push({
      id,
      from: index + 1,
      to: index,
      fromAlpha: 0,
      toAlpha: 1,
      enter: true,
      exit: false,
    });
  }

  for (let index = 0; index < prev.length; index += 1) {
    if (retained.has(index)) continue;
    motions.push({
      id: prev[index]!,
      from: index,
      to: index - shift,
      fromAlpha: 1,
      toAlpha: 0,
      enter: false,
      exit: true,
    });
  }

  return { shift, changed: true, motions };
}
