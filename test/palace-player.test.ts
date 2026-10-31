import { describe, expect, it } from 'vitest';
import { PalacePlayer } from '../src/story/palace-player';
import { PALACE_BEATS, PALACE_START, PALACE_TEXTURES } from '../src/story/ch01-palace';

describe('PalacePlayer', () => {
  it('emits act actions once, then waits for the act duration', () => {
    const player = new PalacePlayer([
      { kind: 'act', actions: [{ kind: 'fx', fx: 'flash' }], ms: 100 },
      { kind: 'say', speaker: '旁白', text: '一句话。' },
    ]);

    const first = player.tick(0);
    expect(first).toEqual([{ type: 'action', action: { kind: 'fx', fx: 'flash' } }]);

    // 再次 tick 不会重复吐 action
    expect(player.tick(40)).toEqual([]);
    expect(player.tick(40)).toEqual([]);
    // 预算攒够 100ms 后进入下一句
    const said = player.tick(40);
    expect(said.map((e) => e.type)).toEqual(['say']);
  });

  it('waits on a say until advance() and never auto-skips it', () => {
    const player = new PalacePlayer([{ kind: 'say', text: '等点击。' }]);
    expect(player.tick(16).map((e) => e.type)).toEqual(['say']);
    expect(player.state.waiting).toBe(true);
    expect(player.tick(5000)).toEqual([]);
    player.advance();
    expect(player.state.waiting).toBe(false);
    expect(player.tick(16).map((e) => e.type)).toEqual(['complete']);
  });

  it('crosses zero-duration acts in one frame without starving', () => {
    const player = new PalacePlayer([
      { kind: 'act', actions: [{ kind: 'faceLeft', actor: 'eunuchRight' }], ms: 0 },
      { kind: 'act', actions: [{ kind: 'faceRight', actor: 'eunuchRight' }], ms: 0 },
      { kind: 'say', text: '到了。' },
    ]);
    const events = player.tick(16);
    expect(events.map((e) => e.type)).toEqual(['action', 'action', 'say']);
  });

  it('skip() ends the whole sequence exactly once', () => {
    const player = new PalacePlayer([
      { kind: 'say', text: '一' },
      { kind: 'say', text: '二' },
    ]);
    player.tick(16);
    expect(player.skip().map((e) => e.type)).toEqual(['complete']);
    expect(player.state.done).toBe(true);
    expect(player.skip()).toEqual([]);
    expect(player.tick(100)).toEqual([]);
  });
});

describe('金殿调度数据', () => {
  it('keeps every actor inside the 33×54 room', () => {
    for (const at of Object.values(PALACE_START)) {
      expect(at.x).toBeGreaterThan(0);
      expect(at.x).toBeLessThan(33);
      expect(at.y).toBeGreaterThan(0);
      expect(at.y).toBeLessThan(54);
    }
  });

  it('moves and textures only reference known actors and keys', () => {
    const actors = new Set(['zhou', 'zheng', 'chu', 'eunuchLeft', 'eunuchRight', 'miner']);
    const textures = new Set<string>(Object.values(PALACE_TEXTURES));
    for (const beat of PALACE_BEATS) {
      if (beat.kind !== 'act') continue;
      for (const action of beat.actions) {
        if ('actor' in action) expect(actors.has(action.actor)).toBe(true);
        if (action.kind === 'texture') expect(textures.has(action.texture)).toBe(true);
      }
    }
  });

  it('plays the beats from the白闪 to the矿工 declaration', () => {
    const lines = PALACE_BEATS.filter((b) => b.kind === 'say').map((b) => b.text);
    expect(lines[0]).toContain('跪在冰冷光滑的地板上');
    expect(lines.some((t) => t.includes('有刺客！护驾'))).toBe(true);
    expect(lines.some((t) => t.includes('楚老师'))).toBe(true);
    expect(lines.some((t) => t.includes('执行矿场清除协议'))).toBe(true);
  });
});
