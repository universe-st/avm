import Phaser from 'phaser';
import { ref, type Ref } from '@phaser-mvvm/core';
import { collectAssets, expandBundleIds, persistentBundleIds } from '../assets/bundles';
import type { AssetDef, BundleId, LoadOptions, LoadState } from '../assets/types';
import catalogJson from '../assets/catalog.gen.json';
import {
  assetBytes,
  missingAssets,
  progressOf,
  requiredFailures,
  totalWeight,
  weightOf,
  type Catalog,
} from './plan';
import { planRelease, type ReleasePlan } from './scope';

const CATALOG = catalogJson as Catalog;

/** 加载页最短可见时长：场景门禁默认 520ms，其余沿用旧的 420ms。 */
function holdMsOf(options: LoadOptions): number {
  if (options.holdMs !== undefined) return Math.max(0, options.holdMs);
  return (options.show ?? 'auto') === 'always' ? 520 : 420;
}

const IDLE: LoadState = {
  phase: 'idle',
  bundles: [],
  progress: 0,
  currentKey: null,
  currentLabel: '',
  label: '',
  loaded: 0,
  total: 0,
  bytesLoaded: 0,
  bytesTotal: 0,
  startedAt: 0,
  show: 'auto',
  holdMs: 0,
  error: null,
};

type Listener = (state: LoadState) => void;

/**
 * 全局唯一的资源加载器。
 *
 * - 只允许一个批次在跑；`ensure()` 串行排队，避免两个场景同时抢 Phaser cache。
 * - 进度按权重算（`plan.ts`），不直接用 Phaser 的文件计数。
 * - 已加载的资源按 cache 命中跳过，重复请求直接完成。
 * - 常驻 bundle（`persistent: true`）每个批次自动带上，永不释放。
 * - 场景切换完成后调用 `releaseExcept()`：释放不属于新场景的 bundle，
 *   同时清掉引用被删纹理的动画，保证「每个场景自己管自己的资源」。
 * - 失败：可选资源降级，必填资源 reject 并把错误写进 state。
 */
export class AssetService {
  readonly state: Ref<LoadState> = ref<LoadState>({ ...IDLE });

  private host: Phaser.Scene | null = null;
  private readonly hostReady: Promise<void>;
  private resolveHost!: () => void;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<Listener>();
  private readonly loadedBundles = new Set<BundleId>();

  constructor() {
    this.hostReady = new Promise<void>((resolve) => {
      this.resolveHost = resolve;
    });
  }

  /** LoaderScene 启动时调用；只允许绑定一次。 */
  attach(scene: Phaser.Scene): void {
    if (this.host && this.host !== scene) return;
    this.host = scene;
    this.resolveHost();
  }

  whenReady(): Promise<void> {
    return this.hostReady;
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 加载一组 bundle（含依赖与常驻包）；返回时资源已就绪（可选资源失败除外）。 */
  ensure(bundleIds: readonly BundleId[], options: LoadOptions = {}): Promise<void> {
    const expanded = expandBundleIds([...bundleIds, ...persistentBundleIds()]);
    const run = (): Promise<void> => this.runBatch(expanded, options);
    const next = this.queue.then(run, run);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /**
   * 释放不在 `keep` 闭包里的所有已加载 bundle；常驻包始终保留。
   *
   * 在目标场景 `create` 之后调用（旧场景已经 shutdown），避免删掉仍被旧场景
   * 引用的纹理。音频 cache 的删除不影响已经播放中的 Sound 实例。
   */
  releaseExcept(keep: readonly BundleId[]): Promise<ReleasePlan> {
    const run = (): ReleasePlan => this.performRelease(keep);
    const next = this.queue.then(run, run);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /** 当前已加载的 bundle（含依赖闭包），调试/验收用。 */
  loadedBundleIds(): readonly BundleId[] {
    return [...this.loadedBundles];
  }

  /** 当前 cache 里真实存在的资源 key，调试/验收用。 */
  loadedAssetKeys(): readonly string[] {
    const assets = collectAssets(this.loadedBundleIds());
    return assets.filter((asset) => this.isLoaded(asset)).map((asset) => asset.key);
  }

  private setState(patch: Partial<LoadState>): void {
    const next = { ...this.state.value, ...patch };
    this.state.value = next;
    for (const listener of this.listeners) listener(next);
  }

  private performRelease(keep: readonly BundleId[]): ReleasePlan {
    const host = this.host;
    if (!host) return { bundles: [], assets: [] };

    const plan = planRelease(this.loadedBundles, keep);
    if (plan.bundles.length === 0) return plan;

    for (const bundleId of plan.bundles) this.loadedBundles.delete(bundleId);
    for (const asset of plan.assets) this.removeAsset(host, asset);

    if (import.meta.env.DEV) {
      const keys = plan.assets.map((asset) => asset.key);
      console.info(
        `[assets] 释放 bundle：${plan.bundles.join(', ')}` +
          (keys.length > 0 ? `（${keys.length} 个资源）` : ''),
      );
    }
    return plan;
  }

  private removeAsset(host: Phaser.Scene, asset: AssetDef): void {
    switch (asset.kind) {
      case 'audio':
        host.cache.audio.remove(asset.key);
        return;
      case 'json':
        host.cache.json.remove(asset.key);
        return;
      default: {
        if (!host.textures.exists(asset.key)) return;
        // 动画帧引用的是纹理 Frame；先删动画再删纹理，否则重进场景时
        // `anims.exists()` 会认为旧动画还在，播到已销毁的 Frame 上。
        for (const animKey of host.anims.getAnimsFromTexture(asset.key)) {
          host.anims.remove(animKey);
        }
        host.textures.remove(asset.key);
      }
    }
  }

  private isLoaded(asset: AssetDef): boolean {
    const host = this.host;
    if (!host) return false;
    switch (asset.kind) {
      case 'audio':
        return host.cache.audio.exists(asset.key);
      case 'json':
        return host.cache.json.exists(asset.key);
      default:
        return host.textures.exists(asset.key);
    }
  }

  private async runBatch(
    bundleIds: readonly BundleId[],
    options: LoadOptions,
  ): Promise<void> {
    if (bundleIds.length === 0) return;
    const host = this.host ?? (await this.hostReady.then(() => this.host));
    if (!host) throw new Error('AssetService: LoaderScene 尚未挂载');

    const all = collectAssets(bundleIds);
    const pending = missingAssets(all, (asset) => this.isLoaded(asset));
    const holdMs = holdMsOf(options);
    const show = options.show ?? 'auto';
    const startedAt = performance.now();

    if (pending.length === 0) {
      for (const id of bundleIds) this.loadedBundles.add(id);
      // 先发 loading 再发 ready：即使缓存全命中，show: 'always' 也会先亮起加载页，
      // 让「进新场景」始终有一次可见的转场，而不是直接闪进目标画面。
      this.setState({
        ...IDLE,
        phase: 'loading',
        bundles: bundleIds,
        progress: 1,
        total: 0,
        label: options.label ?? '',
        startedAt,
        show,
        holdMs,
      });
      this.setState({
        ...IDLE,
        phase: 'ready',
        bundles: bundleIds,
        progress: 1,
        currentLabel: '资源已就绪',
        total: 0,
        label: options.label ?? '',
        startedAt,
        show,
        holdMs,
      });
      return;
    }

    const total = totalWeight(pending, CATALOG);
    const bytesTotal = pending.reduce((sum, a) => sum + assetBytes(a, CATALOG), 0);
    let done = 0;
    let bytesDone = 0;
    let loadedCount = 0;
    const failed: string[] = [];

    this.setState({
      ...IDLE,
      phase: 'loading',
      bundles: bundleIds,
      progress: 0,
      currentKey: pending[0]?.key ?? null,
      currentLabel: pending[0]?.label ?? pending[0]?.key ?? '',
      label: options.label ?? '',
      total: pending.length,
      bytesTotal,
      startedAt,
      show,
      holdMs,
    });

    await new Promise<void>((resolve, reject) => {
      const loader = host.load;
      const onFileComplete = (key: string): void => {
        const asset = pending.find((a) => a.key === key);
        if (!asset) return;
        done += weightOf(asset, CATALOG);
        bytesDone += assetBytes(asset, CATALOG);
        loadedCount += 1;
        this.setState({
          progress: progressOf(done, total),
          currentKey: key,
          currentLabel: asset.label ?? key,
          loaded: loadedCount,
          bytesLoaded: bytesDone,
        });
      };
      const onFileError = (file: Phaser.Loader.File): void => {
        if (file?.key) failed.push(file.key);
      };
      const cleanup = (): void => {
        loader.off(Phaser.Loader.Events.FILE_COMPLETE, onFileComplete);
        loader.off(Phaser.Loader.Events.FILE_LOAD_ERROR, onFileError);
        loader.off(Phaser.Loader.Events.COMPLETE, onComplete);
      };
      const onComplete = (): void => {
        cleanup();
        const required = requiredFailures(pending, failed);
        if (required.length > 0) {
          const message = `资源加载失败：${required.map((a) => a.key).join(', ')}`;
          this.setState({
            phase: 'error',
            progress: progressOf(done, total),
            error: message,
          });
          reject(new Error(message));
          return;
        }
        for (const id of bundleIds) this.loadedBundles.add(id);
        this.setState({
          phase: 'ready',
          progress: 1,
          loaded: pending.length,
          bytesLoaded: bytesTotal,
          error: null,
        });
        resolve();
      };

      loader.on(Phaser.Loader.Events.FILE_COMPLETE, onFileComplete);
      loader.on(Phaser.Loader.Events.FILE_LOAD_ERROR, onFileError);
      loader.on(Phaser.Loader.Events.COMPLETE, onComplete);

      try {
        for (const asset of pending) {
          switch (asset.kind) {
            case 'audio':
              loader.audio(asset.key, asset.url);
              break;
            case 'json':
              loader.json(asset.key, asset.url);
              break;
            default:
              loader.image(asset.key, asset.url);
              break;
          }
        }
        if (!loader.isLoading()) loader.start();
      } catch (error) {
        cleanup();
        const message = error instanceof Error ? error.message : String(error);
        this.setState({ phase: 'error', error: message });
        reject(error instanceof Error ? error : new Error(message));
      }
    });
  }
}

/** 全局单例：场景、UI、测试共用同一份状态。 */
export const assetService = new AssetService();
