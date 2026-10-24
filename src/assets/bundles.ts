import type { AssetDef, BundleDef, BundleId } from './types';

/**
 * M0 的资源清单（唯一真值）。
 * 约定：key = `<kind>.<bundle>.<name>`；url 相对站点根；新增资源先登记在这里。
 */
export const BUNDLES: Record<BundleId, BundleDef> = {
  core: {
    id: 'core',
    budgetKB: 2048,
    assets: [
      {
        key: 'img.core.white',
        kind: 'image',
        url: 'assets/img/core/white.png',
        label: '基础纹理',
      },
      {
        key: 'audio.sfx.click',
        kind: 'audio',
        url: 'assets/audio/sfx/ui_click.mp3',
        required: false,
        label: '按钮点击',
        tags: ['sfx'],
      },
    ],
  },
  title: {
    id: 'title',
    budgetKB: 6144,
    dependsOn: ['core'],
    assets: [
      {
        key: 'img.title.bg',
        kind: 'image',
        url: 'assets/img/title/title_bg.webp',
        label: '标题主视觉',
      },
      {
        key: 'img.title.logo',
        kind: 'image',
        url: 'assets/img/title/logo_mark.png',
        label: '徽记',
      },
      {
        key: 'audio.bgm.title',
        kind: 'audio',
        url: 'assets/audio/bgm/title.mp3',
        // BGM 失败不阻断：没有声音也要能进游戏。
        required: false,
        label: '标题曲《潜入》',
        tags: ['bgm'],
      },
    ],
  },
  ui: {
    id: 'ui',
    budgetKB: 1024,
    assets: [],
  },
  'ch.00': {
    id: 'ch.00',
    budgetKB: 2048,
    dependsOn: ['ui'],
    assets: [
      {
        key: 'img.ch00.bg',
        kind: 'image',
        url: 'assets/img/ch00/bg.png',
        label: '序章背景',
      },
    ],
  },
  'cutscene.prologue': {
    id: 'cutscene.prologue',
    budgetKB: 6144,
    dependsOn: ['core'],
    assets: [
      {
        key: 'img.prologue.sky',
        kind: 'image',
        url: 'assets/img/prologue/01_night_sky.webp',
        label: '深夜天幕',
      },
      {
        key: 'img.prologue.dream',
        kind: 'image',
        url: 'assets/img/prologue/02_dream_root.webp',
        label: '梦的本源',
      },
      {
        key: 'img.prologue.disaster',
        kind: 'image',
        url: 'assets/img/prologue/03_dreamfall.webp',
        label: '梦坠',
      },
      {
        key: 'img.prologue.war',
        kind: 'image',
        url: 'assets/img/prologue/04_hidden_war.webp',
        label: '无声的战争',
      },
      {
        key: 'img.prologue.school',
        kind: 'image',
        url: 'assets/img/prologue/05_qunying_school.webp',
        label: '群英高中',
      },
    ],
  },
};

/** 按依赖顺序展开成扁平的资源列表（去重，保持首次出现顺序）。 */
export function collectAssets(ids: readonly BundleId[]): AssetDef[] {
  const out: AssetDef[] = [];
  const seenKeys = new Set<string>();
  const seenBundles = new Set<BundleId>();

  const visit = (id: BundleId): void => {
    if (seenBundles.has(id)) return;
    seenBundles.add(id);
    const bundle = BUNDLES[id];
    for (const dep of bundle.dependsOn ?? []) visit(dep);
    for (const asset of bundle.assets) {
      if (seenKeys.has(asset.key)) continue;
      seenKeys.add(asset.key);
      out.push(asset);
    }
  };

  for (const id of ids) visit(id);
  return out;
}

export function bundleBytes(id: BundleId): number {
  return BUNDLES[id].assets.reduce((sum, a) => sum + (a.weight ?? 0), 0);
}
