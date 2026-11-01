import Phaser from 'phaser';
import { ref } from '@phaser-mvvm/core';
import { UIScene, type ModalHandle } from '@phaser-mvvm/phaser';
import {
  CH01_ASSET_KEYS,
  CH01_Q_FRAME,
  CH01_Q_STATIC_SPRITES,
  CH01_Q_WALK_FRAME_COUNT,
  CH01_Q_WALK_SHEETS,
} from '../assets/keys';
import { PlayerActor } from '../actors/player-actor';
import { KitchenEnemy } from '../actors/kitchen-enemy';
import { PairActor } from '../actors/pair-actor';
import { Ch01KitchenRoomView } from '../world/ch01-kitchen-room-view';
import { buildKitchenHud } from '../ui/ch01-kitchen-hud';
import {
  openKitchenEndCard,
  openKitchenExitConfirm,
  openKitchenFailCard,
} from '../ui/kitchen-modals';
import { LAYERS } from '../render/layers';
import { SCENE_KEYS } from '../app/scene-keys';
import { applyCamera, getViewportPlan } from '../app/viewport';
import { enterModule } from '../app/director';
import { CH01_KITCHEN_BATTLE_ID } from '../battle/data/ch01-kitchen';
import { audioDirector } from '../audio/audio-director';
import { CH01_KITCHEN_ASSET_KEYS, KITCHEN_CAST } from '../assets/keys';
import { typeVoiceForSpeaker } from '../audio/type-voice';
import { autoAdvanceDelay, resolveReducedMotion, settings, textSpeedFactor } from '../app/settings';
import { isStageLaunchContext, stageBoolParam, stageParam, type StageLaunchContext } from '../dev/stage-types';
import { CH01_KITCHEN_ROOM, KITCHEN_GATE_GUARD_ID } from '../map/rooms/ch01-kitchen';
import { canBackstab } from '../map/core/ambush';
import {
  castVisionPolygon,
  facingToRadians,
  tilesInPolygon,
  type VisionPolygon,
  hasLineOfSight,
  isAngleInCone,
  tileKey,
  visibleTiles,
} from '../map/core/vision';
import { findInteractableNear, interactableCenter, tileCenter, worldToTile } from '../map/core/room';
import { KITCHEN_PLAYER_FOOT } from '../map/player-foot';
import {
  facingFromVector,
  moveWithCollision,
  normalizeDirection,
} from '../map/core/collision';
import type { HideDef, InteractableDef, MapPoint, PatrolDef, RoomDef } from '../map/types';
import {
  KITCHEN_CHAPTER_CARD,
  KITCHEN_HIDE_PROMPTS,
  KITCHEN_INTERACTABLE_PROMPTS,
  KITCHEN_NODES,
  KITCHEN_OBJECTIVES,
  type KitchenInteractableId,
} from '../story/ch01-kitchen';
import { DialoguePlayer, type DialogueEvent } from '../story/dialogue-player';
import {
  DIALOGUE_TYPE_MS,
  speakerLabel,
  speakerTone,
  type DialogueLine,
  type SpeakerTone,
} from '../story/dialogue';
import { DialogueHistory } from '../story/dialogue-history';
import { openDialogueHistory } from '../ui/history-modal';
import { GOLD, TitleCard, makeSceneText } from '../ui/cinematic';
import { addVignette } from '../ui/fx-kit';
import { VirtualJoystick } from '../ui/joystick';

const DIALOGUE_PAGE_CHARS = 68;
const PLAYER_SCALE = 0.6138;
const PLAYER_HEAD_OFFSET = 232;
const WALK_SPEED = 210;
const SNEAK_SPEED = 120;
const RUN_SPEED = 345;
const INTERACT_KEY = 'E';
const BACKSTAB_KEY = 'J';
/**
 * 第二幕「躲起来」的窗口长度。
 *
 * 设计稿写的是 4 秒，实测拿不出来：门一开玩家要同时辨认「进来两个人 + 一个红视锥门卫 +
 * 屏风在哪」，而且屏风在挡路柱 (17,5)-(17,6) 的东侧，得先上到 row 4 再绕过去——
 * 4 秒连方向都定不下来。6.5 秒仍会在最后一段撞线，9 秒是「紧但不冤」的实测值。
 * 催命感由门轴声 + 心跳 + 门卫红视锥提供，不再靠掐秒。
 */
const HIDE_DEADLINE_MS = 9000;
/**
 * 走速一律按「格/秒」对齐：御膳房 2026-10-31 从 `tileSize 64` 放大到 96，
 * 所有 px 速度 ×1.5，追逐/赛跑的松紧和调校时完全一致。
 * 老麦/老肯仍比玩家步行（210）慢，玩家才追得上。
 */
const PAIR_SPEED = 158;
/** 老肯第三幕「去草堆看看」的步速：故意比玩家慢一截，这场赛跑才不是必输。 */
const KEN_SEARCH_SPEED = 123;
/** 老肯听完老麦那句「这草也被人动过」之后先犹豫一下再挪步，给玩家反应时间。 */
const KEN_SEARCH_DELAY_MS = 1600;

interface MovementKeys {
  readonly W: Phaser.Input.Keyboard.Key;
  readonly A: Phaser.Input.Keyboard.Key;
  readonly S: Phaser.Input.Keyboard.Key;
  readonly D: Phaser.Input.Keyboard.Key;
  readonly UP: Phaser.Input.Keyboard.Key;
  readonly DOWN: Phaser.Input.Keyboard.Key;
  readonly LEFT: Phaser.Input.Keyboard.Key;
  readonly RIGHT: Phaser.Input.Keyboard.Key;
}

type KitchenPhase = 'intro' | 'explore' | 'gate' | 'hide' | 'pair' | 'haystack' | 'done' | 'failed';
type KitchenPreviewPhase = 'intro' | 'explore' | 'gate' | 'hide' | 'haystack' | 'done' | 'fail';

interface KitchenRetryData {
  readonly retry?: 'explore' | 'gate';
  /** 战斗里已经解决掉的巡逻 id：重开时不再生成。 */
  readonly cleared?: string;
  /** 从战斗打回来时保持预览态，不写真实进度。 */
  readonly preview?: boolean;
}

const KITCHEN_PREVIEW_PHASES: readonly KitchenPreviewPhase[] = [
  'intro',
  'explore',
  'gate',
  'hide',
  'haystack',
  'done',
  'fail',
];

function normalizePreviewPhase(raw: string | undefined): KitchenPreviewPhase {
  if (
    raw === 'explore' ||
    raw === 'gate' ||
    raw === 'hide' ||
    raw === 'haystack' ||
    raw === 'done' ||
    raw === 'fail'
  ) {
    return raw;
  }
  return 'intro';
}

function isKitchenRetryData(value: unknown): value is KitchenRetryData {
  if (value === null || typeof value !== 'object') return false;
  const retry = (value as KitchenRetryData).retry;
  return retry === 'explore' || retry === 'gate';
}

/**
 * 第一章第二节《御膳房》P1 白盒。
 *
 * 一张 32×64 灰盒地图；玩家视野/迷雾、巡逻/警戒、背后偷袭、躲藏、
 * 门开躲屏风、草堆偷袭老肯。第四/五幕只做到结束卡 stub。
 */
export class Ch01KitchenScene extends UIScene {
  private room: RoomDef = CH01_KITCHEN_ROOM;
  /** 已经被战斗清掉的巡逻（本次运行内有效）。 */
  private clearedEnemies = new Set<string>();
  /** 正在跳去战斗，防重复触发。 */
  private encountering = false;
  /** 老麦/老肯的发现判定节流。 */
  private pairSpotClock = 0;
  private view: Ch01KitchenRoomView | null = null;
  private player: PlayerActor | null = null;
  private xiaobai: Phaser.GameObjects.Image | null = null;
  private enemies: KitchenEnemy[] = [];
  private pairMai: PairActor | null = null;
  private pairKen: PairActor | null = null;
  private guard: KitchenEnemy | null = null;

  /**
   * 累积暗幕：一张「房间大小」的低分辨率 RenderTexture，铺满纯黑，
   * 每次视野更新把扇形多边形**擦掉**——擦过的区域就是永久已探索。
   * 放大显示时走线性过滤，边界天然是柔弧，不再是 96px 的台阶。
   */
  private fog: Phaser.GameObjects.Image | null = null;
  /**
   * 暗幕的像素画布。用 CanvasTexture 而不是 RenderTexture：
   * `destination-out` 合成是 2D 上下文的标准行为，擦除语义稳定，
   * 还能顺手画径向渐变的环境光。
   */
  private fogCanvas: Phaser.Textures.CanvasTexture | null = null;
  private fogKey = 'kitchen-fog';
  /** 玩家连续朝向（弧度）。`facing` 只有 8 档，扇形会每 45° 跳一下。 */
  private headingRad = -Math.PI / 2;
  /** 上次擦除时的位置/朝向，用来跳过无意义的整张纹理上传。 */
  private lastCarve = { x: Number.NaN, y: Number.NaN, heading: Number.NaN };
  /** 当前视野多边形（渲染和"哪些格算看见"共用同一份）；`__AVM__` 里可读取做调试。 */
  protected visionPolygon: VisionPolygon | null = null;
  private cones: Phaser.GameObjects.Graphics | null = null;
  private alertBorder: Phaser.GameObjects.Graphics | null = null;
  private promptText: Phaser.GameObjects.Text | null = null;
  private backstabText: Phaser.GameObjects.Text | null = null;
  /** 躲藏窗口里钉在屏风上的指路提示（黑幕里玩家否则找不到该往哪跑）。 */
  private hideHintText: Phaser.GameObjects.Text | null = null;
  /** 老麦停下等玩家时头顶的「跟上来」，否则玩家不知道队伍为什么不动了。 */
  private pairWaitText: Phaser.GameObjects.Text | null = null;
  private highlightRing: Phaser.GameObjects.Ellipse | null = null;
  private card: TitleCard | null = null;
  private cardTimer: Phaser.Time.TimerEvent | null = null;
  private cardDone = false;

  private joystick: VirtualJoystick | null = null;
  private keys: MovementKeys | null = null;
  private dialogue: DialoguePlayer | null = null;
  private dialogueOnDone: (() => void) | null = null;
  private readonly history = new DialogueHistory();
  private historyModal: ModalHandle | null = null;
  private failCard: ModalHandle | null = null;
  private endCard: ModalHandle | null = null;
  private exitModal: ModalHandle | null = null;
  private autoTimer: Phaser.Time.TimerEvent | null = null;
  private historyLineIndex = -1;
  private lastTyped = 0;

  private phase: KitchenPhase = 'intro';
  private previewPhase: KitchenPreviewPhase = 'intro';
  private retryPhase: 'explore' | 'gate' = 'explore';
  private retried = false;
  private preview = false;
  private debug = false;
  private previewSpot: string | null = null;
  private ended = false;
  private cardVisible = false;
  private tutorialDismissed = false;
  private gateTriggered = false;
  private gateOpen = false;
  private hideDeadline = 0;
  private hideCooldownUntil = 0;
  private hidden: string | null = null;
  private haystackReady = false;
  private disguised = false;
  private pairAtStove = false;
  private pairWalking = false;
  /** 老麦这一趟要走的拐点，按段推进。 */
  private pairWaypoints: MapPoint[] = [];
  private pairStep = 0;
  private pairWaiting = false;
  private backstabTarget: KitchenEnemy | null = null;
  private heartbeatOn = false;
  private lastAlert: 'calm' | 'suspicious' | 'chase' = 'calm';
  private sneak = false;
  private running = false;
  private visionClock = 0;
  private coneClock = 0;
  private stepDistance = 0;
  private stepFlip = false;
  private visible: ReadonlySet<string> = new Set<string>();
  private explored = new Set<string>();

  private readonly objective = ref<string>(KITCHEN_OBJECTIVES.explore);
  private readonly dialogueVisible = ref(false);
  private readonly dialogueSpeaker = ref('');
  private readonly dialogueTone = ref<SpeakerTone>('default');
  private readonly dialogueText = ref('');
  private readonly dialogueHint = ref('继续');
  private readonly dialoguePageIndex = ref(0);
  private readonly dialoguePageCount = ref(1);
  private readonly interactLabel = ref('交互');
  private readonly interactAvailable = ref(false);
  private readonly backstabAvailable = ref(false);
  private readonly sneakOn = ref(false);
  private readonly alertText = ref('');
  private readonly tutorialVisible = ref(false);
  private readonly cardActive = ref(false);
  /** 本节结束后（结束卡/失败卡）把底部操作条整块收掉，别留一个还能按的按钮。 */
  private readonly runOver = ref(false);
  private dialogueRole: DialogueLine['role'] | null = null;

  constructor() {
    super(SCENE_KEYS.ch01Kitchen);
  }

  private get reduced(): boolean {
    return resolveReducedMotion();
  }

  init(data: unknown): void {
    this.preview = false;
    this.debug = false;
    this.previewPhase = 'intro';
    this.retryPhase = 'explore';
    this.retried = false;
    this.previewSpot = null;

    if (isStageLaunchContext(data)) {
      const context: StageLaunchContext = data;
      this.preview = true;
      this.debug = stageBoolParam(context, 'debug', false);
      this.previewSpot = stageParam(context, 'spot') ?? null;
      const raw = stageParam(context, 'phase');
      this.previewPhase = normalizePreviewPhase(raw);
      if (raw !== undefined && !KITCHEN_PREVIEW_PHASES.includes(raw as KitchenPreviewPhase)) {
        console.warn(`[ch01-kitchen] 未知 phase=${raw}，回退 intro`);
      }
      return;
    }

    if (isKitchenRetryData(data)) {
      this.retried = true;
      this.retryPhase = data.retry ?? 'explore';
      if (data.cleared) this.clearedEnemies.add(data.cleared);
      // 从战斗打回来仍然是预览会话，别写真实进度。
      if (data.preview === true) this.preview = true;
    }
  }

  override create(): void {
    this.resetState();
    applyCamera(this);
    this.cameras.main.setBackgroundColor('#05060a');
    this.cameras.main.setBounds(
      0,
      0,
      CH01_KITCHEN_ROOM.size[0] * CH01_KITCHEN_ROOM.tileSize,
      CH01_KITCHEN_ROOM.size[1] * CH01_KITCHEN_ROOM.tileSize,
    );

    this.createWorld();
    super.create();
    // 相机跟随玩家滚动；Compose 页面必须钉在屏幕上，否则 HUD 会跟着地图滚走。
    this.page?.setScrollFactor(0);
    audioDirector.attach(this);
    audioDirector.playSfxAt(CH01_KITCHEN_ASSET_KEYS.audio.ambience, { volume: 0.22, loop: true });
    this.cameras.main.fadeIn(this.reduced ? 180 : 360, 5, 6, 10);
    this.installInput();

    this.time.delayedCall(180, () => this.startFromPhase());
  }

  override update(time: number, delta: number): void {
    const dt = Math.min(50, Math.max(0, delta));
    if (this.cardVisible) {
      this.player?.sync();
      this.updateXiaobai();
      return;
    }
    if (this.dialogue) {
      this.handleDialogueEvents(this.dialogue.tick(dt));
      this.player?.sync();
      this.updateXiaobai();
      return;
    }
    if (this.ended || this.phase === 'done' || this.phase === 'failed') {
      this.player?.sync();
      this.updateXiaobai();
      return;
    }

    if (!this.hidden) this.updateMovement(dt);
    this.updateVision(dt);
    this.updatePatrols(dt);
    this.updateCones(dt);
    this.updatePair(dt);
    this.updateTriggers();
    this.updateNear();
    this.updateXiaobai();
    if (this.phase === 'hide' && time > this.hideDeadline) {
      if (this.hidden) this.beginPairDialogue();
      else this.fail('门卫的红光扫到了你。', 'gate');
    }
  }

  protected content(): void {
    buildKitchenHud({
      objective: this.objective,
      dialogueVisible: this.dialogueVisible,
      dialogueSpeaker: this.dialogueSpeaker,
      dialogueTone: this.dialogueTone,
      dialogueText: this.dialogueText,
      dialogueHint: this.dialogueHint,
      dialoguePageIndex: this.dialoguePageIndex,
      dialoguePageCount: this.dialoguePageCount,
      interactLabel: this.interactLabel,
      interactAvailable: this.interactAvailable,
      backstabAvailable: this.backstabAvailable,
      sneakOn: this.sneakOn,
      alertText: this.alertText,
      tutorialVisible: this.tutorialVisible,
      cardActive: this.cardActive,
      runOver: this.runOver,
      onMenu: () => {
        audioDirector.playClick();
        this.openExitConfirm();
      },
      onSkipDialogue: () => {
        audioDirector.playClick();
        this.skipDialogue();
      },
      onAuto: () => {
        audioDirector.playClick();
        settings.autoAdvance = !settings.autoAdvance;
        this.scheduleAutoAdvance();
      },
      onHistory: () => {
        audioDirector.playClick();
        this.openHistory();
      },
      onInteract: () => {
        audioDirector.playClick();
        this.interact();
      },
      onBackstab: () => {
        audioDirector.playClick();
        this.onBackstab();
      },
      onSneak: () => {
        audioDirector.playClick();
        this.toggleSneak();
      },
    });
  }

  protected override onBack(): boolean {
    if (this.ended) return true;
    this.openExitConfirm();
    return true;
  }

  private resetState(): void {
    this.phase = 'intro';
    this.ended = false;
    this.cardVisible = false;
    this.cardDone = false;
    this.tutorialDismissed = false;
    this.gateTriggered = false;
    this.gateOpen = false;
    this.hideDeadline = 0;
    this.hideCooldownUntil = 0;
    this.hidden = null;
    this.haystackReady = false;
    this.disguised = false;
    this.pairAtStove = false;
    this.pairWalking = false;
    this.pairWaypoints = [];
    this.pairStep = 0;
    this.pairWaiting = false;
    this.backstabTarget = null;
    this.sneak = false;
    this.running = false;
    this.visionClock = 0;
    this.coneClock = 0;
    this.stepDistance = 0;
    this.stepFlip = false;
    this.visible = new Set<string>();
    this.explored = new Set<string>();
    this.enemies = [];
    this.dialogue = null;
    this.dialogueOnDone = null;
    this.history.clear();
    this.historyLineIndex = -1;
    this.lastTyped = 0;
    this.autoTimer?.remove();
    this.autoTimer = null;
    this.cardTimer?.remove();
    this.cardTimer = null;
    this.view = null;
    this.player = null;
    this.xiaobai = null;
    this.pairMai = null;
    this.pairKen = null;
    this.guard = null;
    this.fog = null;
    this.cones = null;
    this.alertBorder = null;
    this.promptText = null;
    this.backstabText = null;
    this.hideHintText = null;
    this.pairWaitText = null;
    this.highlightRing = null;
    this.joystick = null;
    this.keys = null;
    this.card = null;
    this.dialogueVisible.value = false;
    this.dialogueSpeaker.value = '';
    this.dialogueTone.value = 'default';
    this.dialogueText.value = '';
    this.dialogueHint.value = '继续';
    this.dialoguePageIndex.value = 0;
    this.dialoguePageCount.value = 1;
    this.interactLabel.value = '交互';
    this.interactAvailable.value = false;
    this.backstabAvailable.value = false;
    this.sneakOn.value = false;
    this.alertText.value = '';
    this.tutorialVisible.value = false;
    this.cardActive.value = false;
    this.runOver.value = false;
    this.objective.value = KITCHEN_OBJECTIVES.explore;
  }

  private createWorld(): void {
    this.room = CH01_KITCHEN_ROOM;
    this.view = new Ch01KitchenRoomView(this, this.room, this.debug);
    const spawnAt: readonly [number, number] = this.resolveSpawnAt();
    this.player = new PlayerActor(this, this.room, {
      staticKeys: CH01_Q_STATIC_SPRITES,
      walkSheets: CH01_Q_WALK_SHEETS,
      frameWidth: CH01_Q_FRAME.width,
      frameHeight: CH01_Q_FRAME.height,
      walkFrameCount: CH01_Q_WALK_FRAME_COUNT,
      spriteScale: PLAYER_SCALE,
      headOffset: PLAYER_HEAD_OFFSET,
      linearTextures: true,
      depthMaxY: this.room.size[1] * this.room.tileSize,
      spawn: { at: spawnAt, facing: 'up' },
    });

    const plan = getViewportPlan();
    this.cameras.main.setZoom(plan.scale);
    if (this.player.display) {
      this.cameras.main.startFollow(this.player.display, true, 0.12, 0.12);
    }
    this.cameras.main.setDeadzone(180, 270);
    this.cameras.main.centerOn(this.player.position.x, this.player.position.y);

    this.xiaobai = this.addXiaobai();

    this.cones = this.add.graphics().setDepth(LAYERS.markers + 20);
    this.createFogLayer();
    this.alertBorder = this.add
      .graphics()
      .setDepth(LAYERS.cinematic - 10)
      .setScrollFactor(0);

    this.promptText = makeSceneText(this, 0, 0, '', {
      size: 22,
      color: GOLD,
      depth: LAYERS.effects,
      stroke: 4,
    }).setVisible(false);
    this.backstabText = makeSceneText(this, 0, 0, '', {
      size: 22,
      color: 0xffd166,
      depth: LAYERS.effects + 1,
      stroke: 4,
    }).setVisible(false);
    this.pairWaitText = makeSceneText(this, 0, 0, '', {
      size: 20,
      color: 0xffd166,
      depth: LAYERS.effects + 1,
      stroke: 4,
    }).setVisible(false);
    this.hideHintText = makeSceneText(this, 0, 0, '', {
      size: 22,
      color: 0x9be7c8,
      depth: LAYERS.effects + 1,
      stroke: 4,
    }).setVisible(false);
    this.highlightRing = this.add
      .ellipse(0, 0, 180, 78, GOLD, 0)
      .setStrokeStyle(2, GOLD, 0.75)
      .setDepth(LAYERS.markers + 10)
      .setVisible(false);

    this.enemies = this.room.patrols
      ? this.room.patrols
          .filter((def) => def.id !== KITCHEN_GATE_GUARD_ID && !this.clearedEnemies.has(def.id))
          .map((def) => new KitchenEnemy(this, this.room, def))
      : [];

    this.pairMai = new PairActor(
      this,
      '老麦',
      0xd9844a,
      tileCenter(this.room, 15, 4),
      this.room.size[1] * this.room.tileSize,
      KITCHEN_CAST.oldMai,
    );
    this.pairKen = new PairActor(
      this,
      '老肯',
      0x6f9e86,
      tileCenter(this.room, 16, 4),
      this.room.size[1] * this.room.tileSize,
      KITCHEN_CAST.oldKen,
    );
    this.pairMai.setVisible(false);
    this.pairKen.setVisible(false);

    this.card = new TitleCard(this, { depth: LAYERS.cinematic, screenSpace: true });
    addVignette(this, { alpha: 0.32 });
  }

  private resolveSpawnAt(): readonly [number, number] {
    if (this.previewSpot === 'backstab') return [12, 36];
    if (this.previewSpot === 'kitchen') return [13, 40];
    if (this.previewSpot === 'hay') return [5, 46];
    if (this.previewSpot === 'gate') return [15, 6];
    if (this.previewPhase === 'haystack') return [5, 45];
    if (this.previewPhase === 'hide' || this.previewPhase === 'gate') return [15, 6];
    if (this.retryPhase === 'gate') return [15, 6];
    return this.room.spawn.at;
  }

  private beginHidePreview(): void {
    this.phase = 'hide';
    this.openGate();
    // 预览给足时间看双人+门卫站位，不按正式 4 秒窗口失败。
    this.hideDeadline = this.time.now + 20000;
  }

  private beginHaystackPreview(): void {
    this.phase = 'haystack';
    this.objective.value = KITCHEN_OBJECTIVES.haystack;
    this.hidden = 'hide.hay';
    this.haystackReady = true;
    this.backstabAvailable.value = true;
    this.player?.display?.setAlpha(0.18);
    this.pairMai?.setVisible(true);
    this.pairMai?.setPosition(tileCenter(this.room, 15, 40));
    this.pairKen?.setVisible(true);
    this.pairKen?.setPosition(tileCenter(this.room, 6, 45));
    this.joystick?.setEnabled(false);
    this.updateVision(100);
    this.updateCones(100);
  }

  private addXiaobai(): Phaser.GameObjects.Image | null {
    const key = CH01_ASSET_KEYS.characters.xiaobai;
    if (!this.textures.exists(key)) return null;
    const image = this.add
      .image(0, 0, key)
      .setScale(0.36)
      .setDepth(LAYERS.effects + 2)
      .setAlpha(0.9);
    this.tweens.add({
      targets: image,
      y: '+=8',
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    return image;
  }

  private installInput(): void {
    const plan = getViewportPlan();
    this.joystick = new VirtualJoystick(
      this,
      { x: 152, y: plan.designHeight - 190 },
      96,
      { screenSpace: true },
    );

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.keys = keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as unknown as MovementKeys;
      keyboard.on('keydown-E', this.onInteractKey, this);
      keyboard.on('keydown-J', this.onBackstabKey, this);
      keyboard.on('keydown-SHIFT', this.onSneakKey, this);
      keyboard.on('keydown-SPACE', this.onAdvanceKey, this);
      keyboard.on('keydown-ENTER', this.onAdvanceKey, this);
    }

    this.input.once('pointerdown', () => audioDirector.unlock());
    this.input.on('pointerdown', this.onScenePointerDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  private startFromPhase(): void {
    if (this.preview) {
      if (this.previewPhase === 'explore') {
        this.beginExplore();
        return;
      }
      if (this.previewPhase === 'gate') {
        this.beginGate();
        return;
      }
      if (this.previewPhase === 'hide') {
        this.beginHidePreview();
        return;
      }
      if (this.previewPhase === 'haystack') {
        this.beginHaystackPreview();
        return;
      }
      if (this.previewPhase === 'done') {
        this.showDone();
        return;
      }
      if (this.previewPhase === 'fail') {
        this.fail('（白盒失败预览）', 'explore');
        return;
      }
    }
    if (this.retried) {
      if (this.retryPhase === 'gate') this.beginGate();
      else this.beginExplore();
      return;
    }
    this.beginIntro();
  }

  private beginIntro(): void {
    this.phase = 'intro';
    this.objective.value = KITCHEN_OBJECTIVES.explore;
    this.cardVisible = true;
    this.cardActive.value = true;
    this.joystick?.setEnabled(false);
    this.card?.show(KITCHEN_CHAPTER_CARD);
    this.cardTimer?.remove();
    this.cardTimer = this.time.delayedCall(this.reduced ? 1200 : 2100, () => this.finishCard());
  }

  private finishCard(): void {
    if (this.cardDone) return;
    this.cardDone = true;
    this.cardTimer?.remove();
    this.cardTimer = null;
    this.cardVisible = false;
    this.cardActive.value = false;
    this.card?.hide();
    if (this.phase === 'intro' && !this.dialogue) {
      this.startDialogue(KITCHEN_NODES.intro.lines, () => this.beginExplore());
    }
  }

  private beginExplore(): void {
    this.phase = 'explore';
    this.objective.value = KITCHEN_OBJECTIVES.explore;
    this.tutorialVisible.value = !this.tutorialDismissed;
    this.joystick?.setEnabled(true);
  }

  private beginGate(): void {
    if (this.gateTriggered) return;
    this.gateTriggered = true;
    this.phase = 'gate';
    this.objective.value = KITCHEN_OBJECTIVES.gate;
    this.joystick?.setEnabled(false);
    this.startDialogue(KITCHEN_NODES.gate.lines, () => this.openGate());
  }

  private openGate(): void {
    this.gateOpen = true;
    this.phase = 'hide';
    this.objective.value = KITCHEN_OBJECTIVES.hide;
    this.hideDeadline = this.time.now + HIDE_DEADLINE_MS;
    this.pairMai?.setVisible(true);
    this.pairKen?.setVisible(true);
    this.pairMai?.setPosition(tileCenter(this.room, 15, 4));
    this.pairKen?.setPosition(tileCenter(this.room, 16, 4));
    if (!this.guard) {
      const def = this.room.patrols?.find((item) => item.id === KITCHEN_GATE_GUARD_ID) as
        | PatrolDef
        | undefined;
      if (def) {
        this.guard = new KitchenEnemy(this, this.room, def);
        this.enemies.push(this.guard);
      }
    }
    this.guard?.setBodyVisible(true);
    this.joystick?.setEnabled(true);
    // 玩家从下面摸上来，屏风那一片还在黑幕里；不先照亮，4 秒窗口里根本没东西可躲。
    this.revealAround(18, 6, 2);
    this.updateVision(1000);
    this.cameras.main.flash(this.reduced ? 80 : 160, 40, 32, 24);
    audioDirector.playSfxAt(CH01_KITCHEN_ASSET_KEYS.audio.door, { volume: 0.45 });
    audioDirector.playSfxAt(CH01_ASSET_KEYS.audio.chapterChime, { volume: 0.3, rate: 0.8 });
  }

  /**
   * 被巡逻发现 → 进战斗。
   *
   * 和「被老麦/老肯发现」完全不同的处理：后者直接失败重试，前者打一场，
   * 赢了回到这里、这个巡逻不再刷新。
   */
  private beginEncounter(enemyId: string): void {
    if (this.ended || this.encountering) return;
    this.encountering = true;
    this.joystick?.setEnabled(false);
    this.interactAvailable.value = false;
    this.alertText.value = '';
    this.cameras.main.flash(this.reduced ? 80 : 180, 120, 20, 20);
    audioDirector.playSfxAt(CH01_KITCHEN_ASSET_KEYS.audio.alert, { volume: 0.7 });
    void enterModule(this, 'battleCh01', {
      encounterId: CH01_KITCHEN_BATTLE_ID,
      returnTo: 'kitchen',
      resumeAt: this.gateOpen ? 'gate' : 'explore',
      clearedEnemyId: enemyId,
      preview: this.preview,
    } as unknown);
  }

  private beginPairDialogue(): void {    if (this.phase !== 'hide') return;
    this.phase = 'pair';
    this.objective.value = KITCHEN_OBJECTIVES.follow;
    this.joystick?.setEnabled(false);
    this.startDialogue(KITCHEN_NODES['pair-enter'].lines, () => this.startPairWalk());
  }

  private pairPath(): MapPoint[] {
    const points: readonly (readonly [number, number])[] = [
      [15, 4],
      [15, 6],
      [15, 10],
      [15, 15],
      [15, 20],
      [15, 24],
      [15, 30],
      [15, 36],
      [15, 40],
    ];
    return points.map(([col, row]) => tileCenter(this.room, col, row));
  }

  private kenSearchPath(): MapPoint[] {
    const points: readonly (readonly [number, number])[] = [
      [15, 40],
      [15, 42],
      [7, 42],
      [6, 42],
      [6, 45],
    ];
    return points.map(([col, row]) => tileCenter(this.room, col, row));
  }

  private startPairWalk(): void {
    if (this.pairWalking) return;
    this.pairWalking = true;
    this.phase = 'pair';
    this.objective.value = KITCHEN_OBJECTIVES.follow;
    this.joystick?.setEnabled(true);
    this.pairWaypoints = this.pairPath();
    this.pairStep = 0;
    this.pairWaiting = false;
    this.advancePair();
  }

  /**
   * 「跟住他们」必须真的跟。
   *
   * 原来一次把整条路走完，老麦 100px/s 甩开 140px/s 的玩家完全追不上：
   * 灶台那句「这锅有人动过吧？」会在十几格外的黑幕里播，玩家什么也看不见。
   * 改成逐段推进：走完一个拐点就停住等玩家跟上，再走下一段。
   */
  private advancePair(): void {
    const target = this.pairWaypoints[this.pairStep];
    if (!target) {
      this.pairWaiting = false;
      this.onPairAtStove();
      return;
    }
    const behind = this.pairStep > 0 ? this.pairWaypoints[this.pairStep - 1] : undefined;
    const previous = behind ?? target;
    this.pairMai?.walk([target], PAIR_SPEED, () => {
      this.pairWaiting = true;
    });
    // 老肯始终落在老麦身后一个拐点，别两人叠在一起。
    this.pairKen?.walk([previous], PAIR_SPEED);
  }

  /** 队伍停下来等人时，在老麦头顶钉一句「跟上来」，否则玩家只会觉得他们卡住了。 */
  private updatePairWaitMarker(): void {
    const marker = this.pairWaitText;
    if (!marker) return;
    const mai = this.pairMai;
    if (!mai || !this.pairWalking || !this.pairWaiting || this.pairShouldAdvance) {
      marker.setVisible(false);
      return;
    }
    marker
      .setText('跟上来')
      .setPosition(mai.position.x, mai.position.y - 286)
      .setVisible(true);
  }

  /** 老麦停下等玩家：距离足够近才继续下一段。 */
  private get pairShouldAdvance(): boolean {
    const player = this.player;
    const mai = this.pairMai;
    if (!player || !mai) return true;
    const distance = Math.hypot(mai.position.x - player.position.x, mai.position.y - player.position.y);
    return distance <= this.room.tileSize * 4.5;
  }

  private onPairAtStove(): void {
    if (this.pairAtStove) return;
    this.pairAtStove = true;
    this.pairWalking = false;
    this.pairWaitText?.setVisible(false);
    this.joystick?.setEnabled(false);
    // 老麦一句「这草也被人动过」就是在指草堆；顺手把草堆照亮，
    // 否则目标写着「躲进干草堆」，玩家眼前却是一片黑。
    this.revealAround(5, 45, 3);
    this.updateVision(1000);
    this.startDialogue(KITCHEN_NODES.stove.lines, () => this.startKenSearch());
  }

  private startKenSearch(): void {
    this.phase = 'haystack';
    this.objective.value = KITCHEN_OBJECTIVES.haystack;
    this.joystick?.setEnabled(true);
    this.haystackReady = false;
    this.revealAround(5, 45, 3);
    // 玩家这会儿还在灶台边（离草堆 15 格），老肯只要 14 格；不给他一个犹豫的拍子就是必输局。
    this.time.delayedCall(KEN_SEARCH_DELAY_MS, () => {
      if (this.ended || this.phase !== 'haystack') return;
      this.pairKen?.walk(this.kenSearchPath(), KEN_SEARCH_SPEED, () => this.onKenAtHaystack());
    });
  }

  private onKenAtHaystack(): void {
    if (this.hidden === 'hide.hay') {
      this.haystackReady = true;
      this.backstabAvailable.value = true;
      return;
    }
    if (this.hidden === 'hide.cabinet') {
      this.fail('柜子里藏不住。', 'gate');
      return;
    }
    this.fail('老肯看见了你。', 'gate');
  }

  /**
   * 老麦/老肯的「看见」：和他们身后跟着是不同的。
   *
   * 他们走的是朝向前方的视锥（100°/5 格、要有视线）；玩家跟在后头不会被发现，
   * 一旦跑到他们前面晃，就是被认出来了 —— 直接失败重试，不打仗。
   */
  private pairSpotsPlayer(dt: number): void {
    this.pairSpotClock += dt;
    if (this.pairSpotClock < 120) return;
    this.pairSpotClock = 0;
    const player = this.player;
    // 只在「跟随」这一幕生效：躲藏幕是倒计时（他们在门口还没转身），
    // 草堆幕的发现由脚本判定，不重复判。
    if (this.phase !== 'pair') return;
    if (!player || this.hidden || this.ended || this.encountering) return;
    for (const pair of [this.pairMai, this.pairKen]) {
      if (!pair) continue;
      const distance = Math.hypot(pair.position.x - player.position.x, pair.position.y - player.position.y);
      if (distance > this.room.tileSize * 2.5) continue;
      if (!hasLineOfSight(this.room, pair.position, player.position)) continue;
      const facing = pair.facing;
      const angle = Math.abs(
        Phaser.Math.Angle.Wrap(
          Math.atan2(player.position.y - pair.position.y, player.position.x - pair.position.x) -
            facingToRadians(facing),
        ),
      );
      if (angle > Phaser.Math.DegToRad(50)) continue;
      this.fail(
        pair === this.pairKen ? '老肯认出了你——这张脸不该出现在这儿。' : '老麦回头看了你一眼，笑意散了。',
        this.gateOpen ? 'gate' : 'explore',
      );
      return;
    }
  }

  private updatePair(dt: number): void {
    this.pairSpotsPlayer(dt);
    // 行走帧必须每帧推进：卡在原地等玩家时也要能回到静态图，否则会冻在某一帧上。
    this.pairMai?.updateAnimation(dt);
    this.pairKen?.updateAnimation(dt);
    const busy = this.pairWalking || this.pairMai?.walking || this.pairKen?.walking;
    if (!busy && !this.pairWaiting) return;
    this.pairMai?.update(dt);
    this.pairKen?.update(dt);
    this.updatePairWaitMarker();
    if (!this.pairWalking || !this.pairWaiting) return;
    if (this.pairMai?.walking || this.pairKen?.walking) return;
    if (this.pairStep >= this.pairWaypoints.length) {
      this.pairWaiting = false;
      this.onPairAtStove();
      return;
    }
    if (!this.pairShouldAdvance) return;
    this.pairStep += 1;
    this.pairWaiting = false;
    this.advancePair();
  }

  private updateTriggers(): void {
    if (this.phase !== 'explore' || this.gateTriggered) return;
    const trigger = this.room.triggers?.find((item) => item.id === 'gate');
    if (!trigger) return;
    const tile = this.player ? worldToTile(this.room, this.player.position) : null;
    if (!tile) return;
    const [c0, r0, c1, r1] = trigger.rect;
    if (tile.col >= c0 && tile.col <= c1 && tile.row >= r0 && tile.row <= r1) {
      this.beginGate();
    }
  }

  private updateMovement(deltaMs: number): void {
    const player = this.player;
    if (!player) return;
    const keys = this.keys;
    let ix = 0;
    let iy = 0;
    if (keys) {
      if (keys.A.isDown || keys.LEFT.isDown) ix -= 1;
      if (keys.D.isDown || keys.RIGHT.isDown) ix += 1;
      if (keys.W.isDown || keys.UP.isDown) iy -= 1;
      if (keys.S.isDown || keys.DOWN.isDown) iy += 1;
    }
    if (this.joystick) {
      ix += this.joystick.vector.x;
      iy += this.joystick.vector.y;
      this.running = Math.hypot(this.joystick.vector.x, this.joystick.vector.y) > 0.88;
    }
    const direction = normalizeDirection(ix, iy);
    if (Math.abs(direction.x) < 0.001 && Math.abs(direction.y) < 0.001) {
      player.moveTo(player.position, player.facing, false, 0);
      return;
    }
    // 扇形视野用连续朝向；8 向的 `facing` 只负责选贴图，会每 45° 跳一下。
    this.headingRad = Math.atan2(direction.y, direction.x);

    this.dismissTutorial();
    const speed = this.sneak ? SNEAK_SPEED : this.running ? RUN_SPEED : WALK_SPEED;
    const step = (speed * deltaMs) / 1000;
    const result = moveWithCollision(
      this.room,
      player.position,
      { x: direction.x * step, y: direction.y * step },
      KITCHEN_PLAYER_FOOT,
    );
    const facing = facingFromVector(direction.x, direction.y, player.facing);
    const moved =
      result.position.x !== player.position.x || result.position.y !== player.position.y;
    const distance = Math.hypot(
      result.position.x - player.position.x,
      result.position.y - player.position.y,
    );
    player.moveTo(result.position, facing, moved, deltaMs);
    if (moved) this.advanceFootsteps(distance);
  }

  private advanceFootsteps(distance: number): void {
    if (!Number.isFinite(distance) || distance <= 0) return;
    this.stepDistance += distance;
    if (this.stepDistance < 40) return;
    this.stepDistance = 0;
    this.stepFlip = !this.stepFlip;
    audioDirector.playSfxAt(
      this.stepFlip ? CH01_KITCHEN_ASSET_KEYS.audio.stepB : CH01_KITCHEN_ASSET_KEYS.audio.stepA,
      { volume: 0.18, rate: this.stepFlip ? 1.02 : 0.98 },
    );
  }

  private dismissTutorial(): void {
    if (this.tutorialDismissed) return;
    this.tutorialDismissed = true;
    this.tutorialVisible.value = false;
  }

  /**
   * 玩家视野：**射程无限**，只受墙阻挡（2026-11-01 用户要求）。
   *
   * 射程取房间对角线，射线撞到墙就停，所以"无限"实际就是"到墙为止"。
   * 判定不再用 `visibleTiles()`：那是「全房间每格算一次 LOS」，无限射程下代价爆炸；
   * 改成先算射线多边形（遮挡已经在里面了），再由多边形反推格子集合。
   */
  private playerVisionRange(): number {
    const w = this.room.size[0] * this.room.tileSize;
    const h = this.room.size[1] * this.room.tileSize;
    return Math.hypot(w, h);
  }

  private updateVision(dt: number): void {
    this.visionClock += dt;
    if (this.visionClock < 100) return;
    this.visionClock = 0;
    const player = this.player;
    if (!player) return;
    const polygon = castVisionPolygon(this.room, player.position, this.headingRad, {
      fovDeg: 120,
      range: this.playerVisionRange(),
      ambientRange: 2.5 * this.room.tileSize,
      rays: 96,
    });
    this.visionPolygon = polygon;
    const tiles = tilesInPolygon(this.room, player.position, polygon.points);
    this.visible = tiles;
    for (const key of tiles) this.explored.add(key);
    this.carveVision(polygon);
  }

  /** 暗幕像素 = 多少设计像素。8 = 8 倍放大，边界自带柔和过渡。 */
  private static readonly FOG_RT_SCALE = 8;

  private createFogLayer(): void {
    const scale = Ch01KitchenScene.FOG_RT_SCALE;
    const roomW = this.room.size[0] * this.room.tileSize;
    const roomH = this.room.size[1] * this.room.tileSize;
    const width = Math.ceil(roomW / scale);
    const height = Math.ceil(roomH / scale);
    if (this.textures.exists(this.fogKey)) this.textures.remove(this.fogKey);
    const canvas = this.textures.createCanvas(this.fogKey, width, height);
    if (!canvas) return;
    const ctx = canvas.getContext();
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, width, height);
    canvas.refresh();
    canvas.setFilter(Phaser.Textures.FilterMode.LINEAR);
    this.fogCanvas = canvas;
    const image = this.add.image(0, 0, this.fogKey).setOrigin(0, 0).setDepth(LAYERS.fog);
    image.setDisplaySize(roomW, roomH);
    this.fog = image;
  }

  /** 世界坐标 → 暗幕像素。 */
  private toFogSpace(point: MapPoint): MapPoint {
    const scale = Ch01KitchenScene.FOG_RT_SCALE;
    return { x: point.x / scale, y: point.y / scale };
  }

  /**
   * 把当前视野的扇形从暗幕上擦掉（= 记为已探索）。
   *
   * 擦除用 `destination-out` 合成，是累积的：走过的地方永远是亮的，
   * 边界就是历代扇形的并集——弧线，不是 96px 的台阶。
   */
  private carveVision(polygonIn?: VisionPolygon): void {
    const canvas = this.fogCanvas;
    const player = this.player;
    if (!canvas || !player) return;
    // 站着不动就别每 100ms 重传一次 384×768 的纹理（手机上这一下很贵）。
    // 第一次必须擦：`lastCarve` 是 NaN 时任何比较都是 false，不特判就永远不会开灯。
    const first = !Number.isFinite(this.lastCarve.x) || !Number.isFinite(this.lastCarve.heading);
    const moved =
      Math.hypot(player.position.x - this.lastCarve.x, player.position.y - this.lastCarve.y) > 6;
    const turned = Math.abs(this.headingRad - this.lastCarve.heading) > 0.02;
    if (!first && !moved && !turned) return;
    this.lastCarve = {
      x: player.position.x,
      y: player.position.y,
      heading: this.headingRad,
    };
    const tile = this.room.tileSize;
    const polygon =
      polygonIn ??
      castVisionPolygon(this.room, player.position, this.headingRad, {
        fovDeg: 120,
        range: this.playerVisionRange(),
        ambientRange: 2.5 * tile,
        rays: 96,
      });
    const ctx = canvas.getContext();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,1)';
    if (polygon.points.length >= 3) {
      // 从脚下出发画「扇形」而不是「弓形」：`castVisionPolygon` 只给弧上的点，
      // 直接闭合会连成一道弦，把玩家自己那块擦不到（会出现一条贴脸的暗缝）。
      const origin = this.toFogSpace(player.position);
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      for (const point of polygon.points) {
        const p = this.toFogSpace(point);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      // 边缘渐隐：射程 55% 以内全亮，到射程边缘淡出。硬切的扇形边在手机上像 UI 遮罩。
      // 射程无限时这条渐变基本落在房间外，室内就是「到墙为止全亮」。
      const rangeRt = this.playerVisionRange() / Ch01KitchenScene.FOG_RT_SCALE;
      const falloff = ctx.createRadialGradient(
        origin.x,
        origin.y,
        rangeRt * 0.55,
        origin.x,
        origin.y,
        rangeRt,
      );
      falloff.addColorStop(0, 'rgba(0,0,0,1)');
      falloff.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = falloff;
      ctx.fill();
    }
    // 脚下环境光：径向渐变，边缘是渐隐的，不会转身时脚下忽明忽暗。
    if (polygon.ambient) {
      const c = this.toFogSpace(player.position);
      const r = polygon.ambient.radius / Ch01KitchenScene.FOG_RT_SCALE;
      const gradient = ctx.createRadialGradient(c.x, c.y, r * 0.55, c.x, c.y, r);
      gradient.addColorStop(0, 'rgba(0,0,0,1)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    canvas.refresh();
  }

  /** 剧情要"先让他看见"时，直接在暗幕上挖一个柔边圆。 */
  private carveCircle(col: number, row: number, radius: number): void {
    const canvas = this.fogCanvas;
    if (!canvas) return;
    const center = this.toFogSpace(tileCenter(this.room, col, row));
    const r = ((radius + 0.5) * this.room.tileSize) / Ch01KitchenScene.FOG_RT_SCALE;
    const ctx = canvas.getContext();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const gradient = ctx.createRadialGradient(center.x, center.y, r * 0.5, center.x, center.y, r);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    canvas.refresh();
  }

  /**
   * 某个 NPC 现在该不该被玩家看见。
   *
   * 只按「视锥命中」判会让站在两步外的门卫、刚进门的队友全 alpha=0，
   * 玩家被看不见的东西抓住。所以再加一条「近身且有视线」。
   */
  private npcSeen(at: MapPoint, nearTiles = 2.5): boolean {
    const tile = worldToTile(this.room, at);
    if (tile && this.visible.has(tileKey(tile.col, tile.row))) return true;
    const player = this.player;
    if (!player) return false;
    const distance = Math.hypot(at.x - player.position.x, at.y - player.position.y);
    if (distance > this.room.tileSize * nearTiles) return false;
    return hasLineOfSight(this.room, player.position, at);
  }

  /** 把一块区域标成已探索：剧情把玩家逼进昏暗角落时，先让他看见该看见的东西。 */
  private revealAround(col: number, row: number, radius = 2): void {
    for (let r = row - radius; r <= row + radius; r += 1) {
      for (let c = col - radius; c <= col + radius; c += 1) {
        if (c < 0 || r < 0 || c >= this.room.size[0] || r >= this.room.size[1]) continue;
        this.explored.add(tileKey(c, r));
      }
    }
    this.carveCircle(col, row, radius);
  }

  /**
   * 巡逻/门卫的视线判定 + 警戒表现。
   *
   * 判定仍然是格子/视锥（`isAngleInCone` + `hasLineOfSight`），
   * 只有渲染换成了射线多边形 —— 逻辑和表现分开，数值不用重调。
   */
  private updatePatrols(dt: number): void {
    const player = this.player;
    if (!player) return;
    const posture = this.hidden || this.disguised ? 0 : this.sneak ? 0.55 : this.running ? 1.35 : 1;
    let chasing = false;
    let suspicious = false;

    for (const enemy of this.enemies) {
      const dx = player.position.x - enemy.position.x;
      const dy = player.position.y - enemy.position.y;
      const distance = Math.hypot(dx, dy);
      const range = enemy.def.vision.rangeTiles * this.room.tileSize;
      const inCone =
        distance <= range &&
        isAngleInCone(Math.atan2(dy, dx), enemy.facingRad, enemy.def.vision.fovDeg);
      const visible =
        !this.hidden &&
        !this.disguised &&
        inCone &&
        hasLineOfSight(this.room, enemy.position, player.position);

      enemy.unit.update({
        player: player.position,
        playerVisible: visible,
        playerPosture: posture,
        dtMs: dt,
      });
      enemy.sync();
      // 传膳门门卫是这一段的"唯一威胁"，站位 (17,8) 离门触发点 3 格左右，
      // 落在通用的 2.5 格近身感知外——他要是不可见，玩家根本不知道自己被什么盯上了。
      const guardVisible = enemy === this.guard && this.gateOpen && this.npcSeen(enemy.position, 4);
      enemy.setBodyVisible(guardVisible || this.npcSeen(enemy.position));
      enemy.updateVisibility(dt);
      enemy.updateAnimation(dt);
      if (enemy.phase === 'chase') chasing = true;
      if (enemy.phase === 'suspicious' || enemy.alertValue > 0.1) suspicious = true;
      if (enemy.caught) {
        // 被巡逻（御厨/太监/门卫）发现 = 打一场，不是直接判负。
        this.beginEncounter(enemy.def.id);
        return;
      }
    }

    for (const pair of [this.pairMai, this.pairKen]) {
      if (!pair) continue;
      pair.setVisionVisible(this.npcSeen(pair.position));
      pair.updateVisibility(dt);
    }

    this.drawAlertBorder(chasing, suspicious);
    this.updateHeartbeat(chasing);
    this.alertText.value = chasing
      ? '被看到了！'
      : suspicious
        ? '有动静'
        : '';
    const state: 'calm' | 'suspicious' | 'chase' = chasing
      ? 'chase'
      : suspicious
        ? 'suspicious'
        : 'calm';
    if (state !== this.lastAlert) {
      this.lastAlert = state;
      if (state === 'chase') audioDirector.playSfxAt(CH01_KITCHEN_ASSET_KEYS.audio.alert, { volume: 0.7 });
    }
  }

  /** 被追时的心跳：只在进入 chase 时开，退出就关。 */
  private updateHeartbeat(chasing: boolean): void {
    if (chasing === this.heartbeatOn) return;
    this.heartbeatOn = chasing;
    if (chasing) {
      audioDirector.playSfxAt(CH01_KITCHEN_ASSET_KEYS.audio.heartbeat, { volume: 0.5, loop: true });
    } else {
      audioDirector.stopLoop(CH01_KITCHEN_ASSET_KEYS.audio.heartbeat);
    }
  }

  private updateCones(dt: number): void {
    this.coneClock += dt;
    if (this.coneClock < 100) return;
    this.coneClock = 0;
    const graphics = this.cones;
    if (!graphics) return;
    graphics.clear();
    for (const enemy of this.enemies) {
      const result = visibleTiles(this.room, enemy.position, enemy.facingRad, {
        fovDeg: enemy.def.vision.fovDeg,
        range: enemy.def.vision.rangeTiles * this.room.tileSize,
      });
      enemy.setConeTiles(result.tiles);
      const color =
        enemy.phase === 'chase' ? 0xff4d4d : enemy.phase === 'suspicious' ? 0xff9d4d : 0xffc96b;
      const alpha = enemy.phase === 'chase' ? 0.2 : enemy.phase === 'suspicious' ? 0.14 : 0.09;
      // 敌人视锥也画成扇形：玩家视野已经是弧线了，再画格子会明显穿帮。
      const cone = castVisionPolygon(this.room, enemy.position, enemy.facingRad, {
        fovDeg: enemy.def.vision.fovDeg,
        range: enemy.def.vision.rangeTiles * this.room.tileSize,
        rays: 40,
      });
      if (cone.points.length < 3) continue;
      graphics.fillStyle(color, alpha);
      graphics.beginPath();
      graphics.moveTo(enemy.position.x, enemy.position.y);
      for (const point of cone.points) graphics.lineTo(point.x, point.y);
      graphics.closePath();
      graphics.fillPath();
    }
  }

  private drawAlertBorder(chasing: boolean, suspicious: boolean): void {
    const graphics = this.alertBorder;
    if (!graphics) return;
    graphics.clear();
    if (!chasing && !suspicious) return;
    const plan = getViewportPlan();
    const color = chasing ? 0xff4d4d : 0xffb84d;
    graphics.lineStyle(chasing ? 8 : 5, color, chasing ? 0.28 : 0.14);
    graphics.strokeRect(4, 4, plan.designWidth - 8, plan.designHeight - 8);
  }

  private updateNear(): void {
    const active =
      (this.phase === 'explore' ||
        this.phase === 'gate' ||
        this.phase === 'hide' ||
        this.phase === 'pair' ||
        this.phase === 'haystack') &&
      !this.dialogue &&
      !this.cardVisible &&
      !this.ended;

    if (!active || !this.player) {
      this.interactAvailable.value = false;
      this.backstabAvailable.value = false;
      this.promptText?.setVisible(false);
      this.backstabText?.setVisible(false);
      this.highlightRing?.setVisible(false);
      return;
    }

    if (this.hidden) {
      this.interactLabel.value = '离开';
      this.interactAvailable.value = true;
      this.promptText?.setVisible(false);
      this.backstabText?.setVisible(false);
      this.hideHintText?.setVisible(false);
      this.highlightRing?.setVisible(false);
      return;
    }

    this.updateHideHint();

    const hide = this.findNearHide();
    // 躲藏窗口里只提示"躲哪"，别再叠一个"查看传膳门"——两个 [E] 同时挂在屏幕上只会让人犹豫。
    const item = hide || this.phase === 'hide' ? null : this.findNearInteractable();
    this.backstabTarget = this.findBackstabTarget();
    this.backstabAvailable.value = this.backstabTarget !== null || this.haystackReady;

    if (hide) {
      this.interactLabel.value = KITCHEN_HIDE_PROMPTS[hide.id as keyof typeof KITCHEN_HIDE_PROMPTS] ?? '躲藏';
      this.interactAvailable.value = true;
      const at = tileCenter(this.room, hide.at[0], hide.at[1]);
      this.showPrompt(at, this.interactLabel.value);
    } else if (item) {
      this.interactLabel.value =
        item.id in KITCHEN_INTERACTABLE_PROMPTS
          ? KITCHEN_INTERACTABLE_PROMPTS[item.id as KitchenInteractableId]
          : '交互';
      this.interactAvailable.value = true;
      const at = interactableCenter(this.room, item);
      this.showPrompt(at, this.interactLabel.value);
    } else {
      this.interactLabel.value = '交互';
      this.interactAvailable.value = false;
      this.promptText?.setVisible(false);
      this.highlightRing?.setVisible(false);
    }

    if (this.haystackReady && this.pairKen) {
      this.backstabText
        ?.setText(`[${BACKSTAB_KEY}] 偷袭`)
        .setPosition(this.pairKen.position.x + 69, this.pairKen.position.y - 144)
        .setVisible(true);
    } else if (this.backstabTarget) {
      this.backstabText
        ?.setText(`[${BACKSTAB_KEY}] 偷袭`)
        .setPosition(this.backstabTarget.position.x + 69, this.backstabTarget.position.y - 144)
        .setVisible(true);
    } else {
      this.backstabText?.setVisible(false);
    }
  }

  /**
   * 第二幕的躲藏窗口：门一开就倒计时，但玩家从下面摸上来时屏风那一片还没进过视野。
   * 只把地形照亮不够——得在屏风上钉一条指路提示，否则「躲起来」三个字等于没说。
   */
  private updateHideHint(): void {
    const hint = this.hideHintText;
    if (!hint) return;
    if (this.phase !== 'hide' || this.hidden || this.dialogue || this.cardVisible) {
      hint.setVisible(false);
      return;
    }
    const hide = this.room.hides?.find((item) => item.id === 'hide.screen');
    if (!hide) {
      hint.setVisible(false);
      return;
    }
    const at = tileCenter(this.room, hide.at[0], hide.at[1]);
    hint
      .setText(`[${INTERACT_KEY}] 躲到屏风后`)
      .setPosition(at.x, at.y - 117)
      .setVisible(true);
  }

  private showPrompt(at: MapPoint, label: string): void {
    this.promptText
      ?.setText(`[${INTERACT_KEY}] ${label}`)
      .setPosition(at.x + 69, at.y - 108)
      .setVisible(true);
    this.highlightRing
      ?.setPosition(at.x, at.y + 16)
      .setVisible(true);
  }

  private findNearHide(): HideDef | null {
    const player = this.player;
    if (!player) return null;
    let best: HideDef | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const hide of this.room.hides ?? []) {
      const at = tileCenter(this.room, hide.at[0], hide.at[1]);
      const distance = Math.hypot(player.position.x - at.x, player.position.y - at.y);
      if (distance <= 165 && distance < bestDistance) {
        best = hide;
        bestDistance = distance;
      }
    }
    return best;
  }

  private findNearInteractable(): InteractableDef | null {
    const player = this.player;
    if (!player) return null;
    return findInteractableNear(this.room, player.position);
  }

  private findBackstabTarget(): KitchenEnemy | null {
    const player = this.player;
    if (!player || this.disguised) return null;
    let best: KitchenEnemy | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      const eligible = canBackstab({
        enemy: enemy.position,
        enemyFacingRad: enemy.facingRad,
        player: player.position,
        alert: enemy.alertValue,
        phase: enemy.phase,
        tileSize: this.room.tileSize,
      });
      if (!eligible) continue;
      const distance = Math.hypot(
        enemy.position.x - player.position.x,
        enemy.position.y - player.position.y,
      );
      if (distance < bestDistance) {
        best = enemy;
        bestDistance = distance;
      }
    }
    return best;
  }

  private onInteractKey(event: KeyboardEvent): void {
    event.preventDefault();
    this.interact();
  }

  private onBackstabKey(event: KeyboardEvent): void {
    event.preventDefault();
    this.onBackstab();
  }

  private onSneakKey(event: KeyboardEvent): void {
    event.preventDefault();
    this.toggleSneak();
  }

  private onAdvanceKey(event: KeyboardEvent): void {
    event.preventDefault();
    if (this.cardVisible) {
      this.finishCard();
      return;
    }
    if (this.dialogue) {
      this.advanceDialogue();
      return;
    }
    if (this.interactAvailable.value) this.interact();
  }

  private onScenePointerDown(pointer: Phaser.Input.Pointer): void {
    const plan = getViewportPlan();
    const x = pointer.x / (plan.scale || 1);
    const y = pointer.y / (plan.scale || 1);
    const inTopRightButtons = y < 150 && x > plan.designWidth - 230;
    if (this.dialogueVisible.value) {
      if (inTopRightButtons) return;
      this.advanceDialogue();
      return;
    }
    if (this.cardVisible && !inTopRightButtons) this.finishCard();
  }

  private toggleSneak(): void {
    this.sneak = !this.sneak;
    this.sneakOn.value = this.sneak;
  }

  private interact(): void {
    if (this.ended || this.dialogue || this.cardVisible) return;
    if (this.hidden) {
      /**
       * 双击兜底：玩家连按两下 E 会「进藏 → 立刻出藏」，
       * 然后 4 秒窗口到点判负，看起来就像按键失灵。给一个 450ms 保护期。
       */
      if (this.time.now < this.hideCooldownUntil) return;
      this.exitHide();
      return;
    }
    const hide = this.findNearHide();
    if (hide) {
      this.enterHide(hide.id);
      return;
    }
    const item = this.findNearInteractable();
    if (item) this.handleInteractable(item.id);
  }

  private handleInteractable(id: string): void {
    if (id === 'gate') {
      if (this.gateOpen) this.startDialogue(KITCHEN_NODES['gate-repeat'].lines);
      else this.beginGate();
      return;
    }
    if (id === 'backdoor') {
      this.startDialogue(KITCHEN_NODES.backdoor.lines);
      return;
    }
    if (id.startsWith('stove.')) {
      this.startDialogue(KITCHEN_NODES['stove-loot'].lines);
    }
  }

  private enterHide(id: string): void {
    const hide = this.room.hides?.find((item) => item.id === id);
    const player = this.player;
    if (!hide || !player) return;
    this.hidden = id;
    this.hideCooldownUntil = this.time.now + 450;
    this.haystackReady = false;
    this.backstabAvailable.value = false;
    this.promptText?.setVisible(false);
    this.hideHintText?.setVisible(false);
    this.highlightRing?.setVisible(false);
    this.joystick?.setEnabled(false);
    player.moveTo(tileCenter(this.room, hide.at[0], hide.at[1]), player.facing, false, 0);
    player.display?.setAlpha(hide.kind === 'cabinet' ? 0.05 : hide.kind === 'screen' ? 0.45 : 0.18);
    audioDirector.playSfxAt(CH01_ASSET_KEYS.audio.chapterChime, { volume: 0.12, rate: 1.4 });
    if (this.phase === 'hide' && hide.kind === 'screen') {
      // 躲进屏风即算躲过；双人稍后推门进来，不用等到 4 秒窗口自然结束。
      this.time.delayedCall(this.reduced ? 200 : 500, () => {
        if (this.phase === 'hide' && this.hidden === 'hide.screen') this.beginPairDialogue();
      });
    }
  }

  private exitHide(): void {
    this.hidden = null;
    this.haystackReady = false;
    this.player?.display?.setAlpha(1);
    this.joystick?.setEnabled(true);
  }

  private onBackstab(): void {
    if (this.ended || this.dialogue || this.cardVisible) return;
    if (this.haystackReady) {
      this.doTakedown();
      return;
    }
    const target = this.backstabTarget;
    if (!target) return;
    this.backstabTarget = null;
    this.backstabAvailable.value = false;
    this.enemies = this.enemies.filter((enemy) => enemy !== target);
    target.destroy();
    this.cameras.main.flash(this.reduced ? 40 : 80, 255, 244, 220);
    audioDirector.playSfxAt(CH01_KITCHEN_ASSET_KEYS.audio.backstab, { volume: 0.55 });
    if (this.guard === target) this.guard = null;
  }

  private doTakedown(): void {
    if (this.phase !== 'haystack') return;
    this.haystackReady = false;
    this.backstabAvailable.value = false;
    this.hidden = null;
    this.disguised = true;
    this.player?.display?.setAlpha(1);
    this.player?.display?.setTint(0x9be7c8);
    this.pairKen?.setVisible(false);
    this.joystick?.setEnabled(false);
    this.cameras.main.flash(this.reduced ? 80 : 180, 255, 255, 255);
    audioDirector.playSfxAt(CH01_KITCHEN_ASSET_KEYS.audio.backstab, { volume: 0.6 });
    this.time.delayedCall(160, () => {
      if (!this.scene.isActive()) return;
      audioDirector.playSfxAt(CH01_KITCHEN_ASSET_KEYS.audio.transform, { volume: 0.5 });
    });
    this.startDialogue(KITCHEN_NODES.takedown.lines, () => this.showDone());
  }

  private updateXiaobai(): void {
    if (!this.xiaobai || !this.player) return;
    this.xiaobai.setPosition(this.player.position.x + 54, this.player.position.y - 128);
  }

  private startDialogue(lines: readonly DialogueLine[], onDone?: () => void): void {
    this.dialogue = new DialoguePlayer(lines, {
      pageChars: DIALOGUE_PAGE_CHARS,
      balanceLines: true,
      typeMs: Math.round(DIALOGUE_TYPE_MS * textSpeedFactor(settings.textSpeed)),
    });
    this.dialogueOnDone = onDone ?? null;
    this.dialogueVisible.value = true;
    this.dialogueSpeaker.value = '';
    this.dialogueRole = null;
    this.dialogueTone.value = 'default';
    this.dialogueText.value = '';
    this.dialogueHint.value = '继续';
    this.dialoguePageIndex.value = 0;
    this.dialoguePageCount.value = 1;
    this.historyLineIndex = -1;
    this.lastTyped = 0;
    this.joystick?.setEnabled(false);
    this.tutorialVisible.value = false;
    this.promptText?.setVisible(false);
    this.backstabText?.setVisible(false);
    this.handleDialogueEvents(this.dialogue.start());
  }

  private handleDialogueEvents(events: readonly DialogueEvent[]): void {
    for (const event of events) {
      if (event.type === 'line') {
        const tone = speakerTone(event.speaker, event.line.role);
        this.dialogueRole = event.line.role ?? null;
        this.dialogueTone.value = tone;
        this.dialogueSpeaker.value = speakerLabel(event.speaker);
        this.dialoguePageIndex.value = event.pageIndex;
        this.dialoguePageCount.value = event.pageCount;
        this.recordHistory(event);
      } else if (event.type === 'type') {
        this.dialogueText.value = event.text;
        this.dialogueHint.value = event.done ? '继续' : '补全';
        this.dialoguePageIndex.value = event.pageIndex;
        this.dialoguePageCount.value = event.pageCount;
        const gained = event.typedCount - this.lastTyped;
        if (gained > 0 && gained <= 2) {
          audioDirector.playTypeBlip(typeVoiceForSpeaker(event.speaker, this.dialogueRole ?? undefined));
        }
        this.lastTyped = event.typedCount;
        if (event.done) this.scheduleAutoAdvance();
        else this.cancelAutoAdvance();
      } else if (event.type === 'complete') {
        this.finishDialogue();
      }
    }
  }

  private recordHistory(event: DialogueEvent & { type: 'line' }): void {
    if (this.historyLineIndex === event.index) return;
    this.historyLineIndex = event.index;
    const narration = speakerTone(event.speaker, event.line.role) === 'narration';
    this.history.push({
      speaker: speakerLabel(event.speaker),
      text: event.line.text,
      narration,
      at: this.time.now,
    });
  }

  private advanceDialogue(): void {
    if (!this.dialogue) return;
    this.cancelAutoAdvance();
    this.handleDialogueEvents(this.dialogue.requestAdvance());
  }

  private skipDialogue(): void {
    if (!this.dialogue) return;
    this.cancelAutoAdvance();
    this.finishDialogue();
  }

  private finishDialogue(): void {
    this.cancelAutoAdvance();
    this.dialogue = null;
    this.dialogueVisible.value = false;
    this.dialogueSpeaker.value = '';
    this.dialogueTone.value = 'default';
    this.dialogueText.value = '';
    this.dialogueHint.value = '继续';
    this.dialoguePageIndex.value = 0;
    this.dialoguePageCount.value = 1;
    const done = this.dialogueOnDone;
    this.dialogueOnDone = null;
    done?.();
  }

  private cancelAutoAdvance(): void {
    this.autoTimer?.remove();
    this.autoTimer = null;
  }

  private scheduleAutoAdvance(): void {
    this.cancelAutoAdvance();
    if (!settings.autoAdvance || !this.dialogue) return;
    if (this.dialogue.state.phase !== 'waiting') return;
    const chars = Array.from(this.dialogue.pageText).length;
    const delay = autoAdvanceDelay(chars, settings.textSpeed);
    this.autoTimer = this.time.delayedCall(delay, () => {
      this.autoTimer = null;
      if (!this.dialogue || this.historyModal?.open === true) return;
      this.advanceDialogue();
    });
  }

  private openHistory(): void {
    if (this.historyModal?.open === true) return;
    this.cancelAutoAdvance();
    this.historyModal = openDialogueHistory(this.mvvm, this.history.entries, {
      onClose: () => {
        this.historyModal = null;
        if (this.dialogue) this.scheduleAutoAdvance();
      },
    });
    this.historyModal.widget.setScrollFactor(0);
  }

  private fail(reason: string, checkpoint: 'explore' | 'gate'): void {
    if (this.ended) return;
    // 调试用：`__AVM__` 里能读到最后一次判负原因，排查"莫名失败"时不用猜。
    (this as unknown as { lastFailReason?: string }).lastFailReason = reason;
    this.ended = true;
    this.phase = 'failed';
    this.clearActionHud();
    this.joystick?.setEnabled(false);
    this.dialogue = null;
    this.dialogueVisible.value = false;
    this.hideHintText?.setVisible(false);
    this.pairWaitText?.setVisible(false);
    this.promptText?.setVisible(false);
    this.backstabText?.setVisible(false);
    this.alertText.value = '';
    this.alertBorder?.clear();
    this.failCard = openKitchenFailCard(this.mvvm, {
      reason,
      onRetry: () => {
        this.failCard = null;
        this.scene.restart({ retry: checkpoint });
      },
      onTitle: () => {
        void enterModule(this, 'title');
      },
    });
  }

  /**
   * 结束/失败时把底部按钮条归零。
   *
   * `update()` 在 done/failed 会提前 return，`updateNear()` 不再跑，
   * 于是 `interactAvailable` 会停在最后一帧的值——屏幕上就留下一个还能按的「离开」。
   */
  private clearActionHud(): void {
    this.runOver.value = true;
    this.interactAvailable.value = false;
    this.interactLabel.value = '交互';
    this.backstabAvailable.value = false;
    this.sneakOn.value = false;
    this.tutorialVisible.value = false;
    this.alertText.value = '';
    this.alertBorder?.clear();
  }

  private showDone(): void {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'done';
    this.clearActionHud();
    this.joystick?.setEnabled(false);
    this.promptText?.setVisible(false);
    this.backstabText?.setVisible(false);
    this.hideHintText?.setVisible(false);
    this.pairWaitText?.setVisible(false);
    this.alertBorder?.clear();
    this.alertText.value = '';
    this.objective.value = KITCHEN_OBJECTIVES.done;
    // 结算画面背后别是钥匙孔：把玩家周围摊开，结束卡压在一整片看得清的御膳房上。
    const tile = this.player ? worldToTile(this.room, this.player.position) : null;
    if (tile) this.revealAround(tile.col, tile.row, 5);
    this.endCard = openKitchenEndCard(this.mvvm, {
      onRestart: () => {
        this.endCard = null;
        this.scene.restart({ retry: 'explore' });
      },
      onTitle: () => {
        void enterModule(this, 'title');
      },
    });
  }

  private openExitConfirm(): void {
    if (this.exitModal?.open === true) return;
    this.exitModal = openKitchenExitConfirm(this.mvvm, {
      onTitle: () => {
        void enterModule(this, 'title');
      },
      onClose: () => {
        this.exitModal = null;
      },
    });
  }

  private onShutdown(): void {
    audioDirector.stopAllLoops();
    this.heartbeatOn = false;
    this.cancelAutoAdvance();
    this.cardTimer?.remove();
    this.cardTimer = null;
    this.input.off('pointerdown', this.onScenePointerDown, this);
    const keyboard = this.input.keyboard;
    keyboard?.off('keydown-E', this.onInteractKey, this);
    keyboard?.off('keydown-J', this.onBackstabKey, this);
    keyboard?.off('keydown-SHIFT', this.onSneakKey, this);
    keyboard?.off('keydown-SPACE', this.onAdvanceKey, this);
    keyboard?.off('keydown-ENTER', this.onAdvanceKey, this);
    this.joystick?.destroy();
    this.joystick = null;
    this.failCard?.close('scene');
    this.failCard = null;
    this.endCard?.close('scene');
    this.endCard = null;
    this.exitModal?.close('scene');
    this.exitModal = null;
    this.historyModal?.close('scene');
    this.historyModal = null;
    for (const enemy of this.enemies) enemy.destroy();
    this.enemies = [];
    this.pairMai?.destroy();
    this.pairKen?.destroy();
    this.pairMai = null;
    this.pairKen = null;
    this.guard = null;
    this.view?.destroy();
    this.view = null;
    this.player?.destroy();
    this.player = null;
    this.xiaobai?.destroy();
    this.xiaobai = null;
    this.card?.destroy();
    this.card = null;
    this.fog?.destroy();
    this.fog = null;
    this.fogCanvas = null;
    if (this.textures.exists(this.fogKey)) this.textures.remove(this.fogKey);
    this.cones?.destroy();
    this.cones = null;
    this.alertBorder?.destroy();
    this.alertBorder = null;
    this.promptText?.destroy();
    this.promptText = null;
    this.hideHintText?.destroy();
    this.hideHintText = null;
    this.pairWaitText?.destroy();
    this.pairWaitText = null;
    this.backstabText?.destroy();
    this.backstabText = null;
    this.highlightRing?.destroy();
    this.highlightRing = null;
    this.dialogue = null;
    this.keys = null;
  }
}
