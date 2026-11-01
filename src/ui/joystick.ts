import Phaser from 'phaser';
import type { MapPoint } from '../map/types';
import { LAYERS } from '../render/layers';
import { INK, GOLD, PAPER } from './cinematic';
import { getViewportPlan } from '../app/viewport';

/** 触屏浮动摇杆；只在按下点附近激活，不占用整块屏幕。 */
export class VirtualJoystick {
  private readonly scene: Phaser.Scene;
  private readonly center: MapPoint;
  private readonly radius: number;
  private readonly screenSpace: boolean;
  private readonly base: Phaser.GameObjects.Graphics;
  private readonly knob: Phaser.GameObjects.Graphics;
  private pointerId: number | null = null;
  private enabled = true;
  private vectorValue: MapPoint = { x: 0, y: 0 };

  constructor(
    scene: Phaser.Scene,
    center: MapPoint,
    radius = 96,
    options: { screenSpace?: boolean } = {},
  ) {
    this.scene = scene;
    this.center = center;
    this.radius = radius;
    this.screenSpace = options.screenSpace === true;

    this.base = scene.add.graphics().setDepth(LAYERS.input);
    if (this.screenSpace) this.base.setScrollFactor(0);
    this.base.fillStyle(INK, 0.34);
    this.base.fillCircle(center.x, center.y, radius + 18);
    this.base.lineStyle(2, GOLD, 0.28);
    this.base.strokeCircle(center.x, center.y, radius + 18);
    this.base.lineStyle(1, GOLD, 0.16);
    this.base.strokeCircle(center.x, center.y, radius);

    this.knob = scene.add.graphics().setDepth(LAYERS.input + 1);
    if (this.screenSpace) this.knob.setScrollFactor(0);
    this.drawKnob(center);

    scene.input.on('pointerdown', this.onPointerDown, this);
    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.onPointerUp, this);
    scene.input.on('gameout', this.onPointerUp, this);
  }

  get vector(): MapPoint {
    return this.vectorValue;
  }

  get active(): boolean {
    return this.pointerId !== null;
  }

  /**
   * 开关摇杆。
   *
   * **禁用只是变暗、不是消失**：原来直接 setVisible(false)，于是每一次对话、每一段过场，
   * 左下角那块操作区就整个没了——手机上看起来像「UI 没加载出来」。
   * 玩家需要始终看到「移动控制在这儿」，只是现在按不动。
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.base.setVisible(true).setAlpha(enabled ? 1 : 0.3);
    this.knob.setVisible(true).setAlpha(enabled ? 1 : 0.24);
    if (!enabled) this.reset();
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onPointerDown, this);
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.onPointerUp, this);
    this.scene.input.off('gameout', this.onPointerUp, this);
    this.base.destroy();
    this.knob.destroy();
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || this.pointerId !== null) return;
    const point = this.pointerPoint(pointer);
    const distance = Phaser.Math.Distance.Between(
      point.x,
      point.y,
      this.center.x,
      this.center.y,
    );
    if (distance > this.radius * 1.55) return;
    this.pointerId = pointer.id;
    this.updateFromPointer(pointer);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || this.pointerId !== pointer.id) return;
    this.updateFromPointer(pointer);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.pointerId !== pointer.id) return;
    this.reset();
  }

  private pointerPoint(pointer: Phaser.Input.Pointer): MapPoint {
    if (!this.screenSpace) return { x: pointer.worldX, y: pointer.worldY };
    const scale = getViewportPlan().scale || 1;
    return { x: pointer.x / scale, y: pointer.y / scale };
  }

  private updateFromPointer(pointer: Phaser.Input.Pointer): void {
    const point = this.pointerPoint(pointer);
    let dx = point.x - this.center.x;
    let dy = point.y - this.center.y;
    const length = Math.hypot(dx, dy);
    if (length > this.radius) {
      dx = (dx / length) * this.radius;
      dy = (dy / length) * this.radius;
    }
    this.vectorValue = { x: dx / this.radius, y: dy / this.radius };
    this.drawKnob({ x: this.center.x + dx, y: this.center.y + dy });
  }

  private drawKnob(point: MapPoint): void {
    this.knob.clear();
    this.knob.fillStyle(PAPER, 0.22);
    this.knob.fillCircle(point.x, point.y, 38);
    this.knob.lineStyle(2, GOLD, 0.7);
    this.knob.strokeCircle(point.x, point.y, 38);
    this.knob.fillStyle(GOLD, 0.16);
    this.knob.fillCircle(point.x, point.y, 20);
  }

  private reset(): void {
    this.pointerId = null;
    this.vectorValue = { x: 0, y: 0 };
    this.drawKnob(this.center);
  }
}
