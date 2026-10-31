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
    dreamHall: 'img.battle.ch01.dream_hall',
    /** 战斗专用舞台图（720×1280）：聚光、前景台阶、暗角，不是宫殿全景。 */
    minerHall: 'img.battle.ch01.miner_hall',
    /** 梦域金殿地图：过场场景与战斗共用素材源。 */
    palaceHall: 'img.map.palace.hall',
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
