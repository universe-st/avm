import Phaser from 'phaser';
import { ref } from '@phaser-mvvm/core';
import { UIScene, prefersReducedMotion } from '@phaser-mvvm/phaser';
import { enterModule } from '../app/director';
import { SCENE_KEYS } from '../app/scene-keys';
import { applyCamera } from '../app/viewport';
import { audioDirector } from '../audio/audio-director';
import { PALACE_ASSET_KEYS } from '../assets/keys';
import { isStageLaunchContext, stageParam } from '../dev/stage-types';
import { LAYERS, characterDepth } from '../render/layers';
import { buildPalaceHud } from '../ui/palace-hud';
import { CinematicDirector } from '../ui/cinematic-director';
import { PortraitLayer } from '../ui/portrait-layer';
import { setLinearTextures } from '../ui/pixel';
import {
  PALACE_BEATS,
  PALACE_START,
  PALACE_TEXTURES,
  PALACE_WALK,
  palaceDirOf,
  type PalaceDir,
} from '../story/ch01-palace';
import {
  PalacePlayer,
  type PalaceAction,
  type PalaceActorId,
  type PalaceEvent,
} from '../story/palace-player';

/** 金殿房间：33×54 格，和寝室同一套坐标口径（设计宽 720）。 */
const PALACE_ROOM = {
  size: [33, 54] as const,
  /** 设计像素/格：720 / 33。 */
  tileSize: 720 / 33,
};

/**
 * 角色帧是 200×420，脚底基准线在 400：
 * 金殿比寝室大得多（也要同时站五个人），按 0.5 缩放后约 186 设计像素高，
 * 一个人横向约 5 格宽，才排得下「龙椅 + 楚公公 + 两个太监 + 跪着的周全」。
 */
const ACTOR_SCALE = 0.5;
const ACTOR_FOOT_RATIO = 400 / 420;

export class Ch01PalaceScene extends UIScene {
  private player!: PalacePlayer;
  private readonly actors = new Map<PalaceActorId, Phaser.GameObjects.Image>();
  /** 正在走路的角色：帧动画计时器 + 停下后要换回的静态图 key。 */
  private readonly walking = new Map<PalaceActorId, { timer: Phaser.Time.TimerEvent; base: string }>();
  private director: CinematicDirector | null = null;
  private portrait: PortraitLayer | null = null;
  /** 世界层（地图 + 角色）：镜头推拉通过缩放它实现，不碰相机，所以 DOM/Compose 的对话框不会被带走。 */
  private worldRoot: Phaser.GameObjects.Container | null = null;
  private roomOriginY = 96;
  private transitioning = false;
  private preview = false;
  private seed = 1;
  private encounterId = 'ch01.miner.vanguard';
  private readonly reduced = prefersReducedMotion();

  private readonly sayVisible = ref(false);
  private readonly saySpeaker = ref('');
  private readonly sayText = ref('');
  private readonly sayHint = ref('点击继续');

  constructor() {
    super(SCENE_KEYS.ch01Palace);
  }

  init(data: unknown): void {
    const launch = data as { encounterId?: string; seed?: number; preview?: boolean } | null;
    const context = isStageLaunchContext(data) ? data : null;
    this.preview = context?.preview === true || launch?.preview === true;
    this.seed = context?.seed ?? launch?.seed ?? 1;
    if (typeof launch?.encounterId === 'string') this.encounterId = launch.encounterId;
    if (context && stageParam(context, 'phase') === 'skip') {
      // 调试用：直接看最后的矿工形态
    }
  }

  protected override content(): void {
    this.palaceHud();
  }

  override create(): void {
    super.create();
    this.actors.clear();
    this.transitioning = false;

    applyCamera(this);
    this.cameras.main.setBackgroundColor('#08060a');

    this.worldRoot = this.add.container(0, 0).setDepth(LAYERS.background);
    this.director = new CinematicDirector(this, this.reduced, this.worldRoot);
    this.portrait = new PortraitLayer(this, this.reduced);
    this.createRoom();
    this.createActors();
    this.installInput();

    this.player = new PalacePlayer(PALACE_BEATS);
    this.sayVisible.value = false;
    this.saySpeaker.value = '';
    this.sayText.value = '';
    this.sayHint.value = '点击继续';
  }

  override update(_time: number, delta: number): void {
    if (!this.player) return;
    this.director?.syncOverlays();
    if (this.transitioning) return;
    const dt = Math.min(80, Math.max(0, delta));
    this.handleEvents(this.player.tick(dt));
  }

  shutdown(): void {
    for (const id of [...this.walking.keys()]) this.stopWalk(id);
    // 循环音效（大殿环境音、心跳）不能跟着进战斗
    audioDirector.stopAllLoops();
    this.portrait?.destroy();
    this.portrait = null;
    this.worldRoot?.destroy(true);
    this.worldRoot = null;
    this.director?.destroy();
    this.director = null;
  }

  protected override onBack(): boolean {
    if (this.transitioning) return true;
    void enterModule(this, 'title');
    return true;
  }

  // ---------------------------------------------------------------- 场景搭建

  private createRoom(): void {
    const [cols, rows] = PALACE_ROOM.size;
    const tile = PALACE_ROOM.tileSize;
    const roomHeight = rows * tile;
    const designH = this.scale.height / (this.cameras.main.zoom || 1);
    // 整座殿一屏看全：房间比屏幕高时向下取整对齐，避免上下留白不一致。
    this.roomOriginY = Math.round(Math.max(0, (designH - roomHeight) / 2));

    const key = PALACE_ASSET_KEYS.map.hall;
    if (!this.textures.exists(key)) {
      this.add
        .rectangle(0, this.roomOriginY, cols * tile, rows * tile, 0x241416)
        .setOrigin(0, 0)
        .setDepth(LAYERS.background);
      return;
    }
    setLinearTextures(this, [key]);
    const map = this.add
      .image(0, this.roomOriginY, key)
      .setOrigin(0, 0)
      .setDisplaySize(cols * tile, rows * tile);
    this.worldRoot?.add(map);
  }

  private createActors(): void {
    const spawns: Array<[PalaceActorId, { x: number; y: number }, string]> = [
      ['zheng', PALACE_START.zheng, PALACE_TEXTURES.zhengDown],
      ['chu', PALACE_START.chu, PALACE_TEXTURES.chuRight],
      ['eunuchLeft', PALACE_START.eunuchLeft, PALACE_TEXTURES.eunuch],
      ['eunuchRight', PALACE_START.eunuchRight, PALACE_TEXTURES.eunuch],
      ['zhou', PALACE_START.zhou, PALACE_TEXTURES.zhouKneelUp],
    ];

    for (const [id, at, texture] of spawns) {
      const { x, y } = this.toPixel(at);
      const image = this.add
        .image(x, y, texture)
        .setOrigin(0.5, ACTOR_FOOT_RATIO)
        .setScale(ACTOR_SCALE)
        .setDepth(characterDepth(y));
      this.worldRoot?.add(image);
      this.actors.set(id, image);
    }
  }

  private toPixel(at: { x: number; y: number }): { x: number; y: number } {
    const tile = PALACE_ROOM.tileSize;
    return {
      x: (at.x + 0.5) * tile,
      y: this.roomOriginY + (at.y + 1) * tile,
    };
  }

  private installInput(): void {
    this.input.on('pointerdown', () => this.advance());
    this.input.keyboard?.on('keydown-SPACE', () => this.advance());
    this.input.keyboard?.on('keydown-ENTER', () => this.advance());
  }

  // ---------------------------------------------------------------- 时间线

  private handleEvents(events: readonly PalaceEvent[]): void {
    for (const event of events) {
      if (event.type === 'action') this.runAction(event.action);
      else if (event.type === 'say') {
        this.saySpeaker.value = event.speaker === '旁白' || !event.speaker ? '' : event.speaker;
        this.sayText.value = event.text;
        this.sayVisible.value = true;
        this.sayHint.value = '点击继续';
      } else if (event.type === 'complete') {
        this.finish();
      }
    }
  }

  /** 每个角色四个正向的静态图（走完停下要回到对应朝向；斜向落回正面）。 */
  private staticFor(id: PalaceActorId, dir: PalaceDir): string {
    const cardinals = ['down', 'up', 'left', 'right'] as const;
    const key: (typeof cardinals)[number] = (cardinals as readonly string[]).includes(dir)
      ? (dir as (typeof cardinals)[number])
      : 'down';
    const map: Partial<Record<PalaceActorId, Record<(typeof cardinals)[number], string>>> = {
      zheng: {
        down: PALACE_TEXTURES.zhengDown,
        up: PALACE_TEXTURES.zhengUp,
        left: PALACE_TEXTURES.zhengLeft,
        right: PALACE_TEXTURES.zhengRight,
      },
      chu: {
        down: PALACE_TEXTURES.chuDown,
        up: PALACE_TEXTURES.chuUp,
        left: PALACE_TEXTURES.chuLeft,
        right: PALACE_TEXTURES.chuRight,
      },
    };
    const entry = map[id];
    if (!entry) return '';
    return entry[key];
  }

  /** 每个角色的行走 sheet（只有郑卿和楚公公做了八方向行走）。 */
  private walkSheetsFor(id: PalaceActorId): Partial<Record<PalaceDir, string>> {
    if (id === 'zheng') return PALACE_WALK.zheng;
    if (id === 'chu') return PALACE_WALK.chu;
    return {};
  }

  private startWalk(id: PalaceActorId, dir: PalaceDir): void {
    const sheet = this.walkSheetsFor(id)[dir];
    const actor = this.actors.get(id);
    if (!actor || !sheet || !this.textures.exists(sheet)) return;

    const base = this.staticFor(id, dir);
    this.stopWalk(id);

    const texture = this.textures.get(sheet);
    if (texture.frameTotal <= 1) {
      for (let i = 0; i < PALACE_WALK.frameCount; i += 1) {
        texture.add(i, 0, i * PALACE_WALK.frameWidth, 0, PALACE_WALK.frameWidth, PALACE_WALK.frameHeight);
      }
    }
    actor.setTexture(sheet, 0);
    const timer = this.time.addEvent({
      delay: 65,
      loop: true,
      callback: () => {
        const current = typeof actor.frame?.name === 'number' ? actor.frame.name : 0;
        actor.setFrame((current + 1) % PALACE_WALK.frameCount);
      },
    });
    this.walking.set(id, { timer, base });
  }

  private stopWalk(id: PalaceActorId): void {
    const entry = this.walking.get(id);
    if (!entry) return;
    entry.timer.remove(false);
    if (entry.base) this.actors.get(id)?.setTexture(entry.base, 0);
    this.walking.delete(id);
  }

  private advance(): void {
    if (!this.player || this.transitioning) return;
    if (!this.player.state.waiting) return;
    audioDirector.playClick();
    this.sayVisible.value = false;
    this.handleEvents(this.player.advance());
  }

  private skip(): void {
    if (!this.player || this.transitioning) return;
    this.sayVisible.value = false;
    this.handleEvents(this.player.skip());
  }

  private runAction(action: PalaceAction): void {
    switch (action.kind) {
      case 'camera':
        this.director?.zoomTo(action.zoom, action.ms);
        return;
      case 'pan':
        this.director?.panBy(action.dx, action.dy, action.ms);
        return;
      case 'letterbox':
        this.director?.letterbox(action.on, action.ms ?? 260);
        return;
      case 'speedlines':
        this.director?.speedLines(action.color, action.ms ?? 420);
        return;
      case 'stamp':
        this.director?.stamp(action.text, action.tone ?? 'gold', action.ms ?? 900);
        return;
      case 'cut':
        this.director?.cut(action.color ?? 'black', action.ms ?? 320);
        return;
      case 'hitstop':
        this.director?.hitstop(action.ms ?? 90);
        return;
      case 'portrait':
        this.portrait?.show(action.key, action.side ?? 'right');
        return;
      case 'portraitHide':
        this.portrait?.hide();
        return;
      case 'sfx': {
        audioDirector.playSfxAt(action.key, {
          ...(action.volume === undefined ? {} : { volume: action.volume }),
          ...(action.loop === undefined ? {} : { loop: action.loop }),
        });
        return;
      }
      case 'fx': {
        if (this.reduced) return;
        if (action.fx === 'flash') this.cameras.main.flash(200, 255, 255, 255);
        else if (action.fx === 'flashRed') this.cameras.main.flash(220, 255, 80, 60);
        else if (action.fx === 'shake') this.cameras.main.shake(220, 0.006);
        else this.cameras.main.shake(600, 0.012);
        return;
      }
      case 'move': {
        const actor = this.actors.get(action.actor);
        if (!actor) return;
        const to = this.toPixel({ x: action.x, y: action.y });
        // 位移超过一格半才播行走，避免小碎步抖动
        const dx = to.x - actor.x;
        const dy = to.y - actor.y;
        const far = Math.hypot(dx, dy) > PALACE_ROOM.tileSize * 1.5;
        if (far) this.startWalk(action.actor, palaceDirOf(dx, dy));
        this.tweens.add({
          targets: actor,
          x: to.x,
          y: to.y,
          duration: this.reduced ? 0 : action.ms,
          ease: 'Sine.easeInOut',
          // 走位时同步脚底深度，否则走到别人前面会被挡住。
          onUpdate: () => actor.setDepth(characterDepth(actor.y)),
          onComplete: () => this.stopWalk(action.actor),
        });
        return;
      }
      case 'texture': {
        const actor = this.actors.get(action.actor);
        if (!actor) return;
        this.stopWalk(action.actor);
        actor.setTexture(action.texture);
        // 换形态的一瞬间给一点「胀」：0.5 → 0.54 → 0.5
        if (!this.reduced) {
          const base = actor.scaleX;
          this.tweens.add({
            targets: actor,
            scaleX: base * 1.08,
            scaleY: base * 1.08,
            duration: 120,
            yoyo: true,
            ease: 'Quad.easeOut',
          });
        }
        return;
      }
      case 'faceLeft':
        this.actors.get(action.actor)?.setFlipX(true);
        return;
      case 'faceRight':
        this.actors.get(action.actor)?.setFlipX(false);
        return;
      case 'spawn': {
        const actor = this.actors.get(action.actor);
        const to = this.toPixel({ x: action.x, y: action.y });
        if (actor) {
          actor.setPosition(to.x, to.y).setVisible(true);
          return;
        }
        return;
      }
      case 'hide':
        this.actors.get(action.actor)?.setVisible(false);
        return;
      default:
        return;
    }
  }

  private finish(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.sayVisible.value = false;
    this.cameras.main.fadeOut(this.reduced ? 120 : 320, 4, 4, 8);
    audioDirector.stopAllLoops();
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      void enterModule(this, 'battleCh01', {
        encounterId: this.encounterId,
        seed: this.seed,
        preview: this.preview,
      }).catch((error: unknown) => {
        console.warn('[ch01-palace] 进入战斗失败', error);
        this.transitioning = false;
      });
    });
  }

  // ---------------------------------------------------------------- HUD

  private palaceHud(): void {
    buildPalaceHud({
      sayVisible: this.sayVisible,
      saySpeaker: this.saySpeaker,
      sayText: this.sayText,
      sayHint: this.sayHint,
      onSkip: () => {
        audioDirector.playClick();
        this.skip();
      },
    });
  }
}
