import Phaser from 'phaser';
import {
  CH01_STATIC_SPRITES,
  CH01_WALK_FRAME_COUNT,
  CH01_WALK_SHEETS,
} from '../assets/keys';
import type { Facing, MapPoint, RoomDef } from '../map/types';
import { tileCenter } from '../map/core/room';
import { characterDepth } from '../render/layers';
import { setLinearTextures, setPixelTextures } from '../ui/pixel';

const WALK_FRAME_MS = 95;

export interface PlayerActorOptions {
  readonly spawn?: { readonly at: readonly [number, number]; readonly facing: Facing };
  readonly sittingKey?: string;
  readonly sitting?: boolean;
  readonly sittingOffsetY?: number;
  /** 静态八向 key；省略用旧版 64×96 周全（斜向回退主轴）。 */
  readonly staticKeys?: Readonly<Record<Facing, string>>;
  /** 行走 sheet key；省略用旧版 64×96 周全。 */
  readonly walkSheets?: Readonly<Record<Facing, string>>;
  readonly frameWidth?: number;
  readonly frameHeight?: number;
  readonly walkFrameCount?: number;
  /** 整张 sprite 显示缩放，用于 Q 版 160×400 → 地图设计尺寸。 */
  readonly spriteScale?: number;
  /** 头顶到脚底的设计距离（未乘 spriteScale 时传显示后的值）。 */
  readonly headOffset?: number;
  /** Q 版等非像素素材用 LINEAR 采样。 */
  readonly linearTextures?: boolean;
}

/**
 * 玩家角色表现层。
 *
 * 只负责 sprite、八向静态图/行走 sheet、脚底锚点和 depth；不负责碰撞/输入/剧情。
 * 场景把 `moveWithCollision` 的解算结果交给 `moveTo()`。
 */
export class PlayerActor {
  private readonly scene: Phaser.Scene;
  private readonly sprite: Phaser.GameObjects.Image | null;
  private feetPoint: MapPoint;
  private facingValue: Facing;
  private walking = false;
  private walkClock = 0;
  private sitting: boolean;
  private readonly sittingKey?: string;
  private readonly sittingOffsetY: number;
  private readonly staticKeys: Readonly<Record<Facing, string>>;
  private readonly walkSheets: Readonly<Record<Facing, string>>;
  private readonly frameWidth: number;
  private readonly frameHeight: number;
  private readonly walkFrameCount: number;
  private readonly spriteScale: number;
  private readonly headOffset: number;

  constructor(scene: Phaser.Scene, room: RoomDef, options: PlayerActorOptions = {}) {
    this.scene = scene;
    const spawn = options.spawn ?? { at: room.spawn.at, facing: room.spawn.facing };
    this.feetPoint = tileCenter(room, spawn.at[0], spawn.at[1]);
    this.facingValue = spawn.facing;
    this.sittingKey = options.sittingKey;
    this.sittingOffsetY = options.sittingOffsetY ?? 0;
    this.sitting = options.sitting === true && options.sittingKey !== undefined;
    this.staticKeys = options.staticKeys ?? CH01_STATIC_SPRITES;
    this.walkSheets = options.walkSheets ?? CH01_WALK_SHEETS;
    this.frameWidth = options.frameWidth ?? 64;
    this.frameHeight = options.frameHeight ?? 96;
    this.walkFrameCount = options.walkFrameCount ?? CH01_WALK_FRAME_COUNT;
    this.spriteScale = options.spriteScale ?? 1;
    this.headOffset = options.headOffset ?? (this.sitting ? 64 : 96);

    const keys: string[] = [
      ...Object.values(this.staticKeys),
      ...Object.values(this.walkSheets),
    ];
    if (options.sittingKey) keys.push(options.sittingKey);
    if (options.linearTextures === true) setLinearTextures(scene, keys);
    else setPixelTextures(scene, keys);
    for (const key of Object.values(this.walkSheets)) {
      if (!scene.textures.exists(key)) continue;
      const texture = scene.textures.get(key);
      for (let index = 0; index < this.walkFrameCount; index += 1) {
        if (!texture.has(String(index))) {
          texture.add(index, 0, index * this.frameWidth, 0, this.frameWidth, this.frameHeight);
        }
      }
    }

    const staticKey = this.staticKeys[this.facingValue];
    this.sprite = scene.textures.exists(staticKey)
      ? scene.add
          .image(this.feetPoint.x, this.feetPoint.y, staticKey)
          .setOrigin(0.5, 1)
          .setScale(this.spriteScale)
          .setDepth(characterDepth(this.feetPoint.y))
      : null;
  }

  get position(): MapPoint {
    return this.feetPoint;
  }

  get facing(): Facing {
    return this.facingValue;
  }

  /** 头顶中心（精灵顶部），供表情气泡把尾巴钉在头上。 */
  get headPoint(): MapPoint {
    return {
      x: this.feetPoint.x + (this.sitting ? 0 : 0),
      y: this.feetPoint.y - this.headOffset,
    };
  }

  /** 场景移动解算后调用；`deltaMs` 用于推进行走帧。 */
  moveTo(position: MapPoint, facing: Facing, walking: boolean, deltaMs: number): void {
    this.feetPoint = position;
    this.facingValue = facing;
    this.walking = walking;
    if (walking) {
      this.sitting = false;
      this.walkClock += deltaMs;
    } else {
      this.walkClock = 0;
    }
    this.sync();
  }

  /** 开局坐在书桌前；开始探索时由场景解除。 */
  setSitting(value: boolean): void {
    this.sitting = value && this.sittingKey !== undefined;
    this.walking = false;
    this.walkClock = 0;
    this.sync();
  }

  /** 刷新 sprite（章节卡/对话时也可调用）。 */
  sync(): void {
    if (!this.sprite) return;
    const sheet = this.walkSheets[this.facingValue];
    if (this.sitting && this.sittingKey && this.scene.textures.exists(this.sittingKey)) {
      this.sprite.setTexture(this.sittingKey, 0);
    } else if (this.walking && this.scene.textures.exists(sheet)) {
      const frame = Math.floor(this.walkClock / WALK_FRAME_MS) % this.walkFrameCount;
      this.sprite.setTexture(sheet, frame);
    } else {
      this.sprite.setTexture(this.staticKeys[this.facingValue], 0);
    }
    const bob = this.walking ? Math.abs(Math.sin(this.walkClock * 0.02)) * 2 : 0;
    const sittingOffset = this.sitting ? this.sittingOffsetY : 0;
    this.sprite.setPosition(this.feetPoint.x, this.feetPoint.y - bob + sittingOffset);
    this.sprite.setDepth(characterDepth(this.feetPoint.y));
  }

  destroy(): void {
    this.sprite?.destroy();
    this.walking = false;
    this.sitting = false;
  }
}
