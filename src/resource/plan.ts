import type { AssetDef } from '../assets/types';

/** 资源权重缺省值：BGM 与 1×1 图片不该同权，否则进度条会卡在 99%。 */
const FALLBACK_BYTES: Record<AssetDef['kind'], number> = {
  image: 192 * 1024,
  audio: 1024 * 1024,
  json: 32 * 1024,
};

export interface CatalogEntry {
  readonly bytes: number;
}

export type Catalog = Record<string, CatalogEntry>;

export function assetBytes(asset: AssetDef, catalog: Catalog): number {
  return catalog[asset.url]?.bytes ?? FALLBACK_BYTES[asset.kind];
}

/** 权重 = 字节数 / 1KB，钳制到 [1, 4096]；显式 weight 优先。 */
export function weightOf(asset: AssetDef, catalog: Catalog): number {
  if (typeof asset.weight === 'number' && asset.weight > 0) {
    return Math.min(4096, Math.max(1, Math.round(asset.weight)));
  }
  return Math.min(4096, Math.max(1, Math.round(assetBytes(asset, catalog) / 1024)));
}

export function totalWeight(assets: readonly AssetDef[], catalog: Catalog): number {
  return assets.reduce((sum, asset) => sum + weightOf(asset, catalog), 0);
}

/** 进度永远落在 [0,1]，且 total=0 时视为完成。 */
export function progressOf(done: number, total: number): number {
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, done / total));
}

/** 必填资源失败才阻断；可选资源失败由调用方降级。 */
export function requiredFailures(
  assets: readonly AssetDef[],
  failedKeys: readonly string[],
): AssetDef[] {
  const failed = new Set(failedKeys);
  return assets.filter((asset) => failed.has(asset.key) && asset.required !== false);
}

/** 从一组资源里筛掉已经加载过的（按 key）。 */
export function missingAssets(
  assets: readonly AssetDef[],
  isLoaded: (asset: AssetDef) => boolean,
): AssetDef[] {
  return assets.filter((asset) => !isLoaded(asset));
}
