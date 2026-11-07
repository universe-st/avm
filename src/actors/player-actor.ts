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
import {
  initialPose,
  poseAfterMove,
  poseAfterSetSitting,
  poseTextureKind,
  walkFrameIndex,
  type PlayerPose,
} from './player-pose';

// 20 帧 × 65ms ≈ 一个 1.3s 的步态循环；旧的 8 帧 @95ms 只有 760ms，看着像抖。
const WALK_FRAME_MS = 65;

export interface PlayerActorOptions {
  readonly spawn?: { readonly at: readonly [number, number]; readonly facing: Facing };
  readonly sittingKey?: string;
  readonly sitting?: boolean;
  readonly sittingOffsetY?: number;
  /**
   * 坐姿贴图单独的显示缩放；省略 = 与站立相同。
   *
   * 坐姿素材常常和站立帧不是同一个画布尺寸（现有占位 `zhou_sit` 是 96×160，
   * Q 版站立帧是 160×400）。共用一个缩放会让人坐下时突然缩成一小只，
   * 所以按坐姿图自身的尺寸补一个比例。
   */
  readonly sittingScale?: number;
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
  /**
   * 坐姿的头顶到脚底距离（设计 px）。省略 = 与站立相同。
   *
   * 坐地后人物只有站立高度的约 2/3，表情气泡若用站姿 `headOffset` 会飘在半空。
   */
  readonly sittingHeadOffset?: number;
  /** Q 版等非像素素材用 LINEAR 采样。 */
  readonly linearTextures?: boolean;
  /** 地图像素高度；大图必须传，否则角色 depth 会盖过迷雾/特效。 */
  readonly depthMaxY?: number;
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
  /**
   * 姿态唯一真值（坐/走/站立帧时钟）。
   *
   * 坐姿是独占姿态：`moveTo()` 只在**没坐着**时才变成行走；这样表演里
   * walk tween 的最后一帧不会把 sit 步骤的坐姿覆盖掉（t23 真机回归的根因）。
   */
  private pose: PlayerPose;
  private readonly sittingKey?: string;
  private readonly sittingOffsetY: number;
  private readonly sittingScale: number;
  private readonly staticKeys: Readonly<Record<Facing, string>>;
  private readonly walkSheets: Readonly<Record<Facing, string>>;
  private readonly frameWidth: number;
  private readonly frameHeight: number;
  private readonly walkFrameCount: number;
  private readonly spriteScale: number;
  private readonly headOffset: number;
  private readonly sittingHeadOffset: number;
  private readonly depthMaxY: number;

  constructor(scene: Phaser.Scene, room: RoomDef, options: PlayerActorOptions = {}) {
    this.scene = scene;
    const spawn = options.spawn ?? { at: room.spawn.at, facing: room.spawn.facing };
    this.feetPoint = tileCenter(room, spawn.at[0], spawn.at[1]);
    this.facingValue = spawn.facing;
    this.sittingKey = options.sittingKey;
    this.sittingOffsetY = options.sittingOffsetY ?? 0;
    this.pose = poseAfterSetSitting(
      initialPose(),
      options.sitting === true && options.sittingKey !== undefined,
    );
    this.staticKeys = options.staticKeys ?? CH01_STATIC_SPRITES;
    this.walkSheets = options.walkSheets ?? CH01_WALK_SHEETS;
    this.frameWidth = options.frameWidth ?? 64;
    this.frameHeight = options.frameHeight ?? 96;
    this.walkFrameCount = options.walkFrameCount ?? CH01_WALK_FRAME_COUNT;
    this.spriteScale = options.spriteScale ?? 1;
    this.sittingScale =
      typeof options.sittingScale === 'number' && options.sittingScale > 0
        ? options.sittingScale
        : this.spriteScale;
    this.headOffset = options.headOffset ?? (this.pose.sitting ? 64 : 96);
    this.sittingHeadOffset = options.sittingHeadOffset ?? this.headOffset;
    this.depthMaxY = options.depthMaxY ?? 1600;

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
          .setDepth(characterDepth(this.feetPoint.y, this.depthMaxY))
      : null;
    // `sitting: true` 开局（战后回寝室）必须在这里就换成坐姿贴图；
    // 否则第一帧会先闪一张站着的图，等下一次 sync 才坐下。
    this.sync();
  }

  get position(): MapPoint {
    return this.feetPoint;
  }

  get facing(): Facing {
    return this.facingValue;
  }

  get isSitting(): boolean {
    return this.pose.sitting;
  }

  /** 当前贴图应有的显示缩放（坐姿和站立可能不同尺寸）。 */
  get displayScale(): number {
    return this.pose.sitting ? this.sittingScale : this.spriteScale;
  }

  /** 相机跟随/屏幕坐标换算用的显示对象；没有精灵时为 null。 */
  get display(): Phaser.GameObjects.Image | null {
    return this.sprite;
  }

  /** 头顶中心（精灵顶部），供表情气泡把尾巴钉在头上；坐着时用坐姿高度。 */
  get headPoint(): MapPoint {
    return {
      x: this.feetPoint.x,
      y: this.feetPoint.y - (this.pose.sitting ? this.sittingHeadOffset : this.headOffset),
    };
  }

  /**
   * 场景移动解算后调用；`deltaMs` 用于推进行走帧。
   *
   * 坐姿是独占姿态：坐着时调用本方法只挪脚底/朝向，不会把贴图切回行走帧。
   * （表演里 walk tween 和 sit 定时器会在同一 tick 结束，Clock 先于 TweenManager，
   * 旧实现会在这里 `sitting = false` 把 sit 覆盖掉。）
   */
  moveTo(position: MapPoint, facing: Facing, walking: boolean, deltaMs: number): void {
    this.feetPoint = position;
    this.facingValue = facing;
    this.pose = poseAfterMove(this.pose, walking, deltaMs);
    this.sync();
  }

  /** 坐下/起身的唯一入口；开始探索时由场景解除坐姿。 */
  setSitting(value: boolean): void {
    this.pose = poseAfterSetSitting(this.pose, value && this.sittingKey !== undefined);
    this.sync();
  }

  /** 刷新 sprite（章节卡/对话时也可调用）。 */
  sync(): void {
    if (!this.sprite) return;
    const sheet = this.walkSheets[this.facingValue];
    const sittingAvailable =
      this.sittingKey !== undefined && this.scene.textures.exists(this.sittingKey);
    const kind = poseTextureKind(this.pose, sittingAvailable);
    if (kind === 'sitting' && this.sittingKey !== undefined) {
      this.sprite.setTexture(this.sittingKey, 0);
    } else if (kind === 'walking' && this.scene.textures.exists(sheet)) {
      this.sprite.setTexture(
        sheet,
        walkFrameIndex(this.pose, WALK_FRAME_MS, this.walkFrameCount),
      );
    } else {
      this.sprite.setTexture(this.staticKeys[this.facingValue], 0);
    }
    // 坐姿素材画布尺寸和站立帧不同（96×160 vs 160×400），共用缩放会让人忽大忽小。
    this.sprite.setScale(this.displayScale);
    // 上下起伏已经烘进 20 帧序列里，这里不再叠一层随机相位的 bob（会和步态打架）。
    const sittingOffset = this.pose.sitting ? this.sittingOffsetY : 0;
    this.sprite.setPosition(this.feetPoint.x, this.feetPoint.y + sittingOffset);
    this.sprite.setDepth(characterDepth(this.feetPoint.y, this.depthMaxY));
    this.shadow?.setPosition(this.feetPoint.x, this.feetPoint.y + sittingOffset + 2);
  }

  destroy(): void {
    this.sprite?.destroy();
    this.shadow?.destroy();
    this.pose = initialPose();
  }
}
