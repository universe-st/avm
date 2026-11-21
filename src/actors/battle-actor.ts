import Phaser from 'phaser';
import type { Facing8 } from '../battle/types';
import { frameIndexAt } from '../battle/core/frame-sequence';
import { LAYERS, characterDepth } from '../render/layers';

/**
 * 战斗角色表现层（玩家 / 怪物共用）。
 *
 * 只负责：贴图、镜像、朝向、待机呼吸、攻击帧序列、受击闪白、倒地/消散。
 * 不负责判定、不读战斗数据；场景把「现在该做哪个动作」传进来。
 *
 * 基准约定与地图角色一致：160×400 画布、人物高 371、底边 394，
 * 所以 `setOrigin(0.5, 0.985)` 之后脚底正好落在传入的 feet 坐标上。
 */

export interface BattleStrikeStrip {
  readonly key: string;
  readonly frameCount: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly frameMs: number;
  readonly hitFrame: number;
  /** 命中后冻结帧时钟的毫秒数（打击感）；0 = 不冻结。 */
  readonly hitFreezeMs?: number;
}

export interface BattleActorArt {
  readonly idleKey: string;
  readonly guardKey?: string;
  readonly attack?: BattleStrikeStrip;
  readonly dirKeys?: Readonly<Record<Facing8, string>>;
  readonly facing?: Facing8;
  readonly displayScale: number;
  readonly figureHeight: number;
  readonly scaleForFacing?: (facing: Facing8) => number;
  readonly shadowWidth: number;
  readonly placeholder: 'player' | 'enemy';
}

const PLACEHOLDER_PLAYER = 'battle.placeholder.player';
const PLACEHOLDER_ENEMY = 'battle.placeholder.enemy';

/**
 * 素材没生成完时的占位剪影。
 *
 * 只在 `textures.exists(key) === false` 时创建；正式素材到位后不会再走这里。
 * 做成「一眼能看出是个人/是台铁皮机器」，方便白盒阶段验站位与朝向。
 */
export function ensureBattlePlaceholderTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(PLACEHOLDER_PLAYER)) {
    const canvas = scene.textures.createCanvas(PLACEHOLDER_PLAYER, 160, 400);
    if (canvas) {
      const ctx = canvas.context;
      ctx.clearRect(0, 0, 160, 400);
      ctx.fillStyle = 'rgba(242,239,230,0.88)';
      ctx.beginPath();
      ctx.arc(80, 108, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(54, 146, 52, 126);
      ctx.fillRect(60, 272, 16, 116);
      ctx.fillRect(84, 272, 16, 116);
      ctx.fillStyle = 'rgba(5,6,10,0.85)';
      ctx.beginPath();
      ctx.arc(70, 104, 4, 0, Math.PI * 2);
      ctx.arc(90, 104, 4, 0, Math.PI * 2);
      ctx.fill();
      canvas.refresh();
    }
  }

  if (!scene.textures.exists(PLACEHOLDER_ENEMY)) {
    const canvas = scene.textures.createCanvas(PLACEHOLDER_ENEMY, 240, 400);
    if (canvas) {
      const ctx = canvas.context;
      ctx.clearRect(0, 0, 240, 400);
      ctx.fillStyle = 'rgba(58,62,70,0.95)';
      ctx.beginPath();
      ctx.arc(120, 112, 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(62, 150, 116, 150);
      ctx.fillRect(72, 300, 34, 92);
      ctx.fillRect(134, 300, 34, 92);
      ctx.fillStyle = 'rgba(192,57,43,0.95)';
      ctx.beginPath();
      ctx.arc(103, 106, 9, 0, Math.PI * 2);
      ctx.arc(137, 106, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(216,183,106,0.65)';
      ctx.lineWidth = 3;
      ctx.strokeRect(63, 151, 114, 148);
      canvas.refresh();
    }
  }
}

export class BattleActor {
  private readonly scene: Phaser.Scene;
  private readonly art: BattleActorArt;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly maxFeetY: number;
  private feet: { x: number; y: number };
  private baseScale: number;
  private mirror = false;
  private pose: 'idle' | 'guard' = 'idle';
  private idleTween: Phaser.Tweens.Tween | null = null;
  private attackTimer: Phaser.Time.TimerEvent | null = null;
  private attackElapsed = 0;
  private attackFrame = -1;
  private attackHit = false;
  private attackFrozenUntil = 0;
  private destroyed = false;

  constructor(
    scene: Phaser.Scene,
    art: BattleActorArt,
    feet: { readonly x: number; readonly y: number },
    options: { readonly reduced: boolean; readonly maxFeetY: number },
  ) {
    this.scene = scene;
    this.art = art;
    this.feet = { x: feet.x, y: feet.y };
    this.maxFeetY = options.maxFeetY;
    ensureBattlePlaceholderTextures(scene);

    this.baseScale = art.displayScale;
    const textureKey = this.resolveIdleKey();
    this.baseScale = this.resolveScale();

    this.shadow = scene.add
      .ellipse(this.feet.x, this.feet.y + 2, art.shadowWidth, 18, 0x05060a, 0.34)
      .setDepth(LAYERS.props + 4);

    this.sprite = scene.add
      .image(this.feet.x, this.feet.y, textureKey)
      .setOrigin(0.5, 0.985)
      .setScale(this.baseScale)
      .setDepth(characterDepth(this.feet.y, this.maxFeetY));

    this.setPose('idle');
    if (!options.reduced) this.startBreathing();
  }

  get display(): Phaser.GameObjects.Image {
    return this.sprite;
  }

  get headPoint(): { readonly x: number; readonly y: number } {
    const height = this.art.figureHeight * Math.abs(this.baseScale);
    return { x: this.feet.x, y: this.feet.y - height };
  }

  get position(): { readonly x: number; readonly y: number } {
    return { x: this.feet.x, y: this.feet.y };
  }

  setPosition(x: number, y: number): void {
    this.feet = { x, y };
    this.sprite.setPosition(x, y).setDepth(characterDepth(y, this.maxFeetY));
    this.shadow.setPosition(x, y + 2);
  }

  setMirror(flip: boolean): void {
    this.mirror = flip;
    this.sprite.setFlipX(flip);
  }

  setFacing(facing: Facing8): void {
    if (!this.art.dirKeys) return;
    const key = this.art.dirKeys[facing] ?? this.resolveIdleKey();
    this.baseScale = this.resolveScale(facing);
    if (this.scene.textures.exists(key)) {
      this.sprite.setTexture(key);
    }
    this.sprite.setScale(this.baseScale);
    this.restartIdle();
  }

  setPose(pose: 'idle' | 'guard'): void {
    this.pose = pose;
    const key =
      pose === 'guard' && this.art.guardKey && this.scene.textures.exists(this.art.guardKey)
        ? this.art.guardKey
        : this.resolveIdleKey();
    if (this.scene.textures.exists(key)) {
      this.sprite.setTexture(key);
    }
    this.sprite.setScale(this.baseScale);
    this.restartIdle();
  }

  /** 播解离突刺帧序列；`onHit` 在命中帧触发，`onDone` 在整段结束触发。 */
  playAttack(
    options: { readonly reduced: boolean },
    onHit: () => void,
    onDone: () => void,
  ): void {
    const strip = this.art.attack;
    this.stopAttackTimer();
    if (!strip || options.reduced || !this.scene.textures.exists(strip.key)) {
      onHit();
      this.scene.time.delayedCall(options.reduced ? 80 : 160, onDone);
      return;
    }

    this.ensureAttackFrames(strip);
    this.sprite.setTexture(strip.key, 0);
    this.sprite.setScale(this.baseScale);
    this.sprite.setFlipX(this.mirror);
    this.attackElapsed = 0;
    this.attackFrame = 0;
    this.attackHit = false;
    this.attackFrozenUntil = 0;
    this.stopBreathing();

    const total = strip.frameCount * strip.frameMs;
    const lastTick = { at: 0 };

    this.attackTimer = this.scene.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (this.destroyed) return;
        const now = this.scene.time.now;
        const previous = lastTick.at;
        lastTick.at = now;
        const delta = previous === 0 ? 16 : Math.min(48, now - previous);

        // 命中后的「卡肉」：帧时钟暂停一小段，视觉上像真的打实了。
        if (this.attackFrozenUntil > 0) {
          if (now < this.attackFrozenUntil) return;
          this.attackFrozenUntil = 0;
        }

        this.attackElapsed += delta;
        const index = frameIndexAt(this.attackElapsed, strip.frameCount, strip.frameMs);
        if (index !== this.attackFrame) {
          this.attackFrame = index;
          this.sprite.setFrame(index);
        }
        if (!this.attackHit && index >= strip.hitFrame) {
          this.attackHit = true;
          if ((strip.hitFreezeMs ?? 0) > 0) {
            this.attackFrozenUntil = now + (strip.hitFreezeMs ?? 0);
          }
          onHit();
        }
        if (this.attackElapsed >= total) {
          this.stopAttackTimer();
          this.finishAttack();
          onDone();
        }
      },
    });
  }

  /** 受击闪白。 */
  flash(color = 0xffffff, ms = 80): void {
    if (!this.scene.textures.exists(this.sprite.texture.key)) return;
    this.sprite.setTint(color).setTintMode(Phaser.TintModes.FILL);
    this.scene.time.delayedCall(ms, () => {
      if (!this.destroyed) this.sprite.clearTint();
    });
  }

  /** 小幅前冲再回位（玩家突刺/怪物攻击的「发力」）。 */
  nudge(dx: number, dy: number, ms: number): void {
    const homeX = this.feet.x;
    const homeY = this.feet.y;
    this.scene.tweens.add({
      targets: this.sprite,
      x: homeX + dx,
      y: homeY + dy,
      duration: ms,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** 被打退：位移后不回位（由场景在结算后重新摆位）。 */
  knockback(dx: number, dy: number, ms: number): void {
    this.scene.tweens.add({
      targets: this.sprite,
      x: this.sprite.x + dx,
      y: this.sprite.y + dy,
      duration: ms,
      ease: 'Quad.easeOut',
    });
  }

  die(options: { readonly reduced: boolean; readonly player: boolean }): void {
    this.stopAttackTimer();
    this.stopBreathing();
    if (options.reduced) {
      this.sprite.setAlpha(0.15);
      this.shadow.setAlpha(0.1);
      return;
    }
    this.scene.tweens.add({
      targets: this.sprite,
      alpha: 0,
      angle: options.player ? 82 : 0,
      scaleX: this.baseScale * (options.player ? 1 : 0.92),
      scaleY: this.baseScale * (options.player ? 1 : 0.92),
      y: this.feet.y + (options.player ? 34 : 0),
      duration: options.player ? 420 : 520,
      ease: 'Quad.easeIn',
    });
    this.scene.tweens.add({
      targets: this.shadow,
      alpha: 0,
      duration: options.player ? 420 : 520,
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.stopAttackTimer();
    this.stopBreathing();
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.shadow);
    this.sprite.destroy();
    this.shadow.destroy();
  }

  private resolveIdleKey(): string {
    if (this.art.dirKeys) {
      const facing = this.art.facing ?? 'left';
      const dirKey = this.art.dirKeys[facing];
      if (dirKey && this.scene.textures.exists(dirKey)) return dirKey;
    }
    if (this.scene.textures.exists(this.art.idleKey)) return this.art.idleKey;
    return this.art.placeholder === 'player' ? PLACEHOLDER_PLAYER : PLACEHOLDER_ENEMY;
  }

  private resolveScale(facing?: Facing8): number {
    if (facing && this.art.scaleForFacing) return this.art.scaleForFacing(facing);
    if (this.art.dirKeys) {
      const key = this.art.dirKeys[facing ?? this.art.facing ?? 'left'];
      if (!key || !this.scene.textures.exists(key)) {
        // 八向缺图时退回旧单面图的放大比例。
        return this.art.displayScale;
      }
    }
    return this.art.displayScale;
  }

  private ensureAttackFrames(strip: BattleStrikeStrip): void {
    const texture = this.scene.textures.get(strip.key);
    for (let index = 0; index < strip.frameCount; index += 1) {
      if (!texture.has(String(index))) {
        texture.add(
          index,
          0,
          index * strip.frameWidth,
          0,
          strip.frameWidth,
          strip.frameHeight,
        );
      }
    }
  }

  private finishAttack(): void {
    this.attackFrame = -1;
    this.sprite.setScale(this.baseScale);
    this.setPose(this.pose);
  }

  private stopAttackTimer(): void {
    if (this.attackTimer) {
      this.attackTimer.remove(false);
      this.attackTimer = null;
    }
    this.attackElapsed = 0;
    this.attackFrame = -1;
    this.attackHit = false;
    this.attackFrozenUntil = 0;
  }

  private startBreathing(): void {
    if (this.destroyed) return;
    this.stopBreathing();
    this.idleTween = this.scene.tweens.add({
      targets: this.sprite,
      scaleY: this.baseScale * 1.015,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopBreathing(): void {
    if (this.idleTween) {
      this.idleTween.remove();
      this.idleTween = null;
    }
  }

  private restartIdle(): void {
    this.stopBreathing();
    this.sprite.setScale(this.baseScale);
    this.startBreathing();
  }
}
