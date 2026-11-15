import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * 「点 HUD 按钮顺带推进对话」的横向接线护栏（t70）。
 *
 * 纯命中逻辑在 `src/ui/ui-pointer-hit.ts`（见 `test/ui-pointer-hit.test.ts`）；
 * 这里守的是每个场景的推进处理器都真的在开头问了 `isPointerOnUiControl()`，
 * 以及旧的「右上角矩形估算」补丁已经删干净——以后新增场景照着接，不会再漏。
 */

function source(file: string): string {
  return readFileSync(file, 'utf8');
}

/** 取出方法/箭头函数体（签名后第一个位于行尾的 `{` 到配对的 `}`）。 */
function bodyOf(text: string, signature: string): string {
  const start = text.indexOf(signature);
  expect(start, `没找到 ${signature}`).toBeGreaterThanOrEqual(0);
  let open = -1;
  for (let cursor = text.indexOf('{', start); cursor >= 0; cursor = text.indexOf('{', cursor + 1)) {
    if (text[cursor + 1] === '\n' || text[cursor + 1] === '\r') {
      open = cursor;
      break;
    }
  }
  expect(open, `${signature} 没有方法体`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let cursor = open; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, cursor + 1);
    }
  }
  throw new Error(`${signature} 的花括号没有闭合`);
}

const HANDLERS: ReadonlyArray<{ file: string; handler: string; registration: string }> = [
  {
    file: 'src/scenes/ch01-palace-scene.ts',
    handler: 'private onPointerDown(pointer: Phaser.Input.Pointer)',
    registration: "this.input.on('pointerdown', this.onPointerDown, this)",
  },
  {
    file: 'src/scenes/ch01-dorm-scene.ts',
    handler: 'private onScenePointerDown(pointer: Phaser.Input.Pointer)',
    registration: "this.input.on('pointerdown', this.onScenePointerDown, this)",
  },
  {
    file: 'src/scenes/ch01-kitchen-scene.ts',
    handler: 'private onScenePointerDown(pointer: Phaser.Input.Pointer)',
    registration: "this.input.on('pointerdown', this.onScenePointerDown, this)",
  },
  {
    file: 'src/scenes/prologue-scene.ts',
    handler: 'private onPointerDown(pointer: Phaser.Input.Pointer)',
    registration: "this.input.on('pointerdown', this.onPointerDown, this)",
  },
  {
    file: 'src/scenes/ch01-opening-scene.ts',
    handler: 'private handlePointer = (pointer: Phaser.Input.Pointer)',
    registration: "this.input.on('pointerdown', this.handlePointer)",
  },
];

describe('场景推进处理器统一接入 UI 命中判定', () => {
  it('每个推进处理器开头都问 isPointerOnUiControl(this, pointer)', () => {
    for (const { file, handler } of HANDLERS) {
      const sourceText = source(file);
      expect(bodyOf(sourceText, handler), file).toContain(
        'isPointerOnUiControl(this, pointer)',
      );
      // 注册的确实是这个处理器（防止改了函数却忘了换监听）。
      expect(sourceText, file).toContain('isPointerOnUiControl');
    }
  });

  it('监听都指向带 pointer 参数的同一处理器', () => {
    for (const { file, registration, handler } of HANDLERS) {
      const sourceText = source(file);
      expect(sourceText, file).toContain(registration);
      expect(sourceText, file).toContain(handler.split('(')[0]);
    }
  });

  it('旧的「右上角矩形估算」补丁已全部删除', () => {
    for (const file of [
      'src/scenes/ch01-palace-scene.ts',
      'src/scenes/ch01-dorm-scene.ts',
      'src/scenes/ch01-kitchen-scene.ts',
      'src/scenes/prologue-scene.ts',
      'src/scenes/ch01-opening-scene.ts',
    ]) {
      expect(source(file), file).not.toContain('inTopRightButtons');
    }
    expect(source('src/scenes/prologue-scene.ts')).not.toContain('currentlyOver');
  });

  it('探索场景把原生摇杆的按下也算 UI，不触发推进', () => {
    for (const file of ['src/scenes/ch01-dorm-scene.ts', 'src/scenes/ch01-kitchen-scene.ts']) {
      expect(bodyOf(source(file), 'private onScenePointerDown(pointer: Phaser.Input.Pointer)'))
        .toContain('containsPointer(pointer)');
    }
    expect(source('src/ui/joystick.ts')).toContain('containsPointer(pointer: Phaser.Input.Pointer)');
  });

  it('弹窗打开期间整块按 UI 消费（不依赖各场景自己记得挡）', () => {
    expect(source('src/ui/ui-pointer-guard.ts')).toContain('mvvm.modal.top !== null');
  });

  it('判定不是时间窗 hack：没有 setTimeout / 忽略下一帧点击', () => {
    const guard = source('src/ui/ui-pointer-guard.ts');
    expect(guard).not.toContain('setTimeout');
    expect(guard).not.toContain('setImmediate');
    expect(guard).not.toContain('requestAnimationFrame');
    expect(source('src/ui/ui-pointer-hit.ts')).not.toContain('setTimeout');
  });

  it('hud-kit 的注释不再与行为脱节（写明实现落点）', () => {
    const hud = source('src/ui/hud-kit.ts');
    expect(hud).toContain('按钮/弹窗点击区域除外');
    expect(hud).toContain('ui-pointer-guard.ts');
    expect(hud).toContain('isPointerOnUiControl()');
  });

  it('对话面板正文不是控件：纯命中逻辑只认 focusable/onActivate/interactive', () => {
    const hit = source('src/ui/ui-pointer-hit.ts');
    expect(hit).toContain('widget.focusable === true');
    expect(hit).toContain("typeof widget.onActivate === 'function'");
    expect(hit).toContain('widget.interactive === true');
  });
});
