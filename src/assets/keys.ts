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
export const CH01_ASSET_KEYS = {
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
  },
  battle: {
    dreamHall: 'img.battle.ch01.dream_hall',
  },
  audio: {
    dormBgm: 'audio.bgm.ch01_dorm',
    dreamBgm: 'audio.bgm.ch01_dream',
    punch: 'audio.sfx.ch01_punch',
    metal: 'audio.sfx.ch01_metal',
    phone: 'audio.sfx.ch01_phone',
    snore: 'audio.sfx.ch01_snore',
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
