/**
 * 循环音登记表（纯逻辑，不依赖 Phaser / WebAudio，可直接单测）。
 *
 * 背景：Phaser 的 SoundManager 是 game 级的，场景 shutdown **不会**自动停掉用
 * `sound.add(key, { loop: true })` 起的声音。只要有一个场景把循环音存在自己的字段里、
 * 又在退出时忘了停，它就会跟着玩家回到标题页（寝室呼噜声就是这么漏的）。
 *
 * 约定：凡是「会一直响到被显式停掉」的声音，都必须在创建时登记到这里；
 * 场景 shutdown 时调用 `stopAll()`，由登记表负责停 + 销毁（释放函数由调用方提供）。
 *
 * 语义：
 * - 同名 key 重复登记 = 先释放旧实例再换新，绝不留下没人持有的循环音；
 * - `stop()` / `stopAll()` 幂等，重复调用不会再释放第二次；
 * - 释放函数抛错不会中断其它循环音的收尾，也不会让条目留在表里。
 */

export type LoopRelease<T> = (handle: T) => void;

interface LoopEntry<T> {
  readonly handle: T;
  readonly release: LoopRelease<T>;
}

export class LoopRegistry<T> {
  private readonly entries = new Map<string, LoopEntry<T>>();

  /** 当前登记的循环音数量。 */
  get size(): number {
    return this.entries.size;
  }

  /**
   * 登记一个循环音，返回原句柄方便链式使用。
   *
   * 同名 key 已经登记过时先释放旧实例：旧实例再也不会被任何人到，留着就是泄漏
   * （例如同一环境音在场景里被重复 start）。
   */
  register(key: string, handle: T, release: LoopRelease<T>): T {
    this.stop(key);
    this.entries.set(key, { handle, release });
    return handle;
  }

  /** 取当前登记的句柄；没登记返回 null。 */
  get(key: string): T | null {
    return this.entries.get(key)?.handle ?? null;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  /** 当前登记的所有 key（按登记顺序）。调试/验收用：标题页应当为空。 */
  keys(): string[] {
    return [...this.entries.keys()];
  }

  /** 停掉并移除一个循环音；没登记时是空操作。返回是否真的释放了一个。 */
  stop(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    // 先删再释放：释放函数里若再调 stop 也不会递归。
    this.entries.delete(key);
    try {
      entry.release(entry.handle);
    } catch {
      // 声音可能已经被销毁（例如场景 shutdown 时 Phaser 先收尾了音频节点）；
      // 释放失败不能阻断其它循环音的收尾，也不能让条目留在表里。
    }
    return true;
  }

  /** 场景 shutdown / restart 时统一收尾：停掉所有登记的循环音并清空表。幂等。 */
  stopAll(): void {
    for (const key of [...this.entries.keys()]) this.stop(key);
  }
}
