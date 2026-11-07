import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUNDLES, collectAssets, expandBundleIds } from '../src/assets/bundles';
import { CH01_ASSET_KEYS } from '../src/assets/keys';

/**
 * 「起身结束 → 侧面 idle」的**接线**护栏（#t41）。
 *
 * 贴图归属的决策链已经抽到纯逻辑里（`planPlayerTexture`，见 `test/player-pose.test.ts`），
 * 但「场景到底有没有把侧面 idle 接上、有没有把旧的 110ms 交叉淡入删干净」只能看源码。
 * 这里按源码断言，防止后续重构把 `q.right` 的转身又接回来。
 */

const SCENE = 'src/scenes/ch01-dorm-scene.ts';

function sceneSource(): string {
  return readFileSync(SCENE, 'utf8');
}

/** 取出某个方法体（从方法签名到下一个同缩进的成员），避免跨方法误判。 */
function methodBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start, `没找到 ${signature}`).toBeGreaterThanOrEqual(0);
  // 方法体按花括号配对截取。
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let cursor = open; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, cursor + 1);
    }
  }
  throw new Error(`${signature} 的花括号没有闭合`);
}

describe('寝室起身 → 侧面 idle 接线', () => {
  it('场景把 zhou_idle_right 作为 sideIdle 传给 PlayerActor（朝向 right）', () => {
    const source = sceneSource();
    expect(source).toMatch(
      /sideIdle:\s*\{\s*key:\s*CH01_ASSET_KEYS\.characters\.zhouIdleRight,\s*facing:\s*'right'\s*\}/,
    );
    // 不再走 `q.right` 的 3/4 面 idle：那张图只该出现在八向静态表里。
    expect(source).not.toContain('standingLook');
    expect(source).not.toContain('crossFadeToIdle');
  });

  it('起身序列末帧之后是 settleToIdle（硬切到侧面 idle），不是交叉淡入', () => {
    const body = methodBody(sceneSource(), 'private playStandUpSequence(');
    const lastFrame = body.indexOf('sprite.setTexture(key, frames - 1)');
    const settle = body.indexOf('this.settleToIdle(player)');
    expect(lastFrame).toBeGreaterThanOrEqual(0);
    expect(settle).toBeGreaterThan(lastFrame);
    // 旧实现：设置末帧后做 110ms alpha 交叉（`crossFadeToIdle`）。
    expect(body).not.toContain('crossFadeToIdle');
    expect(body).not.toContain('110');
  });

  it('0ms 硬切路径调用 player.settleStandUp()', () => {
    const body = methodBody(sceneSource(), 'private settleToIdle(');
    expect(body).toContain('player.settleStandUp()');
    // 兜底融合仍受常量控制（当前 0ms，正常路径不会建过渡层）。
    expect(body).toContain('standUpToIdleFadeMs(this.reduced)');
    expect(body).toContain('player.sideIdleLook');
  });

  it('过渡层字段仍在 resetState / onShutdown 兜底销毁（不残留浮空贴图）', () => {
    const source = sceneSource();
    const field = source.match(/private standUpCrossFade: Phaser\.GameObjects\.Image \| null/);
    expect(field).not.toBeNull();
    const destroyCalls = source.match(/this\.standUpCrossFade\?\.destroy\(\)/g) ?? [];
    // settleToIdle + resetState + onShutdown：三处都要有。
    expect(destroyCalls.length).toBeGreaterThanOrEqual(3);
    const reset = methodBody(source, 'private resetState(');
    expect(reset).toContain('this.standUpCrossFade?.destroy()');
    expect(reset).toContain('this.standUpCrossFade = null');
    const shutdown = methodBody(source, 'private onShutdown(');
    expect(shutdown).toContain('this.standUpCrossFade?.destroy()');
    expect(shutdown).toContain('this.standUpCrossFade = null');
  });

  it('侧面 idle 素材在寝室模块声明的 bundle 里（ch.01 → ch01.char）', () => {
    const ids = expandBundleIds(['ch.01']);
    const keys = collectAssets(ids).map((asset) => asset.key);
    expect(keys).toContain(CH01_ASSET_KEYS.characters.zhouIdleRight);
    const owner = Object.values(BUNDLES).find((bundle) =>
      bundle.assets.some((asset) => asset.key === CH01_ASSET_KEYS.characters.zhouIdleRight),
    );
    // t39 把这张图放在章节包 `ch.01` 里（寝室场景的 requires），换 bundle 会让真机缺图。
    expect(owner?.id).toBe('ch.01');
  });
});
