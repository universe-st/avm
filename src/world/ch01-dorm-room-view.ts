import Phaser from 'phaser';
import { CH01_ASSET_KEYS } from '../assets/keys';
import type { RoomDef } from '../map/types';
import { interactableCenter, isWalkableTile, tileCenter } from '../map/core/room';
import { LAYERS } from '../render/layers';
import { GOLD, makeSceneText } from '../ui/cinematic';
import { setLinearTextures } from '../ui/pixel';

/**
 * 寝室地图视图（2026-10-25 新地图）：整张 1600×1728 房间图按 720 宽显示，
 * 四张床/书桌/窗/门都在图里，不再单独摆椅子或课程表。
 */
export class Ch01DormRoomView {
  private readonly scene: Phaser.Scene;
  private readonly room: RoomDef;
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, room: RoomDef, debug = false) {
    this.scene = scene;
    this.room = room;

    const key = CH01_ASSET_KEYS.map.dormRoomQ;
    if (scene.textures.exists(key)) {
      setLinearTextures(scene, [key]);
      this.objects.push(
        scene.add
          .image(room.origin.x, room.origin.y, key)
          .setOrigin(0, 0)
          .setDisplaySize(room.size[0] * room.tileSize, room.size[1] * room.tileSize)
          .setDepth(LAYERS.background),
      );
    } else {
      const fallback = scene.add
        .rectangle(
          room.origin.x,
          room.origin.y,
          room.size[0] * room.tileSize,
          room.size[1] * room.tileSize,
          0x211a16,
        )
        .setOrigin(0, 0)
        .setDepth(LAYERS.background);
      this.objects.push(fallback);
      console.warn('[ch01-dorm] 缺少 Q 版寝室房间图，使用纯色占位');
    }

    this.addSleepingZheng();
    this.addInteractiveMarkers();
    if (debug) this.drawDebugLayer();
  }

  /** 旧场景兼容：新地图没有独立椅子。 */
  setChairVisible(_visible: boolean): void {
    // 新地图的桌椅已经画在整图里。
  }

  destroy(): void {
    for (const object of this.objects) object.destroy();
    this.objects.length = 0;
  }

  /** 郑卿睡在左上床：4 帧呼吸动画，尺寸与床格完全对齐。 */
  private addSleepingZheng(): void {
    const key = CH01_ASSET_KEYS.map.bedZheng;
    if (!this.scene.textures.exists(key)) return;
    const texture = this.scene.textures.get(key);
    for (let i = 0; i < 4; i += 1) {
      if (!texture.has(String(i))) texture.add(i, 0, i * 288, 0, 288, 704);
    }
    if (!this.scene.anims.exists('ch01.bed_zheng')) {
      this.scene.anims.create({
        key: 'ch01.bed_zheng',
        frames: [0, 1, 2, 3].map((frame) => ({ key, frame })),
        frameRate: 3,
        repeat: -1,
      });
    }
    setLinearTextures(this.scene, [key]);
    const sprite = this.track(
      this.scene.add
        .sprite(this.room.origin.x + 5 * this.room.tileSize, this.room.origin.y + 5 * this.room.tileSize, key, 0)
        .setOrigin(0, 0)
        .setDisplaySize(this.room.tileSize * 9, this.room.tileSize * 22)
        .setDepth(LAYERS.props + 30),
    );
    sprite.play('ch01.bed_zheng');
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.push(object);
    return object;
  }

  private addInteractiveMarkers(): void {
    const graphics = this.track(this.scene.add.graphics().setDepth(LAYERS.markers));
    for (const item of this.room.interactables) {
      if (item.id !== 'zheng' && item.id !== 'phone') continue;
      const at = interactableCenter(this.room, item);
      graphics.fillStyle(GOLD, 0.55);
      graphics.fillCircle(at.x + 18, at.y - 14, 3);
      graphics.lineStyle(1, GOLD, 0.35);
      graphics.strokeCircle(at.x + 18, at.y - 14, 8);
    }

    // Zzz 钉在郑卿床（左上床）上方，而不是交互 marker。
    const anchor = tileCenter(this.room, 9, 6);
    const zzz = this.track(
      makeSceneText(this.scene, anchor.x + 22, anchor.y - 12, 'Zzz', {
        size: 18,
        color: GOLD,
        alpha: 0.65,
        depth: LAYERS.markers + 20,
      }),
    );
    this.scene.tweens.add({
      targets: zzz,
      y: zzz.y - 8,
      alpha: 0.25,
      duration: 1300,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private drawDebugLayer(): void {
    const graphics = this.track(this.scene.add.graphics().setDepth(LAYERS.debug));
    for (let row = 0; row < this.room.size[1]; row += 1) {
      for (let col = 0; col < this.room.size[0]; col += 1) {
        if (isWalkableTile(this.room, col, row)) continue;
        graphics.fillStyle(0xc0392b, 0.18);
        graphics.fillRect(
          this.room.origin.x + col * this.room.tileSize,
          this.room.origin.y + row * this.room.tileSize,
          this.room.tileSize,
          this.room.tileSize,
        );
      }
    }
    for (const item of this.room.interactables) {
      const at = interactableCenter(this.room, item);
      graphics.lineStyle(1, 0xd8b76a, 0.7);
      graphics.strokeCircle(at.x, at.y, item.radius ?? 100);
    }
  }
}
