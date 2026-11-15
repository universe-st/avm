import type { PointLike, TargetNode } from '@phaser-mvvm/phaser';

/**
 * Compose 控件命中判定（纯逻辑，不依赖 Phaser，可在 Node 里单测）。
 *
 * 场景的「点屏幕任意处推进对话」挂在 `scene.input.on('pointerdown')` 上，按钮自己也走
 * 同一条指针通路，于是按「记录 / 跳过 / 自动 / 菜单」的那一下会顺带补全或推进当前台词。
 * 修法是：场景在推进前问一句「这一点是不是落在可交互的 Compose 控件上」。
 *
 * 判定分两步：
 * 1. `resolveUiTarget()`：按布局树做「最深者优先」命中，和框架 `InputRouter` 的
 *    `resolveTargetInTree()` 同一套规则（隐藏 / routingEnabled / clipsPointer / 兄弟顺序）；
 * 2. `findUiControlTarget()`：从命中的 widget 往上找祖先，任一节点是控件就算 UI。
 *
 * 「控件」只看 `focusable` / `onActivate` / 显式 `interactive`：
 * 对话面板正文、装饰 Text、纯 `blockPointer` 面板**不算**——点对话框空白仍要推进，
 * 这是玩家的主操作，不能因为修按钮误触而变迟钝。
 */
export interface ControlLike {
  readonly focusable?: boolean;
  /** 可激活回调（Button / 可点击 Panel / Slider 等）；不是函数就不算控件。 */
  readonly onActivate?: unknown;
  /** 显式声明可交互的 widget 标记。 */
  readonly interactive?: unknown;
}

/** 一个 widget 是不是「按下去应该由 UI 处理」的控件。 */
export function isControlLike(widget: ControlLike): boolean {
  return (
    widget.focusable === true ||
    typeof widget.onActivate === 'function' ||
    widget.interactive === true
  );
}

/**
 * 按布局树找指针命中的节点（最深者优先），只做纯几何与可见性判断。
 *
 * `pointFor(node)` 返回指针在**该节点所在坐标系**里的位置：这一层由调用方处理
 * camera/scrollFactor（框架的 `pointerInWidgetSpace()` 就是干这个的）。
 */
export function resolveUiTarget<N extends TargetNode>(
  root: N,
  pointFor: (node: N) => PointLike,
  isTarget: (node: N) => boolean,
): N | null {
  const visit = (node: N, offsetX: number, offsetY: number): N | null => {
    if (node.routingEnabled === false) return null;

    const point = pointFor(node);
    const localX = point.x - offsetX;
    const localY = point.y - offsetY;
    const rect = node.appliedRect;
    const inside = localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height;

    // 裁剪容器外的内容既看不见也点不到：整棵子树都不参与命中。
    if (!inside && node.clipsPointer === true) return null;

    const children = node.getWidgetChildren();
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (!child || child.visible === false || child.routingEnabled === false) continue;
      const found = visit(child as N, offsetX + child.x, offsetY + child.y);
      if (found) return found;
    }

    if (!isTarget(node)) return null;
    return inside ? node : null;
  };

  return visit(root, 0, 0);
}

/**
 * 命中的最深节点是否属于某个可交互控件（自身或其任一祖先）。
 *
 * `parentOf` 让这个函数保持纯逻辑：生产代码传 `parentContainer`，测试传普通对象树。
 */
export function findUiControlTarget<N extends TargetNode>(
  root: N,
  pointFor: (node: N) => PointLike,
  isTarget: (node: N) => boolean,
  parentOf: (node: N) => N | null,
  isControl: (node: N) => boolean,
): N | null {
  let node: N | null = resolveUiTarget(root, pointFor, isTarget);
  while (node) {
    if (isControl(node)) return node;
    node = parentOf(node);
  }
  return null;
}
