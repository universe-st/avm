import type { AssetDef, BundleDef, BundleId } from './types';

/**
 * M0 的资源清单（唯一真值）。
 * 约定：key = `<kind>.<bundle>.<name>`；url 相对站点根；新增资源先登记在这里。
 */
export const BUNDLES: Record<BundleId, BundleDef> = {
  core: {
    id: 'core',
    budgetKB: 2048,
    // 常驻：白纹理、点击音、逐字提示音、播放图标在所有场景都可能用到。
    persistent: true,
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
      // 逐字提示音：三段音高轮流出现。刻意用 WAV，避免 MP3 编码前导静音
      // 让每 55ms 一次的「哒」听起来拖拍（生成脚本见 tools/make-type-blips.py）。
      {
        key: 'audio.sfx.type1',
        kind: 'audio',
        url: 'assets/audio/sfx/type_blip_1.wav',
        required: false,
        label: '逐字提示音 1',
        tags: ['sfx'],
      },
      {
        key: 'audio.sfx.type2',
        kind: 'audio',
        url: 'assets/audio/sfx/type_blip_2.wav',
        required: false,
        label: '逐字提示音 2',
        tags: ['sfx'],
      },
      {
        key: 'audio.sfx.type3',
        kind: 'audio',
        url: 'assets/audio/sfx/type_blip_3.wav',
        required: false,
        label: '逐字提示音 3',
        tags: ['sfx'],
      },
      // 播放控制图标：纯白图形，运行时按状态 setTint（生成脚本 tools/make-ui-icons.py）。
      {
        key: 'img.ui.icon.auto',
        kind: 'image',
        url: 'assets/img/ui/icon_auto.png',
        required: false,
        label: '图标 · 自动播放',
      },
      {
        key: 'img.ui.icon.skip',
        kind: 'image',
        url: 'assets/img/ui/icon_skip.png',
        required: false,
        label: '图标 · 跳过',
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
    // 常驻：通用 UI 资源不属于任何一个内容场景，切场景时不回收。
    persistent: true,
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
      {
        key: 'audio.bgm.prologue',
        kind: 'audio',
        url: 'assets/audio/bgm/prologue.mp3',
        // 音乐失败不阻断剧情：静音也要能看完开幕。
        required: false,
        label: '开幕曲《星夜梦境》',
        tags: ['bgm'],
      },
    ],
  },
  'ch.01': {
    id: 'ch.01',
    budgetKB: 8192,
    dependsOn: ['ui'],
    assets: [
      {
        key: 'img.map.ch01.dorm_room',
        kind: 'image',
        url: 'assets/img/map/ch01/dorm_room.png',
        label: '寝室房间',
        tags: ['map', 'pixel'],
      },
      {
        key: 'img.map.ch01.dorm_q',
        kind: 'image',
        url: 'assets/img/map/ch01/dorm_q.png',
        label: '寝室房间 · Q 版俯视',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.down',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_down.png',
        label: '周全 Q 版 · 朝下',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.up',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_up.png',
        label: '周全 Q 版 · 朝上',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.left',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_left.png',
        label: '周全 Q 版 · 朝左',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.right',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_right.png',
        label: '周全 Q 版 · 朝右',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.walk_down',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_walk_down.png',
        label: '周全 Q 版行走 · 朝下',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.walk_up',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_walk_up.png',
        label: '周全 Q 版行走 · 朝上',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.walk_left',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_walk_left.png',
        label: '周全 Q 版行走 · 朝左',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.walk_right',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_walk_right.png',
        label: '周全 Q 版行走 · 朝右',
        tags: ['map'],
      },
      {
        key: 'img.map.ch01.bed_zheng',
        kind: 'image',
        url: 'assets/img/map/ch01/bed_zheng.png',
        label: '郑卿睡床 · 4 帧',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.down_left',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_down_left.png',
        label: '周全 Q 版 · 左下',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.down_right',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_down_right.png',
        label: '周全 Q 版 · 右下',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.up_left',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_up_left.png',
        label: '周全 Q 版 · 左上',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.up_right',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_up_right.png',
        label: '周全 Q 版 · 右上',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.walk_down_left',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_walk_down_left.png',
        label: '周全 Q 版行走 · 左下',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.walk_down_right',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_walk_down_right.png',
        label: '周全 Q 版行走 · 右下',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.walk_up_left',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_walk_up_left.png',
        label: '周全 Q 版行走 · 左上',
        tags: ['map'],
      },
      {
        key: 'img.char.ch01.q.walk_up_right',
        kind: 'image',
        url: 'assets/img/character/ch01/q/zhou_q_walk_up_right.png',
        label: '周全 Q 版行走 · 右上',
        tags: ['map'],
      },
      {
        key: 'img.map.ch01.chair',
        kind: 'image',
        url: 'assets/img/map/ch01/chair.png',
        label: '书桌椅',
        tags: ['map', 'prop'],
      },
      {
        key: 'img.char.ch01.zhou_down',
        kind: 'image',
        url: 'assets/img/character/ch01/zhou_down.png',
        label: '周全 · 朝下',
        tags: ['map', 'pixel'],
      },
      {
        key: 'img.char.ch01.zhou_up',
        kind: 'image',
        url: 'assets/img/character/ch01/zhou_up.png',
        label: '周全 · 朝上',
        tags: ['map', 'pixel'],
      },
      {
        key: 'img.char.ch01.zhou_left',
        kind: 'image',
        url: 'assets/img/character/ch01/zhou_left.png',
        label: '周全 · 朝左',
        tags: ['map', 'pixel'],
      },
      {
        key: 'img.char.ch01.zhou_right',
        kind: 'image',
        url: 'assets/img/character/ch01/zhou_right.png',
        label: '周全 · 朝右',
        tags: ['map', 'pixel'],
      },
      {
        key: 'img.char.ch01.zhou_walk_down',
        kind: 'image',
        url: 'assets/img/character/ch01/zhou_walk_down.png',
        label: '周全 · 行走下',
        tags: ['map', 'pixel', 'walk'],
      },
      {
        key: 'img.char.ch01.zhou_walk_up',
        kind: 'image',
        url: 'assets/img/character/ch01/zhou_walk_up.png',
        label: '周全 · 行走上',
        tags: ['map', 'pixel', 'walk'],
      },
      {
        key: 'img.char.ch01.zhou_walk_left',
        kind: 'image',
        url: 'assets/img/character/ch01/zhou_walk_left.png',
        label: '周全 · 行走左',
        tags: ['map', 'pixel', 'walk'],
      },
      {
        key: 'img.char.ch01.zhou_walk_right',
        kind: 'image',
        url: 'assets/img/character/ch01/zhou_walk_right.png',
        label: '周全 · 行走右',
        tags: ['map', 'pixel', 'walk'],
      },
      {
        key: 'img.char.ch01.xiaobai',
        kind: 'image',
        url: 'assets/img/character/ch01/xiaobai.png',
        label: '小白',
        tags: ['map', 'character'],
      },
      {
        key: 'img.char.ch01.zhou_sit',
        kind: 'image',
        url: 'assets/img/character/ch01/zhou_sit.png',
        label: '周全坐姿',
        tags: ['character'],
      },
      {
        key: 'img.char.ch01.zheng',
        kind: 'image',
        url: 'assets/img/character/ch01/zheng.png',
        label: '郑卿',
        tags: ['map', 'character'],
      },
      {
        key: 'audio.bgm.ch01_dorm',
        kind: 'audio',
        url: 'assets/audio/bgm/ch01_dorm.mp3',
        // 环境音失败不阻断：寝室可以静音探索。
        required: false,
        label: '寝室环境《闷热午后》',
        tags: ['bgm'],
      },
      {
        key: 'audio.sfx.ch01_punch',
        kind: 'audio',
        url: 'assets/audio/sfx/ch01_punch.mp3',
        required: false,
        label: '拳头砸铁皮',
        tags: ['sfx'],
      },
      {
        key: 'audio.sfx.ch01_phone',
        kind: 'audio',
        url: 'assets/audio/sfx/ch01_phone.mp3',
        required: false,
        label: '手机故障',
        tags: ['sfx'],
      },
      {
        key: 'audio.sfx.ch01_snore',
        kind: 'audio',
        url: 'assets/audio/sfx/ch01_snore.mp3',
        required: false,
        label: '郑卿呼噜',
        tags: ['sfx'],
      },
      {
        key: 'img.cg.ch01.phone',
        kind: 'image',
        url: 'assets/img/cg/ch01/phone.webp',
        label: 'CG · 手机白光',
        tags: ['cg'],
      },
      {
        key: 'img.cg.ch01.xiaobai',
        kind: 'image',
        url: 'assets/img/cg/ch01/xiaobai.webp',
        label: 'CG · 小白登场',
        tags: ['cg'],
      },
      {
        key: 'img.cg.ch01.wake',
        kind: 'image',
        url: 'assets/img/cg/ch01/wake.webp',
        label: 'CG · 醒来',
        tags: ['cg'],
      },
    ],
  },
  'battle.common': {
    id: 'battle.common',
    budgetKB: 3072,
    dependsOn: ['ui'],
    assets: [],
  },
  'battle.ch01': {
    id: 'battle.ch01',
    budgetKB: 5120,
    // 战斗复用寝室 bundle 里的周全 sprite；collectAssets 会按依赖展开。
    dependsOn: ['battle.common', 'ch.01'],
    assets: [
      {
        key: 'img.battle.ch01.dream_hall',
        kind: 'image',
        url: 'assets/img/battle/ch01/dream_hall.webp',
        label: '梦域金殿',
        tags: ['battle', 'pixel'],
      },
      {
        key: 'img.char.ch01.miner',
        kind: 'image',
        url: 'assets/img/character/ch01/miner.png',
        label: '矿工·清除单元',
        tags: ['battle', 'pixel'],
      },
      {
        key: 'audio.bgm.ch01_dream',
        kind: 'audio',
        url: 'assets/audio/bgm/ch01_dream.mp3',
        required: false,
        label: '梦域金殿《清除协议》',
        tags: ['bgm'],
      },
      {
        key: 'audio.sfx.ch01_metal',
        kind: 'audio',
        url: 'assets/audio/sfx/ch01_metal.mp3',
        required: false,
        label: '金属撞击',
        tags: ['sfx'],
      },
    ],
  },
};

/**
 * 按依赖顺序展开 bundle 闭包（去重，依赖在前，自身在后）。
 *
 * 场景门禁、释放计划和舞台预览都用它，保证「我 require 了什么」和
 * 「我实际持有/需要保留什么」是同一套口径。
 */
export function expandBundleIds(ids: readonly BundleId[]): BundleId[] {
  const out: BundleId[] = [];
  const seen = new Set<BundleId>();

  const visit = (id: BundleId): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const bundle = BUNDLES[id];
    for (const dep of bundle.dependsOn ?? []) visit(dep);
    out.push(id);
  };

  for (const id of ids) visit(id);
  return out;
}

/** 常驻 bundle：每个批次自动带上，切换场景时永不释放。 */
export function persistentBundleIds(): BundleId[] {
  return (Object.keys(BUNDLES) as BundleId[]).filter((id) => BUNDLES[id].persistent === true);
}

/** 按依赖顺序展开成扁平的资源列表（去重，保持首次出现顺序）。 */
export function collectAssets(ids: readonly BundleId[]): AssetDef[] {
  const out: AssetDef[] = [];
  const seenKeys = new Set<string>();

  for (const id of expandBundleIds(ids)) {
    for (const asset of BUNDLES[id].assets) {
      if (seenKeys.has(asset.key)) continue;
      seenKeys.add(asset.key);
      out.push(asset);
    }
  }

  return out;
}

export function bundleBytes(id: BundleId): number {
  return BUNDLES[id].assets.reduce((sum, a) => sum + (a.weight ?? 0), 0);
}
