import Phaser from 'phaser';
import type { RoomDef } from '../map/types';
import { KITCHEN_ZONES, CH01_KITCHEN_ROOM } from '../map/rooms/ch01-kitchen';
import { LAYERS } from '../render/layers';
import { GOLD, makeSceneText } from '../ui/cinematic';
import { CH01_KITCHEN_ASSET_KEYS } from '../assets/keys';
import { setPixelTexture } from '../ui/pixel';

const COLORS = {
  floor: 0x3a2c22,
  floorAlt: 0x44342a,
  wall: 0x554334,
  wallTop: 0x7a5c40,
  low: 0x5a4230,
  lowTop: 0x7a5a3c,
  hay: 0x7a5c2a,
  haySpeck: 0xa8873f,
  gate: 0x6b4a2c,
  gateLine: 0x2a1a10,
  screen: 0x3b2a2f,
  cabinet: 0x33251c,
  zone: 0xb99a5a,
  patrol: 0x9c3b32,
  hide: 0x3f7a5a,
  trigger: 0x8a6a2a,
} as const;

/**
 * 御膳房白盒地图视图。
 *
 * P2 起优先使用 `img.map.ch01.kitchen` 整图；找不到时回退 ASCII 色块。
 * 碰撞永远读 ASCII；整图只做视觉。区域标题与 debug 层始终叠加。
 */
export class Ch01KitchenRoomView {
  private readonly scene: Phaser.Scene;
  private readonly room: RoomDef;
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  constructor(scene: Phaser.Scene, room: RoomDef = CH01_KITCHEN_ROOM, debug = false) {
    this.scene = scene;
    this.room = room;
    const artKey = CH01_KITCHEN_ASSET_KEYS.map.kitchen;
    if (scene.textures.exists(artKey)) {
      setPixelTexture(scene, artKey);
      const image = scene.add
        .image(room.origin.x, room.origin.y, artKey)
        .setOrigin(0, 0)
        .setDisplaySize(room.size[0] * room.tileSize, room.size[1] * room.tileSize)
        .setDepth(LAYERS.background);
      this.track(image);
      // 不再画「传膳门/屏风/橱柜/后门」小字：这些道具现在有清楚的形状（96px 格），
      // 18px 的门牌在放大后既小又飘，读起来像误笔。区域名与地标保留，字号跟着 tile 放大。
    } else {
      this.drawMap();
    }
    this.drawZones();
    this.drawLandmarks();
    if (debug) this.drawDebugLayer();
  }

  destroy(): void {
    for (const object of this.objects) object.destroy();
    this.objects.length = 0;
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.push(object);
    return object;
  }

  private drawMap(): void {
    const floor = this.track(this.scene.add.graphics().setDepth(LAYERS.background));
    const walls = this.track(this.scene.add.graphics().setDepth(LAYERS.props));
    const { tileSize } = this.room;
    const origin = this.room.origin;

    for (let row = 0; row < this.room.size[1]; row += 1) {
      const line = this.room.ascii[row] ?? '';
      for (let col = 0; col < this.room.size[0]; col += 1) {
        const char = line[col] ?? '#';
        const x = origin.x + col * tileSize;
        const y = origin.y + row * tileSize;
        const parity = (col + row) % 2 === 0;
        if (char === '#' || char === '=') {
          floor.fillStyle(parity ? COLORS.floor : COLORS.floorAlt, 1);
          floor.fillRect(x, y, tileSize, tileSize);
          walls.fillStyle(COLORS.wall, 1);
          walls.fillRect(x, y, tileSize, tileSize);
          walls.lineStyle(1, COLORS.wallTop, 0.35);
          walls.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);
        } else if (char === 'o') {
          floor.fillStyle(parity ? COLORS.floor : COLORS.floorAlt, 1);
          floor.fillRect(x, y, tileSize, tileSize);
          walls.fillStyle(COLORS.low, 1);
          walls.fillRect(x + 3, y + 3, tileSize - 6, tileSize - 6);
          walls.lineStyle(2, COLORS.lowTop, 0.55);
          walls.strokeRect(x + 3, y + 3, tileSize - 6, tileSize - 6);
        } else if (char === '~') {
          floor.fillStyle(COLORS.hay, 1);
          floor.fillRect(x, y, tileSize, tileSize);
          floor.fillStyle(COLORS.haySpeck, 0.55);
          floor.fillCircle(x + 16, y + 20, 2);
          floor.fillCircle(x + 40, y + 34, 1.6);
          floor.fillCircle(x + 28, y + 50, 1.4);
        } else {
          floor.fillStyle(parity ? COLORS.floor : COLORS.floorAlt, 1);
          floor.fillRect(x, y, tileSize, tileSize);
          floor.lineStyle(1, 0x4a3828, 0.35);
          floor.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);
        }
      }
    }

    // 灰盒回退才画门面；有整图时只留文字标签。
    this.drawDoor(14, 0, 4, 4, '传膳门');
    this.drawDoor(9, 63, 4, 1, '后门');
    this.drawDoor(17, 5, 1, 2, '屏风', COLORS.screen);
    this.drawDoor(27, 44, 2, 3, '橱柜', COLORS.cabinet);
  }

  private drawDoor(
    col: number,
    row: number,
    width: number,
    height: number,
    label: string,
    color: number = COLORS.gate,
  ): void {
    const { tileSize } = this.room;
    const x = this.room.origin.x + col * tileSize;
    const y = this.room.origin.y + row * tileSize;
    const g = this.track(this.scene.add.graphics().setDepth(LAYERS.props + 2));
    g.fillStyle(color, 0.95);
    g.fillRect(x, y, width * tileSize, height * tileSize);
    g.lineStyle(3, COLORS.gateLine, 0.8);
    g.strokeRect(x + 2, y + 2, width * tileSize - 4, height * tileSize - 4);
    g.lineStyle(1, GOLD, 0.35);
    g.lineBetween(x + 8, y + height * tileSize - 8, x + width * tileSize - 8, y + height * tileSize - 8);
    this.track(
      makeSceneText(this.scene, x + (width * tileSize) / 2, y - 18, label, {
        size: 18,
        color: GOLD,
        alpha: 0.55,
        originX: 0.5,
        originY: 0.5,
        depth: LAYERS.markers,
      }),
    );
  }

  private drawZones(): void {
    const { tileSize } = this.room;
    for (const zone of KITCHEN_ZONES) {
      const [c0, r0, c1, r1] = zone.rect;
      const x = this.room.origin.x + ((c0 + c1 + 1) / 2) * tileSize;
      const y = this.room.origin.y + ((r0 + r1 + 1) / 2) * tileSize;
      this.track(
        makeSceneText(this.scene, x, y, zone.title, {
          size: 34,
          color: COLORS.zone,
          alpha: 0.26,
          originX: 0.5,
          originY: 0.5,
          depth: LAYERS.markers,
          letterSpacing: 6,
        }),
      );
    }
  }

  private drawLandmarks(): void {
    const { tileSize } = this.room;
    const markers: readonly [number, number, string, number][] = [
      [5, 45, '干草堆', COLORS.haySpeck],
      [13, 36, '灶台', 0xd9a441],
      [7, 10, '库房', 0xc9a45a],
    ];
    for (const [col, row, label, color] of markers) {
      const x = this.room.origin.x + col * tileSize + tileSize / 2;
      const y = this.room.origin.y + row * tileSize + tileSize / 2;
      const g = this.track(this.scene.add.graphics().setDepth(LAYERS.markers + 1));
      g.lineStyle(2, color, 0.45);
      g.strokeCircle(x, y, 15);
      this.track(
        makeSceneText(this.scene, x, y - 40, label, {
          size: 22,
          color,
          alpha: 0.7,
          originX: 0.5,
          originY: 0.5,
          depth: LAYERS.markers + 2,
        }),
      );
    }
  }

  private drawDebugLayer(): void {
    const { tileSize } = this.room;
    const g = this.track(this.scene.add.graphics().setDepth(LAYERS.debug));
    for (const patrol of this.room.patrols ?? []) {
      g.lineStyle(2, COLORS.patrol, 0.65);
      patrol.path.forEach(([col, row], index) => {
        const x = this.room.origin.x + col * tileSize + tileSize / 2;
        const y = this.room.origin.y + row * tileSize + tileSize / 2;
        if (index === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      if (patrol.path.length > 2) {
        const first = patrol.path[0];
        if (first) {
          g.lineTo(
            this.room.origin.x + first[0] * tileSize + tileSize / 2,
            this.room.origin.y + first[1] * tileSize + tileSize / 2,
          );
        }
      }
      g.strokePath();
    }
    for (const hide of this.room.hides ?? []) {
      const x = this.room.origin.x + hide.at[0] * tileSize + tileSize / 2;
      const y = this.room.origin.y + hide.at[1] * tileSize + tileSize / 2;
      g.lineStyle(2, COLORS.hide, 0.8);
      g.strokeCircle(x, y, 18);
    }
    for (const trigger of this.room.triggers ?? []) {
      const [c0, r0, c1, r1] = trigger.rect;
      g.lineStyle(2, COLORS.trigger, 0.8);
      g.strokeRect(
        this.room.origin.x + c0 * tileSize,
        this.room.origin.y + r0 * tileSize,
        (c1 - c0 + 1) * tileSize,
        (r1 - r0 + 1) * tileSize,
      );
    }
  }
}
