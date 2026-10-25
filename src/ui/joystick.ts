import Phaser from 'phaser';
import type { MapPoint } from '../map/types';
import { LAYERS } from '../render/layers';
import { INK, GOLD, PAPER } from './cinematic';

/** 触屏浮动摇杆；只在按下点附近激活，不占用整块屏幕。 */
export class VirtualJoystick {
  private readonly scene: Phaser.Scene;
  private readonly center: MapPoint;
  private readonly radius: number;
  private readonly base: Phaser.GameObjects.Graphics;
  private readonly knob: Phaser.GameObjects.Graphics;
  private pointerId: number | null = null;
  private enabled = true;
  private vectorValue: MapPoint = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, center: MapPoint, radius = 96) {
    this.scene = scene;
    this.center = center;
    this.radius = radius;

    this.base = scene.add.graphics().setDepth(LAYERS.input);
    this.base.fillStyle(INK, 0.34);
    this.base.fillCircle(center.x, center.y, radius + 18);
    this.base.lineStyle(2, GOLD, 0.28);
    this.base.strokeCircle(center.x, center.y, radius + 18);
    this.base.lineStyle(1, GOLD, 0.16);
    this.base.strokeCircle(center.x, center.y, radius);

    this.knob = scene.add.graphics().setDepth(LAYERS.input + 1);
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

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.base.setVisible(enabled);
    this.knob.setVisible(enabled);
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
    const distance = Phaser.Math.Distance.Between(
      pointer.worldX,
      pointer.worldY,
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

  private updateFromPointer(pointer: Phaser.Input.Pointer): void {
    let dx = pointer.worldX - this.center.x;
    let dy = pointer.worldY - this.center.y;
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
