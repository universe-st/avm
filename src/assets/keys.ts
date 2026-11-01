/**
 * 第一章资源 key 的分层唯一真值。
 *
 * 约定（与 `docs/RENDER-LAYERS.md` 一致）：
 * - `map.*`：地图/房间背景与地标
 * - `char.*`：角色静态图与行走 sheet
 * - `cg.*`：全屏剧情 CG
 * - `battle.*`：战斗背景（场景背景，不是 CG）
 * - `audio.*`：BGM / SFX
 * - UI 资源继续用 `img.ui.*`
 */
/**
 * 全局逐字提示音（core bundle）。
 *
 * `genericA/B` 给没有专属声线的配角轮换；其余四个 key 是主角团/旁白的专属声线。
 * 生成脚本：`tools/make-type-blips.py`。
 */
export const TYPE_BLIP_KEYS = {
  genericA: 'audio.sfx.type1',
  genericB: 'audio.sfx.type2',
  genericC: 'audio.sfx.type3',
  narrator: 'audio.sfx.voice_narrator',
  zhou: 'audio.sfx.voice_zhou',
  zheng: 'audio.sfx.voice_zheng',
  xiaobai: 'audio.sfx.voice_xiaobai',
} as const;

/** 梦域金殿（第一章殿上过场）的资源 key。 */
export const PALACE_ASSET_KEYS = {
  map: {
    hall: 'img.map.palace.hall',
  },
  characters: {
    zhouKneelUp: 'img.char.palace.zhou_kneel_up',
    zhouKneelDown: 'img.char.palace.zhou_kneel_down',
    eunuch: 'img.char.palace.eunuch_down',
    eunuchCrack: 'img.char.palace.eunuch_crack',
    miner: 'img.char.palace.miner',
    zhengDown: 'img.char.palace.zheng_emperor_down',
    zhengUp: 'img.char.palace.zheng_emperor_up',
    zhengLeft: 'img.char.palace.zheng_emperor_left',
    zhengRight: 'img.char.palace.zheng_emperor_right',
    chuDown: 'img.char.palace.chu_gonggong_down',
    chuUp: 'img.char.palace.chu_gonggong_up',
    chuLeft: 'img.char.palace.chu_gonggong_left',
    chuRight: 'img.char.palace.chu_gonggong_right',
    chuKneel: 'img.char.palace.chu_gonggong_kneel',
    portraitZheng: 'img.char.palace.portrait_zheng',
    portraitChu: 'img.char.palace.portrait_chu',
  },
  sfx: {
    ambience: 'audio.sfx.palace.ambience',
    step: 'audio.sfx.palace.step',
    kneel: 'audio.sfx.palace.kneel',
    crack: 'audio.sfx.palace.crack',
    servo: 'audio.sfx.palace.servo',
    stamp: 'audio.sfx.palace.stamp',
    led: 'audio.sfx.palace.led',
    rumble: 'audio.sfx.palace.rumble',
    whoosh: 'audio.sfx.palace.whoosh',
    heartbeat: 'audio.sfx.palace.heartbeat',
    knock: 'audio.sfx.palace.knock',
    cloth: 'audio.sfx.palace.cloth',
    blade: 'audio.sfx.palace.blade',
    gasp: 'audio.sfx.palace.gasp',
  },
  walk: {
    zheng_down: 'img.char.palace.walk.zheng_down',
    zheng_up: 'img.char.palace.walk.zheng_up',
    zheng_left: 'img.char.palace.walk.zheng_left',
    zheng_right: 'img.char.palace.walk.zheng_right',
    zheng_down_left: 'img.char.palace.walk.zheng_down_left',
    zheng_down_right: 'img.char.palace.walk.zheng_down_right',
    zheng_up_left: 'img.char.palace.walk.zheng_up_left',
    zheng_up_right: 'img.char.palace.walk.zheng_up_right',
    chu_down: 'img.char.palace.walk.chu_down',
    chu_up: 'img.char.palace.walk.chu_up',
    chu_left: 'img.char.palace.walk.chu_left',
    chu_right: 'img.char.palace.walk.chu_right',
    chu_down_left: 'img.char.palace.walk.chu_down_left',
    chu_down_right: 'img.char.palace.walk.chu_down_right',
    chu_up_left: 'img.char.palace.walk.chu_up_left',
    chu_up_right: 'img.char.palace.walk.chu_up_right',
  },
} as const;

export const CH01_ASSET_KEYS = {
  /** 剧情视频（bundle `cutscene.ch01phone`）。 */
  video: {
    phone: 'video.ch01.phone',
  },
  map: {
    dormRoom: 'img.map.ch01.dorm_room',
    dormRoomQ: 'img.map.ch01.dorm_q',
    bedZheng: 'img.map.ch01.bed_zheng',
    chair: 'img.map.ch01.chair',
  },
  characters: {
    zhouDown: 'img.char.ch01.zhou_down',
    zhouUp: 'img.char.ch01.zhou_up',
    zhouLeft: 'img.char.ch01.zhou_left',
    zhouRight: 'img.char.ch01.zhou_right',
    zhouWalkDown: 'img.char.ch01.zhou_walk_down',
    zhouWalkUp: 'img.char.ch01.zhou_walk_up',
    zhouWalkLeft: 'img.char.ch01.zhou_walk_left',
    zhouWalkRight: 'img.char.ch01.zhou_walk_right',
    zhouQDown: 'img.char.ch01.q.down',
    zhouQUp: 'img.char.ch01.q.up',
    zhouQLeft: 'img.char.ch01.q.left',
    zhouQRight: 'img.char.ch01.q.right',
    zhouQWalkDown: 'img.char.ch01.q.walk_down',
    zhouQWalkUp: 'img.char.ch01.q.walk_up',
    zhouQWalkLeft: 'img.char.ch01.q.walk_left',
    zhouQWalkRight: 'img.char.ch01.q.walk_right',
    zhouQDownLeft: 'img.char.ch01.q.down_left',
    zhouQDownRight: 'img.char.ch01.q.down_right',
    zhouQUpLeft: 'img.char.ch01.q.up_left',
    zhouQUpRight: 'img.char.ch01.q.up_right',
    zhouQWalkDownLeft: 'img.char.ch01.q.walk_down_left',
    zhouQWalkDownRight: 'img.char.ch01.q.walk_down_right',
    zhouQWalkUpLeft: 'img.char.ch01.q.walk_up_left',
    zhouQWalkUpRight: 'img.char.ch01.q.walk_up_right',
    xiaobai: 'img.char.ch01.xiaobai',
    zhouSit: 'img.char.ch01.zhou_sit',
    zheng: 'img.char.ch01.zheng',
    miner: 'img.char.ch01.miner',
  },
  cg: {
    phone: 'img.cg.ch01.phone',
    xiaobai: 'img.cg.ch01.xiaobai',
    wake: 'img.cg.ch01.wake',
    news: 'img.cg.ch01.news',
  },
  battle: {
    /** 战斗专用舞台图（720×1280）：聚光、前景台阶、暗角，不是宫殿全景。 */
    minerHall: 'img.battle.ch01.miner_hall',
  },
  audio: {
    dormBgm: 'audio.bgm.ch01_dorm',
    dreamBgm: 'audio.bgm.ch01_dream',
    crisisBgm: 'audio.bgm.ch01_crisis',
    punch: 'audio.sfx.ch01_punch',
    metal: 'audio.sfx.ch01_metal',
    phone: 'audio.sfx.ch01_phone',
    snore: 'audio.sfx.ch01_snore',
    /** 寝室午后环境音（蝉鸣/操场/吊扇）；循环，音量压得很低。 */
    ambienceDay: 'audio.sfx.ch01_ambience_day',
    /** 木地板脚步 A/B，交替播放避免机械感。 */
    stepWoodA: 'audio.sfx.ch01_step_wood_a',
    stepWoodB: 'audio.sfx.ch01_step_wood_b',
    /** 章节卡/结束卡钟声。 */
    chapterChime: 'audio.sfx.ch01_chapter_chime',
  },
} as const;

export const CH01_STATIC_SPRITES = {
  down: CH01_ASSET_KEYS.characters.zhouDown,
  up: CH01_ASSET_KEYS.characters.zhouUp,
  left: CH01_ASSET_KEYS.characters.zhouLeft,
  right: CH01_ASSET_KEYS.characters.zhouRight,
  // 旧版只有四向素材：斜向回退到主轴，Q 版用完整的八向表。
  downLeft: CH01_ASSET_KEYS.characters.zhouLeft,
  downRight: CH01_ASSET_KEYS.characters.zhouRight,
  upLeft: CH01_ASSET_KEYS.characters.zhouLeft,
  upRight: CH01_ASSET_KEYS.characters.zhouRight,
} as const;

export const CH01_WALK_SHEETS = {
  down: CH01_ASSET_KEYS.characters.zhouWalkDown,
  up: CH01_ASSET_KEYS.characters.zhouWalkUp,
  left: CH01_ASSET_KEYS.characters.zhouWalkLeft,
  right: CH01_ASSET_KEYS.characters.zhouWalkRight,
  downLeft: CH01_ASSET_KEYS.characters.zhouWalkLeft,
  downRight: CH01_ASSET_KEYS.characters.zhouWalkRight,
  upLeft: CH01_ASSET_KEYS.characters.zhouWalkLeft,
  upRight: CH01_ASSET_KEYS.characters.zhouWalkRight,
} as const;

export const CH01_WALK_FRAME_COUNT = 8;

export const CH01_Q_STATIC_SPRITES = {
  down: CH01_ASSET_KEYS.characters.zhouQDown,
  up: CH01_ASSET_KEYS.characters.zhouQUp,
  left: CH01_ASSET_KEYS.characters.zhouQLeft,
  right: CH01_ASSET_KEYS.characters.zhouQRight,
  downLeft: CH01_ASSET_KEYS.characters.zhouQDownLeft,
  downRight: CH01_ASSET_KEYS.characters.zhouQDownRight,
  upLeft: CH01_ASSET_KEYS.characters.zhouQUpLeft,
  upRight: CH01_ASSET_KEYS.characters.zhouQUpRight,
} as const;

export const CH01_Q_WALK_SHEETS = {
  down: CH01_ASSET_KEYS.characters.zhouQWalkDown,
  up: CH01_ASSET_KEYS.characters.zhouQWalkUp,
  left: CH01_ASSET_KEYS.characters.zhouQWalkLeft,
  right: CH01_ASSET_KEYS.characters.zhouQWalkRight,
  downLeft: CH01_ASSET_KEYS.characters.zhouQWalkDownLeft,
  downRight: CH01_ASSET_KEYS.characters.zhouQWalkDownRight,
  upLeft: CH01_ASSET_KEYS.characters.zhouQWalkUpLeft,
  upRight: CH01_ASSET_KEYS.characters.zhouQWalkUpRight,
} as const;

export const CH01_Q_FRAME = { width: 160, height: 400 } as const;

/** Q 版行走 sheet 的帧数：`tools/make-ch01-q-walk20.py` 由 8 帧插值成 20 帧。 */
export const CH01_Q_WALK_FRAME_COUNT = 20;


/** 第一章第二节（御膳房）P2 资源；地图先进，角色/UI/音效随后补。 */
export const CH01_KITCHEN_ASSET_KEYS = {
  map: {
    kitchen: 'img.map.ch01.kitchen',
  },
  ui: {
    eye: 'img.ui.ch01.kitchen.eye',
    dagger: 'img.ui.ch01.kitchen.dagger',
    footprints: 'img.ui.ch01.kitchen.footprints',
    screen: 'img.ui.ch01.kitchen.screen',
    alert: 'img.ui.ch01.kitchen.alert',
    reply: 'img.ui.ch01.kitchen.reply',
  },
  audio: {
    ambience: 'audio.ch01.kitchen.ambience',
    stepA: 'audio.ch01.kitchen.step_a',
    stepB: 'audio.ch01.kitchen.step_b',
    alert: 'audio.ch01.kitchen.alert',
    backstab: 'audio.ch01.kitchen.backstab',
    door: 'audio.ch01.kitchen.door',
    transform: 'audio.ch01.kitchen.transform',
    heartbeat: 'audio.ch01.kitchen.heartbeat',
    latch: 'audio.ch01.kitchen.latch',
  },
} as const;

/** 御膳房角色八方向（游戏内方向名；snake 化后就是资源名后缀）。 */
export const KITCHEN_CAST_DIRS = [
  'down',
  'up',
  'left',
  'right',
  'downLeft',
  'downRight',
  'upLeft',
  'upRight',
] as const;

export type KitchenCastDir = (typeof KITCHEN_CAST_DIRS)[number];

export interface KitchenCastKeys {
  readonly still: Record<KitchenCastDir, string>;
  readonly walk: Record<KitchenCastDir, string>;
  /**
   * 每个方向静态图里的**实际身形高度**（帧内像素，帧高 400）。
   *
   * `make-static-sprite.py` 是「高 371 + 宽不超过 160」双约束，胖角色被宽度卡住，
   * 而且**卡多少按方向不同**（御厨 down 269、up_left 371，差 38%）。
   * 只用一个缩放值的话，怪物一转身就忽大忽小。所以按方向记实际高度、逐个反算缩放。
   */
  readonly heightByDir: Record<KitchenCastDir, number>;
  /** 代表比例（用 `down`），只给标签这类"不该随转身跳"的东西定位。 */
  readonly heightRatio: number;
  /**
   * 行走 sheet 每帧的实际身高（20 帧中位数）。
   *
   * 行走帧是从另一段视频抽的，姿态幅度更大、宽度更容易超帧，被压得比静态图更矮
   * （御厨 down：静态 269 → 行走 190）。不单独补偿的话，怪一迈步就变矮。
   */
  readonly walkHeightByDir: Record<KitchenCastDir, number>;
  /**
   * 贴图方向别名：某些角色的转圈视频整体镜像了，左/右两侧的图是对调的。
   * 这里把「逻辑方向 → 该用哪张图」的映射修回来，不动美术文件。
   */
  readonly dirAlias?: Partial<Record<KitchenCastDir, KitchenCastDir>>;
  /** 行走帧身高低于静态的这个比例 = 这张 sheet 抽坏了（角色走出画面），改用静态身高。 */
  readonly walkBrokenRatio: number;
}

const snakeDir = (dir: string): string => dir.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);

/**
 * 御膳房阵容（2026-11-01 重出）：老麦/老肯/御厨/太监/门卫 各一套八方向。
 * key 与 url 都由 slug + 方向生成，加角色只改 `KITCHEN_CAST_SLUGS`。
 */
function kitchenCast(
  slug: string,
  heights: readonly [number, number, number, number, number, number, number, number],
  walkHeights?: readonly [number, number, number, number, number, number, number, number],
  dirAlias?: Partial<Record<KitchenCastDir, KitchenCastDir>>,
): KitchenCastKeys {
  const still = {} as Record<KitchenCastDir, string>;
  const walk = {} as Record<KitchenCastDir, string>;
  for (const dir of KITCHEN_CAST_DIRS) {
    const suffix = snakeDir(dir);
    still[dir] = `img.char.ch01.kitchen.${slug}_${suffix}`;
    walk[dir] = `img.char.ch01.kitchen.${slug}_walk_${suffix}`;
  }
  const heightByDir = {} as Record<KitchenCastDir, number>;
  KITCHEN_CAST_DIRS.forEach((dir, index) => {
    heightByDir[dir] = heights[index] ?? 371;
  });
  const walkHeightByDir = {} as Record<KitchenCastDir, number>;
  KITCHEN_CAST_DIRS.forEach((dir, index) => {
    walkHeightByDir[dir] = walkHeights?.[index] ?? heightByDir[dir];
  });
  return {
    still,
    walk,
    heightByDir,
    heightRatio: (heightByDir.down ?? 371) / 371,
    walkHeightByDir,
    ...(dirAlias ? { dirAlias } : {}),
    walkBrokenRatio: 0.55,
  };
}

/** 让角色在屏幕上始终这么高（设计像素）。主角 371×0.6138 ≈ 228，NPC 高 4%。 */
const CAST_TARGET_FIGURE = 371 * 0.6138 * 1.04;

/** 逻辑方向 → 实际该用哪张图（镜像过的角色靠 `dirAlias` 换回来）。 */
export function castDir(cast: KitchenCastKeys, dir: KitchenCastDir): KitchenCastDir {
  return cast.dirAlias?.[dir] ?? dir;
}

/**
 * 某角色某方向的渲染缩放。
 *
 * - `walking=false`：按静态图身高补偿，转身不忽大忽小；
 * - `walking=true`：按行走帧身高补偿，迈步不变矮；
 * - 行走补偿封顶在静态缩放的 1.32 倍，串到坏帧也不会变巨人。
 */
export function castScale(cast: KitchenCastKeys, dir: KitchenCastDir, walking = false): number {
  const stillHeight = cast.heightByDir[dir] || 371;
  const stillScale = CAST_TARGET_FIGURE / stillHeight;
  if (!walking) return stillScale;
  const walkHeight = cast.walkHeightByDir[dir] || stillHeight;
  // sheet 抽坏的（角色走出画面 → 帧高异常小）就退回静态身高，别把人放大成巨人。
  if (walkHeight < stillHeight * cast.walkBrokenRatio) return stillScale;
  return CAST_TARGET_FIGURE / walkHeight;
}

// 顺序 = KITCHEN_CAST_DIRS：down, up, left, right, downLeft, downRight, upLeft, upRight
//
// 2026-11-01：帧宽从 160 放宽到 224，静态图不再被宽度卡矮（八向统一 371）；
// 行走 sheet 另外用 tools/normalize-walk-sheet.py 做过非等比归一化，
// 所以行走帧的高度≈371、宽高比也和静态图对齐了 —— 走路不再变矮、也不再变胖。
export const KITCHEN_CAST = {
  oldMai: kitchenCast(
    'old_mai',
    [371, 371, 371, 371, 371, 371, 371, 371],
    [371, 371, 371, 371, 371, 371, 371, 371],
  ),
  oldKen: kitchenCast(
    'old_ken',
    [371, 371, 371, 371, 371, 371, 371, 371],
    [371, 370, 371, 371, 371, 366, 371, 371],
  ),
  cook: kitchenCast(
    'cook',
    [371, 371, 371, 371, 371, 371, 371, 371],
    [371, 371, 371, 371, 371, 371, 371, 371],
  ),
  eunuch: kitchenCast(
    'eunuch',
    [371, 371, 371, 371, 371, 371, 371, 371],
    [371, 371, 371, 371, 371, 371, 370, 371],
  ),
  guard: kitchenCast(
    'guard',
    [371, 371, 371, 371, 371, 371, 371, 371],
    [371, 371, 371, 371, 371, 370, 371, 371],
  ),
} as const;

/** 角色基准缩放（主角同款）。实际缩放 = BASE / heightRatio，让 NPC 身高和主角齐平。 */
export const KITCHEN_CAST_BASE_SCALE = 0.6138;
/** NPC 比主角略高一点（都是成年人），1.04 ≈ 高 4%。 */
export const KITCHEN_CAST_ADULT_BIAS = 1.04;

export type KitchenCastId = keyof typeof KITCHEN_CAST;

export const CH01_KITCHEN_FRAME = { width: 224, height: 400 } as const;
export const CH01_KITCHEN_WALK_FRAME_COUNT = 20;
