/**
 * 金殿角色「脚底接触阴影」的对位表（纯数据 + 纯函数，不依赖 Phaser，可直接单测）。
 *
 * 为什么要有这张表：金殿里五个角色原先共用一条常量阴影 `ellipse(x, y + 3, 118, 24)`，
 * 但贴图并不共享同一个「脚底」——角色帧是 200×420，`setOrigin(0.5, 400/420)` 把落点
 * 钉在画布第 400 行，可**画出来的**底边各不相同：
 *
 *   - 站姿（zheng/chu/eunuch/miner…）：不透明像素一直画到第 399 行，落点几乎就在脚下；
 *   - 跪姿 zhou_kneel_up：只画到第 383 行（比落点高 17 画布 px = 8.5 设计 px），
 *     而他横着摊开的膝+小腿只有 52 设计 px 宽。
 *
 * 于是同一条 118×24 的阴影落到跪着的周全身上就变成「一大摊」：椭圆最黑的地方在他
 * 身体底下 10 多设计 px，左右各多出 30 多，眼睛读成「人悬在一摊影子上面」。
 *
 * 现在的做法：阴影参数**按贴图的 alpha 轮廓算**，不再一条常量打天下。
 * 数据由 `tools/measure-actor-footprint.py` 从 PNG 直接量出来（alpha ≥ 40 才算不透明，
 * 贴图最底下几行 alpha ≤ 32 的抗锯齿余烬不算，否则阴影会被它顶高、看起来仍悬空）：
 *
 *   python3 tools/measure-actor-footprint.py            # 人读的表
 *   python3 tools/measure-actor-footprint.py --json     # 机器读
 *
 * 换贴图后重跑工具，把 `contactBottomY / contactWidth / contactCenterX` 抄回下面这张表；
 * 抄漏或忘了更新，`test/palace-shadow.test.ts` 会现场重算像素轮廓并报红。
 *
 * 推导规则（都由表里的像素数字 + 下面的 STYLE 决定，没有逐个手调的数字）：
 *
 *   width   = max(minWidth, contactWidth × scale × widthFactor)
 *   height  = round(width × heightRatio)
 *   offsetX = (contactCenterX − 画布中线) × scale × (flipX ? −1 : 1)   ← 翻面时接触面会镜像
 *   offsetY = (contactBottomY − 脚底基准线) × scale − overlap + height / 2
 *
 * 即：阴影上边缘压在「贴图不透明底边」上方 overlap 设计像素处（跪姿 3px，站姿沿用既有的 8.5px），
 * 横向跟着真实接触面走。站姿的 118×24 / alpha 0.28 / y+3 由这套公式原样复现，观感不变。
 */

/** 角色帧画布尺寸（金殿所有人物贴图都是这张画布）。 */
export const PALACE_FRAME = { width: 200, height: 420 } as const;
/** `setOrigin(0.5, ACTOR_FOOT_RATIO)` 钉住的脚底基准行。 */
export const PALACE_FOOT_ANCHOR_Y = 400 as const;
/** `tools/measure-actor-footprint.py` 与测试共用的口径：alpha 低于这个值的像素不算数。 */
export const PALACE_ALPHA_CUTOFF = 40 as const;
/** 接触带：底边往上多少画布像素内取最宽的一行（膝+小腿 / 鞋+袍脚都在这个带里）。 */
export const PALACE_CONTACT_BAND = 24 as const;

/** 场景里 ACTOR_SCALE 的权威值：表里的接触面要乘它才换算成设计像素。 */
export const PALACE_ACTOR_SCALE = 0.5;

/** 跪姿 vs 站姿：接触面的形状不同，阴影该用的宽度/高度/透明度也不同。 */
export type PalacePose = 'stand' | 'kneel';

export interface PalaceFootprint {
  readonly pose: PalacePose;
  /** 贴图文件名，测试据此回读 PNG 像素。 */
  readonly file: string;
  /** 不透明像素的最低一行（画布 y，0 起）。 */
  readonly contactBottomY: number;
  /** 接触带里最宽一行的不透明像素跨度（画布 px）。 */
  readonly contactWidth: number;
  /** 同上那一行的水平中心（画布 x），跪姿/侧身会明显偏离画布中线 100。 */
  readonly contactCenterX: number;
}

const key = (file: string): string => `img.char.palace.${file.replace(/\.png$/, '')}`;

/** 一行一条：贴图 key → 从像素量出来的接触面。数据来自 `tools/measure-actor-footprint.py`。 */
const FOOTPRINT_ROWS: ReadonlyArray<readonly [string, PalaceFootprint]> = [
  [key('zhou_kneel_up.png'), { pose: 'kneel', file: 'zhou_kneel_up.png', contactBottomY: 383, contactWidth: 104, contactCenterX: 111.5 }],
  [key('zhou_kneel_down.png'), { pose: 'kneel', file: 'zhou_kneel_down.png', contactBottomY: 399, contactWidth: 108, contactCenterX: 99.5 }],
  [key('zheng_emperor_down.png'), { pose: 'stand', file: 'zheng_emperor_down.png', contactBottomY: 399, contactWidth: 115, contactCenterX: 100 }],
  [key('zheng_emperor_down_left.png'), { pose: 'stand', file: 'zheng_emperor_down_left.png', contactBottomY: 399, contactWidth: 121, contactCenterX: 101 }],
  [key('zheng_emperor_down_right.png'), { pose: 'stand', file: 'zheng_emperor_down_right.png', contactBottomY: 399, contactWidth: 116, contactCenterX: 105.5 }],
  [key('zheng_emperor_up.png'), { pose: 'stand', file: 'zheng_emperor_up.png', contactBottomY: 399, contactWidth: 125, contactCenterX: 102 }],
  [key('zheng_emperor_up_left.png'), { pose: 'stand', file: 'zheng_emperor_up_left.png', contactBottomY: 399, contactWidth: 103, contactCenterX: 97 }],
  [key('zheng_emperor_up_right.png'), { pose: 'stand', file: 'zheng_emperor_up_right.png', contactBottomY: 399, contactWidth: 99, contactCenterX: 107 }],
  [key('zheng_emperor_left.png'), { pose: 'stand', file: 'zheng_emperor_left.png', contactBottomY: 399, contactWidth: 97, contactCenterX: 99 }],
  [key('zheng_emperor_right.png'), { pose: 'stand', file: 'zheng_emperor_right.png', contactBottomY: 399, contactWidth: 99, contactCenterX: 105 }],
  [key('chu_gonggong_down.png'), { pose: 'stand', file: 'chu_gonggong_down.png', contactBottomY: 399, contactWidth: 85, contactCenterX: 89 }],
  [key('chu_gonggong_down_left.png'), { pose: 'stand', file: 'chu_gonggong_down_left.png', contactBottomY: 399, contactWidth: 85, contactCenterX: 89 }],
  [key('chu_gonggong_down_right.png'), { pose: 'stand', file: 'chu_gonggong_down_right.png', contactBottomY: 399, contactWidth: 85, contactCenterX: 110 }],
  [key('chu_gonggong_up.png'), { pose: 'stand', file: 'chu_gonggong_up.png', contactBottomY: 399, contactWidth: 70, contactCenterX: 114.5 }],
  [key('chu_gonggong_up_left.png'), { pose: 'stand', file: 'chu_gonggong_up_left.png', contactBottomY: 399, contactWidth: 67, contactCenterX: 110 }],
  [key('chu_gonggong_up_right.png'), { pose: 'stand', file: 'chu_gonggong_up_right.png', contactBottomY: 399, contactWidth: 67, contactCenterX: 89 }],
  [key('chu_gonggong_left.png'), { pose: 'stand', file: 'chu_gonggong_left.png', contactBottomY: 399, contactWidth: 54, contactCenterX: 121.5 }],
  [key('chu_gonggong_right.png'), { pose: 'stand', file: 'chu_gonggong_right.png', contactBottomY: 399, contactWidth: 54, contactCenterX: 77.5 }],
  [key('chu_gonggong_kneel.png'), { pose: 'kneel', file: 'chu_gonggong_kneel.png', contactBottomY: 399, contactWidth: 200, contactCenterX: 99.5 }],
  [key('eunuch_down.png'), { pose: 'stand', file: 'eunuch_down.png', contactBottomY: 399, contactWidth: 133, contactCenterX: 99 }],
  [key('eunuch_crack.png'), { pose: 'stand', file: 'eunuch_crack.png', contactBottomY: 399, contactWidth: 111, contactCenterX: 96 }],
  [key('miner.png'), { pose: 'stand', file: 'miner.png', contactBottomY: 399, contactWidth: 110, contactCenterX: 98.5 }],
];

export const PALACE_FOOTPRINTS: ReadonlyMap<string, PalaceFootprint> = new Map(FOOTPRINT_ROWS);

/**
 * 兜底：行走 sheet / 还没登记的贴图。走路的帧是站姿、和静态图同一套 rig，
 * 站立帧画到画布第 399 行（落点第 400 行），所以按这个底边算出来仍是既有的 y+3、118×24。
 */
const FALLBACK_FOOTPRINT: PalaceFootprint = {
  pose: 'stand',
  file: '',
  contactBottomY: PALACE_FOOT_ANCHOR_Y - 1,
  contactWidth: 0,
  contactCenterX: PALACE_FRAME.width / 2,
};

/** 同一条贴图的接触面；表里没有时返回 null（测试会拦住漏登记）。 */
export function palaceFootprintOf(textureKey: string): PalaceFootprint | null {
  return PALACE_FOOTPRINTS.get(textureKey) ?? null;
}

/** 每种姿态的阴影风格。数字含义见文件头推导规则。 */
export interface PalaceShadowStyle {
  /** 阴影宽度下限（设计 px）：小于它就没有「脚下有一摊」的体积感。 */
  readonly minWidth: number;
  /** width = 接触宽 × scale × widthFactor（≥ minWidth）；站姿 1 = 只在接触面更宽时才放宽。 */
  readonly widthFactor: number;
  /** height = width × heightRatio（扁椭圆）。 */
  readonly heightRatio: number;
  readonly alpha: number;
  /** 阴影上边缘压住「贴图不透明底边」多少设计 px。 */
  readonly overlap: number;
}

export const PALACE_SHADOW_STYLE: Readonly<Record<PalacePose, PalaceShadowStyle>> = {
  // 站姿：沿用金殿既有观感（118×24 / alpha 0.28 / 落点 +3），接触面特别宽的角色跟着放宽。
  stand: { minWidth: 118, widthFactor: 1, heightRatio: 24 / 118, alpha: 0.28, overlap: 8.5 },
  // 跪姿：膝+小腿摊在地上，接触面更宽更扁；阴影上移贴住膝盖，和下摆重叠 6px。
  // 为什么不写 3：椭圆上边缘是个尖，渲染后最上面 1–2px 覆盖率太低（alpha < 1/255）看不见，
  // 几何重叠 3px 时画面上只是「刚碰到」，缩放一取整就会露出一条缝。实测 6px 在 390 宽屏幕上
  // 还剩 2–3px 可见重叠（见 .evidence/docs/screenshots/palace-shadow/，本机取证，不入库）。
  kneel: { minWidth: 56, widthFactor: 1.4, heightRatio: 0.22, alpha: 0.3, overlap: 6 },
};

export interface PalaceShadowParams {
  /** 阴影椭圆宽/高（设计 px）。 */
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
  /** 相对角色落点（`toPixel()` 给的 x/y）的偏移，设计 px。 */
  readonly offsetX: number;
  readonly offsetY: number;
  /** 命中的接触面；null = 贴图没登记（走了站姿兜底）。 */
  readonly footprint: PalaceFootprint | null;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * 按贴图算阴影参数。
 *
 * @param textureKey 角色当前贴图 key（行走 sheet 这类没登记的贴图会走站姿兜底）。
 * @param opts.scale  场景的角色缩放（金殿 0.5）。
 * @param opts.flipX  角色是否 `setFlipX(true)`——翻转会把接触面镜像到另一侧。
 */
export function palaceShadowFor(
  textureKey: string,
  opts: { scale: number; flipX?: boolean },
): PalaceShadowParams {
  const footprint = palaceFootprintOf(textureKey);
  const shape = footprint ?? FALLBACK_FOOTPRINT;
  const style = PALACE_SHADOW_STYLE[shape.pose];
  const scale = Math.max(0.01, opts.scale);

  const contactWidth = shape.contactWidth * scale;
  const width = Math.round(Math.max(style.minWidth, contactWidth * style.widthFactor));
  const height = Math.max(2, Math.round(width * style.heightRatio));

  const contactBottom = (shape.contactBottomY - PALACE_FOOT_ANCHOR_Y) * scale;
  const offsetY = round2(contactBottom - style.overlap + height / 2);
  const offsetX = round2(
    ((shape.contactCenterX - PALACE_FRAME.width / 2) * scale) * (opts.flipX === true ? -1 : 1),
  );

  return { width, height, alpha: style.alpha, offsetX, offsetY, footprint };
}

// ---------------------------------------------------------------- 头顶（表情气泡）

/**
 * 表情气泡的「头顶」对位表。
 *
 * 气泡的尾巴要落在人物头上，但**头顶不等于落点上方一个固定值**：站姿的人顶到画布第 29 行，
 * 跪着的周全只到第 150 行（差 60 设计 px）。以前按「落点上方 186」写死，跪姿的气泡会飘到
 * 天花板上去。
 *
 * 数字的取法（与阴影同一套 alpha 口径）：不透明像素先按 `PALACE_ALPHA_CUTOFF` 过滤，
 * 取最上一行 `topY`，再取最上面 12 行不透明像素的水平中心 `centerX`（侧身/跪姿的头会偏离中线）。
 * `test/palace-shadow.test.ts` 会现场重算这两列并对表，换贴图重跑测量即可，不许手调。
 */
export interface PalaceHeadAnchor {
  /** 贴图文件名，测试据此回读 PNG 像素。 */
  readonly file: string;
  /** 不透明像素最上一行（画布 y，0 起）。 */
  readonly topY: number;
  /** 最上面 12 行不透明像素的水平中心（画布 x）。 */
  readonly centerX: number;
}

const HEAD_ROWS: ReadonlyArray<readonly [string, PalaceHeadAnchor]> = [
  [key('zhou_kneel_up.png'), { file: 'zhou_kneel_up.png', topY: 150, centerX: 111.5 }],
  [key('zhou_kneel_down.png'), { file: 'zhou_kneel_down.png', topY: 150, centerX: 104.9 }],
  [key('zheng_emperor_down.png'), { file: 'zheng_emperor_down.png', topY: 29, centerX: 98.5 }],
  [key('zheng_emperor_left.png'), { file: 'zheng_emperor_left.png', topY: 29, centerX: 82.8 }],
  [key('zheng_emperor_right.png'), { file: 'zheng_emperor_right.png', topY: 29, centerX: 115.9 }],
  [key('chu_gonggong_down.png'), { file: 'chu_gonggong_down.png', topY: 29, centerX: 89.5 }],
  [key('eunuch_down.png'), { file: 'eunuch_down.png', topY: 29, centerX: 98.7 }],
  [key('eunuch_crack.png'), { file: 'eunuch_crack.png', topY: 114, centerX: 96.8 }],
  [key('miner.png'), { file: 'miner.png', topY: 152, centerX: 99.1 }],
];

export const PALACE_HEAD_ANCHORS: ReadonlyMap<string, PalaceHeadAnchor> = new Map(HEAD_ROWS);

/** 兜底：行走 sheet / 未登记贴图按站姿（顶到第 29 行、水平居中）算。 */
const FALLBACK_HEAD: PalaceHeadAnchor = { file: '', topY: 29, centerX: PALACE_FRAME.width / 2 };

export interface PalaceHeadPoint {
  /** 相对角色落点（`toPixel()` 给的 x/y）的偏移，设计 px；气泡锚点就取这里。 */
  readonly offsetX: number;
  readonly offsetY: number;
  readonly head: PalaceHeadAnchor | null;
}

/** 按贴图算「头顶中心」相对落点的偏移；世界层缩放/平移由调用方再套一层。 */
export function palaceHeadPointFor(
  textureKey: string,
  opts: { scale: number; flipX?: boolean },
): PalaceHeadPoint {
  const head = PALACE_HEAD_ANCHORS.get(textureKey) ?? null;
  const shape = head ?? FALLBACK_HEAD;
  const scale = Math.max(0.01, opts.scale);
  return {
    offsetX: round2(
      ((shape.centerX - PALACE_FRAME.width / 2) * scale) * (opts.flipX === true ? -1 : 1),
    ),
    offsetY: round2((shape.topY - PALACE_FOOT_ANCHOR_Y) * scale),
    head,
  };
}
