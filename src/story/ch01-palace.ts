/**
 * 第一章 · 梦域金殿：殿上过场的剧本与调度数据。
 *
 * 场景只消费 `PALACE_BEATS`，不在这里写任何 Phaser 代码；坐标一律用**格**
 * （room 的 tile 坐标，原点在房间左上角），由场景换算成像素，
 * 这样以后改地图尺寸不用重排台词。
 *
 * 原文依据：`reference/刺客与矿工/第001章-天子.txt`、`第002章-小白.txt`。
 * 关键设定：楚老师 = 楚公公，梦主郑卿的潜意识把班主任投影成了太监总管。
 */

import { PALACE_ASSET_KEYS } from '../assets/keys';
import type { PalaceBeat } from './palace-player';

/** 角色的贴图 key（bundle `cutscene.ch01palace` 里注册）。 */
export const PALACE_TEXTURES = {
  zhouKneelUp: PALACE_ASSET_KEYS.characters.zhouKneelUp,
  zhouKneelDown: PALACE_ASSET_KEYS.characters.zhouKneelDown,
  zhengDown: PALACE_ASSET_KEYS.characters.zhengDown,
  zhengUp: PALACE_ASSET_KEYS.characters.zhengUp,
  zhengLeft: PALACE_ASSET_KEYS.characters.zhengLeft,
  zhengRight: PALACE_ASSET_KEYS.characters.zhengRight,
  chuDown: PALACE_ASSET_KEYS.characters.chuDown,
  chuLeft: PALACE_ASSET_KEYS.characters.chuLeft,
  chuRight: PALACE_ASSET_KEYS.characters.chuRight,
  chuUp: PALACE_ASSET_KEYS.characters.chuUp,
  chuKneel: PALACE_ASSET_KEYS.characters.chuKneel,
  eunuch: PALACE_ASSET_KEYS.characters.eunuch,
  eunuchCrack: PALACE_ASSET_KEYS.characters.eunuchCrack,
  miner: PALACE_ASSET_KEYS.characters.miner,
  portraitZheng: PALACE_ASSET_KEYS.characters.portraitZheng,
  portraitChu: PALACE_ASSET_KEYS.characters.portraitChu,
} as const;

/**
 * 行走 sheet（八方向，每个方向一张横条）。
 *
 * 帧数 16、单帧 200×420，和静态图同一基准（人物高 371、底边 400、中心 100）。
 * 只有郑卿和楚公公需要走位；太监是「扑上来」的一瞬间，用静态图 + 位移就够。
 */
export const PALACE_WALK = {
  frameCount: 16,
  frameWidth: 200,
  frameHeight: 420,
  zheng: {
    down: 'img.char.palace.walk.zheng_down',
    up: 'img.char.palace.walk.zheng_up',
    left: 'img.char.palace.walk.zheng_left',
    right: 'img.char.palace.walk.zheng_right',
    down_left: 'img.char.palace.walk.zheng_down_left',
    down_right: 'img.char.palace.walk.zheng_down_right',
    up_left: 'img.char.palace.walk.zheng_up_left',
    up_right: 'img.char.palace.walk.zheng_up_right',
  },
  chu: {
    down: 'img.char.palace.walk.chu_down',
    up: 'img.char.palace.walk.chu_up',
    left: 'img.char.palace.walk.chu_left',
    right: 'img.char.palace.walk.chu_right',
    down_left: 'img.char.palace.walk.chu_down_left',
    down_right: 'img.char.palace.walk.chu_down_right',
    up_left: 'img.char.palace.walk.chu_up_left',
    up_right: 'img.char.palace.walk.chu_up_right',
  },
} as const;

export type PalaceDir =
  | 'down'
  | 'up'
  | 'left'
  | 'right'
  | 'down_left'
  | 'down_right'
  | 'up_left'
  | 'up_right';

/** 按位移方向挑一个八方向 key：屏幕坐标里 +y 是向下（朝镜头）。 */
export function palaceDirOf(dx: number, dy: number): PalaceDir {
  const angle = Math.atan2(dy, dx); // 0 = 右，+PI/2 = 下
  const index = Math.round(angle / (Math.PI / 4)) & 7;
  const dirs = ['right', 'down_right', 'down', 'down_left', 'left', 'up_left', 'up', 'up_right'] as const;
  return dirs[index] ?? 'down';
}

/** 静态图按方向取哪张（走完停下要回到对应的朝向）。 */
export function palaceStaticOf(dir: PalaceDir): string {
  switch (dir) {
    case 'up':
      return PALACE_TEXTURES.zhengUp;
    case 'left':
      return PALACE_TEXTURES.zhengLeft;
    case 'right':
      return PALACE_TEXTURES.zhengRight;
    default:
      return PALACE_TEXTURES.zhengDown;
  }
}

/** 开场站位（格）。 */
export const PALACE_START = {
  zhou: { x: 12.4, y: 30.2 },
  zheng: { x: 16.5, y: 17.5 },
  chu: { x: 20.5, y: 18.5 },
  eunuchLeft: { x: 7.4, y: 29.4 },
  eunuchRight: { x: 25.0, y: 30.2 },
} as const;

/** 太监冲上来按住周全后的站位。 */
const PRESS_LEFT = { x: 9.6, y: 31.0 };
const PRESS_RIGHT = { x: 15.2, y: 31.2 };

export const PALACE_BEATS: readonly PalaceBeat[] = [
  {
    kind: 'act',
    actions: [
      { kind: 'fx', fx: 'flash' },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.ambience, volume: 0.35, loop: true },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.rumble, volume: 0.5 },
      { kind: 'camera', zoom: 0.94, ms: 900 },
      { kind: 'letterbox', on: true, ms: 420 },
    ],
    ms: 520,
  },
  { kind: 'say', speaker: '旁白', text: '白光褪去，你发现自己跪在冰冷光滑的地板上。' },
  {
    kind: 'say',
    speaker: '旁白',
    text: '雕梁画栋，金碧辉煌。四根粗大的红柱撑起大殿，光从雕花窗棂里斜进来。',
  },
  {
    kind: 'say',
    speaker: '旁白',
    text: '正前方，高高的金色龙椅上端坐一人——明黄五爪龙袍，垂珠冕旒。',
  },
  {
    kind: 'act',
    actions: [
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.heartbeat, volume: 0.45, loop: true },
      { kind: 'camera', zoom: 1.06, ms: 1100 },
      { kind: 'pan', dx: 0, dy: -60, ms: 1100 },
    ],
    ms: 1150,
  },
  { kind: 'say', speaker: '周全', text: '老郑？！……郑卿？！' },
  { kind: 'act', actions: [{ kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.gasp, volume: 0.6 }], ms: 0 },
  {
    kind: 'act',
    actions: [
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.whoosh, volume: 0.75 },
      { kind: 'speedlines', color: 'white', ms: 360 },
      { kind: 'camera', zoom: 1.12, ms: 520 },
      { kind: 'hitstop', ms: 80 },
      { kind: 'faceLeft', actor: 'eunuchRight' },
      { kind: 'move', actor: 'eunuchLeft', x: PRESS_LEFT.x, y: PRESS_LEFT.y, ms: 700 },
      { kind: 'move', actor: 'eunuchRight', x: PRESS_RIGHT.x, y: PRESS_RIGHT.y, ms: 700 },
    ],
    ms: 760,
  },
  {
    kind: 'act',
    actions: [
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.stamp, volume: 0.6 },
      { kind: 'stamp', text: '护驾！', tone: 'danger', ms: 900 },
      { kind: 'hitstop', ms: 70 },
    ],
    ms: 260,
  },
  { kind: 'say', speaker: '楚公公', text: '有刺客！护驾！！' },
  {
    kind: 'act',
    actions: [
      { kind: 'fx', fx: 'shake' },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.kneel, volume: 0.9 },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.cloth, volume: 0.5 },
    ],
    ms: 420,
  },
  {
    kind: 'say',
    speaker: '旁白',
    text: '几个穿着太监服饰、却肌肉虬结的大汉扑上来，把你死死按在地板上。',
  },
  {
    kind: 'say',
    speaker: '旁白',
    text: '脸贴着冰凉的地板，你拼命抬头——龙椅旁站着一个瘦高的身影，顶着标志性的黑眼圈。',
  },
  {
    kind: 'act',
    actions: [{ kind: 'portrait', key: PALACE_TEXTURES.portraitChu, side: 'left' }],
    ms: 220,
  },
  { kind: 'say', speaker: '周全', text: '楚……楚老师？！' },
  {
    kind: 'act',
    actions: [
      { kind: 'camera', zoom: 1.08, ms: 900 },
      { kind: 'move', actor: 'zheng', x: 18.6, y: 33.2, ms: 1900 },
    ],
    ms: 1960,
  },
  {
    kind: 'act',
    actions: [
      { kind: 'portrait', key: PALACE_TEXTURES.portraitZheng, side: 'right' },
      { kind: 'camera', zoom: 1.12, ms: 420 },
    ],
    ms: 240,
  },
  { kind: 'say', speaker: '郑卿', text: '哼。谁派你来的？' },
  {
    kind: 'say',
    speaker: '旁白',
    text: '小皇帝偏了偏头，眼里闪过一丝困惑，随即被怒火取代。',
  },
  {
    kind: 'say',
    speaker: '郑卿',
    text: '楚公公！朕让你加派人手，严防死守！你就是这么给朕当差的？你脖子上那颗脑袋，不想要了？！',
  },
  {
    kind: 'act',
    // 只走位，不在这里换贴图：换贴图会立刻打断行走动画（走完自动回到朝向对应的静态图）。
    actions: [{ kind: 'move', actor: 'chu', x: 21.6, y: 33.4, ms: 900 }],
    ms: 940,
  },
  {
    // 「噗通」——不给他走位的时间，直接砸下去：换跪姿 + 震一下 + 半步下沉
    kind: 'act',
    actions: [
      { kind: 'fx', fx: 'shake' },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.kneel, volume: 0.85 },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.knock, volume: 0.7 },
      { kind: 'stamp', text: '楚公公', tone: 'gold', ms: 1100 },
      { kind: 'hitstop', ms: 90 },
      { kind: 'texture', actor: 'chu', texture: PALACE_TEXTURES.chuKneel },
    ],
    ms: 520,
  },
  {
    kind: 'act',
    actions: [
      { kind: 'portraitHide' },
      { kind: 'portrait', key: PALACE_TEXTURES.portraitChu, side: 'right' },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.gasp, volume: 0.55 },
    ],
    ms: 320,
  },
  {
    kind: 'say',
    speaker: '楚公公',
    text: '陛下饶命！陛下饶命啊！臣罪该万死！求陛下开恩，饶了奴才这条贱命吧！',
  },
  {
    kind: 'say',
    speaker: '旁白',
    text: '罪该万死又要求饶命？你差点笑出声，可头顶泰山压顶一样的重量让你憋了回去。',
  },
  { kind: 'act', actions: [{ kind: 'portraitHide' }], ms: 220 },
  {
    kind: 'say',
    speaker: '周全',
    text: '郑！卿！快！醒！醒！你！爸！来！学！校！查！寝！了——！！！',
  },
  {
    kind: 'act',
    actions: [
      { kind: 'fx', fx: 'rumble' },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.rumble, volume: 0.9 },
    ],
    ms: 900,
  },
  {
    kind: 'say',
    speaker: '旁白',
    text: '轰隆——整座大殿像地震一样剧烈一晃，龙椅上的皇帝瞬间石化，脸上那丝满足的笑僵住了。',
  },
  {
    kind: 'say',
    speaker: '？？？',
    role: 'xiaobai',
    text: '心防出现剧烈震荡，目标精神屏障异常薄弱。',
  },
  {
    kind: 'say',
    speaker: '旁白',
    text: '按住你的一个太监猛地一声暴喝，单手把你像麻袋一样抡了起来。',
  },
  { kind: 'say', speaker: '太监', text: '呔！大胆贼子！纳命来！' },
  {
    kind: 'act',
    actions: [
      { kind: 'fx', fx: 'shake' },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.whoosh, volume: 0.9 },
      { kind: 'move', actor: 'zhou', x: 8.2, y: 35.2, ms: 260 },
    ],
    ms: 520,
  },
  {
    kind: 'say',
    speaker: '旁白',
    text: '你被摔得七荤八素，骨头像散了架。抬头看去，瞳孔骤然收缩——',
  },
  {
    kind: 'act',
    actions: [
      { kind: 'portraitHide' },
      { kind: 'fx', fx: 'flash' },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.crack, volume: 1.0 },
      { kind: 'camera', zoom: 1.2, ms: 260 },
      { kind: 'speedlines', color: 'red', ms: 480 },
      { kind: 'hitstop', ms: 110 },
      { kind: 'texture', actor: 'eunuchLeft', texture: PALACE_TEXTURES.eunuchCrack },
      { kind: 'texture', actor: 'eunuchRight', texture: PALACE_TEXTURES.eunuchCrack },
    ],
    ms: 900,
  },
  {
    kind: 'say',
    speaker: '旁白',
    text: '那几个太监的皮肉像劣质拉链一样「嗤啦」裂开、剥落，露出底下冰冷的金属骨架。',
  },
  {
    kind: 'act',
    actions: [
      { kind: 'fx', fx: 'flashRed' },
      { kind: 'camera', zoom: 1.25, ms: 420 },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.led, volume: 0.75 },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.servo, volume: 0.8 },
      { kind: 'texture', actor: 'eunuchLeft', texture: PALACE_TEXTURES.miner },
      { kind: 'texture', actor: 'eunuchRight', texture: PALACE_TEXTURES.miner },
    ],
    ms: 760,
  },
  {
    kind: 'say',
    speaker: '矿工',
    text: '入侵单元确认！执行矿场清除协议！',
  },
  {
    kind: 'act',
    actions: [
      { kind: 'fx', fx: 'shake' },
      { kind: 'camera', zoom: 1.05, ms: 900 },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.blade, volume: 0.6 },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.servo, volume: 0.7 },
    ],
    ms: 640,
  },
];
