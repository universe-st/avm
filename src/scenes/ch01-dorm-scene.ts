import Phaser from 'phaser';
import { ref } from '@phaser-mvvm/core';
import { UIScene, prefersReducedMotion, type ModalHandle } from '@phaser-mvvm/phaser';

/** 对话面板一页最多显示的字数（34px 字号 × 4 行 × 约 17 字）。 */
const DIALOGUE_PAGE_CHARS = 68;

import {
  CH01_ASSET_KEYS,
  CH01_Q_FRAME,
  CH01_Q_STATIC_SPRITES,
  CH01_Q_WALK_FRAME_COUNT,
  CH01_Q_WALK_SHEETS,
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
import { audioDirector } from '../audio/audio-director';
import { typeVoiceForSpeaker } from '../audio/type-voice';
import { settings } from '../app/settings';
import { bgmManager } from '../audio/bgm-manager';
import {
  isStageLaunchContext,
  stageBoolParam,
  stageParam,
  type StageLaunchContext,
} from '../dev/stage-types';
import {
  CH01_DORM_ROOM,
} from '../map/rooms/ch01-dorm';
import { findInteractableNear, interactableCenter } from '../map/core/room';
import { PLAYER_FOOT } from '../map/player-foot';
import {
  facingFromVector,
  moveWithCollision,
  normalizeDirection,
} from '../map/core/collision';
import type { InteractableDef, RoomDef } from '../map/types';
import {
  CH01_CHAPTER_CARD,
  CH01_INTERACTABLE_PROMPTS,
  CH01_OBJECTIVES,
  type Ch01InteractableId,
} from '../story/ch01-dorm';
import {
  CH01_PREVIEW_PHASES,
  Ch01Flow,
  isCh01ResumeData,
  normalizeCh01PreviewPhase,
  type Ch01Event,
  type Ch01PreviewPhase,
} from '../story/ch01-flow';
import { DialoguePlayer, type DialogueEvent } from '../story/dialogue-player';
import { playCutsceneVideo, type CutsceneVideoHandle } from '../ui/cutscene-video';
import type { DialogueLine } from '../story/dialogue';
import { TitleCard, GOLD, makeSceneText } from '../ui/cinematic';
import { VirtualJoystick } from '../ui/joystick';
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
 * 角色显示缩放：Q 版帧 160×400，原始比例 0.682，按要求整体缩到 **90%**（0.682 × 0.9）。
 * `headOffset` 是头顶到脚底的设计像素，必须跟着一起缩，否则表情气泡会飘在头顶上方。
 * 脚盒 `PLAYER_FOOT` 是碰撞用的，不跟缩放走（缩了会让窄过道更难走）。
 */
const PLAYER_SCALE = 0.6138;
const PLAYER_HEAD_OFFSET = 232;


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
  private promptText: Phaser.GameObjects.Text | null = null;
  private cg: CgOverlay | null = null;
  private emotionBubble: EmotionBubble | null = null;
  private emotionHoldUntil = 0;
  private snore: Phaser.Sound.BaseSound | null = null;
  private bgmStarted = false;
  private card: TitleCard | null = null;
  private cardTimer: Phaser.Time.TimerEvent | null = null;
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
  private cardVisible = false;
  private transitioning = false;
  private ended = false;
  private preview = false;
  private previewPhase: Ch01PreviewPhase = 'opening';
  private tutorialDismissed = false;
  private resumeAfterBattle = false;
  private seed = 1;
  private debug = false;
  private exitModal: ModalHandle | null = null;
  private readonly reduced = prefersReducedMotion();

  private readonly objective = ref<string>(CH01_OBJECTIVES.wakeZheng);
  private readonly dialogueVisible = ref(false);
  private readonly dialogueSpeaker = ref('');
  /** 当前这句的稳定角色 id（小白的名字会变，声线与立绘认这个）。 */
  private dialogueRole: DialogueLine['role'] | null = null;
  private readonly dialogueNarration = ref(false);
  private readonly dialogueText = ref('');
  private readonly dialogueHint = ref('继续');
  private readonly interactLabel = ref('交互');
  private readonly interactAvailable = ref(false);
  private readonly cardActive = ref(false);
  /** 新手移动指引：首次进入探索时显示，玩家第一次移动后收起。 */
  private readonly tutorialVisible = ref(false);

  constructor() {
    super(SCENE_KEYS.ch01Dorm);
  }

  init(data: unknown): void {
    const context: StageLaunchContext | null = isStageLaunchContext(data) ? data : null;
    this.preview = context?.preview === true;
    this.debug = context ? stageBoolParam(context, 'debug', false) : false;
    this.seed = context?.seed ?? 1;
    this.resumeAfterBattle = context === null && isCh01ResumeData(data);

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
    bgmManager.enterScene(this);
    if (this.isOpening()) this.startSnore();
    this.cameras.main.fadeIn(this.reduced ? 220 : 460, 5, 6, 10);

    this.flow = new Ch01Flow({
      ...(this.resumeAfterBattle ? { resume: 'afterBattle' as const } : {}),
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
      dialogueNarration: this.dialogueNarration,
      dialogueText: this.dialogueText,
      dialogueHint: this.dialogueHint,
      interactLabel: this.interactLabel,
      interactAvailable: this.interactAvailable,
      cardActive: this.cardActive,
      tutorialVisible: this.tutorialVisible,
      onMenu: () => {
        audioDirector.playClick();
        this.openExitConfirm();
      },
      onContinue: () => {
        audioDirector.playClick();
        this.advanceDialogue();
      },
      onSkipDialogue: () => {
        audioDirector.playClick();
        this.skipDialogue();
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
    this.roomView = null;
    this.player = null;
    this.xiaobai = null;
    this.promptText = null;
    this.cg = null;
    this.emotionBubble = null;
    this.emotionHoldUntil = 0;
    this.snore = null;
    this.bgmStarted = false;
    this.card = null;
    this.cardTimer = null;
    this.joystick = null;
    this.keys = null;
    this.objective.value = CH01_OBJECTIVES.wakeZheng;
    this.dialogueVisible.value = false;
    this.dialogueSpeaker.value = '';
    this.dialogueRole = null;
    this.dialogueNarration.value = false;
    this.dialogueText.value = '';
    this.dialogueHint.value = '继续';
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
    const opening = this.isOpening();
    this.player = new PlayerActor(this, this.room, {
      staticKeys: CH01_Q_STATIC_SPRITES,
      walkSheets: CH01_Q_WALK_SHEETS,
      frameWidth: CH01_Q_FRAME.width,
      frameHeight: CH01_Q_FRAME.height,
      walkFrameCount: CH01_Q_WALK_FRAME_COUNT,
      spriteScale: PLAYER_SCALE,
      headOffset: PLAYER_HEAD_OFFSET,
      linearTextures: true,
      // 开局站在书桌下方、靠左侧床的一侧。
      ...(opening ? { spawn: { at: [14, 12] as const, facing: 'down' as const } } : {}),
    });
    this.cg = new CgOverlay(this, this.reduced);
    this.emotionBubble = new EmotionBubble(this, this.reduced);

    const phone = this.room.interactables.find((item) => item.id === 'phone');
    const xiaobaiKey = CH01_ASSET_KEYS.characters.xiaobai;
    if (phone && this.textures.exists(xiaobaiKey)) {
      setPixelTexture(this, xiaobaiKey);
      const at = interactableCenter(this.room, phone);
      this.xiaobai = this.add
        .image(at.x + 56, at.y - 44, xiaobaiKey)
        .setDepth(LAYERS.effects)
        .setScale(0.45)
        .setAlpha(0)
        .setVisible(false);
    }

    this.promptText = makeSceneText(this, 0, 0, '', {
      size: 22,
      color: GOLD,
      depth: LAYERS.effects,
      stroke: 4,
    }).setVisible(false);

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
    player.moveTo(result.position, facing, moved, deltaMs);
  }

  private updateNear(): void {
    const active = this.flow?.state.phase === 'explore' && !this.dialogue && !this.cardVisible && !this.ended;
    const near = active && this.player ? findInteractableNear(this.room, this.player.position) : null;
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
        .setPosition(at.x, at.y - 70)
        // 开局站在书桌下，手机提示会压在主角头上；先让新手指引独占画面，移动后再显示提示。
        .setVisible(!this.tutorialVisible.value);
    } else {
      this.promptText.setVisible(false);
    }
  }

  private onInteractKey(event: KeyboardEvent): void {
    event.preventDefault();
    if (this.cutscene) return;
    this.interact();
  }

  private onAdvanceKey(event: KeyboardEvent): void {
    event.preventDefault();
    if (this.cutscene) return;
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
   * 右上角那条留给「跳过 / 菜单」按钮（点它们不该同时推进对话），
   * 判定用设计坐标：UI 相机 1:1，`worldX/worldY` 就是设计像素。
   */
  private onScenePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.cutscene) return;
    const plan = getViewportPlan();
    const inTopRightButtons = pointer.worldY < 150 && pointer.worldX > plan.designWidth - 230;
    if (this.dialogueVisible.value) {
      if (inTopRightButtons) return;
      this.advanceDialogue();
      return;
    }
    if (!this.cardVisible) return;
    if (inTopRightButtons) return;
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
    if (!this.dialogue) return;
    this.finishDialogue();
  }

  private interact(): void {
    if (this.transitioning || this.ended || this.cutscene) return;
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
          if (this.flow?.state.phase === 'explore') this.startExploreAudio();
          break;
        case 'dialogue':
          if (event.nodeId === 'phone' && !this.phoneCutsceneSeen) {
            this.phoneCutsceneSeen = true;
            this.startPhoneCutscene(event.lines);
          } else {
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
      this.startDialogue(lines);
    });
  }

  private startDialogue(lines: readonly DialogueLine[]): void {
    /**
     * 对话面板固定 300 高、字号 34（lg）、内容宽 628 —— 大约 4 行 × 17 字。
     * 超出就分页，点一下翻下一页，避免长句被裁掉。
     */
    this.dialogue = new DialoguePlayer(lines, { pageChars: DIALOGUE_PAGE_CHARS });
    this.dialogueVisible.value = true;
    this.dialogueSpeaker.value = '';
    this.dialogueRole = null;
    this.dialogueNarration.value = false;
    this.dialogueText.value = '';
    this.dialogueHint.value = '继续';
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
        const narration = event.speaker === '旁白';
        this.dialogueRole = event.line.role ?? null;
        this.dialogueSpeaker.value = narration ? '' : (event.speaker ?? '');
        this.dialogueNarration.value = narration;
        this.applyLineCue(event.line);
        if (this.dialogueRole === 'xiaobai' || event.speaker === '小白') this.showXiaobai();
      } else if (event.type === 'type') {
        this.dialogueText.value = event.text;
        this.dialogueHint.value = event.done ? '继续' : '补全';
        const gained = event.typedCount - this.lastTyped;
        if (gained > 0 && gained <= 2) {
          audioDirector.playTypeBlip(typeVoiceForSpeaker(event.speaker, this.dialogueRole ?? undefined));
        }
        this.lastTyped = event.typedCount;
      } else if (event.type === 'complete') {
        this.finishDialogue();
        return;
      }
    }
  }

  private advanceDialogue(): void {
    if (!this.dialogue) return;
    this.handleDialogueEvents(this.dialogue.requestAdvance());
  }

  private finishDialogue(): void {
    this.dialogue = null;
    // 回忆段一旦开始，《危机来临》就保持到离开寝室（梦域战斗会接手切曲）；
    // 即使玩家中途点「跳过」也不切回日常，情绪不能断。
    const next = this.flow.nodeCompleted();
    this.handleEvents(next);
    // 如果 next 又开了对话，startDialogue 会把 visible 保持为 true，避免 Branch 闪一下探索按钮。
    if (!this.dialogue) {
      this.dialogueVisible.value = false;
      this.dialogueSpeaker.value = '';
      this.dialogueNarration.value = false;
      this.dialogueText.value = '';
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
      !this.transitioning;
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
    if (line.cg !== undefined) this.cg?.show(line.cg, line.fx);
    else this.cg?.hide();

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
      const at = interactableCenter(this.room, zheng);
      this.emotionBubble?.show(kind, at.x + 88, at.y - 62, 900);
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
    const key = CH01_ASSET_KEYS.audio.snore;
    if (!this.cache.audio.exists(key)) return;
    const sound = this.sound.add(key, { loop: true, volume: 0 });
    this.snore = sound;
    sound.play();
    this.tweens.add({
      targets: sound,
      volume: settings.muted ? 0 : settings.sfx * 0.6,
      duration: 320,
      ease: 'Sine.easeOut',
    });
  }

  private stopSnore(): void {
    const sound = this.snore;
    if (!sound) return;
    this.snore = null;
    this.tweens.killTweensOf(sound);
    sound.stop();
    sound.destroy();
  }

  private startExploreAudio(): void {
    if (this.bgmStarted || this.ended || this.transitioning) return;
    this.bgmStarted = true;
    this.stopSnore();
    this.player?.setSitting(false);
    this.roomView?.setChairVisible(true);
    bgmManager.play('ch01Dorm');
  }

  private isOpening(): boolean {
    return !this.resumeAfterBattle && this.previewPhase === 'opening';
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
    this.tweens.add({
      targets: this.xiaobai,
      y: this.xiaobai.y - 8,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  /** 梦域这一段先在金殿里演完（走位/台词），再由宫殿场景自己切战斗。 */
  private beginPalace(battleId: string): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.dialogue = null;
    this.dialogueVisible.value = false;
    this.joystick?.setEnabled(false);
    this.promptText?.setVisible(false);
    this.cg?.hide();
    this.emotionBubble?.hide();
    this.stopSnore();

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

  private showEndCard(): void {
    this.ended = true;
    this.objective.value = CH01_OBJECTIVES.complete;
    this.joystick?.setEnabled(false);
    this.promptText?.setVisible(false);
    this.interactAvailable.value = false;
    this.cg?.hide();
    this.emotionBubble?.hide();
    this.stopSnore();
    openCh01EndCard(this.mvvm, {
      onRestart: () => {
        audioDirector.playClick();
        this.scene.restart();
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
        void enterModule(this, 'title');
      },
      onClose: () => {
        this.exitModal = null;
      },
    });
  }

  private onShutdown(): void {
    this.shuttingDown = true;
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
    this.cg = null;
    this.keys = null;
  }
}
