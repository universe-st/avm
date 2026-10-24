/** 资源类型：M0 只需要图、音频、JSON；图集/序列帧后续加。 */
export type AssetKind = 'image' | 'audio' | 'json';

export type BundleId = 'core' | 'title' | 'ui' | 'ch.00';

export interface AssetDef {
  /** 全局唯一；Phaser cache 的 key。 */
  readonly key: string;
  readonly kind: AssetKind;
  /** 相对站点根（Cordova 下就是 www/）的路径，例如 `assets/img/title/title_bg.png`。 */
  readonly url: string;
  /** 进度权重；缺省按 catalog 字节数算。 */
  readonly weight?: number;
  /** 默认 true；false 时加载失败只降级、不阻断。 */
  readonly required?: boolean;
  /** 给人看的名字，加载页显示。 */
  readonly label?: string;
  readonly tags?: readonly string[];
}

export interface BundleDef {
  readonly id: BundleId;
  readonly assets: readonly AssetDef[];
  readonly dependsOn?: readonly BundleId[];
  /** CI 体积门禁（KB）。 */
  readonly budgetKB?: number;
}

export type LoadShow = 'auto' | 'always' | 'never';

export interface LoadOptions {
  /** 是否显示加载页：auto 由耗时决定，always 立即显示，never 静默。 */
  readonly show?: LoadShow;
  /** 加载页副标题（例如「正在进入梦域」）。 */
  readonly label?: string;
}

export interface LoadState {
  readonly phase: 'idle' | 'loading' | 'ready' | 'error';
  readonly bundles: readonly BundleId[];
  /** 0–1，按权重单调递增。 */
  readonly progress: number;
  readonly currentKey: string | null;
  readonly currentLabel: string;
  readonly label: string;
  readonly loaded: number;
  readonly total: number;
  readonly bytesLoaded: number;
  readonly bytesTotal: number;
  readonly startedAt: number;
  readonly show: LoadShow;
  readonly error: string | null;
}
