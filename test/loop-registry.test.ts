import { describe, expect, it, vi } from 'vitest';
import { LoopRegistry } from '../src/audio/loop-registry';

/** 用一个最小假声音记录 stop/destroy，验证登记表的语义。 */
interface FakeSound {
  readonly key: string;
  stopped: number;
  destroyed: number;
}

function makeSound(key: string): FakeSound {
  return { key, stopped: 0, destroyed: 0 };
}

function release(sound: FakeSound): void {
  sound.stopped += 1;
  sound.destroyed += 1;
}

describe('LoopRegistry', () => {
  it('登记后可取回，keys 按登记顺序', () => {
    const loops = new LoopRegistry<FakeSound>();
    const ambience = makeSound('ambience');
    const snore = makeSound('snore');

    expect(loops.register('ambience', ambience, release)).toBe(ambience);
    loops.register('snore', snore, release);

    expect(loops.size).toBe(2);
    expect(loops.has('snore')).toBe(true);
    expect(loops.get('snore')).toBe(snore);
    expect(loops.keys()).toEqual(['ambience', 'snore']);
  });

  it('没登记的 key 返回 null / false，不报错', () => {
    const loops = new LoopRegistry<FakeSound>();
    expect(loops.get('nope')).toBeNull();
    expect(loops.has('nope')).toBe(false);
    expect(loops.stop('nope')).toBe(false);
    expect(loops.size).toBe(0);
  });

  it('同名 key 重复登记先释放旧实例，不泄漏', () => {
    const loops = new LoopRegistry<FakeSound>();
    const first = makeSound('ambience');
    const second = makeSound('ambience');

    loops.register('ambience', first, release);
    loops.register('ambience', second, release);

    expect(first.stopped).toBe(1);
    expect(first.destroyed).toBe(1);
    expect(second.stopped).toBe(0);
    expect(loops.size).toBe(1);
    expect(loops.get('ambience')).toBe(second);
  });

  it('stop 幂等：重复调用只释放一次', () => {
    const loops = new LoopRegistry<FakeSound>();
    const snore = makeSound('snore');
    loops.register('snore', snore, release);

    expect(loops.stop('snore')).toBe(true);
    expect(snore.stopped).toBe(1);
    expect(loops.size).toBe(0);
    expect(loops.has('snore')).toBe(false);

    expect(loops.stop('snore')).toBe(false);
    expect(snore.stopped).toBe(1);
    expect(snore.destroyed).toBe(1);
  });

  it('stopAll 清空并逐条释放，再调一次是空操作', () => {
    const loops = new LoopRegistry<FakeSound>();
    const a = makeSound('a');
    const b = makeSound('b');
    loops.register('a', a, release);
    loops.register('b', b, release);

    loops.stopAll();
    expect(a.destroyed).toBe(1);
    expect(b.destroyed).toBe(1);
    expect(loops.size).toBe(0);
    expect(loops.keys()).toEqual([]);

    loops.stopAll();
    expect(a.destroyed).toBe(1);
    expect(b.destroyed).toBe(1);
  });

  it('释放函数抛错也把条目清掉，且不影响其它循环音收尾', () => {
    const loops = new LoopRegistry<FakeSound>();
    const broken = makeSound('broken');
    const ok = makeSound('ok');
    const onError = vi.fn();

    loops.register('broken', broken, () => {
      onError();
      throw new Error('already destroyed');
    });
    loops.register('ok', ok, release);

    expect(() => loops.stopAll()).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(ok.destroyed).toBe(1);
    expect(loops.size).toBe(0);
  });

  it('释放过程中重新登记同名 key 不会无限递归', () => {
    const loops = new LoopRegistry<FakeSound>();
    const first = makeSound('ambience');
    const second = makeSound('ambience');

    loops.register('ambience', first, () => {
      // 模拟「释放时又起了一条同样的环境音」：stop 已先删表，不会回头再释放自己。
      loops.register('ambience', second, release);
    });
    loops.stop('ambience');

    expect(loops.get('ambience')).toBe(second);
    expect(second.destroyed).toBe(0);
    loops.stopAll();
    expect(second.destroyed).toBe(1);
  });
});
