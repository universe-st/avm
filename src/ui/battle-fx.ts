import Phaser from 'phaser';
import type { BattlePoint } from '../battle/layout';
import type { Facing8 } from '../battle/types';
import { FACING_ANGLES } from '../battle/core/slots';
import { DANGER, GOLD, INK, PAPER } from './cinematic';
import { LAYERS } from '../render/layers';
import { impactRing, sparkBurst } from './fx-kit';

/**
 * 战斗表现层特效（原生层，即用即弃）。
 *
 * 与 `fx-kit` 的分工：这里只放**战斗语义**——背袭扇区、意图高亮、斩击弧、
 * 残影、格挡护盾、协议压迫；通用冲击环/火花/震屏继续用 `fx-kit`。
 *
 * 所有坐标是设计坐标，depth 从 `LAYERS` 取；`reduced` 时去掉位移/闪烁，
 * 只保留静态图形与伤害信息。
 */

const DEG = Math.PI / 180;

export function pointOnCircle(
  center: { readonly x: number; readonly y: number },
  radius: number,
  angleDeg: number,
): BattlePoint {
  return {
    x: center.x + Math.cos(angleDeg * DEG) * radius,
    y: center.y - Math.sin(angleDeg * DEG) * radius,
  };
}

/** 采样一段圆弧（屏幕坐标系，0°=右、逆时针为正）。 */
export function arcPoints(
  center: { readonly x: number; readonly y: number },
  radius: number,
  fromDeg: number,
  toDeg: number,
  segments = 20,
): BattlePoint[] {
  const points: BattlePoint[] = [];
  const count = Math.max(2, Math.floor(segments));
  for (let index = 0; index <= count; index += 1) {
    const angle = fromDeg + ((toDeg - fromDeg) * index) / count;
    points.push(pointOnCircle(center, radius, angle));
  }
  return points;
}

/**
 * 背袭扇区：朝向背后 135°–225° 的 90° 楔形（金色）。
 * 6 个站位里正好覆盖左/左上/左下（面朝左时）。
 */
export function drawBackArc(
  graphics: Phaser.GameObjects.Graphics,
  center: { readonly x: number; readonly y: number },
  facing: Facing8,
  radius: number,
  options: { readonly color?: number; readonly alpha?: number } = {},
): void {
  const facingAngle = FACING_ANGLES[facing];
  const from = facingAngle + 135;
  const to = facingAngle + 225;
  const points = arcPoints(center, radius, from, to, 24);
  graphics.fillStyle(options.color ?? GOLD, options.alpha ?? 0.09);
  graphics.beginPath();
  graphics.moveTo(center.x, center.y);
  for (const point of points) graphics.lineTo(point.x, point.y);
  graphics.closePath();
  graphics.fillPath();

  graphics.lineStyle(2, options.color ?? GOLD, 0.42);
  graphics.beginPath();
  const outer = arcPoints(center, radius, from, to, 24);
  graphics.moveTo(outer[0]!.x, outer[0]!.y);
  for (const point of outer.slice(1)) graphics.lineTo(point.x, point.y);
  graphics.strokePath();
}

/** 站位地面环（静态底环 / 当前站位 / 意图危险格都复用它）。 */
export function drawSlotRing(
  graphics: Phaser.GameObjects.Graphics,
  point: { readonly x: number; readonly y: number },
  options: {
    readonly color?: number;
    /** 填充色（默认与描边同色）；玩家站在危险格时用金填充 + 红描边。 */
    readonly fillColor?: number;
    readonly alpha?: number;
    readonly fillAlpha?: number;
    readonly radiusX?: number;
    readonly radiusY?: number;
    readonly lineWidth?: number;
  } = {},
): void {
  const color = options.color ?? GOLD;
  const radiusX = options.radiusX ?? 46;
  const radiusY = options.radiusY ?? 15;
  if ((options.fillAlpha ?? 0) > 0) {
    graphics.fillStyle(options.fillColor ?? color, options.fillAlpha ?? 0);
    graphics.fillEllipse(point.x, point.y + 4, radiusX * 2, radiusY * 2);
  }
  graphics.lineStyle(options.lineWidth ?? 2, color, options.alpha ?? 0.45);
  graphics.strokeEllipse(point.x, point.y + 4, radiusX * 2, radiusY * 2);
}

/** 怪物脚下的朝向箭头（朝向在 8 向贴图上不一定一眼读得出）。 */
export function drawFacingMark(
  graphics: Phaser.GameObjects.Graphics,
  center: { readonly x: number; readonly y: number },
  facing: Facing8,
  distance: number,
  color = GOLD,
): void {
  const tip = pointOnCircle(center, distance, FACING_ANGLES[facing]);
  const left = pointOnCircle(center, distance - 18, FACING_ANGLES[facing] + 154);
  const right = pointOnCircle(center, distance - 18, FACING_ANGLES[facing] - 154);
  graphics.fillStyle(color, 0.82);
  graphics.beginPath();
  graphics.moveTo(tip.x, tip.y);
  graphics.lineTo(left.x, left.y);
  graphics.lineTo(right.x, right.y);
  graphics.closePath();
  graphics.fillPath();
}

/** 斩击弧：一次性的弧形刀光，命中帧播放。 */
export function slashArc(
  scene: Phaser.Scene,
  center: { readonly x: number; readonly y: number },
  facingDeg: number,
  options: {
    readonly radius?: number;
    readonly color?: number;
    readonly ms?: number;
    readonly reduced?: boolean;
    readonly depth?: number;
  } = {},
): void {
  const radius = options.radius ?? 110;
  const color = options.color ?? PAPER;
  const ms = options.ms ?? 260;
  const reduced = options.reduced === true;
  const depth = options.depth ?? LAYERS.effects + 10;

  const graphics = scene.add.graphics().setDepth(depth);
  const points = arcPoints(center, radius, facingDeg - 48, facingDeg + 48, 18);
  graphics.lineStyle(reduced ? 8 : 14, color, reduced ? 0.55 : 0.9);
  graphics.beginPath();
  graphics.moveTo(points[0]!.x, points[0]!.y);
  for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
  graphics.strokePath();

  if (reduced) {
    graphics.setAlpha(0.7);
    scene.time.delayedCall(120, () => graphics.destroy());
    return;
  }
  graphics.setScale(0.86);
  graphics.setAlpha(1);
  scene.tweens.add({
    targets: graphics,
    alpha: 0,
    scaleX: 1.06,
    scaleY: 1.06,
    duration: ms,
    ease: 'Quad.easeOut',
    onComplete: () => graphics.destroy(),
  });
}

/** 闪现残影：在同一位置放一张半透明贴图，快速淡出。 */
export function afterimage(
  scene: Phaser.Scene,
  textureKey: string,
  x: number,
  y: number,
  options: {
    readonly scale?: number;
    readonly flipX?: boolean;
    readonly alpha?: number;
    readonly ms?: number;
    readonly depth?: number;
  } = {},
): Phaser.GameObjects.Image | null {
  if (!scene.textures.exists(textureKey)) return null;
  const image = scene.add
    .image(x, y, textureKey)
    .setOrigin(0.5, 0.985)
    .setScale(options.scale ?? 1)
    .setAlpha(options.alpha ?? 0.5)
    .setDepth(options.depth ?? LAYERS.effects);
  if (options.flipX === true) image.setFlipX(true);
  scene.tweens.add({
    targets: image,
    alpha: 0,
    duration: options.ms ?? 240,
    ease: 'Quad.easeOut',
    onComplete: () => image.destroy(),
  });
  return image;
}

/** 格挡护盾：胸前一圈冷白弧 + 细环。 */
export function guardShield(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: { readonly reduced?: boolean; readonly depth?: number } = {},
): void {
  const depth = options.depth ?? LAYERS.effects + 6;
  const graphics = scene.add.graphics().setDepth(depth);
  const center = { x, y };
  const points = arcPoints(center, 62, -62, 62, 14);
  graphics.lineStyle(7, PAPER, 0.82);
  graphics.beginPath();
  graphics.moveTo(points[0]!.x, points[0]!.y);
  for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
  graphics.strokePath();
  graphics.lineStyle(2, 0x9fc7ff, 0.6);
  graphics.strokeCircle(x, y, 74);
  if (options.reduced === true) {
    graphics.setAlpha(0.6);
    scene.time.delayedCall(160, () => graphics.destroy());
    return;
  }
  graphics.setAlpha(0.95);
  scene.tweens.add({
    targets: graphics,
    alpha: 0,
    scaleX: 1.12,
    scaleY: 1.12,
    duration: 320,
    ease: 'Quad.easeOut',
    onComplete: () => graphics.destroy(),
  });
}

/** 清除协议：红色地面环 + 两段压迫弧，持续到结算。 */
export function protocolPressure(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: { readonly reduced?: boolean } = {},
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics().setDepth(LAYERS.effects + 8);
  graphics.lineStyle(3, DANGER, 0.72);
  graphics.strokeEllipse(x, y + 4, 360, 110);
  graphics.lineStyle(6, DANGER, 0.5);
  graphics.strokeEllipse(x, y + 4, 260, 76);
  const left = arcPoints({ x, y: y - 70 }, 150, 18, 74, 12);
  const right = arcPoints({ x, y: y - 70 }, 150, 106, 162, 12);
  for (const points of [left, right]) {
    graphics.lineStyle(5, DANGER, 0.8);
    graphics.beginPath();
    graphics.moveTo(points[0]!.x, points[0]!.y);
    for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
    graphics.strokePath();
  }
  if (options.reduced !== true) {
    scene.tweens.add({
      targets: graphics,
      alpha: { from: 0.5, to: 1 },
      duration: 320,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
  return graphics;
}

/** 一次命中的组合反馈：冲击环 + 火花 + 可选震屏。 */
export function hitBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: {
    readonly color?: number;
    readonly backstab?: boolean;
    readonly reduced?: boolean;
    readonly seed?: number;
    readonly depth?: number;
  } = {},
): void {
  const color = options.color ?? GOLD;
  impactRing(scene, x, y, {
    color,
    radius: options.backstab === true ? 116 : 82,
    ms: options.backstab === true ? 360 : 260,
    reduced: options.reduced,
    depth: options.depth ?? LAYERS.effects,
  });
  sparkBurst(scene, x, y, {
    color: options.backstab === true ? 0xffe3a8 : color,
    count: options.backstab === true ? 20 : 12,
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    reduced: options.reduced,
    depth: options.depth ?? LAYERS.effects,
  });
}

/** 暗场压屏（协议/战败时用；reduced 时只留一层静态压暗）。 */
export function protocolScrim(scene: Phaser.Scene, reduced: boolean): Phaser.GameObjects.Rectangle {
  const graphics = scene.add
    .rectangle(0, 0, 720, 1700, INK, reduced ? 0.42 : 0.58)
    .setOrigin(0, 0)
    .setDepth(LAYERS.cinematic - 20);
  if (!reduced) {
    graphics.setAlpha(0);
    scene.tweens.add({ targets: graphics, alpha: 1, duration: 260, ease: 'Quad.easeOut' });
  }
  return graphics;
}

/**
 * 解离突刺的「光刃延伸」。
 *
 * 帧动画在突刺峰值时刃尖会冲出帧右缘（源视频的画幅限制），只看得见握柄；
 * 这里从手部向目标画一条冷白光刃，把被裁掉的部分补成「光」而不是「断掉的刀」。
 * 位置由场景按站位/朝向算好传进来，本函数不读战斗数据。
 */
export function bladeTrail(
  scene: Phaser.Scene,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
  options: { readonly reduced?: boolean; readonly depth?: number } = {},
): void {
  const depth = options.depth ?? LAYERS.effects + 12;
  const graphics = scene.add.graphics().setDepth(depth);
  graphics.lineStyle(20, 0x7fe9ff, 0.16);
  graphics.lineBetween(from.x, from.y, to.x, to.y);
  graphics.lineStyle(10, 0xdff8ff, 0.55);
  graphics.lineBetween(from.x, from.y, to.x, to.y);
  graphics.lineStyle(4, 0xffffff, 0.95);
  graphics.lineBetween(from.x, from.y, to.x, to.y);
  graphics.fillStyle(0xffffff, 0.9);
  graphics.fillCircle(to.x, to.y, 6);

  if (options.reduced === true) {
    graphics.setAlpha(0.8);
    scene.time.delayedCall(120, () => graphics.destroy());
    return;
  }
  scene.tweens.add({
    targets: graphics,
    alpha: 0,
    duration: 320,
    ease: 'Quad.easeOut',
    onComplete: () => graphics.destroy(),
  });
}
