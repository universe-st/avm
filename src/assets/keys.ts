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
    /**
     * 小白：白色小精灵（娃娃脸光团 + 兜帽 + 羽翼 + 胸口蓝核）半身立绘。
     *
     * 720×900 RGBA、透明底，和 `portrait_zheng` / `portrait_chu` 同一套画风与构图
     * （`portraitMetrics()` 按 720:900 定显示尺寸，换图不用改代码）。
     * 用在金殿「心防出现剧烈震荡」与收尾「建议：先活下来。」两句。
     */
    portraitXiaobai: 'img.char.palace.portrait_xiaobai',
    /**
     * 周全被太监按跪在地上、脸被迫上仰时的慌张头部特写（720×900 RGBA、透明底）。
     *
     * 台词「（……你不是罪该万死吗，饶什么命啊？）」到「疯了吧你？！……」共用这张，
     * 震屏前 `portraitHide`。**不要**拿 200×420 的角色贴图放大充数（会糊）。
     */
    portraitZhouPanic: 'img.char.palace.portrait_zhou_panic',
    /**
     * 殿前侍卫应命「是！」的半身立绘（720×900 RGBA、透明底）。
     *
     * 就是画面上那两个蓝袍壮汉（`eunuch_down` 那张 200×420 精灵，后文裂皮的「太监」同一对），
     * 以精灵图为身份基准生成，画风照 `portrait_zheng` / `portrait_chu`。
     * 只在「郑卿喝令拖出午门 → 侍卫：是！」这一拍出场，说完立刻 `portraitHide`。
     */
    portraitShiwei: 'img.char.palace.portrait_shiwei',
    /**
     * 矿工（裂皮后的铁皮骨架）半身立绘（720×900 RGBA、透明底）。
     *
     * 以 `miner.png` 精灵图为身份基准生成：圆盔头、猩红怒目、蓝色关节环/核心、带锈深灰铁皮。
     * 台词「入侵单元确认！执行矿场清除协议！」按 `PALACE_SPEAKER_PORTRAIT` 自动上脸（左侧）。
     * 2026-11-18 前它没有立绘、开口留空；补图后与侍卫同一套对位管线。
     */
    portraitMiner: 'img.char.palace.portrait_miner',
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
    /**
     * 坐在地上、面朝右的正式素材（t28 生成，`tools/make-zhou-sit-standup.py`）。
     *
     * 160×400 画布、人物高 160 / 底边 394 / 水平中心 80，**按 scale 1.0 显示**
     * （与站立帧 371×0.6138≈228 同一屏显比例：坐着本来就矮）。场景通过
     * `resolveSittingKey()` 探测，缺图时回退 `zhou_sit` → Q 版朝右，绝不白屏。
     */
    zhouSitRight: 'img.char.ch01.zhou_sit_right',
    /**
     * 坐地起身序列 `zhou_stand_up`（t28 生成正式图）。
     *
     * 约定：横排 strip，8 帧 × 160×400 = 1280×400（脚底在 y≈394），65ms/帧。
     * `CH01_ZHOU_STAND_UP` 里有帧数/帧尺寸/帧时长/显示缩放；**按 displayScale 1.0 播**，
     * 和坐姿图同一套画布，别再乘 PLAYER_SCALE。
     * 白盒阶段 bundle 里曾指向 `zhou_sit.png` 占位（尺寸对不上 → 场景判定为不可用）；
     * 正式图已就位，只改了 `bundles.ts` 的 url，场景代码不用动。
     */
    zhouStandUp: 'img.char.ch01.zhou_stand_up',
    /**
     * 正侧面站立 idle（t39 生成，`tools/make-zhou-idle-right.py`）。
     *
     * 160×400 画布、人物高 371 / 底边 394 / 水平中心 80 —— 与 `CH01_ZHOU_STAND_FRAME`
     * **完全同一套画布基准**（所以显示缩放也取同一个 `displayScale` 0.6138），区别只在朝向：
     * `q/zhou_q_right.png` 是 3/4 朝镜头，这张是**正侧面朝右**，和 `zhou_stand_up`
     * 末帧同角度。起身演完直接硬切这张（t41 已接线到 `ch01-dorm-scene` 的 `settleToIdle`），
     * 不再需要 110ms 的「转身」交叉淡入。只在「起身后、玩家还没动」这段生效。
     */
    zhouIdleRight: 'img.char.ch01.zhou_idle_right',
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
    /** 金殿过场专用：《小皇帝的早朝》（诙谐宫廷古风），裂皮翻脸那一下硬切回《清除协议》。 */
    palaceBgm: 'audio.bgm.ch01_palace',
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
    /** 头顶表情气泡「啵」地冒出来（t61；六情绪共用一条，靠 rate 微变区分）。 */
    bubblePop: 'audio.sfx.ch01_bubble_pop',
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

/**
 * 坐地起身序列的帧元数据（t28）。
 *
 * 画布 160×400 / 帧宽 160 / 8 帧 = 1280 宽（< 4096 真机纹理上限）。
 * **displayScale = 1.0**：这张 sheet 和 `zhou_sit_right` 同一套画布与缩放，
 * 第 1 帧与坐姿图逐像素对齐（高 160），最后一帧屏显高 228 = 站立帧 371×0.6138，
 * 起身演完可以无缝切回站立贴图。乘 0.6138 会让人站起来时突然缩成一小只。
 */
export const CH01_ZHOU_STAND_UP = {
  key: CH01_ASSET_KEYS.characters.zhouStandUp,
  frameCount: 8,
  frameWidth: 160,
  frameHeight: 400,
  frameMs: 65,
  displayScale: 1,
} as const;

/** 坐地朝右静帧的显示元数据：底边/中心与站立帧同基准，缩放 1.0。 */
export const CH01_ZHOU_SIT_RIGHT = {
  key: CH01_ASSET_KEYS.characters.zhouSitRight,
  displayScale: 1,
  canvasWidth: 160,
  canvasHeight: 400,
  height: 160,
  /** 人物最后一排不透明像素的**边界**（y=393 的下一行），原点 394/400 = 0.985。 */
  bottom: 394,
  centerX: 80,
} as const;

/**
 * 站立静态 Q 版帧的几何元数据（`zhou_q_*.png` 实测）。
 *
 * 160×400 画布、人物高 371 / 底边 394 / 水平中心 80——和坐姿图、起身序列**同一套画布基准**。
 * `displayScale` 就是场景里的 `PLAYER_SCALE`（0.682 × 0.9）：371 × 0.6138 ≈ 228，
 * 正好等于起身序列末帧的屏显高，起身演完切回站立不会跳大小。
 *
 * 三者关系（底边都是 394，绝不各自为政）：
 * - 坐姿 `CH01_ZHOU_SIT_RIGHT`：人物高 160，scale 1.0 → 屏显 160；
 * - 起身 `CH01_ZHOU_STAND_UP`：首帧 160 → 末帧 228，scale 1.0；
 * - 站立 `CH01_ZHOU_STAND_FRAME`：人物高 371，scale 0.6138 → 屏显 228。
 */
export const CH01_ZHOU_STAND_FRAME = {
  canvasWidth: 160,
  canvasHeight: 400,
  height: 371,
  bottom: 394,
  centerX: 80,
  displayScale: 0.6138,
} as const;


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
    [371, 371, 339, 371, 371, 371, 371, 346],
  ),
  oldKen: kitchenCast(
    'old_ken',
    [371, 371, 371, 371, 371, 371, 371, 371],
    [320, 291, 321, 371, 306, 281, 371, 309],
  ),
  cook: kitchenCast(
    'cook',
    [371, 371, 371, 371, 371, 371, 371, 371],
    [302, 299, 371, 371, 302, 303, 371, 325],
  ),
  eunuch: kitchenCast(
    'eunuch',
    [371, 371, 371, 371, 371, 371, 371, 371],
    [371, 371, 371, 371, 371, 371, 371, 371],
  ),
  guard: kitchenCast(
    'guard',
    [371, 371, 371, 371, 371, 371, 371, 371],
    [337, 301, 371, 371, 317, 371, 359, 337],
  ),
} as const;

/** 角色基准缩放（主角同款）。实际缩放 = BASE / heightRatio，让 NPC 身高和主角齐平。 */
export const KITCHEN_CAST_BASE_SCALE = 0.6138;
/** NPC 比主角略高一点（都是成年人），1.04 ≈ 高 4%。 */
export const KITCHEN_CAST_ADULT_BIAS = 1.04;

export type KitchenCastId = keyof typeof KITCHEN_CAST;

/**
 * 行走 sheet 的单帧尺寸。
 *
 * **宽不能随便加**：20 帧并排，整张纹理宽度 = 20 × width，必须 < GPU 的 `MAX_TEXTURE_SIZE`
 * （手机常见上限 4096）。224 时整张 4480，真机上纹理创建失败 → 角色渲染成一块纯黑矩形；
 * 桌面 GPU 上限 16384 所以本地看不出来。192 → 3840，留了余量。
 */
export const CH01_KITCHEN_FRAME = { width: 192, height: 400 } as const;
export const CH01_KITCHEN_WALK_FRAME_COUNT = 20;
