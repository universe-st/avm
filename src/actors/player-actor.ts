import Phaser from 'phaser';
import {
  CH01_STATIC_SPRITES,
  CH01_WALK_FRAME_COUNT,
  CH01_WALK_SHEETS,
} from '../assets/keys';
import type { Facing, MapPoint, RoomDef } from '../map/types';
import { tileCenter } from '../map/core/room';
import { LAYERS, characterDepth } from '../render/layers';
import { setLinearTextures, setPixelTextures } from '../ui/pixel';

// 20 帧 × 65ms ≈ 一个 1.3s 的步态循环；旧的 8 帧 @95ms 只有 760ms，看着像抖。
const WALK_FRAME_MS = 65;

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
  /** 脚底接触阴影：贴在角色下面、地图家具上面，role 的「脚踩地面」全靠它。 */
  private readonly shadow: Phaser.GameObjects.Ellipse | null;
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
    this.shadow = scene.add
      .ellipse(
        this.feetPoint.x,
        this.feetPoint.y + 2,
        Math.max(34, 52 * this.spriteScale),
        Math.max(10, 15 * this.spriteScale),
        0x000000,
        0.3,
      )
      .setDepth(LAYERS.props - 1);
    this.sprite = scene.textures.exists(staticKey)
      ? scene.add
          .image(this.feetPoint.x, this.feetPoint.y, staticKey)
          /**
           * 立绘的脚在帧内 y=394（帧高 400，下面留了 6px 余白给鞋影）。
           * 用 1.0 当锚点的话 feetY 会比视觉脚底低 6px，角色看起来就「踩进」了地面的障碍物；
           * 0.985 = 394/400，让视觉脚底和碰撞用的脚底坐标对上。
           */
          .setOrigin(0.5, 0.985)
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
    // 上下起伏已经烘进 20 帧序列里，这里不再叠一层随机相位的 bob（会和步态打架）。
    const sittingOffset = this.sitting ? this.sittingOffsetY : 0;
    this.sprite.setPosition(this.feetPoint.x, this.feetPoint.y + sittingOffset);
    this.sprite.setDepth(characterDepth(this.feetPoint.y));
    this.shadow?.setPosition(this.feetPoint.x, this.feetPoint.y + sittingOffset + 2);
  }

  destroy(): void {
    this.sprite?.destroy();
    this.shadow?.destroy();
    this.walking = false;
    this.sitting = false;
  }
}
