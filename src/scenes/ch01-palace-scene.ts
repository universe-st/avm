import Phaser from 'phaser';
import { ref } from '@phaser-mvvm/core';
import { UIScene, type ModalHandle } from '@phaser-mvvm/phaser';
import { enterModule } from '../app/director';
import { SCENE_KEYS } from '../app/scene-keys';
import { applyCamera } from '../app/viewport';
import { autoAdvanceDelay, resolveReducedMotion, settings } from '../app/settings';
import { audioDirector } from '../audio/audio-director';
import { bgmManager } from '../audio/bgm-manager';
import { SceneLifecycle } from '../app/scene-lifecycle';
import { PALACE_ASSET_KEYS } from '../assets/keys';
import { isStageLaunchContext, stageParam } from '../dev/stage-types';
import { LAYERS, characterDepth } from '../render/layers';
import { buildPalaceHud } from '../ui/palace-hud';
import { openCh01ExitConfirm } from '../ui/ch01-modals';
import { openDialogueHistory } from '../ui/history-modal';
import { openGameMenu } from '../ui/game-menu';
import { evaluateSaveAvailability } from '../app/save/save-availability';
import { restoreSaveFromScene } from '../app/save/load';
import { CinematicDirector } from '../ui/cinematic-director';
import { EmotionBubble } from '../ui/emotion-bubble';
import { PortraitLayer } from '../ui/portrait-layer';
import {
  addDustMotes,
  addEmbers,
  addLightShaft,
  addVignette,
  impactRing,
  ledPulse,
  shardBurst,
  sparkBurst,
} from '../ui/fx-kit';
import { addStageFrame, type StageFrameHandle } from '../ui/stage-frame';
import { isPointerOnUiControl } from '../ui/ui-pointer-guard';
import {
  DIALOGUE_PAGE_CHARS,
  balanceDialogueLine,
  speakerLabel,
  speakerTone,
  type DialogueRole,
  type EmotionKind,
  type SpeakerTone,
} from '../story/dialogue';
import { paginateText } from '../story/dialogue-player';
import { Typewriter, typewriterIntervalMs, type TypewriterStep } from '../story/typewriter';
import { typeVoiceForSpeaker } from '../audio/type-voice';
import { DialogueHistory } from '../story/dialogue-history';
import { setLinearTextures } from '../ui/pixel';
import {
  PALACE_BEATS,
  PALACE_START,
  PALACE_TEXTURES,
  PALACE_WALK,
  palaceDirOf,
  reducePortraitForSay,
  type PalaceDir,
} from '../story/ch01-palace';
import {
  PalacePlayer,
  type PalaceAction,
  type PalaceActorId,
  type PalaceEmotionTarget,
  type PalaceEvent,
} from '../story/palace-player';
import { PALACE_ACTOR_SCALE, palaceHeadPointFor, palaceShadowFor } from './ch01-palace-shadow';

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
 *
 * 缩放值本身由 `ch01-palace-shadow.ts` 定义：阴影的接触面换算要用同一个数，
 * 两处各写一份迟早会飘。
 */
const ACTOR_SCALE = PALACE_ACTOR_SCALE;
const ACTOR_FOOT_RATIO = 400 / 420;

/**
 * 「换形态」的贴图：换过去的那一帧要做一下 0.5 → 0.54 → 0.5 的缩放弹跳。
 *
 * 只给这三张贴图——跪地、裂皮、现出矿工骨架，是「形体变了」；
 * 换朝向（郑卿走完台阶转身看周全）走的是同一个 `texture` action，
 * 但**不该**让整个人鼓一下，所以按 key 白名单决定，别退化成「所有换图都弹」。
 */
const FORM_TEXTURES: ReadonlySet<string> = new Set([
  PALACE_TEXTURES.chuKneel,
  PALACE_TEXTURES.eunuchCrack,
  PALACE_TEXTURES.miner,
]);

export class Ch01PalaceScene extends UIScene {
  private player!: PalacePlayer;
  private readonly actors = new Map<PalaceActorId, Phaser.GameObjects.Image>();
  /** 每个角色的脚底接触阴影，跟着走位一起移动。 */
  private readonly shadows = new Map<PalaceActorId, Phaser.GameObjects.Ellipse>();
  /**
   * 阴影相对角色落点的偏移（设计 px）。跪姿比站姿高、侧身/翻面会左右偏，
   * 走位每帧只动位置，偏移量从这张小表里取，不重新算一遍像素轮廓。
   */
  private readonly shadowOffsets = new Map<PalaceActorId, { x: number; y: number }>();
  /** 舞台框 + 氛围层（光柱/余烬/暗角），shutdown 统一销毁。 */
  private stageFrame: StageFrameHandle | null = null;
  private ambientFx: Phaser.GameObjects.GameObject[] = [];
  /** 正在走路的角色：帧动画计时器 + 停下后要换回的静态图 key。 */
  private readonly walking = new Map<PalaceActorId, { timer: Phaser.Time.TimerEvent; base: string }>();
  private director: CinematicDirector | null = null;
  private portrait: PortraitLayer | null = null;
  /** 郑卿愤怒 / 周全震惊的表情气泡（世界层，跟着镜头推拉）。 */
  private emotionBubble: EmotionBubble | null = null;
  /** 世界层（地图 + 角色）：镜头推拉通过缩放它实现，不碰相机，所以 DOM/Compose 的对话框不会被带走。 */
  private worldRoot: Phaser.GameObjects.Container | null = null;
  private roomOriginY = 96;
  private transitioning = false;
  private preview = false;
  private seed = 1;
  private encounterId = 'ch01.miner.vanguard';
  private historyModal: ModalHandle | null = null;
  /** 右上角图标菜单。金殿是纯演出：菜单只提供音量/返回标题/读档，保存项禁用。 */
  private menuModal: ModalHandle | null = null;
  private autoTimer: Phaser.Time.TimerEvent | null = null;
  /** 见 `src/app/scene-lifecycle.ts`：每轮 `create()` 复位，回调先验 runId。 */
  private readonly lifecycle = new SceneLifecycle();
  private readonly history = new DialogueHistory();
  /** 当前这句的逐字状态；say 事件进入时 start，点击补全/打完/跳过时清干净。 */
  private readonly typewriter = new Typewriter();
  /** 当前这句的声线与角色：逐字音按它选 blip（旁白最轻）。 */
  private lineSpeaker: string | undefined;
  private lineRole: DialogueRole | undefined;
  /** 上一帧已经显示的字数：一帧补多个字时也只播一次逐字音。 */
  private lastTyped = 0;
  /**
   * 当前这句的分页结果。金殿过场和寝室/御膳房共用同一条排版规则：
   * `paginateText`（句末断点 + 行首禁则）→ `balanceDialogueLine`（孤行控制）。
   */
  private linePages: readonly string[] = [];
  private linePageIndex = 0;

  private get reduced(): boolean {
    return resolveReducedMotion();
  }

  private readonly sayVisible = ref(false);
  private readonly saySpeaker = ref('');
  private readonly sayTone = ref<SpeakerTone>('default');
  private readonly sayText = ref('');
  private readonly sayHint = ref('点击继续');
  private readonly sayPageIndex = ref(0);
  private readonly sayPageCount = ref(1);

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
    /**
     * 收尾必须挂在 SHUTDOWN 事件上。
     *
     * Phaser 的 `Systems.shutdown()` 只派发 SHUTDOWN，**不会调用场景子类的 `shutdown()` 方法**；
     * 以前把清理写在同名方法里等于没写（2026-11-18 实测：切走后 portrait/worldRoot 仍在）。
     * `once` 每轮 create 重新注册，restart / 离场都能收到。
     */
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
    // 大殿的循环音（环境音/心跳）走 audioDirector 的循环表：注册宿主场景后，
    // SHUTDOWN 会由 AudioDirector 自动兜底 stopAllLoops，不依赖场景自己记得停。
    audioDirector.attach(this);
    // 场景绑定：梦域金殿《清除协议》（见 bgm-tracks.ts）。随后进战斗是同一首，实例与进度连续。
    bgmManager.enterScene(this);
    this.actors.clear();
    this.shadows.clear();
    this.shadowOffsets.clear();
    this.transitioning = false;
    // 金殿也会被 `scene.restart()` / 重进复用同一个实例：先开一轮新运行。
    this.lifecycle.beginRun();

    applyCamera(this);
    this.cameras.main.setBackgroundColor('#08060a');

    this.worldRoot = this.add.container(0, 0).setDepth(LAYERS.background);
    this.director = new CinematicDirector(this, this.reduced, this.worldRoot);
    this.portrait = new PortraitLayer(this, this.reduced);
    this.emotionBubble = new EmotionBubble(this, this.reduced);
    this.createRoom();
    this.createActors();
    this.installInput();

    this.player = new PalacePlayer(PALACE_BEATS);
    this.history.clear();
    this.cancelAutoAdvance();
    this.sayVisible.value = false;
    this.saySpeaker.value = '';
    this.sayTone.value = 'default';
    this.sayText.value = '';
    this.sayHint.value = '点击继续';
    this.sayPageIndex.value = 0;
    this.sayPageCount.value = 1;
    this.typewriter.reset();
    this.lineSpeaker = undefined;
    this.lineRole = undefined;
    this.lastTyped = 0;
    this.linePages = [];
    this.linePageIndex = 0;
  }

  override update(_time: number, delta: number): void {
    if (!this.player) return;
    this.director?.syncOverlays();
    // 菜单打开 = 演出暂停：时间线与逐字都停在当前帧。
    if (this.menuModal?.open === true) return;
    if (this.transitioning) return;
    const dt = Math.min(80, Math.max(0, delta));
    this.handleEvents(this.player.tick(dt));
    this.advanceTypewriter(dt);
  }

  /**
   * SHUTDOWN 收尾（`create()` 里注册）。不是 Phaser 的 `shutdown()` 钩子——
   * 那个方法名不会被调用，见 `create()` 的注释。
   */
  private onShutdown(): void {
    this.lifecycle.close();
    this.cancelAutoAdvance();
    this.typewriter.reset();
    this.lastTyped = 0;
    this.historyModal?.close();
    this.historyModal = null;
    this.menuModal?.close('scene');
    this.menuModal = null;
    this.input.off('pointerdown', this.onPointerDown, this);
    for (const id of [...this.walking.keys()]) this.stopWalk(id);
    // 循环音效（大殿环境音、心跳）不能跟着进战斗
    audioDirector.stopAllLoops();
    this.portrait?.destroy();
    this.portrait = null;
    this.emotionBubble?.destroy();
    this.emotionBubble = null;
    this.stageFrame?.destroy();
    this.stageFrame = null;
    for (const fx of this.ambientFx) fx.destroy();
    this.ambientFx = [];
    this.shadows.clear();
    this.shadowOffsets.clear();
    this.worldRoot?.destroy(true);
    this.worldRoot = null;
    this.director?.destroy();
    this.director = null;
  }

  protected override onBack(): boolean {
    if (this.transitioning) return true;
    this.openExitConfirm();
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

    // 舞台框：把上下留白做成墨色底板 + 鎏金界框，而不是两条纯黑。
    this.stageFrame = addStageFrame(this, {
      x: 0,
      y: this.roomOriginY,
      width: cols * tile,
      height: roomHeight,
      variant: 'palace',
      reduced: this.reduced,
    });

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
    this.addPalaceAmbience();
  }

  /**
   * 金殿氛围：窗棂斜光柱（对应旁白「光从雕花窗棂里斜进来」）、香炉余烬、浮尘、暗角。
   * 光柱/浮尘在世界层与角色之间，余烬在角色之上（前景灰），暗角压整屏。
   */
  private addPalaceAmbience(): void {
    const top = this.roomOriginY;
    const shaftA = addLightShaft(this, {
      x: 210,
      y: top + 60,
      width: 240,
      height: 760,
      angleDeg: 14,
      color: 0xffd98a,
      alpha: 0.1,
      reduced: this.reduced,
      depth: LAYERS.props + 2,
    });
    const shaftB = addLightShaft(this, {
      x: 540,
      y: top + 60,
      width: 220,
      height: 700,
      angleDeg: -12,
      color: 0xffcf7a,
      alpha: 0.08,
      reduced: this.reduced,
      depth: LAYERS.props + 2,
    });
    const dust = addDustMotes(this, {
      x: 80,
      y: top + 180,
      width: 560,
      height: 520,
      count: 18,
      seed: this.seed,
      color: 0xffe1a8,
      alpha: 0.4,
      reduced: this.reduced,
      depth: LAYERS.props + 3,
    });
    const embers = addEmbers(this, {
      x: 60,
      y: top + 620,
      width: 600,
      height: 520,
      count: 18,
      seed: this.seed,
      color: 0xe8a24c,
      reduced: this.reduced,
      depth: LAYERS.effects,
    });
    // 光柱/浮尘/余烬是「世界里的东西」，跟着镜头推拉一起缩放；暗角留在屏幕上。
    this.worldRoot?.add([shaftA, shaftB, dust, embers]);
    this.ambientFx.push(shaftA, shaftB, dust, embers, addVignette(this, { alpha: 0.38 }));
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
      // 脚底接触阴影：尺寸/位置按这张贴图自己的 alpha 轮廓算（跪姿和站姿不是一套参数），
      // 参数表在 `ch01-palace-shadow.ts`，像素数字由 `tools/measure-actor-footprint.py` 量出来。
      const params = palaceShadowFor(texture, { scale: ACTOR_SCALE });
      const shadow = this.add
        .ellipse(x + params.offsetX, y + params.offsetY, params.width, params.height, 0x000000, params.alpha)
        .setDepth(LAYERS.props - 1);
      this.worldRoot?.add(shadow);
      this.shadows.set(id, shadow);
      this.shadowOffsets.set(id, { x: params.offsetX, y: params.offsetY });

      const image = this.add
        .image(x, y, texture)
        .setOrigin(0.5, ACTOR_FOOT_RATIO)
        .setScale(ACTOR_SCALE)
        .setDepth(characterDepth(y));
      this.worldRoot?.add(image);
      this.actors.set(id, image);
    }
  }

  /**
   * 重算一个角色的阴影：换姿势（跪/裂皮/矿工）、换朝向、走完停下都要走这里。
   *
   * 行走 sheet 里没有登记接触面，会按站姿兜底——走路时本来就该用站姿阴影。
   * 换贴图后阴影的**宽度和上边缘**都要跟着动，否则跪姿又会出现「人悬在一摊影子上面」。
   */
  private syncShadow(id: PalaceActorId): void {
    const actor = this.actors.get(id);
    const shadow = this.shadows.get(id);
    if (!actor || !shadow) return;
    const params = palaceShadowFor(actor.texture.key, { scale: ACTOR_SCALE, flipX: actor.flipX });
    shadow.setSize(params.width, params.height);
    shadow.setFillStyle(0x000000, params.alpha);
    shadow.setPosition(actor.x + params.offsetX, actor.y + params.offsetY);
    this.shadowOffsets.set(id, { x: params.offsetX, y: params.offsetY });
  }

  /** 走位时阴影跟着落点走（偏移量来自接触面表：跪姿的阴影比站姿高 7.5 设计 px）。 */
  private followShadow(id: PalaceActorId): void {
    const actor = this.actors.get(id);
    const shadow = this.shadows.get(id);
    const offset = this.shadowOffsets.get(id);
    if (!actor || !shadow || !offset) return;
    shadow.setPosition(actor.x + offset.x, actor.y + offset.y);
  }

  private toPixel(at: { x: number; y: number }): { x: number; y: number } {
    const tile = PALACE_ROOM.tileSize;
    return {
      x: (at.x + 0.5) * tile,
      y: this.roomOriginY + (at.y + 1) * tile,
    };
  }

  private installInput(): void {
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.keyboard?.on('keydown-SPACE', () => this.advance());
    this.input.keyboard?.on('keydown-ENTER', () => this.advance());
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    // 按在「跳过 / 自动 / 记录 / 菜单」或任意 Compose 弹窗上时，这次点击不属于对话推进。
    if (isPointerOnUiControl(this, pointer)) return;
    this.advance();
  }

  // ---------------------------------------------------------------- 时间线

  private handleEvents(events: readonly PalaceEvent[]): void {
    for (const event of events) {
      if (event.type === 'action') this.runAction(event.action);
      else if (event.type === 'say') {
        // 开口前先把立绘对齐到说话人：数据里漏写换立绘也不会再出现「周全的名字配郑卿的脸」。
        this.alignPortraitForLine(event.speaker);
        const tone = speakerTone(event.speaker, event.role);
        this.sayTone.value = tone;
        this.saySpeaker.value = speakerLabel(event.speaker);
        this.lineSpeaker = event.speaker;
        this.lineRole = event.role;
        this.lastTyped = 0;
        this.sayVisible.value = true;
        // 整句原文进历史（分页不影响历史——玩家回看的是整句）；
        // 屏幕上先只露出这一页的遮罩文本（全角空格占位，行数不变），逐字填。
        this.history.push({
          speaker: speakerLabel(event.speaker),
          text: event.text,
          narration: tone === 'narration',
          at: this.time.now,
        });
        this.linePages = paginateText(event.text, DIALOGUE_PAGE_CHARS).map((page) =>
          balanceDialogueLine(page),
        );
        this.sayPageCount.value = this.linePages.length;
        this.showLinePage(0);
      } else if (event.type === 'complete') {
        this.cancelAutoAdvance();
        this.typewriter.reset();
        this.lastTyped = 0;
        this.linePages = [];
        this.linePageIndex = 0;
        this.sayPageIndex.value = 0;
        this.sayPageCount.value = 1;
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
    this.syncShadow(id);
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
    this.syncShadow(id);
    this.walking.delete(id);
  }

  /**
   * 显示当前这句的第 `index` 页：换文本、重置逐字、刷新页码。
   *
   * 进句/翻页都不播逐字音（这些字不是「逐字打出来」的）；之后每帧新增的字才响。
   */
  private showLinePage(index: number): void {
    const page = this.linePages[index] ?? '';
    if (page === '') {
      this.linePages = [];
      this.linePageIndex = 0;
      this.sayPageIndex.value = 0;
      this.sayPageCount.value = 1;
      this.applyTypeStep(this.typewriter.complete(), { blip: false });
      return;
    }
    this.linePageIndex = index;
    this.sayPageIndex.value = index;
    this.lastTyped = 0;
    this.applyTypeStep(this.typewriter.start(page, typewriterIntervalMs(settings.textSpeed)), {
      blip: false,
    });
  }

  /**
   * 每帧推进逐字。历史弹窗/切场/收尾期间不喂 delta，等于就地暂停。
   */
  private advanceTypewriter(deltaMs: number): void {
    if (this.lifecycle.shuttingDown || this.transitioning) return;
    if (this.historyModal?.open === true) return;
    const step = this.typewriter.tick(deltaMs);
    if (step === null) return;
    this.applyTypeStep(step);
  }

  /**
   * 把逐字状态画到 Compose 面板上。
   *
   * - 文本用遮罩串，固定文本框不会逐字跳行；
   * - 一帧「新增字数 > 0」只播一次 blip（掉帧一帧补多字也不连发）；
   * - `blip: false` 用于开场/点击补全：补出来的字不发声。
   */
  private applyTypeStep(step: TypewriterStep, options: { blip?: boolean } = {}): void {
    this.sayText.value = step.text;
    this.sayHint.value = step.done ? '点击继续' : '点击补全';
    const gained = step.revealed - this.lastTyped;
    this.lastTyped = step.revealed;
    if (options.blip !== false && gained > 0) {
      audioDirector.playTypeBlip(typeVoiceForSpeaker(this.lineSpeaker, this.lineRole));
    }
    if (step.done) this.scheduleAutoAdvance();
    else this.cancelAutoAdvance();
  }

  private advance(): void {
    if (!this.player || this.transitioning) return;
    if (this.menuModal?.open === true) return;
    if (!this.player.state.waiting) return;
    // 打字中点击 = 先补全本句：不进下一句，也不播点击音。
    if (this.typewriter.typing) {
      this.cancelAutoAdvance();
      this.applyTypeStep(this.typewriter.complete(), { blip: false });
      return;
    }
    // 这一句还有下一页：翻页重新逐字，不推进时间线（与地图对话的点击语义一致）。
    if (this.linePageIndex + 1 < this.linePages.length) {
      audioDirector.playClick();
      this.cancelAutoAdvance();
      this.showLinePage(this.linePageIndex + 1);
      return;
    }
    audioDirector.playClick();
    this.cancelAutoAdvance();
    this.sayVisible.value = false;
    this.linePages = [];
    this.linePageIndex = 0;
    this.handleEvents(this.player.advance());
  }

  private skip(): void {
    if (!this.player || this.transitioning) return;
    if (this.menuModal?.open === true) return;
    this.cancelAutoAdvance();
    this.typewriter.reset();
    this.lastTyped = 0;
    this.linePages = [];
    this.linePageIndex = 0;
    this.sayPageIndex.value = 0;
    this.sayPageCount.value = 1;
    this.sayVisible.value = false;
    this.handleEvents(this.player.skip());
  }

  private cancelAutoAdvance(): void {
    this.autoTimer?.remove();
    this.autoTimer = null;
  }

  /** 金殿的台词逐字打完后再停留；停留时长按字数估算，从打完那一刻开始计时。 */
  private scheduleAutoAdvance(): void {
    this.cancelAutoAdvance();
    if (this.lifecycle.shuttingDown) return;
    if (!settings.autoAdvance || !this.player || this.transitioning) return;
    // 打字中不计时：打完那一帧会再次调到这里。
    if (this.typewriter.typing) return;
    const delay = autoAdvanceDelay(Array.from(this.sayText.value).length, settings.textSpeed);
    this.autoTimer = this.time.delayedCall(delay, () => {
      this.autoTimer = null;
      if (this.historyModal?.open === true) return;
      if (this.player?.state.waiting) this.advance();
    });
  }

  private openHistory(): void {
    if (this.historyModal?.open === true) return;
    this.cancelAutoAdvance();
    this.historyModal = openDialogueHistory(this.mvvm, this.history.entries, {
      onClose: () => {
        this.historyModal = null;
        // 关掉记录时若还在逐字，就让它继续打；打完自然会排自动播放。
        if (this.player?.state.waiting && !this.typewriter.typing) this.scheduleAutoAdvance();
      },
    });
  }

  /**
   * 立绘对位：每句台词开口前跑一次 `reducePortraitForSay()`。
   *
   * 这是**结构性防线**，不是演出细节：谁开口，屏幕上就只能挂谁的立绘。
   * 数据里显式写的 `portrait` / `portraitHide` act 仍然优先（提前入画、换站位、收脸），
   * 这里只负责「换人时必须换脸、没立绘的人不许顶别人的脸」。
   * 契约见 `src/story/ch01-palace.ts` 的 `PALACE_SPEAKER_PORTRAIT`。
   */
  private alignPortraitForLine(speaker: string | undefined): void {
    const currentKey = this.portrait?.currentKey ?? null;
    const step = reducePortraitForSay(speaker, currentKey ? { key: currentKey } : null);
    if (step.action === 'show') this.portrait?.show(step.key, step.side);
    else if (step.action === 'hide') this.portrait?.hide();
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
      case 'emotion':
        this.showEmotionBubble(action.by, action.emotion);
        return;
      case 'sfx': {
        audioDirector.playSfxAt(action.key, {
          ...(action.volume === undefined ? {} : { volume: action.volume }),
          ...(action.loop === undefined ? {} : { loop: action.loop }),
        });
        return;
      }
      case 'sfxStop': {
        audioDirector.stopLoop(action.key);
        return;
      }
      case 'bgm': {
        bgmManager.play(action.id, action.hard === true ? { hard: true } : undefined);
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
          onUpdate: () => {
            actor.setDepth(characterDepth(actor.y));
            this.followShadow(action.actor);
          },
          onComplete: () => this.stopWalk(action.actor),
        });
        return;
      }
      case 'texture': {
        const actor = this.actors.get(action.actor);
        if (!actor) return;
        this.stopWalk(action.actor);
        actor.setTexture(action.texture);
        // 跪姿/裂皮/矿工的接触面和站姿完全不同，换完贴图立刻把影子按新轮廓重算。
        this.syncShadow(action.actor);
        // 裂皮 / 现出矿工：金属碎片 + 火星 + 轻微震屏，再给核心一盏脉动红光。
        if (action.texture === PALACE_TEXTURES.eunuchCrack || action.texture === PALACE_TEXTURES.miner) {
          shardBurst(this, actor.x, actor.y - 70, {
            color: 0xc7ccd4,
            count: 12,
            seed: this.seed,
            reduced: this.reduced,
            depth: LAYERS.effects,
          });
          sparkBurst(this, actor.x, actor.y - 60, {
            color: 0xff8a5c,
            count: 18,
            seed: this.seed + 7,
            reduced: this.reduced,
            depth: LAYERS.effects,
          });
          impactRing(this, actor.x, actor.y - 40, {
            color: 0xd6453c,
            radius: 120,
            ms: 420,
            reduced: this.reduced,
            depth: LAYERS.effects,
          });
          if (action.texture === PALACE_TEXTURES.miner) {
            this.ambientFx.push(
              ledPulse(this, actor.x, actor.y - 96, {
                color: 0xff3b30,
                radius: 10,
                reduced: this.reduced,
                depth: LAYERS.effects,
              }),
            );
          }
        }
        // 换形态的一瞬间给一点「胀」：0.5 → 0.54 → 0.5（只有 `FORM_TEXTURES` 那几张，见常量注释）
        if (!this.reduced && FORM_TEXTURES.has(action.texture)) {
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
        // 翻面会把接触面镜像到另一侧，影子跟着挪，不然侧身时影子会偏到身体一侧之外。
        this.syncShadow(action.actor);
        return;
      case 'faceRight':
        this.actors.get(action.actor)?.setFlipX(false);
        this.syncShadow(action.actor);
        return;
      case 'spawn': {
        const actor = this.actors.get(action.actor);
        const to = this.toPixel({ x: action.x, y: action.y });
        if (actor) {
          actor.setPosition(to.x, to.y).setVisible(true);
          this.syncShadow(action.actor);
          this.shadows.get(action.actor)?.setVisible(true);
          return;
        }
        return;
      }
      case 'hide':
        this.actors.get(action.actor)?.setVisible(false);
        this.shadows.get(action.actor)?.setVisible(false);
        return;
      default:
        return;
    }
  }

  /**
   * 在世界层角色的头顶冒一个表情气泡。
   *
   * 气泡自己挂在场景根节点（`EmotionBubble` 内部建 container），角色却在 `worldRoot` 里；
   * 过场推拉只缩放/平移 `worldRoot`（`CinematicDirector.zoomWorld`，不动相机），
   * 所以角色的世界层坐标要手动过一遍同一个变换，否则镜头一推气泡就离开头顶。
   * 气泡本身**不跟缩放**：它是「信息」，不是「世界里的物体」。
   */
  private showEmotionBubble(by: PalaceEmotionTarget, emotion: EmotionKind): void {
    const actor = this.actors.get(by);
    const bubble = this.emotionBubble;
    if (!actor || !bubble || !actor.visible) return;
    const head = palaceHeadPointFor(actor.texture.key, { scale: ACTOR_SCALE, flipX: actor.flipX });
    const root = this.worldRoot;
    const scale = root?.scaleX ?? 1;
    const x = (root?.x ?? 0) + (actor.x + head.offsetX) * scale;
    const y = (root?.y ?? 0) + (actor.y + head.offsetY) * scale;
    // 1100ms：够玩家看清，又不会拖到下一句台词还在头上挂着。
    bubble.show(emotion, x, y, 1100);
  }

  private finish(): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.cancelAutoAdvance();
    this.typewriter.reset();
    this.lastTyped = 0;
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
      sayTone: this.sayTone,
      sayText: this.sayText,
      sayHint: this.sayHint,
      pageIndex: this.sayPageIndex,
      pageCount: this.sayPageCount,
      onSkip: () => {
        audioDirector.playClick();
        this.skip();
      },
      onAuto: () => {
        audioDirector.playClick();
        settings.autoAdvance = !settings.autoAdvance;
        if (settings.autoAdvance && this.player?.state.waiting) this.scheduleAutoAdvance();
        else this.cancelAutoAdvance();
      },
      onHistory: () => {
        audioDirector.playClick();
        this.openHistory();
      },
      onMenu: () => {
        audioDirector.playClick();
        this.openMenu();
      },
    });
  }

  /**
   * 右上角菜单（金殿是纯演出：保存项禁用并显示原因，读档/音量/返回标题可用）。
   *
   * 打开期间暂停过场推进：`update()` 早退（时间线 + 逐字都停在当前帧），
   * SPACE/ENTER 与点屏推进也被 `menuModal` 挡住；关闭后从原状态继续。
   */
  private openMenu(): void {
    if (this.menuModal?.open === true) return;
    this.cancelAutoAdvance();
    this.menuModal = openGameMenu(this.mvvm, {
      availability: evaluateSaveAvailability({
        preview: this.preview,
        module: 'ch01Palace',
        phase: 'performance',
        dialogue: this.sayVisible.value,
        transition: this.transitioning,
        ended: this.player?.state.done === true,
      }),
      sceneLabel: '梦域 · 金殿',
      // 保存按钮在这里恒为禁用（见上面的 module），这个回调只是兜底。
      onSave: (slot) => ({ ok: false, slot, reason: 'io' }),
      onLoad: (save) => {
        void restoreSaveFromScene(this, save);
      },
      onRequestTitle: () => this.openExitConfirm(),
      onClose: () => {
        this.menuModal = null;
        if (this.player?.state.waiting && !this.typewriter.typing) this.scheduleAutoAdvance();
      },
    });
  }

  private openExitConfirm(): void {
    openCh01ExitConfirm(this.mvvm, {
      onTitle: () => {
        audioDirector.playClick();
        void enterModule(this, 'title');
      },
    });
  }
}
