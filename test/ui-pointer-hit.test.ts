import { describe, expect, it } from 'vitest';
import type { TargetNode } from '@phaser-mvvm/phaser';
import {
  findUiControlTarget,
  isControlLike,
  resolveUiTarget,
  type ControlLike,
} from '../src/ui/ui-pointer-hit';

/**
 * HUD 按钮误推进对话的命中判定（t70，纯逻辑）。
 *
 * 布局按真实金殿 HUD 排：720 设计宽，右侧 4 个 92px 按钮、间隔 8px，
 * 从 x=304 排到 696；底部对话面板 672×300。这里守三件事：
 * - 四个按钮中心都算 UI，8px 间隙不算；
 * - 对话面板正文不是控件（点它仍要推进）；
 * - 命中按布局树走，缩放后的指针坐标要先换回设计坐标。
 */

interface FakeNode extends TargetNode {
  readonly children: FakeNode[];
  parent: FakeNode | null;
  control: boolean;
  target: boolean;
  controlLike: ControlLike;
}

interface NodeOptions {
  control?: boolean;
  target?: boolean;
  visible?: boolean;
  routingEnabled?: boolean;
  clipsPointer?: boolean;
}

function makeNode(
  x: number,
  y: number,
  width: number,
  height: number,
  options: NodeOptions = {},
): FakeNode {
  const node: FakeNode = {
    x,
    y,
    appliedRect: { width, height },
    visible: options.visible ?? true,
    routingEnabled: options.routingEnabled ?? true,
    clipsPointer: options.clipsPointer ?? false,
    children: [],
    parent: null,
    control: options.control ?? false,
    target: options.target ?? false,
    controlLike: { focusable: options.control ?? false },
    getWidgetChildren: () => node.children,
  };
  return node;
}

function attach(parent: FakeNode, child: FakeNode): FakeNode {
  child.parent = parent;
  parent.children.push(child);
  return child;
}

interface Layout {
  readonly root: FakeNode;
  readonly buttons: readonly FakeNode[];
  readonly panel: FakeNode;
  readonly panelText: FakeNode;
  readonly interact: FakeNode;
}

/** 和 `buildStageHeader()` 一致的 4 按钮排布 + 底部对话面板 + 右下交互键。 */
function hudLayout(): Layout {
  const root = makeNode(0, 0, 720, 1600);
  const buttons = [304, 404, 504, 604].map((x) => {
    const button = attach(root, makeNode(x, 24, 92, 44, { control: true, target: true }));
    // 按钮里的文字是普通 Text，不是 widget；这里用 target:false 模拟“不算控件”。
    attach(button, makeNode(10, 10, 50, 24, { target: true }));
    return button;
  });
  const panel = attach(root, makeNode(24, 1280, 672, 300, { target: true }));
  const panelText = attach(panel, makeNode(22, 40, 628, 120, { target: true }));
  const interact = attach(root, makeNode(560, 1200, 136, 56, { control: true, target: true }));
  return { root, buttons, panel, panelText, interact };
}

function hitAt(layout: Layout, x: number, y: number): FakeNode | null {
  return findUiControlTarget(
    layout.root,
    () => ({ x, y }),
    (node) => node.target,
    (node) => node.parent,
    (node) => node.control,
  );
}

describe('Compose 控件命中', () => {
  it('顶栏四个按钮的中心全部命中', () => {
    const layout = hudLayout();
    const centers = [350, 450, 550, 650];
    for (const x of centers) {
      expect(hitAt(layout, x, 46), `按钮中心 x=${x}`).toBe(
        layout.buttons[centers.indexOf(x)],
      );
    }
  });

  it('按钮之间 8px 的间隙不命中', () => {
    const layout = hudLayout();
    // 304..396 / 404..496 / 504..596 / 604..696，间隙 396–404、496–504、596–604。
    for (const x of [397, 400, 403, 497, 500, 503, 597, 600, 603]) {
      expect(hitAt(layout, x, 46), `间隙 x=${x}`).toBeNull();
    }
  });

  it('按钮内的文字/子 widget 命中时向上归到按钮', () => {
    const layout = hudLayout();
    // 第一个按钮的 label 在 (314..364, 34..58) 一带。
    expect(hitAt(layout, 320, 40)).toBe(layout.buttons[0]);
  });

  it('点对话面板正文不算 UI（面板本身不是控件）', () => {
    const layout = hudLayout();
    expect(hitAt(layout, 300, 1400)).toBeNull();
    expect(hitAt(layout, 200, 1500)).toBeNull();
  });

  it('右下交互键算 UI', () => {
    const layout = hudLayout();
    expect(hitAt(layout, 628, 1228)).toBe(layout.interact);
  });

  it('隐藏 / routingEnabled=false 的按钮不参与命中', () => {
    const layout = hudLayout();
    const button = layout.buttons[1] as FakeNode;
    button.visible = false;
    expect(hitAt(layout, 450, 46)).toBeNull();
    button.visible = true;
    button.routingEnabled = false;
    expect(hitAt(layout, 450, 46)).toBeNull();
  });

  it('裁剪容器外的控件点不到（clipsPointer）', () => {
    const root = makeNode(0, 0, 200, 100);
    const clip = attach(root, makeNode(0, 0, 100, 100, { clipsPointer: true, target: true }));
    attach(clip, makeNode(150, 0, 50, 40, { control: true, target: true }));
    const hit = findUiControlTarget(
      root,
      () => ({ x: 160, y: 20 }),
      (node) => node.target,
      (node) => node.parent,
      (node) => node.control,
    );
    expect(hit).toBeNull();
  });

  it('指针坐标按视口缩放换回设计坐标后仍然命中', () => {
    const layout = hudLayout();
    // 390 宽的竖屏：CSS 坐标 × (390/720) 就是设计坐标。
    const scale = 390 / 720;
    const hitAtCss = (cssX: number, cssY: number): FakeNode | null =>
      findUiControlTarget(
        layout.root,
        () => ({ x: cssX / scale, y: cssY / scale }),
        (node) => node.target,
        (node) => node.parent,
        (node) => node.control,
      );

    expect(hitAtCss(350 * scale, 46 * scale)).toBe(layout.buttons[0]);
    expect(hitAtCss(650 * scale, 46 * scale)).toBe(layout.buttons[3]);
    expect(hitAtCss(400 * scale, 46 * scale)).toBeNull();
    // 面板正文在缩放后依旧不算控件。
    expect(hitAtCss(300 * scale, 1400 * scale)).toBeNull();
  });

  it('resolveUiTarget 保持“最深者优先、后兄弟在上”', () => {
    const root = makeNode(0, 0, 100, 100);
    const under = attach(root, makeNode(0, 0, 100, 100, { target: true }));
    const over = attach(root, makeNode(0, 0, 100, 100, { target: true }));
    expect(resolveUiTarget(root, () => ({ x: 10, y: 10 }), (node) => node.target)).toBe(over);
    over.visible = false;
    expect(resolveUiTarget(root, () => ({ x: 10, y: 10 }), (node) => node.target)).toBe(under);
  });
});

describe('isControlLike', () => {
  it('focusable / onActivate / interactive 任一为真就是控件', () => {
    expect(isControlLike({ focusable: true })).toBe(true);
    expect(isControlLike({ onActivate: () => true })).toBe(true);
    expect(isControlLike({ interactive: true })).toBe(true);
  });

  it('纯 blockPointer 面板 / 装饰文字不算控件', () => {
    expect(isControlLike({})).toBe(false);
    expect(isControlLike({ focusable: false, onActivate: null })).toBe(false);
  });
});
