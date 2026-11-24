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
  portraitXiaobai: PALACE_ASSET_KEYS.characters.portraitXiaobai,
  portraitZhouPanic: PALACE_ASSET_KEYS.characters.portraitZhouPanic,
  portraitShiwei: PALACE_ASSET_KEYS.characters.portraitShiwei,
  portraitMiner: PALACE_ASSET_KEYS.characters.portraitMiner,
} as const;

/**
 * 金殿这段里小白的显示名。
 *
 * 时间点在「寝室里揭开名字」之前，所以不能写「小白」（会剧透），也不能再写「？？？」——
 * 名字一旦在别处揭示过，后面还冒「？？？」就前后不一致。这里用一句完整的描述当名号。
 * 语义色／逐字音只认 `role: 'xiaobai'`（见 `speakerTone()` / `typeVoiceForSpeaker()`），
 * 所以**改名不用动声线与配色**。
 */
export const XIAOBAI_SPEAKER = '莫名其妙出现的白色小精灵';

/**
 * 金殿立绘与说话人的对位表（唯一真值）。
 *
 * 2026-11-18 用户反馈「这里说话人和贴图没对应」之后的契约：
 *
 * - **谁开口，屏幕上就只能是那个人的立绘**；`side` 只是默认站位（贴左 / 贴右），
 *   场景里显式的 `portrait` act 只用来提前入画、改站位或收脸。
 * - **旁白不在这张表里**：旁白不换脸，立绘停在上一位说话人身上（否则每句旁白都闪一下）。
 * - `null` = 这个角色没有半身立绘，开口时把上一张收掉，**不许让上一张脸冒充他**
 *   （矿工 2026-11-18 起有 `portrait_miner` 了；这张表的 null 语义保留给以后的新角色）。
 *
 * 场景在每句台词开口前调用 `reducePortraitForSay()` 归约，所以就算数据里漏写换立绘，
 * 也不会再串脸；护栏见 `test/palace-portrait-speaker.test.ts`。
 */
export interface PalaceSpeakerPortrait {
  readonly key: string;
  readonly side: 'left' | 'right';
}

export const PALACE_SPEAKER_PORTRAIT: Readonly<Record<string, PalaceSpeakerPortrait | null>> = {
  周全: { key: PALACE_TEXTURES.portraitZhouPanic, side: 'left' },
  郑卿: { key: PALACE_TEXTURES.portraitZheng, side: 'right' },
  楚公公: { key: PALACE_TEXTURES.portraitChu, side: 'left' },
  侍卫: { key: PALACE_TEXTURES.portraitShiwei, side: 'left' },
  // 殿前那两个蓝袍壮汉＝后文裂皮的「太监」，共用一张立绘（见 keys.ts 的注释）。
  太监: { key: PALACE_TEXTURES.portraitShiwei, side: 'left' },
  [XIAOBAI_SPEAKER]: { key: PALACE_TEXTURES.portraitXiaobai, side: 'right' },
  // 裂皮之后的矿工（铁皮骨架）：以 miner.png 为身份基准的半身立绘（2026-11-18 补图）。
  矿工: { key: PALACE_TEXTURES.portraitMiner, side: 'left' },
};

/** 一句台词对应立绘该怎么处理；场景与单测共用这一个归约，不存在第二套判定。 */
export type PalacePortraitStep =
  | { readonly action: 'keep' }
  | { readonly action: 'show'; readonly key: string; readonly side: 'left' | 'right' }
  | { readonly action: 'hide' };

/** 查表：`undefined` = 旁白 / 未登记（保持现状），`null` = 明确无立绘。 */
export function palacePortraitForSpeaker(
  speaker: string | undefined,
): PalaceSpeakerPortrait | null | undefined {
  if (!speaker) return undefined;
  if (!Object.prototype.hasOwnProperty.call(PALACE_SPEAKER_PORTRAIT, speaker)) return undefined;
  return PALACE_SPEAKER_PORTRAIT[speaker];
}

/**
 * 台词开口前，把当前立绘对齐到说话人。
 *
 * - 同一个人已经在场 → `keep`：保留显式 act 定好的站位，不要每句都从画面边上滑回来；
 * - 换人 → `show` 该角色的立绘与默认站位；
 * - 说话人明确没有立绘 → `hide`，宁可空着也不挂别人的脸。
 */
export function reducePortraitForSay(
  speaker: string | undefined,
  current: { readonly key: string } | null,
): PalacePortraitStep {
  const entry = palacePortraitForSpeaker(speaker);
  if (entry === undefined) return { action: 'keep' };
  if (entry === null) return current ? { action: 'hide' } : { action: 'keep' };
  if (current?.key === entry.key) return { action: 'keep' };
  return { action: 'show', key: entry.key, side: entry.side };
}

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
      // 只敲一记心跳，不 loop：旧版从这里起了一条 3 秒循环、一直响到进战斗，
      // 手机上听着就是「隔一秒一记闷响」，还盖住了本该有的 BGM。
      // 循环心跳留给裂皮那一刻（见下面 `crack` 那一拍）。
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.heartbeat, volume: 0.35 },
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
  // 楚公公的立绘在「有刺客！护驾！！」那句就挂上了（见 `PALACE_SPEAKER_PORTRAIT`），
  // 这里不再补一拍 `portrait`：上一版就是在这里挂楚公公、紧接着周全开口，
  // 于是「周全」的名字配着楚老师的脸。立绘对位统一走 `reducePortraitForSay()`。
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
      // 走位结束会回落到「朝下」的静态图（`down` 是朝镜头），所以这里显式换成**朝左**的贴图，
      // 让郑卿转过身去看向跪在殿下的周全。**不要用 `faceLeft`**：那只是 `flipX`，
      // 把一张正面图翻过来仍然是正面，看不出朝向。
      { kind: 'texture', actor: 'zheng', texture: PALACE_TEXTURES.zhengLeft },
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
    // 周全被两个蓝袍壮汉（殿前侍卫，后文裂皮的「太监」是同一对）按在地板上、抬不起头：
    // 先给「被按跪、脸被压得微微上仰」的慌张特写，接他心里的那两句吐槽
    // （括号＝心里话，和寝室开场独白同一套写法）。@see docs/STORY-BIBLE.md
    kind: 'act',
    actions: [
      { kind: 'portraitHide' },
      { kind: 'portrait', key: PALACE_TEXTURES.portraitZhouPanic, side: 'left' },
    ],
    ms: 240,
  },
  { kind: 'say', speaker: '周全', text: '（……你不是罪该万死吗，饶什么命啊？）' },
  { kind: 'say', speaker: '周全', text: '（……不对不对，是吐槽这个的时候吗？）' },
  // 从「心里吐槽」转成「当面喊」：立绘不换，还是那张被按着抬头的脸。
  { kind: 'say', speaker: '周全', text: '老郑！你到底什么情况？！' },
  {
    // 郑卿接话：他还没认出这是自己的死党，只觉得一个刺客在跟他攀交情。
    // 换立绘（不是换贴图）：周全的脸收掉，换成右侧的郑卿，镜头再推近一点压住对话。
    kind: 'act',
    actions: [
      { kind: 'portraitHide' },
      { kind: 'portrait', key: PALACE_TEXTURES.portraitZheng, side: 'right' },
      { kind: 'camera', zoom: 1.14, ms: 420 },
    ],
    ms: 260,
  },
  { kind: 'say', speaker: '郑卿', text: '你这刺客，好大的胆子！竟敢跟朕称兄道弟起来了？' },
  { kind: 'say', speaker: '周全', text: '谁和你称兄道弟了？你想当我儿子我还不乐意呢！' },
  {
    // 周全顶完嘴把镜头交回郑卿：下一句旁白要「看到青筋」、气泡也挂在他头上，
    // 所以先换回他的脸，别让周全的慌张特写一直挂到郑卿开口（上一版就是这样串的脸）。
    kind: 'act',
    actions: [{ kind: 'portrait', key: PALACE_TEXTURES.portraitZheng, side: 'right' }],
    ms: 240,
  },
  { kind: 'say', speaker: '旁白', text: '你看到郑卿脸上青筋暴起。' },
  {
    // 旁白说完才冒气泡：先看见青筋、再听见他发火，因果顺序不能倒。
    // 气泡挂在**世界层里的郑卿头上**（见 `ch01-palace-scene.ts` 的 `showEmotionBubble`）。
    kind: 'act',
    actions: [{ kind: 'emotion', by: 'zheng', emotion: 'angry' }],
    ms: 420,
  },
  { kind: 'say', speaker: '郑卿', text: '……哼，真是不知天高地厚！拖出午门，砍了吧！' },
  {
    // 侍卫应命：殿前那两个蓝袍壮汉（后文裂皮时说的「太监」是同一对）有自己的立绘。
    kind: 'act',
    actions: [
      { kind: 'portraitHide' },
      { kind: 'portrait', key: PALACE_TEXTURES.portraitShiwei, side: 'left' },
    ],
    ms: 240,
  },
  { kind: 'say', speaker: '侍卫', text: '是！' },
  // 「是！」说完立刻收脸：下一句旁白要回到「被两边架住往外拖」的画面。
  { kind: 'act', actions: [{ kind: 'portraitHide' }], ms: 200 },
  { kind: 'say', speaker: '旁白', text: '你只感觉边上两个侍卫狠狠拉扯你的双臂，就要把你拽出去。' },
  {
    // 周全的震惊气泡在旁白之后、他爆发之前。同上，挂在世界层的角色头上。
    kind: 'act',
    actions: [{ kind: 'emotion', by: 'zhou', emotion: 'surprised' }],
    ms: 420,
  },
  {
    // 换回开头那张「被按跪的慌张特写」，接他最后的爆发（和第一张同一张图，不另做一张）。
    kind: 'act',
    actions: [{ kind: 'portrait', key: PALACE_TEXTURES.portraitZhouPanic, side: 'left' }],
    ms: 240,
  },
  { kind: 'say', speaker: '周全', text: '疯了吧你？！你在这儿玩什么cosplay！你爸知道你这么牛x吗？' },
  {
    kind: 'act',
    actions: [
      // 大殿晃起来之前先把脸收掉：震屏时屏幕上不该还贴着一张立绘。
      { kind: 'portraitHide' },
      { kind: 'fx', fx: 'rumble' },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.rumble, volume: 0.9 },
    ],
    ms: 900,
  },
  {
    // 紧接上一句「你爸知道你这么牛x吗？」——中间不再插任何台词，震完就是这句旁白。
    kind: 'say',
    speaker: '旁白',
    text: '轰隆——整座大殿像地震一样剧烈一晃，龙椅上的皇帝瞬间石化，脸上那丝满足的笑僵住了。',
  },
  {
    // 小白这句是「画外」插话：立绘在台词前出现、说完就收，别让它一直挂在屏幕上。
    kind: 'act',
    actions: [{ kind: 'portrait', key: PALACE_TEXTURES.portraitXiaobai, side: 'right' }],
    ms: 220,
  },
  {
    kind: 'say',
    speaker: XIAOBAI_SPEAKER,
    role: 'xiaobai',
    text: '心防出现剧烈震荡，目标精神屏障异常薄弱。',
  },
  { kind: 'act', actions: [{ kind: 'portraitHide' }], ms: 200 },
  {
    kind: 'say',
    speaker: '旁白',
    text: '按住你的一个太监猛地一声暴喝，单手把你像麻袋一样抡了起来。',
  },
  { kind: 'say', speaker: '太监', text: '呔！大胆贼子！纳命来！' },
  {
    kind: 'act',
    actions: [
      // 太监的立绘由台词对位表自动挂上（`PALACE_SPEAKER_PORTRAIT`）；摔人这一拍把它收掉，
      // 后面「抬头看去，瞳孔骤然收缩」是全景，不该还贴着一张脸。
      { kind: 'portraitHide' },
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
      // 喜剧收工、恐怖接手：这里必须**硬切**（不淡出），切点就落在裂皮那一帧。
      { kind: 'bgm', id: 'ch01Dream', hard: true },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.heartbeat, volume: 0.5 },
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
  // 原寝室 `dream` 节点的收尾台词，金殿接管后挪到这里，避免丢掉小白这句吐槽。
  {
    // 同一张小白立绘再用一次：全段只有它两次开口，贴图保持一致玩家才认得出是同一个人。
    kind: 'act',
    actions: [{ kind: 'portrait', key: PALACE_TEXTURES.portraitXiaobai, side: 'right' }],
    ms: 180,
  },
  {
    kind: 'say',
    speaker: XIAOBAI_SPEAKER,
    role: 'xiaobai',
    text: '建议：躲避攻击，保留体力。',
  },
  {
    kind: 'act',
    actions: [
      // 进战斗前收掉立绘，免得切场时还残留一张。
      { kind: 'portraitHide' },
      { kind: 'fx', fx: 'shake' },
      { kind: 'camera', zoom: 1.05, ms: 900 },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.blade, volume: 0.6 },
      { kind: 'sfx', key: PALACE_ASSET_KEYS.sfx.servo, volume: 0.7 },
    ],
    ms: 640,
  },
];
