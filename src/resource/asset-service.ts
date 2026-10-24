import Phaser from 'phaser';
import { ref, type Ref } from '@phaser-mvvm/core';
import { collectAssets } from '../assets/bundles';
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

const CATALOG = catalogJson as Catalog;

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
  error: null,
};

type Listener = (state: LoadState) => void;

/**
 * 全局唯一的资源加载器。
 *
 * - 只允许一个批次在跑；`ensure()` 串行排队，避免两个场景同时抢 Phaser cache。
 * - 进度按权重算（`plan.ts`），不直接用 Phaser 的文件计数。
 * - 已加载的资源按 cache 命中跳过，重复请求直接完成。
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

  /** 加载一组 bundle；返回时资源已就绪（可选资源失败除外）。 */
  ensure(bundleIds: readonly BundleId[], options: LoadOptions = {}): Promise<void> {
    const run = (): Promise<void> => this.runBatch(bundleIds, options);
    const next = this.queue.then(run, run);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /** 空闲预取：不显示 UI，失败静默（预取失败不该打断玩家）。 */
  prefetch(bundleIds: readonly BundleId[]): void {
    this.ensure(bundleIds, { show: 'never' }).catch(() => {
      // 预取失败下次还会再试。
    });
  }

  /** M0 只登记引用，不真正卸载；章节淘汰在 M1 接入。 */
  retain(bundleId: BundleId): void {
    this.loadedBundles.add(bundleId);
  }

  release(_bundleIds: readonly BundleId[]): void {
    // 有意留空：M0 资源常驻，避免误删正在使用的纹理。
  }

  private setState(patch: Partial<LoadState>): void {
    const next = { ...this.state.value, ...patch };
    this.state.value = next;
    for (const listener of this.listeners) listener(next);
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

    if (pending.length === 0) {
      for (const id of bundleIds) this.loadedBundles.add(id);
      this.setState({
        ...IDLE,
        phase: 'ready',
        bundles: bundleIds,
        progress: 1,
        total: 0,
        startedAt: performance.now(),
        show: options.show ?? 'auto',
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
      startedAt: performance.now(),
      show: options.show ?? 'auto',
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
