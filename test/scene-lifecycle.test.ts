import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SceneLifecycle } from '../src/app/scene-lifecycle';

/**
 * 场景生命周期闩的回归护栏（2026-11-18 用户报的 bug）。
 *
 * 现象：寝室里「查看手机」→ 手机 CG 播完 → 不接小白台词，直接变成自由行动。
 * 根因：Phaser 的 `scene.restart()`（菜单读档走的就是它）复用同一个场景实例，
 * `SHUTDOWN` 里置位的 `shuttingDown` 从来没有在下一轮 `create()` 复位，于是
 * `playCutsceneVideo()` 的 `onDone` 被永久吞掉。
 *
 * 分两层守：
 * 1. `SceneLifecycle` 的纯逻辑：收尾/重开/串轮；
 * 2. 源码护栏：场景里不许再出现裸的 `shuttingDown` 布尔，接线必须走 lifecycle。
 */

function source(file: string): string {
  return readFileSync(file, 'utf8');
}

/** 取出方法体（签名后第一个位于行尾的 `{` 到配对的 `}`）。 */
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

describe('SceneLifecycle：每轮运行的身份', () => {
  it('beginRun 之后本轮回调有效，close 之后一律失效', () => {
    const life = new SceneLifecycle();
    expect(life.shuttingDown).toBe(false);
    const run = life.beginRun();
    expect(life.isLive(run)).toBe(true);
    life.close();
    expect(life.shuttingDown).toBe(true);
    expect(life.isLive(run)).toBe(false);
  });

  it('读档（restart）后：上一轮迟到的回调不能打进新一局，新一轮自己要能跑', () => {
    const life = new SceneLifecycle();
    const firstRun = life.beginRun();
    life.close();
    // scene.restart() → 同一实例再走一次 create()
    const secondRun = life.beginRun();
    expect(life.shuttingDown, '新一轮必须重新放行').toBe(false);
    expect(life.isLive(firstRun), '旧一轮的 CG 回调必须作废').toBe(false);
    expect(secondRun).not.toBe(firstRun);
    expect(life.isLive(secondRun), '新一轮的 CG 回调必须生效').toBe(true);
  });

  it('close 幂等；beginRun 每轮 +1', () => {
    const life = new SceneLifecycle();
    const a = life.beginRun();
    life.close();
    life.close();
    const b = life.beginRun();
    expect(b).toBe(a + 1);
    expect(life.runId).toBe(b);
    expect(life.isLive(b)).toBe(true);
  });
});

describe('场景接线护栏（源码）', () => {
  const DORM = 'src/scenes/ch01-dorm-scene.ts';
  const PALACE = 'src/scenes/ch01-palace-scene.ts';

  it('场景里不许再裸存 shuttingDown 布尔（必须走 SceneLifecycle）', () => {
    for (const file of [DORM, PALACE]) {
      expect(source(file), `${file} 又加了一个裸生命周期布尔`).not.toMatch(/private\s+shuttingDown/);
    }
  });

  it('寝室：resetState 里开新一轮，SHUTDOWN 收尾 close', () => {
    const dorm = source(DORM);
    const reset = bodyOf(dorm, 'private resetState(): void');
    expect(reset, 'resetState 没有 beginRun：读档后回调会被永久判成已关闭').toContain(
      'this.lifecycle.beginRun();',
    );
    const shutdown = bodyOf(dorm, 'private onShutdown(): void');
    expect(shutdown).toContain('this.lifecycle.close();');
  });

  it('金殿：create 里开新一轮，shutdown 收尾 close', () => {
    const palace = source(PALACE);
    expect(bodyOf(palace, 'override create(): void')).toContain('this.lifecycle.beginRun();');
    expect(bodyOf(palace, 'shutdown(): void')).toContain('this.lifecycle.close();');
  });

  it('手机 CG 回调先验「本轮仍有效」，不是只看 shuttingDown', () => {
    const phone = bodyOf(
      source(DORM),
      'private startPhoneCutscene(lines: readonly DialogueLine[]): void',
    );
    expect(phone).toContain('const run = this.lifecycle.runId;');
    expect(phone).toContain('if (!this.lifecycle.isLive(run)) return;');
  });

  it('phoneCutsceneSeen 每轮 create 归零（读档后重走手机节点要重新播 CG）', () => {
    expect(bodyOf(source(DORM), 'private resetState(): void')).toContain(
      'this.phoneCutsceneSeen = false;',
    );
  });
});
