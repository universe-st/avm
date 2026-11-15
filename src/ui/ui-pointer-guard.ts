import type Phaser from 'phaser';
import {
  Widget,
  pointerInWidgetSpace,
  type UIScene,
} from '@phaser-mvvm/phaser';
import { findUiControlTarget, isControlLike } from './ui-pointer-hit';

/**
 * 场景侧的唯一入口：这次 `pointerdown` 是不是按在 Compose UI（控件 / 弹窗）上。
 *
 * 用法（每个场景的推进处理器开头一行）：
 *
 * ```ts
 * private onScenePointerDown(pointer: Phaser.Input.Pointer): void {
 *   if (isPointerOnUiControl(this, pointer)) return;
 *   ...
 * }
 * ```
 *
 * 覆盖范围：
 * - 顶栏「跳过 / 自动 / 记录 / 菜单」、底部「交互 / 偷袭 / 潜行」等所有 Button；
 * - Slider / TextField / 可点击 Panel 之类任何 `focusable` / `onActivate` / `interactive` 控件；
 * - 任意 Compose 模态打开期间（历史记录、返回标题确认、结束卡），整块都算 UI 消费，
 *   连遮罩上的空白点击也不会漏到场景推进；
 * - 对话面板正文、装饰文字、纯 `blockPointer` 面板**不算**：点对话框空白仍旧推进。
 *
 * 摇杆等非 Compose 原生控件不在布局树里，由场景单独判断（`VirtualJoystick#containsPointer`）。
 */
export function isPointerOnUiControl(
  scene: UIScene,
  pointer: Phaser.Input.Pointer,
): boolean {
  const mvvm = scene.mvvm;
  // 模态打开时 InputRouter 的 capture 已经挡住下层，但场景的全局 pointerdown 不经过它；
  // 这里显式把「有弹窗」当成整块 UI 消费，弹窗遮罩上的点击也不会误推进。
  if (mvvm.modal.top !== null) return true;

  const root = scene.page;
  if (!root) return false;

  const camera = pointer.camera ?? scene.cameras.main;
  return (
    findUiControlTarget<Widget>(
      root,
      (widget) => pointerInWidgetSpace(pointer, widget, camera),
      (widget) => widget.input != null && widget.enabled !== false,
      (widget) => (widget.parentContainer instanceof Widget ? widget.parentContainer : null),
      (widget) => isControlLike(widget),
    ) !== null
  );
}
