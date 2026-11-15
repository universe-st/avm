import Phaser from 'phaser';
import { ref } from '@phaser-mvvm/core';
import { UIScene, type ModalHandle } from '@phaser-mvvm/phaser';

/** 对话面板一页最多显示的字数（34px 字号 × 4 行 × 约 17 字）。 */
const DIALOGUE_PAGE_CHARS = 68;

import {
  CH01_ASSET_KEYS,
  CH01_Q_FRAME,
  CH01_Q_STATIC_SPRITES,
  CH01_Q_WALK_FRAME_COUNT,
  CH01_Q_WALK_SHEETS,
  CH01_ZHOU_SIT_RIGHT,
  CH01_ZHOU_STAND_FRAME,
  CH01_ZHOU_STAND_UP,
  PALACE_ASSET_KEYS,
} from '../assets/keys';
import { PlayerActor } from '../actors/player-actor';
import { Ch01DormRoomView } from '../world/ch01-dorm-room-view';
import { CgOverlay } from '../ui/cg-overlay';
import { EmotionBubble } from '../ui/emotion-bubble';
import { buildCh01Hud } from '../ui/ch01-hud';
import { openCh01EndCard, openCh01ExitConfirm } from '../ui/ch01-modals';
import { LAYERS } from '../render/layers';
import { enterModule } from '../app/director';
import { SCENE_KEYS } from '../app/scene-keys';
import { applyCamera, getViewportPlan } from '../app/viewport';
import { audioDirector, type LoopHandle } from '../audio/audio-director';
import { typeVoiceForSpeaker } from '../audio/type-voice';
import { autoAdvanceDelay, resolveReducedMotion, settings, textSpeedFactor } from '../app/settings';
import { saveProgress } from '../app/progress';
import { bgmManager } from '../audio/bgm-manager';
import { SCENE_SILENT } from '../audio/bgm-tracks';
import {
  isStageLaunchContext,
  stageBoolParam,
  stageParam,
  type StageLaunchContext,
} from '../dev/stage-types';
import {
  CH01_DORM_ROOM,
} from '../map/rooms/ch01-dorm';
import { findInteractableNear, interactableCenter, tileCenter } from '../map/core/room';
import { PLAYER_FOOT } from '../map/player-foot';
import {
  facingFromVector,
  moveWithCollision,
  normalizeDirection,
} from '../map/core/collision';
import type { InteractableDef, MapPoint, RoomDef } from '../map/types';
import {
  CH01_CHAPTER_CARD,
  CH01_INTERACTABLE_PROMPTS,
  CH01_OBJECTIVES,
  type Ch01InteractableId,
} from '../story/ch01-dorm';
import {
  CH01_PREVIEW_PHASES,
  Ch01Flow,
  endCardRestartData,
  isCh01ResumeData,
  normalizeCh01PreviewPhase,
  type Ch01Event,
  type Ch01PreviewPhase,
} from '../story/ch01-flow';
import {
  CH01_DREAM_ENTRY_PERFORMANCE,
  CH01_DREAM_FLASH_PERFORMANCE,
  CH01_SIT_HEAD_OFFSET,
  CH01_SIT_TILE,
  CH01_STAND_UP_SEQUENCE,
  CH01_WAKE_PERFORMANCE,
  CH01_XIAOBAI_OFFSET,
  flashInMs,
  flashOutMs,
  resolveSittingKey,
  sittingScaleFor,
  standUpFrameAt,
  standUpFramesFromLayout,
  standUpToIdleFadeMs,
  stepDurationMs,
  timelineDurationMs,
  type FlashStep,
  type FrameSequenceStep,
  type MoveActorStep,
  type PerformanceStep,
  type PerformanceTimeline,
  type SitStep,
  type WalkStep,
} from '../story/ch01-performance';
import { DialoguePlayer, type DialogueEvent } from '../story/dialogue-player';
import { playCutsceneVideo, type CutsceneVideoHandle } from '../ui/cutscene-video';
import { mountFlashOverlay, type FlashOverlayHandle } from '../ui/flash-overlay';
import {
  DIALOGUE_TYPE_MS,
  speakerLabel,
  speakerTone,
  type DialogueLine,
  type SpeakerTone,
} from '../story/dialogue';
import { DialogueHistory } from '../story/dialogue-history';
import { openDialogueHistory } from '../ui/history-modal';
import { TitleCard, GOLD, makeSceneText } from '../ui/cinematic';
import { addDustMotes, addLightShaft, addVignette } from '../ui/fx-kit';
import { addStageFrame, type StageFrameHandle } from '../ui/stage-frame';
import { VirtualJoystick } from '../ui/joystick';
import { isPointerOnUiControl } from '../ui/ui-pointer-guard';
import { setPixelTexture } from '../ui/pixel';

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

const BASE_ROOM = CH01_DORM_ROOM;
const WALK_SPEED = 140;
const INTERACT_KEY = 'E';

/**
 * 角色显示缩放：Q 版帧 160×400，人物高 371，取素材声明的 `CH01_ZHOU_STAND_FRAME.displayScale`
 * （= 0.682 × 0.9 = 0.6138，屏显高约 228）。坐姿/起身各用自己的 `displayScale`，
 * 三者底边都是 394，见 `src/assets/keys.ts`。
 * `headOffset` 是头顶到脚底的设计像素，必须跟着一起缩，否则表情气泡会飘在头顶上方。
 * 脚盒 `PLAYER_FOOT` 是碰撞用的，不跟缩放走（缩了会让窄过道更难走）。
 */
const PLAYER_SCALE = CH01_ZHOU_STAND_FRAME.displayScale;
const PLAYER_HEAD_OFFSET = 232;

/**
 * 坐姿图脚底相对脚底坐标的偏移。
 *
 * 椅子占位图自带椅脚，脚底贴地即 offset 0；正式坐地素材若有裙摆/腿的余白再调。
 * （坐姿的**缩放**：正式素材取 `CH01_ZHOU_SIT_RIGHT.displayScale`，其余回退贴图由
 * `sittingScaleFor(贴图源图高)` 按 `CH01_SIT_DISPLAY_HEIGHT` 换算，见 `create()`。）
 */
const ZHOU_SIT_OFFSET_Y = 0;


/**
 * 第一章第一节 · 寝室。
 *
 * 世界层用原生 Phaser（房间图 + 角色 + 交互提示）；HUD/对话/按钮用 Compose。
 * 剧情只从 `Ch01Flow` 取事件，场景不写台词。
 */
export class Ch01DormScene extends UIScene {
  private flow!: Ch01Flow;
  private room: RoomDef = BASE_ROOM;
  private roomView: Ch01DormRoomView | null = null;
  private player: PlayerActor | null = null;
  private xiaobai: Phaser.GameObjects.Image | null = null;
  /** 小白的上下漂浮；移动位置前必须停掉，否则两个 tween 会抢同一个 y。 */
  private xiaobaiBob: Phaser.Tweens.Tween | null = null;
  /**
   * 表演走位的 tween。
   *
   * 必须持引用：sit 步骤和 walk tween 在同一 tick 结束（Clock 先于 TweenManager），
   * 进 sit 时要主动停掉它，否则最后一帧还是会 `moveTo()` 挪脚/刷新贴图。
   */
  private walkTween: Phaser.Tweens.Tween | null = null;
  /** 表演进行中：屏蔽移动/交互，也不推进对话逐字。 */
  private performing = false;
  private performanceTimers: Phaser.Time.TimerEvent[] = [];
  /**
   * 起身末帧 → 侧面 idle 之间的**可选**极短过渡图层（当前用不上，见下）。
   *
   * 两张图的朝向和画布基准已完全一致，正常路径是硬切（`standUpToIdleFadeMs()` 返回 0），
   * 不会建这一层。只有真机上硬切仍闪 1 帧、把常量调到 ≤40ms 时才会出现；届时它盖在
   * 起身末帧之上，alpha 到 1 之后主角才切 idle 贴图。淡完立即销毁，退出/重开兜底。
   */
  private standUpCrossFade: Phaser.GameObjects.Image | null = null;
  /** 全屏白光层（DOM，盖住 HUD）；结束后必须移除，不能留白影。 */
  private flashOverlay: FlashOverlayHandle | null = null;
  private flashStep: FlashStep | null = null;
  /**
   * `flash.handoff` 的白场淡出时长：寝室不淡出，`beginPalace` 在切场之后用这个值淡出。
   * 为 0 表示没有交接中的白场。
   */
  private flashHandoffOutMs = 0;
  /** 入梦表演只跑一次（dream 空节点可能被重入）。 */
  private dreamPerformanceDone = false;
  /** 战后回来：等第一句征召台词打完，再播起身表演。 */
  private wakePerformancePending = false;
  /** 战后表演开始后不再让 `cg: wake` 把画面盖回去，否则起身动画看不见。 */
  private suppressWakeCg = false;
  private promptText: Phaser.GameObjects.Text | null = null;
  /** 靠近可交互物时套在地上的金圈，比头顶文字更早被看到。 */
  private highlightRing: Phaser.GameObjects.Ellipse | null = null;
  private cg: CgOverlay | null = null;
  private emotionBubble: EmotionBubble | null = null;
  private emotionHoldUntil = 0;
  /** 郑卿的呼噜：登记在 audioDirector 的循环表里，退出/重开时统一收尾。 */
  private snore: LoopHandle | null = null;
  private bgmStarted = false;
  private card: TitleCard | null = null;
  private cardTimer: Phaser.Time.TimerEvent | null = null;
  /** 舞台框：寝室上下留白的墨色底板与鎏金界框。 */
  private stageFrame: StageFrameHandle | null = null;
  private ambientFx: Phaser.GameObjects.GameObject[] = [];
  private joystick: VirtualJoystick | null = null;
  private keys: MovementKeys | null = null;
  private dialogue: DialoguePlayer | null = null;
  /** 手机 CG 的全屏播放句柄；非空时屏蔽场景输入。 */
  private cutscene: CutsceneVideoHandle | null = null;
  /** 手机 CG 只在第一次「查看手机」时播；重进本节不再打扰。 */
  private phoneCutsceneSeen = false;
  private shuttingDown = false;
  private deferred: Ch01Event[] = [];
  private near: InteractableDef | null = null;
  private lastTyped = 0;
  /** 走了多少设计像素播下一次脚步；两只脚交替。 */
  private stepDistance = 0;
  private stepFlip = false;
  private cardVisible = false;
  private transitioning = false;
  private ended = false;
  private preview = false;
  private previewPhase: Ch01PreviewPhase = 'opening';
  private tutorialDismissed = false;
  private resumeMode: 'start' | 'afterBattle' | 'explore' | 'complete' = 'start';
  private seed = 1;
  private debug = false;
  private exitModal: ModalHandle | null = null;
  private historyModal: ModalHandle | null = null;
  /** 自动播放的推进计时器；同一时刻只允许一个。 */
  private autoTimer: Phaser.Time.TimerEvent | null = null;
  /** 已经写进对话记录的行号，避免分页/重绘时重复收录。 */
  private historyLineIndex = -1;
  private readonly history = new DialogueHistory();

  private get reduced(): boolean {
    return resolveReducedMotion();
  }

  private readonly objective = ref<string>(CH01_OBJECTIVES.wakeZheng);
  private readonly dialogueVisible = ref(false);
  private readonly dialogueSpeaker = ref('');
  /** 当前这句的稳定角色 id（小白的名字会变，声线与立绘认这个）。 */
  private dialogueRole: DialogueLine['role'] | null = null;
  private readonly dialogueTone = ref<SpeakerTone>('default');
  private readonly dialogueText = ref('');
  private readonly dialogueHint = ref('继续');
  private readonly dialoguePageIndex = ref(0);
  private readonly dialoguePageCount = ref(1);
  private readonly interactLabel = ref('交互');
  private readonly interactAvailable = ref(false);
  private readonly cardActive = ref(false);
  /**
   * 表演进行中：HUD 走单独分支，**整块不画**「交互」按钮与提示。
   *
   * 只看 `interactAvailable` 不够——那只是 disabled，灰按钮还会挂在右下角（t27 反馈）。
   */
  private readonly performanceActive = ref(false);
  /** 新手移动指引：首次进入探索时显示，玩家第一次移动后收起。 */
  private readonly tutorialVisible = ref(false);

  constructor() {
    super(SCENE_KEYS.ch01Dorm);
  }

  init(data: unknown): void {
    const context: StageLaunchContext | null = isStageLaunchContext(data) ? data : null;
    // `scene.restart(data)` / `enterModule` 传的是普通对象时没有 stageId，过不了
    // `isStageLaunchContext` 的校验。这里补认 `preview` / `seed` 标记（与御膳房一致），
    // 否则「重看本节」这类 restart 会把自己当成正式流程、写掉玩家进度。
    const plain =
      context === null && data !== null && typeof data === 'object'
        ? (data as { preview?: unknown; seed?: unknown })
        : null;
    const plainSeed = typeof plain?.seed === 'number' && Number.isFinite(plain.seed) ? plain.seed : 1;
    this.preview = context?.preview === true || plain?.preview === true;
    this.debug = context ? stageBoolParam(context, 'debug', false) : false;
    this.seed = context?.seed ?? plainSeed;
    this.resumeMode = context === null && isCh01ResumeData(data) ? data.resume : 'start';

    const rawPhase = context ? stageParam(context, 'phase') : undefined;
    this.previewPhase = normalizeCh01PreviewPhase(rawPhase);
    if (rawPhase !== undefined && !CH01_PREVIEW_PHASES.includes(rawPhase as Ch01PreviewPhase)) {
      console.warn(`[ch01-dorm] 未知 phase=${rawPhase}，回退 opening`);
    }
  }

  override create(): void {
    this.resetState();
    applyCamera(this);
    this.cameras.main.setBackgroundColor('#05060a');

    this.createWorld();
    super.create();
    audioDirector.attach(this);
    // 默认绑定是校园日常《午后小憩》（见 `bgm-tracks.ts` 的 SCENE_BGM）；只有「睡觉戏」开场
    // 明确静场（只有呼噜声），进探索时再由 startExploreAudio 切曲。
    bgmManager.enterScene(this, this.isOpening() ? SCENE_SILENT : undefined);
    if (this.isOpening()) this.startSnore();
    this.cameras.main.fadeIn(this.reduced ? 220 : 460, 5, 6, 10);

    this.flow = new Ch01Flow({
      resume: this.resumeMode,
      previewPhase: this.previewPhase,
    });

    this.installInput();
    this.time.delayedCall(360, () => {
      if (this.transitioning) return;
      this.handleEvents(this.flow.start());
      this.syncControls();
    });
  }

  override update(_time: number, delta: number): void {
    const dt = Math.min(50, Math.max(0, delta));
    // 表演期间不要 sync：起身/坐下是直接改 sprite 的 y/scale，sync 会把它们重置。
    if (this.performing) return;
    if (this.cardVisible) {
      this.player?.sync();
      return;
    }
    if (this.dialogue) {
      const holdingEmotion = this.time.now < this.emotionHoldUntil;
      this.handleDialogueEvents(this.dialogue.tick(holdingEmotion ? 0 : dt));
      return;
    }
    if (this.flow?.state.phase === 'explore' && !this.transitioning && !this.ended) {
      this.updateMovement(dt);
    }
    this.updateNear();
  }

  protected content(): void {
    buildCh01Hud({
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
      cardActive: this.cardActive,
      performanceActive: this.performanceActive,
      tutorialVisible: this.tutorialVisible,
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
    });
  }

  protected override onBack(): boolean {
    if (this.ended) return true;
    this.openExitConfirm();
    return true;
  }

  private resetState(): void {
    this.flow = null as unknown as Ch01Flow;
    this.room = BASE_ROOM;
    this.dialogue = null;
    this.deferred = [];
    this.near = null;
    this.lastTyped = 0;
    this.cardVisible = false;
    this.transitioning = false;
    this.ended = false;
    this.exitModal = null;
    this.historyModal = null;
    this.autoTimer?.remove();
    this.autoTimer = null;
    this.history.clear();
    this.historyLineIndex = -1;
    this.roomView = null;
    this.player = null;
    this.xiaobai = null;
    this.xiaobaiBob = null;
    this.walkTween = null;
    // 起身过渡层只在极短融合时存在（当前 0ms 不建）；重开本节时兜底清掉，别留一张浮空贴图。
    this.standUpCrossFade?.destroy();
    this.standUpCrossFade = null;
    this.performing = false;
    for (const timer of this.performanceTimers) timer.remove();
    this.performanceTimers = [];
    this.flashOverlay?.remove();
    this.flashOverlay = null;
    this.flashStep = null;
    this.flashHandoffOutMs = 0;
    this.performanceActive.value = false;
    this.dreamPerformanceDone = false;
    this.suppressWakeCg = false;
    this.wakePerformancePending = this.isWakeStart();
    this.promptText = null;
    this.highlightRing = null;
    this.cg = null;
    this.emotionBubble = null;
    this.emotionHoldUntil = 0;
    // 重开本节时若还有一条在响的呼噜，必须先停再丢引用，否则 Sound 会变成没人管的孤儿。
    this.stopSnore();
    this.bgmStarted = false;
    this.card = null;
    this.cardTimer = null;
    this.stageFrame?.destroy();
    this.stageFrame = null;
    for (const fx of this.ambientFx) fx.destroy();
    this.ambientFx = [];
    this.joystick = null;
    this.keys = null;
    this.objective.value = CH01_OBJECTIVES.wakeZheng;
    this.dialogueVisible.value = false;
    this.dialogueSpeaker.value = '';
    this.dialogueRole = null;
    this.dialogueTone.value = 'default';
    this.dialogueText.value = '';
    this.dialogueHint.value = '继续';
    this.dialoguePageIndex.value = 0;
    this.dialoguePageCount.value = 1;
    this.stepDistance = 0;
    this.stepFlip = false;
    this.interactLabel.value = '交互';
    this.interactAvailable.value = false;
    this.cardActive.value = false;
    this.tutorialVisible.value = false;
    this.tutorialDismissed = false;
  }

  private createWorld(): void {
    const plan = getViewportPlan();
    const roomHeight = BASE_ROOM.size[1] * BASE_ROOM.tileSize;
    const playTop = 96;
    const playBottom = plan.designHeight - 200;
    const roomY = Math.max(
      playTop,
      playTop + Math.round((playBottom - playTop - roomHeight) / 2),
    );
    this.room = {
      ...BASE_ROOM,
      origin: { x: BASE_ROOM.origin.x, y: roomY },
    };

    this.roomView = new Ch01DormRoomView(this, this.room, this.debug);

    // 舞台框 + 午后窗光：地图只占设计高的一部分，上下留白做成有意设计的画框。
    this.stageFrame = addStageFrame(this, {
      x: 0,
      y: roomY,
      width: BASE_ROOM.size[0] * BASE_ROOM.tileSize,
      height: roomHeight,
      variant: 'dorm',
      reduced: this.reduced,
    });
    this.ambientFx.push(
      addLightShaft(this, {
        x: 360,
        y: roomY + 18,
        width: 300,
        height: 620,
        angleDeg: 9,
        color: 0xffe2ac,
        alpha: 0.13,
        reduced: this.reduced,
        depth: LAYERS.props + 2,
      }),
      addDustMotes(this, {
        x: 110,
        y: roomY + 130,
        width: 500,
        height: 430,
        count: 22,
        seed: this.seed,
        color: 0xffe6b8,
        alpha: 0.5,
        reduced: this.reduced,
        depth: LAYERS.effects,
      }),
      addVignette(this, { alpha: 0.3 }),
    );
    const opening = this.isOpening();
    const wakeStart = this.isWakeStart();
    /**
     * 坐姿贴图走候选回退（缺新素材时用椅子占位，再缺就用朝右立绘，绝不白屏）。
     * 不管是不是战后回来都要带上：入梦表演也要在房间中心坐下。
     */
    const sittingKey = resolveSittingKey((key) => this.textures.exists(key));
    const sittingFallsBackToStanding = sittingKey === CH01_Q_STATIC_SPRITES.right;
    const sittingSource = sittingKey === null ? null : this.textures.get(sittingKey).getSourceImage();
    const sittingHeight =
      sittingSource !== null && 'height' in sittingSource ? Number(sittingSource.height) : 0;
    /**
     * 坐姿缩放：**正式素材按自己声明的缩放**，回退贴图按源图高换算。
     *
     * t28 的 `zhou_sit_right.png` 是「人物高 160 + 画布高 400」——400 只是留给
     * 脚底 y≈394 与站立帧对齐的留白。若照 t29 的「按画布高换算」当成
     * `160/400 = 0.4`，人会被缩成 64px（站立 228px 的三分之一），所以这一档
     * 直接取 `CH01_ZHOU_SIT_RIGHT.displayScale`（1.0）。
     * 回退链的占位图（96×160 椅子坐姿）仍走 `sittingScaleFor(源图高)` → 1.0。
     */
    const sittingScale =
      sittingKey === CH01_ASSET_KEYS.characters.zhouSitRight
        ? CH01_ZHOU_SIT_RIGHT.displayScale
        : sittingScaleFor(sittingHeight);
    this.player = new PlayerActor(this, this.room, {
      staticKeys: CH01_Q_STATIC_SPRITES,
      /**
       * 起身结束后的站立 idle 用正侧面朝右素材（#t41），不再切 3/4 面的 `q.right`。
       * 只在「起身后、玩家还没动」这段生效；一移动/转向就回到八向逻辑（见 PlayerActor.moveTo）。
       */
      sideIdle: { key: CH01_ASSET_KEYS.characters.zhouIdleRight, facing: 'right' },
      walkSheets: CH01_Q_WALK_SHEETS,
      frameWidth: CH01_Q_FRAME.width,
      frameHeight: CH01_Q_FRAME.height,
      walkFrameCount: CH01_Q_WALK_FRAME_COUNT,
      spriteScale: PLAYER_SCALE,
      headOffset: PLAYER_HEAD_OFFSET,
      linearTextures: true,
      ...(sittingKey === null
        ? {}
        : {
            sittingKey,
            sittingOffsetY: ZHOU_SIT_OFFSET_Y,
            sittingScale: sittingFallsBackToStanding ? PLAYER_SCALE : sittingScale,
            // 坐地后人物比站立矮一截，表情气泡要跟着降下来。
            sittingHeadOffset: sittingFallsBackToStanding
              ? PLAYER_HEAD_OFFSET
              : CH01_SIT_HEAD_OFFSET,
          }),
      ...(wakeStart
        ? // 战后回来：进场就坐在房间中心，不是先站着再瞬移坐下。
          { spawn: { at: CH01_SIT_TILE, facing: 'right' as const }, sitting: true }
        : // 开局站在书桌下方、靠左侧床的一侧。
          opening
          ? { spawn: { at: [14, 12] as const, facing: 'down' as const } }
          : {}),
    });
    this.cg = new CgOverlay(this, this.reduced);
    this.emotionBubble = new EmotionBubble(this, this.reduced);

    const phone = this.room.interactables.find((item) => item.id === 'phone');
    const xiaobaiKey = CH01_ASSET_KEYS.characters.xiaobai;
    if (this.textures.exists(xiaobaiKey) && (wakeStart || phone)) {
      setPixelTexture(this, xiaobaiKey);
      // 正常开场：小白先在手机上方成形；战后回来：它已经浮在坐在原地的主角右侧。
      const at = wakeStart
        ? this.xiaobaiSpotNearPlayer()
        : interactableCenter(this.room, phone as InteractableDef);
      this.xiaobai = this.add
        .image(wakeStart ? at.x : at.x + 56, wakeStart ? at.y : at.y - 44, xiaobaiKey)
        .setDepth(LAYERS.effects)
        .setScale(0.45)
        .setAlpha(wakeStart ? 1 : 0)
        .setVisible(wakeStart);
      if (wakeStart) this.startXiaobaiBob();
    }

    this.promptText = makeSceneText(this, 0, 0, '', {
      size: 22,
      color: GOLD,
      depth: LAYERS.effects,
      stroke: 4,
    }).setVisible(false);

    this.highlightRing = this.add
      .ellipse(0, 0, 120, 52, GOLD, 0)
      .setStrokeStyle(2, GOLD, 0.75)
      .setDepth(LAYERS.markers + 10)
      .setVisible(false);
    if (!this.reduced) {
      this.tweens.add({
        targets: this.highlightRing,
        scaleX: 1.12,
        scaleY: 1.12,
        alpha: 0.65,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }

    this.card = new TitleCard(this, { depth: LAYERS.cinematic });
  }

  private installInput(): void {
    const plan = getViewportPlan();
    this.joystick = new VirtualJoystick(this, { x: 152, y: plan.designHeight - 190 }, 96);
    this.joystick.setEnabled(false);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.keys = keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as unknown as MovementKeys;
      keyboard.on('keydown-E', this.onInteractKey, this);
      keyboard.on('keydown-SPACE', this.onAdvanceKey, this);
      keyboard.on('keydown-ENTER', this.onAdvanceKey, this);
    }

    this.input.once('pointerdown', () => audioDirector.unlock());
    this.input.on('pointerdown', this.onScenePointerDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
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
    }

    const direction = normalizeDirection(ix, iy);
    if (Math.abs(direction.x) < 0.001 && Math.abs(direction.y) < 0.001) {
      player.moveTo(player.position, player.facing, false, 0);
      return;
    }

    // 玩家第一次推动方向就把新手指引收起来，避免挡住探索。
    this.dismissTutorial();

    const step = (WALK_SPEED * deltaMs) / 1000;
    const result = moveWithCollision(
      this.room,
      player.position,
      { x: direction.x * step, y: direction.y * step },
      PLAYER_FOOT,
    );
    const facing = facingFromVector(direction.x, direction.y, player.facing);
    // 撞墙（这一帧一像素都没挪动）就停在站立帧，别原地踏步。
    const moved =
      result.position.x !== player.position.x || result.position.y !== player.position.y;
    const distance = Math.hypot(
      result.position.x - player.position.x,
      result.position.y - player.position.y,
    );
    player.moveTo(result.position, facing, moved, deltaMs);
    if (moved) this.advanceFootsteps(distance);
  }

  /** 每走约 34 设计像素落一只脚；A/B 交替 + 轻微音高差，避免机械感。 */
  private advanceFootsteps(distance: number): void {
    if (!Number.isFinite(distance) || distance <= 0) return;
    this.stepDistance += distance;
    if (this.stepDistance < 34) return;
    this.stepDistance = 0;
    this.playFootstep();
  }

  /** 左右脚交替 + 轻微音高差，避免机械感。 */
  private playFootstep(): void {
    this.stepFlip = !this.stepFlip;
    const key = this.stepFlip
      ? CH01_ASSET_KEYS.audio.stepWoodB
      : CH01_ASSET_KEYS.audio.stepWoodA;
    audioDirector.playSfxAt(key, {
      volume: 0.3,
      rate: this.stepFlip ? 1.03 : 0.97,
    });
  }

  /**
   * 交互点选择：当前目标的交互点只要在半径内就优先，避免「站在书桌下按 E 却只翻到小说」。
   *
   * 目标完成后回落到「最近的可交互物」，书桌/窗/门这些风味交互不受影响。
   */
  private pickNear(feet: { x: number; y: number }): InteractableDef | null {
    const base = findInteractableNear(this.room, feet);
    const targetId = this.flow?.state.talkedZheng === false
      ? 'zheng'
      : this.flow?.state.phoneFound === false
        ? 'phone'
        : null;
    if (!targetId) return base;
    const target = this.room.interactables.find((item) => item.id === targetId);
    if (!target) return base;
    const at = interactableCenter(this.room, target);
    const radius = target.radius ?? 100;
    return Math.hypot(feet.x - at.x, feet.y - at.y) <= radius ? target : base;
  }

  private updateNear(): void {
    const active =
      this.flow?.state.phase === 'explore' &&
      !this.dialogue &&
      !this.cardVisible &&
      !this.ended &&
      !this.performing;
    const near = active && this.player ? this.pickNear(this.player.position) : null;
    this.near = near;
    this.interactAvailable.value = near !== null;

    const id = near?.id;
    const prompt = id !== undefined && id in CH01_INTERACTABLE_PROMPTS
      ? CH01_INTERACTABLE_PROMPTS[id as Ch01InteractableId]
      : '交互';
    this.interactLabel.value = near ? prompt : '交互';

    if (!this.promptText) return;
    if (near) {
      const at = interactableCenter(this.room, near);
      this.promptText
        .setText(`[${INTERACT_KEY}] ${prompt}`)
        .setPosition(at.x + 46, at.y - 92)
        // 开局站在书桌下，手机提示会压在主角头上；先让新手指引独占画面，移动后再显示提示。
        .setVisible(!this.tutorialVisible.value);
      this.highlightRing
        ?.setPosition(at.x, at.y + 18)
        .setVisible(!this.tutorialVisible.value);
    } else {
      this.promptText.setVisible(false);
      this.highlightRing?.setVisible(false);
    }
  }

  private onInteractKey(event: KeyboardEvent): void {
    event.preventDefault();
    if (this.cutscene || this.performing) return;
    this.interact();
  }

  private onAdvanceKey(event: KeyboardEvent): void {
    event.preventDefault();
    if (this.cutscene || this.performing) return;
    if (this.cardVisible) {
      this.hideChapterCard();
      return;
    }
    if (this.dialogue) {
      this.advanceDialogue();
      return;
    }
    if (this.near) this.interact();
  }

  /**
   * 全局点击：对话中**点屏幕任意位置**都算「补全 / 继续」。
   *
   * 顶栏按钮与 Compose 弹窗由 `isPointerOnUiControl()` 统一消费（按布局树命中，不再用
   * 右上角矩形估算）；摇杆不在 Compose 树里，单独用 `containsPointer()` 判断。
   * 对话面板正文不是控件，点它仍然推进。
   */
  private onScenePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.cutscene || this.performing) return;
    if (isPointerOnUiControl(this, pointer) || this.joystick?.containsPointer(pointer) === true) {
      return;
    }
    if (this.dialogueVisible.value) {
      this.advanceDialogue();
      return;
    }
    if (!this.cardVisible) return;
    this.hideChapterCard();
  }

  /** 收起新手指引；一次性，之后不再弹。 */
  private dismissTutorial(): void {
    if (this.tutorialDismissed) return;
    this.tutorialDismissed = true;
    this.tutorialVisible.value = false;
  }

  /** 「跳过」：整段对话直接结束，后续事件照常发（目标更新、镜头等）。 */
  private skipDialogue(): void {
    // 表演期间「跳过」不该把流程推过正在播放的走位/起身。
    if (!this.dialogue || this.performing) return;
    this.cancelAutoAdvance();
    this.finishDialogue();
  }

  private interact(): void {
    if (this.transitioning || this.ended || this.cutscene || this.performing) return;
    if (this.cardVisible) {
      this.hideChapterCard();
      return;
    }
    if (this.dialogue) {
      this.advanceDialogue();
      return;
    }
    if (this.flow.state.phase !== 'explore' || !this.near) return;
    const objectId = this.near.id;
    this.near = null;
    this.interactAvailable.value = false;
    this.promptText?.setVisible(false);
    const events = this.flow.interact(objectId);
    this.handleEvents(events);
    this.syncControls();
  }

  private handleEvents(events: readonly Ch01Event[]): void {
    for (const event of events) {
      if (this.cardVisible && event.type !== 'objective' && event.type !== 'chapter-card') {
        this.deferred.push(event);
        continue;
      }
      switch (event.type) {
        case 'chapter-card':
          this.showChapterCard(event.lines);
          break;
        case 'objective':
          this.objective.value = event.text;
          if (this.flow?.state.phase === 'explore') {
            this.startExploreAudio();
            saveProgress('dorm.explore', { preview: this.preview });
          }
          break;
        case 'dialogue':
          // 空台词节点（现在的 `dream`）只用来把流程推进到下一拍。
          if (event.lines.length === 0) {
            // 小白台词段已经整段在**坐姿**下走完，这里只剩「停顿一拍 → 白光 → 切金殿」，
            // 演完再 `finishDialogue()` 让流程发出 battle 事件（beginPalace 接手白场）。
            if (event.nodeId === 'dream' && !this.dreamPerformanceDone) {
              this.dreamPerformanceDone = true;
              this.startPerformance(CH01_DREAM_FLASH_PERFORMANCE, () => this.finishDialogue());
            } else {
              this.finishDialogue();
            }
            break;
          }
          if (event.nodeId === 'phone' && !this.phoneCutsceneSeen) {
            this.phoneCutsceneSeen = true;
            this.startPhoneCutscene(event.lines);
          } else {
            if (event.nodeId === 'after') saveProgress('dorm.after', { preview: this.preview });
            // 手机对白必须在坐姿下说：CG 已经放过的重入路径（或素材缺失）也要先钉构图。
            if (event.nodeId === 'phone') this.applyCompositionNow(CH01_DREAM_ENTRY_PERFORMANCE);
            this.startDialogue(event.lines);
          }
          break;
        case 'battle':
          this.beginPalace(event.battleId);
          break;
        case 'complete':
          this.showEndCard();
          break;
      }
    }
  }

  private showChapterCard(lines: readonly string[]): void {
    audioDirector.playSfxAt(CH01_ASSET_KEYS.audio.chapterChime, { volume: 0.45 });
    this.cardVisible = true;
    this.cardActive.value = true;
    this.joystick?.setEnabled(false);
    this.card?.show(lines.length > 0 ? lines : CH01_CHAPTER_CARD);
    this.cardTimer?.remove();
    this.cardTimer = this.time.delayedCall(this.reduced ? 1400 : 2300, () => this.hideChapterCard());
  }

  private hideChapterCard(): void {
    if (!this.cardVisible) return;
    this.cardVisible = false;
    this.cardActive.value = false;
    this.cardTimer?.remove();
    this.cardTimer = null;
    this.card?.hide();
    const pending = this.deferred;
    this.deferred = [];
    if (pending.length > 0) this.handleEvents(pending);
    this.syncControls();
  }

  /**
   * 「查看手机」先整段放 CG（EP002），播完或跳过再进对话。
   *
   * 视频是 DOM 直显、盖在 canvas 上；播放期间场景输入由 `cutscene` 句柄屏蔽，
   * 只留右上角的「跳过」。素材缺失时直接进对话，不卡流程。
   */
  private startPhoneCutscene(lines: readonly DialogueLine[]): void {
    this.joystick?.setEnabled(false);
    this.promptText?.setVisible(false);
    this.interactAvailable.value = false;
    this.cutscene = playCutsceneVideo(this, CH01_ASSET_KEYS.video.phone, (reason) => {
      this.cutscene = null;
      if (this.shuttingDown) return;
      if (reason === 'error') console.warn('[ch01-dorm] 手机 CG 不可用，直接进入对话');
      /**
       * t29 关键点：**CG 结束那一帧**画面就已经是「主角坐在房间中心、小白在右侧」。
       *
       * `onDone` 与视频层 `destroy()` 在同一个 JS 任务里（中间不会落一帧），
       * 所以这里同步执行 0 时长构图步骤 —— 玩家看不到任何「还站在书桌边」的中间态，
       * 也不会先播一段走路再坐下。
       */
      this.applyCompositionNow(CH01_DREAM_ENTRY_PERFORMANCE);
      this.startDialogue(lines);
    });
  }

  private startDialogue(lines: readonly DialogueLine[]): void {
    /**
     * 对话面板固定 300 高、字号 34（lg）、内容宽 628 —— 大约 4 行 × 17 字。
     * 超出就分页，点一下翻下一页，避免长句被裁掉。
     * `typeMs` 由设置换算；`instant` 传 0，播放器一次显示整句。
     */
    this.dialogue = new DialoguePlayer(lines, {
      pageChars: DIALOGUE_PAGE_CHARS,
      balanceLines: true,
      typeMs: Math.round(DIALOGUE_TYPE_MS * textSpeedFactor(settings.textSpeed)),
    });
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
    this.interactAvailable.value = false;
    this.handleDialogueEvents(this.dialogue.start());
  }

  private handleDialogueEvents(events: readonly DialogueEvent[]): void {
    for (const event of events) {
      if (event.type === 'line') {
        // 旁白不显示「旁白」两个字，文字改用天蓝色；说话人变化也要反映在逐字音上。
        const tone = speakerTone(event.speaker, event.line.role);
        this.dialogueRole = event.line.role ?? null;
        this.dialogueTone.value = tone;
        this.dialogueSpeaker.value = speakerLabel(event.speaker);
        this.dialoguePageIndex.value = event.pageIndex;
        this.dialoguePageCount.value = event.pageCount;
        this.applyLineCue(event.line);
        this.recordHistory(event);
        if (this.dialogueRole === 'xiaobai' || event.speaker === '小白') this.showXiaobai();
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
        // 战后回来的第一句征召台词打完 → 收起醒来 CG、演起身；演完玩家再点「继续」。
        if (
          event.done &&
          this.wakePerformancePending &&
          event.index === 0 &&
          event.pageIndex === event.pageCount - 1
        ) {
          this.wakePerformancePending = false;
          this.cancelAutoAdvance();
          this.startWakePerformance();
          return;
        }
        if (event.done) this.scheduleAutoAdvance();
        else this.cancelAutoAdvance();
      } else if (event.type === 'complete') {
        this.cancelAutoAdvance();
        this.finishDialogue();
        return;
      }
    }
  }

  /** 收进对话记录；只在首次看到某一行时写入，分页重绘不重复。 */
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

  private cancelAutoAdvance(): void {
    this.autoTimer?.remove();
    this.autoTimer = null;
  }

  /**
   * 自动播放：一句/一页打完后按阅读时长推进。
   *
   * 同一时刻只保留一个计时器；玩家点屏幕会先取消它，再手动推进。
   */
  private scheduleAutoAdvance(): void {
    this.cancelAutoAdvance();
    if (this.performing || !settings.autoAdvance || !this.dialogue) return;
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
    if (this.performing) return;
    if (this.historyModal?.open === true) return;
    this.cancelAutoAdvance();
    this.historyModal = openDialogueHistory(this.mvvm, this.history.entries, {
      onClose: () => {
        this.historyModal = null;
        // 关闭记录后按当前状态恢复自动播放（不重复计时）。
        if (this.dialogue) this.scheduleAutoAdvance();
      },
    });
  }

  private advanceDialogue(): void {
    if (!this.dialogue || this.performing) return;
    this.cancelAutoAdvance();
    this.handleDialogueEvents(this.dialogue.requestAdvance());
  }

  private finishDialogue(): void {
    this.cancelAutoAdvance();
    // 玩家用「跳过」提前结束征召段时，起身表演还没播过；至少把坐姿切回站立，
    // 别让后面的结束卡背后还坐着一个已经「站起来」说过话的人。
    if (this.wakePerformancePending) {
      this.wakePerformancePending = false;
      this.suppressWakeCg = true;
      this.player?.setSitting(false);
    }
    this.dialogue = null;
    // 回忆段一旦开始，《危机来临》就保持到离开寝室（梦域战斗会接手切曲）；
    // 即使玩家中途点「跳过」也不切回日常，情绪不能断。
    const next = this.flow.nodeCompleted();
    this.handleEvents(next);
    // 如果 next 又开了对话，startDialogue 会把 visible 保持为 true，避免 Branch 闪一下探索按钮。
    if (!this.dialogue) {
      this.dialogueVisible.value = false;
      this.dialogueSpeaker.value = '';
      this.dialogueTone.value = 'default';
      this.dialogueText.value = '';
      this.dialoguePageIndex.value = 0;
      this.dialoguePageCount.value = 1;
      this.cg?.hide();
      this.emotionBubble?.hide();
    }
    this.syncControls();
    this.updateNear();
  }

  private syncControls(): void {
    const canExplore =
      this.flow?.state.phase === 'explore' &&
      this.dialogue === null &&
      !this.cardVisible &&
      !this.ended &&
      !this.transitioning &&
      !this.performing;
    this.joystick?.setEnabled(canExplore);
    if (canExplore) {
      this.startExploreAudio();
      if (!this.tutorialDismissed) this.tutorialVisible.value = true;
    } else {
      this.tutorialVisible.value = false;
      this.promptText?.setVisible(false);
    }
    this.updateNear();
  }

  private applyLineCue(line: DialogueLine): void {
    if (line.bgm !== undefined) bgmManager.play(line.bgm);
    // 战后第一句会先盖着醒来 CG（旁白是「坐在寝室地板上」）；起身表演开始后不再让
    // 后续 `cg: wake` 把画面重新盖上，否则坐→站的过程全在 CG 底下，玩家根本看不见。
    const suppressedWakeCg =
      this.suppressWakeCg && line.cg === CH01_ASSET_KEYS.cg.wake;
    if (line.cg !== undefined && !suppressedWakeCg) {
      this.cg?.show(line.cg, line.fx);
    } else if (this.flow?.state.currentNode !== 'after') {
      // 战后整段征召都在同一个画面里（醒来 CG → 坐起 → 起身）；中途切回站着的寝室会穿帮，
      // 所以 after 节点没有显式 cg 时保持上一张醒来 CG，等整段结束再收起。
      this.cg?.hide();
    }

    if (line.emotion !== undefined) {
      this.emotionHoldUntil = this.time.now + 700;
      this.showEmotion(line.emotion, line.emotionBy);
    } else {
      this.emotionHoldUntil = 0;
      this.emotionBubble?.hide();
    }

    if (line.fx !== undefined && line.cg === undefined) {
      if (line.fx === 'flash' && !this.reduced) this.cameras.main.flash(240, 255, 255, 255);
      else if (line.fx === 'shake' && !this.reduced) this.cameras.main.shake(140, 0.004);
    }
  }

  private showEmotion(
    kind: NonNullable<DialogueLine['emotion']>,
    by?: DialogueLine['emotionBy'],
  ): void {
    const target =
      by ??
      (this.dialogueSpeaker.value.includes('郑卿')
        ? 'zheng'
        : this.dialogueRole === 'xiaobai' || this.dialogueSpeaker.value === '小白'
          ? 'xiaobai'
          : 'zhou');

    if (target === 'zheng') {
      const zheng = this.room.interactables.find((item) => item.id === 'zheng');
      if (!zheng) return;
      // 郑卿的判定点在枕头左侧（床沿）；+88 正好落到床上那颗脑袋的中心。
      // 判定点 2026-11-06 从行 13 下移到 14，气泡底部要跟着回抬一格（-62 → -84），
      // 否则尾巴（at.y - 52）会扎进头发里：行 14 时 at.y=412.1，头顶在 y≈340。
      const at = interactableCenter(this.room, zheng);
      this.emotionBubble?.show(kind, at.x + 88, at.y - 84, 900);
      return;
    }

    if (target === 'xiaobai' && this.xiaobai?.visible === true) {
      this.emotionBubble?.show(kind, this.xiaobai.x, this.xiaobai.y - 46, 900);
      return;
    }

    const player = this.player;
    if (!player) return;
    const head = player.headPoint;
    this.emotionBubble?.show(kind, head.x, head.y, 900);
  }

  private startSnore(): void {
    // 走 audioDirector 的循环表（而不是裸 this.sound.add）：场景 shutdown / restart 时
    // 由登记表统一停掉，呼噜不会跟着玩家回到标题页。
    const handle = audioDirector.playLoop(CH01_ASSET_KEYS.audio.snore, { volume: 0 });
    if (!handle) return;
    this.snore = handle;
    this.tweens.add({
      targets: handle.sound,
      volume: settings.muted ? 0 : settings.sfx * 0.6,
      duration: 320,
      ease: 'Sine.easeOut',
    });
  }

  private stopSnore(): void {
    const handle = this.snore;
    if (!handle) return;
    this.snore = null;
    // stop 会一并 kill 指着这条 Sound 的音量 tween（见 AudioDirector.trackLoop）。
    handle.stop();
  }

  /**
   * 本节自持的循环音统一收尾点：呼噜 + 蝉鸣环境音。
   *
   * shutdown / restart / 转场 / 结束卡都走这里，避免以后新增循环音时又漏一条。
   * `audioDirector.attach()` 在 SHUTDOWN 还会兜底 `stopAllLoops()`，这里负责「提前、显式」。
   */
  private stopSceneAudio(): void {
    this.stopSnore();
    this.stopAmbience();
  }

  private startExploreAudio(): void {
    if (this.bgmStarted || this.ended || this.transitioning) return;
    this.bgmStarted = true;
    this.stopSnore();
    this.player?.setSitting(false);
    this.roomView?.setChairVisible(true);
    // 睡觉戏开场是静场的，进探索时切回**场景绑定**里的曲子（不是写死 ch01Dorm：运行时改绑要生效）。
    // 从「继续游戏」直接进探索时绑定曲已经在 create 播过，这里是同一实例的续播判定（不会从头播）。
    bgmManager.applySceneBinding();
    // 环境音：蝉鸣/操场/吊扇，压得很低，只负责「这个房间是活的」。
    audioDirector.playSfxAt(CH01_ASSET_KEYS.audio.ambienceDay, { volume: 0.22, loop: true });
  }

  private stopAmbience(): void {
    audioDirector.stopLoop(CH01_ASSET_KEYS.audio.ambienceDay);
  }

  private isOpening(): boolean {
    return this.resumeMode === 'start' && this.previewPhase === 'opening';
  }

  /**
   * 是否从「战后回来」进入本节：正式流程传 `resume: 'afterBattle'`；
   * 舞台预览对应 `?stage=scene.ch01.dorm&phase=after`。两条路都要先进坐姿。
   */
  private isWakeStart(): boolean {
    return (
      this.resumeMode === 'afterBattle' ||
      (this.resumeMode === 'start' && this.previewPhase === 'after')
    );
  }

  /** 小白该浮的位置：主角脚底 + 时间线里的 tile 偏移（不写死像素）。 */
  private xiaobaiSpotNearPlayer(): MapPoint {
    const at = this.player?.position ?? tileCenter(this.room, CH01_SIT_TILE[0], CH01_SIT_TILE[1]);
    return {
      x: at.x + CH01_XIAOBAI_OFFSET[0] * this.room.tileSize,
      y: at.y + CH01_XIAOBAI_OFFSET[1] * this.room.tileSize,
    };
  }

  private startXiaobaiBob(): void {
    const xiaobai = this.xiaobai;
    if (!xiaobai || this.reduced || this.xiaobaiBob) return;
    const baseY = xiaobai.y;
    this.xiaobaiBob = this.tweens.add({
      targets: xiaobai,
      y: baseY - 8,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopXiaobaiBob(): void {
    this.xiaobaiBob?.remove();
    this.xiaobaiBob = null;
  }

  private showXiaobai(): void {
    if (!this.xiaobai || this.xiaobai.visible) return;
    this.xiaobai.setVisible(true).setAlpha(0);
    this.tweens.add({
      targets: this.xiaobai,
      alpha: 1,
      duration: this.reduced ? 120 : 520,
      ease: 'Sine.easeOut',
    });
    this.startXiaobaiBob();
  }

  /**
   * 同步执行一段「构图」时间线（只接受 0 时长步骤）。
   *
   * 用于手机 CG 结束那一帧：`onDone` 与视频层摘除在同一个 JS 任务里，
   * 这里立刻把主角钉在坐点、把小白放到右侧，中间不会落任何「站着」的帧。
   * 不设 `performing`——调用方紧接着就开始对白（对白期间由坐姿独占保证姿态）。
   */
  private applyCompositionNow(timeline: PerformanceTimeline): void {
    if (this.shuttingDown) return;
    for (const step of timeline.steps) {
      if (stepDurationMs(step, this.reduced) !== 0) {
        console.warn('[ch01-dorm] 同步构图步骤必须是 0 时长，已跳过', step.kind);
        continue;
      }
      this.runPerformanceStep(step, 0);
    }
    // 构图直接落地：把可能残留的交互提示按掉，避免和画面抢注意力。
    this.near = null;
    this.promptText?.setVisible(false);
    this.highlightRing?.setVisible(false);
    this.interactAvailable.value = false;
    this.interactLabel.value = '交互';
  }

  /**
   * 按纯数据时间线执行表演。
   *
   * 每一步在自己的开始时间触发，最后一次性收尾（白场淡出 + 恢复输入 + onDone）。
   * 期间 `performing` 为真：不推进对话、不吃输入、不 sync 角色（起身/坐下会直接改 sprite）。
   */
  private startPerformance(timeline: PerformanceTimeline, onDone: () => void): void {
    if (this.performing || this.shuttingDown) return;
    this.performing = true;
    this.performanceActive.value = true;
    this.cancelAutoAdvance();
    this.joystick?.setEnabled(false);
    this.promptText?.setVisible(false);
    this.highlightRing?.setVisible(false);
    this.interactAvailable.value = false;

    let at = 0;
    for (const step of timeline.steps) {
      const duration = stepDurationMs(step, this.reduced);
      const startAt = at;
      this.performanceTimers.push(
        this.time.delayedCall(startAt, () => {
          if (this.shuttingDown) return;
          this.runPerformanceStep(step, duration);
        }),
      );
      at += duration;
    }

    this.performanceTimers.push(
      this.time.delayedCall(timelineDurationMs(timeline, this.reduced), () => {
        if (this.shuttingDown) return;
        this.finishPerformance();
        onDone();
      }),
    );
  }

  private runPerformanceStep(step: PerformanceStep, duration: number): void {
    switch (step.kind) {
      case 'walk':
        this.performWalk(step, duration);
        break;
      case 'sit':
        this.performSit(step, duration);
        break;
      case 'move-actor':
        this.performMoveActor(step, duration);
        break;
      case 'wait':
        break;
      case 'flash':
        this.performFlash(step);
        break;
      case 'frame-sequence':
        this.performStand(step, duration);
        break;
    }
  }

  /** 走到 tile 中心：边挪脚底边推进行走帧 + 木地板脚步。 */
  private performWalk(step: WalkStep, duration: number): void {
    const player = this.player;
    if (!player) return;
    const target = tileCenter(this.room, step.to[0], step.to[1]);
    const proxy = { x: player.position.x, y: player.position.y };
    /**
     * 表演走位的速度比日常移动快（约 375px/s vs 140px/s），如果沿用 `advanceFootsteps`
     * 的「每 34px 一步」，1.6 秒会踩出十几下，像打字机。
     * 这里改成按时间踩点（约每 500ms 一步），和 20 帧步态的脚落地节奏接近。
     */
    let stepClock = 0;
    this.walkTween = this.tweens.add({
      targets: proxy,
      x: target.x,
      y: target.y,
      duration,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        player.moveTo({ x: proxy.x, y: proxy.y }, step.facing, true, this.game.loop.delta);
        stepClock += this.game.loop.delta;
        if (stepClock >= 500) {
          stepClock -= 500;
          this.playFootstep();
        }
      },
      onComplete: () => {
        this.walkTween = null;
        player.moveTo(target, step.facing, false, 0);
      },
    });
  }

  /** 停掉表演走位；tween 的 onComplete 不会再触发，避免它和 sit 抢贴图。 */
  private stopWalkTween(): void {
    this.walkTween?.stop();
    this.walkTween = null;
  }

  /**
   * 坐下：先停走位 tween、钉到 sit 的落点，再切坐姿贴图。
   *
   * 这里的顺序是 t23 真机回归的修复点：Clock 先于 TweenManager 更新，sit 定时器
   * 会在 walk tween 的最后一帧之前触发；旧实现只 `setSitting(true)`，随后 walk
   * 的最后一帧 `moveTo(walking=true)` 又把贴图刷回行走/站立。
   * 现在走位 tween 在进 sit 时被 stop，且 `PlayerActor` 保证坐姿独占，不会被覆盖。
   * reduced-motion 时省略下沉和尘土。
   */
  private performSit(step: SitStep, duration: number): void {
    const player = this.player;
    if (!player) return;
    const target = tileCenter(this.room, step.to[0], step.to[1]);
    this.stopWalkTween();
    // 先钉回坐下的 tile 中心（走位最后一帧可能还差几像素），再进入坐姿。
    player.moveTo(target, step.facing, false, 0);
    player.setSitting(true);

    if (step.from === 'sit') return; // 已经坐着，这一拍只是让玩家看清构图
    audioDirector.playSfxAt(PALACE_ASSET_KEYS.sfx.kneel, { volume: 0.22, rate: 0.92 });
    if (this.reduced) return;

    const sprite = player.display;
    if (sprite) {
      const baseY = sprite.y;
      sprite.setY(baseY - 6);
      this.tweens.add({
        targets: sprite,
        y: baseY,
        duration: Math.min(duration, 200),
        ease: 'Back.easeOut',
      });
    }
    if (step.dust) this.spawnSitDust(player.position);
  }

  /** 坐下时脚边一圈淡出的浅色尘土（纯 Graphics，不占额外资源）。 */
  private spawnSitDust(at: MapPoint): void {
    for (let i = 0; i < 5; i += 1) {
      const dx = (i - 2) * 10;
      const puff = this.add
        .ellipse(at.x + dx, at.y + 2, 12, 6, 0xd8c9a8, 0.42)
        .setDepth(LAYERS.effects);
      this.tweens.add({
        targets: puff,
        x: puff.x + dx * 0.9,
        y: puff.y - 8,
        alpha: 0,
        scaleX: 1.9,
        scaleY: 1.9,
        duration: 460,
        ease: 'Sine.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  /** 小白平移到主角右侧；移动前停掉漂浮 bob，落位后从新位置继续 bob。 */
  private performMoveActor(step: MoveActorStep, duration: number): void {
    const xiaobai = this.xiaobai;
    const player = this.player;
    if (!xiaobai || !player) return;
    const target = {
      x: player.position.x + step.offset[0] * this.room.tileSize,
      y: player.position.y + step.offset[1] * this.room.tileSize,
    };
    this.stopXiaobaiBob();
    /**
     * 0 时长 = CG 结束那一帧的构图：**直接落位并可见**（小白在 CG 里已经成形，
     * 这里不需要再淡入一次）。否则按原逻辑平移 + 落位后继续 bob。
     */
    if (duration <= 0) {
      xiaobai.setVisible(true).setAlpha(1).setPosition(target.x, target.y);
      this.startXiaobaiBob();
      return;
    }
    // 玩家跳过手机对话时小白可能还没登场；表演里必须让它出现，否则「在他右边」落空。
    this.showXiaobai();
    this.tweens.add({
      targets: xiaobai,
      x: target.x,
      y: target.y,
      duration,
      ease: 'Sine.easeInOut',
      onComplete: () => this.startXiaobaiBob(),
    });
  }

  /**
   * 全屏白场：DOM 层淡入（盖住 HUD 与 canvas）。
   *
   * `handoff: true` 时**这里只淡入、不淡出**：全白保持到 `beginPalace` 切完场景，
   * 再由金殿首帧之上淡出（否则会像 t27 那样先露出约 0.48s 寝室）。
   */
  private performFlash(step: FlashStep): void {
    this.flashStep = step;
    this.flashHandoffOutMs = step.handoff === true ? flashOutMs(step, this.reduced) : 0;
    const fade = flashInMs(step, this.reduced);
    this.flashOverlay = mountFlashOverlay({ color: '#ffffff' });
    this.flashOverlay?.fadeIn(fade);
    if (!this.flashOverlay && !this.reduced) {
      // 没有 DOM（极老 WebView/单测）：退回相机闪白，至少还有一下。
      this.cameras.main.flash(fade, 255, 255, 255);
    }
    audioDirector.playSfxAt(PALACE_ASSET_KEYS.sfx.rumble, { volume: 0.32, rate: 0.85 });
    audioDirector.playSfxAt(PALACE_ASSET_KEYS.sfx.whoosh, { volume: 0.26 });
  }

  /**
   * 起身：播 `zhou_stand_up` 8 帧序列（520ms / Linear）。
   *
   * 帧号只由「已播时长 / 整段时长 × 帧数」决定（`standUpFrameAt`），**不叠 ease**：
   * 任何缓动都会让某些帧停更久、另一些被跳过，看起来像抽帧而不是起身。
   * 播完把贴图交回站立静态图（`player.sync()` 按朝向取 Q 版 `zhou_q_*`），缩放在
   * 三处都取素材声明（坐姿 1.0 / 起身 1.0 / 站立 0.6138），底边同为 394，
   * 因此从头到尾不会出现「缩小的站立图」。
   *
   * 末帧是**正侧面朝右**，起身结束落到同朝向的侧面 idle（`zhou_idle_right`），所以
   * 硬切即可，不再有 110ms 的「转身」交叉；见 `settleToIdle`。
   *
   * 帧序列按贴图**宽度**判定可用性（`standUpFramesFromLayout`）：占位图 96×160
   * 切不出 160 宽的帧 → 0 → 直接落回站立静态图（不做缩小/放大的 tween 假起身）。
   * 播放期间 `performing` 为真，`update()` 不会 `sync()`，贴图不会被坐姿刷回去。
   */
  private performStand(step: FrameSequenceStep, duration: number): void {
    const player = this.player;
    if (!player) return;
    audioDirector.playSfxAt(PALACE_ASSET_KEYS.sfx.cloth, { volume: 0.3 });
    if (this.playStandUpSequence(player, step, duration)) return;
    // 素材不可用：原地落回站立（不缩放、不硬切「小站立图」）。
    // 同样走「站定 + 侧面 idle」：起身序列缺图不该让 idle 退回 3/4 面。
    player.settleStandUp();
  }

  /**
   * 播 `zhou_stand_up` 帧序列；素材不可用时返回 false，由调用方直接落回站立静态图。
   *
   * 素材是横排 strip（8 帧 × 160×400，见 `CH01_STAND_UP_SEQUENCE`）。与行走 sheet
   * 同一套做法：首次使用时按 frameWidth 把帧切进 Phaser 纹理缓存。
   */
  private playStandUpSequence(
    player: PlayerActor,
    step: FrameSequenceStep,
    duration: number,
  ): boolean {
    const sprite = player.display;
    if (!sprite) return false;
    const { key, frameWidth, frameHeight } = CH01_STAND_UP_SEQUENCE;
    if (!this.textures.exists(key)) return false;

    const texture = this.textures.get(key);
    const source = texture.getSourceImage();
    const width = 'width' in source ? Number(source.width) : 0;
    const height = 'height' in source ? Number(source.height) : 0;
    const frames = standUpFramesFromLayout(width, height);
    if (frames < 2) return false;

    for (let index = 0; index < frames; index += 1) {
      if (!texture.has(String(index))) {
        texture.add(index, 0, index * frameWidth, 0, frameWidth, frameHeight);
      }
    }

    const feet = player.position;
    const total = Math.max(1, duration);
    const proxy = { t: 0 };
    // 播放期间不再叠坐姿贴图（performing 冻结 sync）。
    // 缩放取素材声明（1.0）：这张 sheet 与坐姿图同一套 160×400 画布、底边同为 394，
    // 末帧人物高 228 = 站立静态图 371 × 0.6138；再乘 PLAYER_SCALE 会先缩一半再弹回去。
    sprite.setScale(CH01_ZHOU_STAND_UP.displayScale);
    sprite.setPosition(feet.x, feet.y);
    sprite.setTexture(key, 0);
    this.tweens.add({
      targets: proxy,
      t: total,
      duration: total,
      // 帧序列按**均匀时间**推进：ease 只该作用在位移上。
      ease: step.ease,
      onUpdate: () => {
        sprite.setTexture(key, standUpFrameAt(proxy.t, frames, total));
      },
      onComplete: () => {
        // 最后一帧钳住站立姿态，再落到同朝向的侧面 idle（同一底边、同一屏显高，硬切）。
        sprite.setTexture(key, frames - 1);
        this.settleToIdle(player);
        // 站直那一下的落脚声（cloth 在起身开始时已经给过）。
        audioDirector.playSfxAt(CH01_ASSET_KEYS.audio.stepWoodB, { volume: 0.2 });
      },
    });
    return true;
  }

  /**
   * 起身末帧 → 站立 idle：**硬切**到同朝向的侧面 idle（`zhou_idle_right`）。
   *
   * #t41：起身末帧是正侧面朝右，`zhou_idle_right` 也是正侧面朝右、同一套 160×400 画布
   * （人物高 371 / 底边 394 / 水平中心 80），显示缩放同为 0.6138。两张图之间没有姿势
   * 跳变，所以 `standUpToIdleFadeMs()` 现在是 0：直接 `player.settleStandUp()` 换贴图，
   * 不再盖过渡层，也不会再出现那 110ms 的「转身」。
   *
   * 兜底分支：真机上若硬切仍闪 1 帧，把 `STANDUP_TO_IDLE_FADE_MS` 调到 ≤40ms，这里会
   * 自动退回「盖一层侧面 idle、alpha 均匀淡到 1 再切贴图」的做法——临时层与主角同脚底、
   * 同原点、同 depth、同缩放，所以融合期间脚底（y≈782）和大小都不动。
   * 临时层只有在这里和 `resetState` / `onShutdown` 三处碰，淡完立即销毁，不残留。
   */
  private settleToIdle(player: PlayerActor): void {
    const sprite = player.display;
    const fadeMs = standUpToIdleFadeMs(this.reduced);
    const look = player.sideIdleLook;
    if (fadeMs <= 0 || sprite === null || look === null) {
      // 正常路径：0ms 硬切。
      player.settleStandUp();
      return;
    }
    // 兜底：正常时序不会叠加，万一上一次没销毁，先清掉再建。
    this.standUpCrossFade?.destroy();
    const temp = this.add
      .image(sprite.x, sprite.y, look.key)
      .setOrigin(sprite.originX, sprite.originY)
      .setScale(look.scale)
      .setDepth(sprite.depth)
      .setAlpha(0);
    this.standUpCrossFade = temp;
    this.tweens.add({
      targets: temp,
      alpha: 1,
      duration: fadeMs,
      // 融合只要「均匀地把新姿势叠上来」，不需要 ease。
      ease: 'Linear',
      onComplete: () => {
        player.settleStandUp();
        temp.destroy();
        if (this.standUpCrossFade === temp) this.standUpCrossFade = null;
      },
    });
  }

  /** 表演收尾：白场淡出（或交给下一个场景），恢复输入，再交给调用方。 */
  private finishPerformance(): void {
    const flash = this.flashStep;
    const overlay = this.flashOverlay;
    this.flashStep = null;
    if (overlay) {
      if (flash?.handoff === true) {
        /**
         * 交接模式：**保持全白、不淡出**。
         * `beginPalace` 会在切场景之后才在目标场景之上淡出（时长已记在
         * `flashHandoffOutMs`），所以这里什么都不做，连元素都不摘。
         */
      } else if (flash) {
        const out = flashOutMs(flash, this.reduced);
        overlay.fadeOut(out);
        // 淡出结束再摘层；场景 shutdown 也会兜底 remove。
        this.performanceTimers.push(
          this.time.delayedCall(out + 60, () => {
            overlay.remove();
            if (this.flashOverlay === overlay) this.flashOverlay = null;
          }),
        );
      } else {
        overlay.remove();
        this.flashOverlay = null;
      }
    }
    this.performing = false;
    this.performanceActive.value = false;
    this.syncControls();
    this.updateNear();
  }

  /**
   * 战后起身表演：醒来 CG 收起 → 坐一拍 → 起身。
   *
   * 坐姿图缺失（`PlayerActor` 起不来）时直接跳过，不能把流程卡在表演里。
   */
  private startWakePerformance(): void {
    if (this.player?.isSitting !== true) return;
    this.suppressWakeCg = true;
    this.cg?.hide();
    this.startPerformance(CH01_WAKE_PERFORMANCE, () => {
      // 表演里 `performStand` 收尾已经落到「站定 + 侧面 idle」；这里再调一次只解除坐姿，
      // `poseAfterSetSitting(false)` 会保留侧面 idle 标记，不会把 idle 刷回 3/4 面的 `q.right`。
      this.player?.setSitting(false);
      if (settings.autoAdvance) this.scheduleAutoAdvance();
    });
  }

  /** 梦域这一段先在金殿里演完（走位/台词），再由宫殿场景自己切战斗。 */
  private beginPalace(battleId: string): void {
    if (this.transitioning) return;
    this.transitioning = true;
    saveProgress('dorm.palace', { preview: this.preview });
    this.dialogue = null;
    this.dialogueVisible.value = false;
    this.performanceActive.value = false;
    this.joystick?.setEnabled(false);
    this.promptText?.setVisible(false);
    this.interactAvailable.value = false;
    this.cg?.hide();
    this.emotionBubble?.hide();
    this.stopSceneAudio();

    /**
     * 入梦白场交接（t27 实测：旧实现在寝室里提前淡出，露 0.48s 寝室）。
     *
     * 此时白光已经被 `finishPerformance` 保持在全白；这里把它从寝室手里**接走**：
     * 先清掉 `flashOverlay` 引用（否则 dorm 的 SHUTDOWN 会把 DOM 层删掉），
     * 等 `enterModule` 把金殿摆好之后再在白场之上淡出。全白期间完成切场，
     * 寝室一帧都不会露。
     */
    const handoff = this.flashOverlay;
    // 没记到淡出时长时给一个安全值：宁可白场多停一会儿，也不能 0ms 直接露寝室。
    const handoffOutMs = this.flashHandoffOutMs > 0 ? this.flashHandoffOutMs : 320;
    this.flashOverlay = null;
    this.flashHandoffOutMs = 0;
    if (handoff) {
      this.enterPalaceUnderFlash(battleId, handoff, handoffOutMs);
      return;
    }

    // 兜底（DOM 白场不可用/极老 WebView）：沿用「闪白 → 黑场 → 切场景」。
    if (!this.reduced) this.cameras.main.flash(180, 255, 255, 255);
    this.time.delayedCall(this.reduced ? 80 : 260, () => {
      this.cameras.main.fadeOut(this.reduced ? 160 : 320, 5, 6, 10);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        void enterModule(this, 'ch01Palace', {
          encounterId: battleId,
          seed: this.seed,
          preview: this.preview,
        }).catch((error: unknown) => {
          console.warn('[ch01-dorm] 进入金殿失败', error);
          this.transitioning = false;
        });
      });
    });
  }

  /**
   * 全白期间切金殿：`enterModule` 之后就淡出白场（DOM 层留在 body 上，不随场景销毁）。
   *
   * `enterModule` 在 `scene.start()` 之后 resolve；金殿的 `create()` 会在下一帧跑完。
   * 白场从 100% 开始淡出，等它降到能看见画面时金殿已经画出来了——中间没有任何寝室帧。
   */
  private enterPalaceUnderFlash(
    battleId: string,
    overlay: FlashOverlayHandle,
    outMs: number,
  ): void {
    const finish = (): void => {
      overlay.fadeOut(outMs);
      // 场景已 shutdown，`this.time` 不再可靠；用 window 计时器收尾 DOM 层。
      window.setTimeout(() => overlay.remove(), outMs + 80);
    };
    void enterModule(this, 'ch01Palace', {
      encounterId: battleId,
      seed: this.seed,
      preview: this.preview,
    })
      .then(finish)
      .catch((error: unknown) => {
        console.warn('[ch01-dorm] 进入金殿失败', error);
        // 失败时白场必须撤掉，否则玩家永远停在纯白里。
        overlay.remove();
        this.transitioning = false;
      });
  }

  private showEndCard(): void {
    audioDirector.playSfxAt(CH01_ASSET_KEYS.audio.chapterChime, { volume: 0.38 });
    this.ended = true;
    // 结束卡是模态；把 HUD 切到 card 分支，避免右下角「交互」按钮从卡片下面露出来。
    this.cardActive.value = true;
    this.objective.value = CH01_OBJECTIVES.complete;
    this.joystick?.setEnabled(false);
    this.promptText?.setVisible(false);
    this.interactAvailable.value = false;
    this.cg?.hide();
    this.emotionBubble?.hide();
    this.stopSceneAudio();
    saveProgress('ch01.complete', { preview: this.preview });
    openCh01EndCard(this.mvvm, {
      // 正式流程：结束卡直接送进第二节。`preview` 原样传给下游，预览不写进度。
      onNext: () => {
        audioDirector.playClick();
        void enterModule(this, 'ch01Kitchen', {
          ...(this.preview ? { preview: true } : {}),
          seed: this.seed,
        });
      },
      onRestart: () => {
        audioDirector.playClick();
        // 「重看本节」= 从本节开头重演：先把检查点退回寝室探索，避免「继续游戏」直接又跳结束卡。
        saveProgress('dorm.explore', { preview: this.preview });
        // restart 必须显式给 data：不传会沿用上次启动的 `{ resume: 'complete' }`，
        // 于是又回到同一张结束卡（C3 死循环）。`endCardRestartData` 保证它解析成 resume:'start'。
        this.scene.restart(endCardRestartData({ preview: this.preview, seed: this.seed }));
      },
      onTitle: () => {
        audioDirector.playClick();
        void enterModule(this, 'title');
      },
    });
  }

  private openExitConfirm(): void {
    if (this.exitModal?.open === true) return;
    this.exitModal = openCh01ExitConfirm(this.mvvm, {
      onTitle: () => {
        audioDirector.playClick();
        // 先停本节的循环音（呼噜/蝉鸣）再走加载门：不等 SHUTDOWN，标题页一出现就是静的。
        this.stopSceneAudio();
        void enterModule(this, 'title');
      },
      onClose: () => {
        this.exitModal = null;
      },
    });
  }

  private onShutdown(): void {
    this.shuttingDown = true;
    this.cancelAutoAdvance();
    // 表演：停掉所有延时步骤，白光层必须现在摘掉（DOM 层不会跟着 Phaser 场景消失）。
    this.performing = false;
    this.performanceActive.value = false;
    for (const timer of this.performanceTimers) timer.remove();
    this.performanceTimers = [];
    // 注意：白场交接时 `beginPalace` 已把 `flashOverlay` 置空并转交给金殿，
    // 这里只会摘掉「还没交接」的白场，不会误删正在淡出的那一层。
    this.flashOverlay?.remove();
    this.flashOverlay = null;
    this.flashStep = null;
    this.flashHandoffOutMs = 0;
    this.xiaobaiBob?.remove();
    this.xiaobaiBob = null;
    this.walkTween?.stop();
    this.walkTween = null;
    // 交叉淡入还在跑就退出/切场：临时层必须现在销毁，不能挂在已关闭的场景上。
    this.standUpCrossFade?.destroy();
    this.standUpCrossFade = null;
    // 循环音必须在 SHUTDOWN 里停：Phaser 的 SoundManager 是 game 级的，场景关闭不会自动停。
    this.stopSceneAudio();
    this.cutscene?.destroy();
    this.cutscene = null;
    this.input.off('pointerdown', this.onScenePointerDown, this);
    const keyboard = this.input.keyboard;
    keyboard?.off('keydown-E', this.onInteractKey, this);
    keyboard?.off('keydown-SPACE', this.onAdvanceKey, this);
    keyboard?.off('keydown-ENTER', this.onAdvanceKey, this);
    this.joystick?.destroy();
    this.joystick = null;
    this.cardTimer?.remove();
    this.cardTimer = null;
    this.exitModal?.close('scene');
    this.exitModal = null;
    this.historyModal?.close('scene');
    this.historyModal = null;
    this.stageFrame?.destroy();
    this.stageFrame = null;
    for (const fx of this.ambientFx) fx.destroy();
    this.ambientFx = [];
    this.roomView?.destroy();
    this.roomView = null;
    this.card?.destroy();
    this.card = null;
    this.dialogue = null;
    this.deferred = [];
    this.roomView = null;
    this.player = null;
    this.xiaobai = null;
    this.promptText = null;
    this.highlightRing = null;
    this.cg = null;
    this.keys = null;
  }
}
