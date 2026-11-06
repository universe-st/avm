import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 音频生命周期的护栏（纯源码检查，不启动 Phaser）。
 *
 * 背景：Phaser 的 SoundManager 是 **game 级**的，场景 shutdown 不会自动停
 * `sound.add(key, { loop: true })` 起的声音。2026-11 的用户反馈「退出回到开始菜单时，
 * 郑卿的呼噜声没消失」就是这么漏的：呼噜用裸 `sound.add` 起、只存在场景字段里，
 * 退出时没人停。
 *
 * 所以这里有两条硬规则：
 * 1. 场景里不许裸起循环音，必须走 `audioDirector.playLoop()` / `playSfxAt({ loop: true })`，
 *    这样才登记进循环表；
 * 2. 会起循环音（`playLoop` / `playSfxAt`）的场景必须 `audioDirector.attach(this)`——
 *    SHUTDOWN 时的 `stopAllLoops()` 兜底就挂在这个 attach 上。只点按钮（`playClick`）的
 *    场景不需要，一次性音效本来就在播完时自己销毁。
 *
 * BGM（`bgm-manager`）有自己的一套交叉淡化，不受这两条约束；开场视频用的是 DOM video 元素。
 */

const SCENES_DIR = 'src/scenes';

interface SceneSource {
  readonly file: string;
  readonly source: string;
}

function sceneSources(): SceneSource[] {
  return readdirSync(SCENES_DIR)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => ({ file, source: readFileSync(join(SCENES_DIR, file), 'utf8') }));
}

/** 取出 `.sound.add(...)` 的完整调用文本（按括号配对，避免把后面的语句算进来）。 */
function soundAddCalls(source: string): string[] {
  const needle = '.sound.add(';
  const calls: string[] = [];
  let index = source.indexOf(needle);
  while (index !== -1) {
    let cursor = index + needle.length;
    let depth = 1;
    while (cursor < source.length && depth > 0) {
      const char = source[cursor];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      cursor += 1;
    }
    calls.push(source.slice(index, cursor));
    index = source.indexOf(needle, cursor);
  }
  return calls;
}

describe('场景音频生命周期', () => {
  it('场景里不允许裸起循环音（必须登记进 audioDirector 的循环表）', () => {
    const offenders: string[] = [];
    for (const { file, source } of sceneSources()) {
      for (const call of soundAddCalls(source)) {
        if (/loop:\s*true/.test(call)) {
          offenders.push(`${file}: ${call.split('\n')[0]?.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('会起循环音的场景都 attach 了宿主场景（SHUTDOWN 兜底靠它）', () => {
    const missing: string[] = [];
    for (const { file, source } of sceneSources()) {
      const startsAudio =
        source.includes('audioDirector.playLoop(') || source.includes('audioDirector.playSfxAt(');
      if (!startsAudio) continue;
      if (!source.includes('audioDirector.attach(this)')) missing.push(file);
    }
    expect(missing).toEqual([]);
  });
});
