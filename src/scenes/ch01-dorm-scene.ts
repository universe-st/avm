import Phaser from 'phaser';
import { ref } from '@phaser-mvvm/core';
import { UIScene, prefersReducedMotion, type ModalHandle } from '@phaser-mvvm/phaser';

import { CH01_ASSET_KEYS, CH01_Q_FRAME, CH01_Q_STATIC_SPRITES, CH01_Q_WALK_SHEETS } from '../assets/keys';
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
const FOOT = { width: 58, height: 20 } as const;
const WALK_SPEED = 140;
const INTERACT_KEY = 'E';


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
  private deferred: Ch01Event[] = [];
  private near: InteractableDef | null = null;
  private lastTyped = 0;
  private cardVisible = false;
  private transitioning = false;
  private ended = false;
  private preview = false;
  private previewPhase: Ch01PreviewPhase = 'opening';
  private resumeAfterBattle = false;
  private seed = 1;
  private debug = false;
  private exitModal: ModalHandle | null = null;
  private readonly reduced = prefersReducedMotion();

  private readonly objective = ref<string>(CH01_OBJECTIVES.wakeZheng);
  private readonly dialogueVisible = ref(false);
  private readonly dialogueSpeaker = ref('');
  private readonly dialogueText = ref('');
  private readonly dialogueHint = ref('继续');
  private readonly interactLabel = ref('交互');
  private readonly interactAvailable = ref(false);
  private readonly cardActive = ref(false);

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
      dialogueText: this.dialogueText,
      dialogueHint: this.dialogueHint,
      interactLabel: this.interactLabel,
      interactAvailable: this.interactAvailable,
      cardActive: this.cardActive,
      onMenu: () => {
        audioDirector.playClick();
        this.openExitConfirm();
      },
      onContinue: () => {
        audioDirector.playClick();
        this.advanceDialogue();
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
    this.dialogueText.value = '';
    this.dialogueHint.value = '继续';
    this.interactLabel.value = '交互';
    this.interactAvailable.value = false;
    this.cardActive.value = false;
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
      spriteScale: 0.45,
      headOffset: 170,
      linearTextures: true,
      ...(opening ? { spawn: { at: [24, 36] as const, facing: 'up' as const } } : {}),
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

    const step = (WALK_SPEED * deltaMs) / 1000;
    const result = moveWithCollision(
      this.room,
      player.position,
      { x: direction.x * step, y: direction.y * step },
      FOOT,
    );
    const facing = facingFromVector(direction.x, direction.y, player.facing);
    player.moveTo(result.position, facing, true, deltaMs);
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
      this.promptText.setText(`[${INTERACT_KEY}] ${prompt}`).setPosition(at.x, at.y - 70).setVisible(true);
    } else {
      this.promptText.setVisible(false);
    }
  }

  private onInteractKey(event: KeyboardEvent): void {
    event.preventDefault();
    this.interact();
  }

  private onAdvanceKey(event: KeyboardEvent): void {
    event.preventDefault();
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

  private onScenePointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.cardVisible) return;
    // 卡片右上角给「菜单」留出命中区。
    const plan = getViewportPlan();
    if (pointer.worldX > plan.designWidth - 140 && pointer.worldY < 140) return;
    this.hideChapterCard();
  }

  private interact(): void {
    if (this.transitioning || this.ended) return;
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
          this.startDialogue(event.lines);
          break;
        case 'battle':
          this.beginBattle(event.battleId);
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

  private startDialogue(lines: readonly DialogueLine[]): void {
    this.dialogue = new DialoguePlayer(lines);
    this.dialogueVisible.value = true;
    this.dialogueSpeaker.value = '';
    this.dialogueText.value = '';
    this.dialogueHint.value = '继续';
    this.lastTyped = 0;
    this.joystick?.setEnabled(false);
    this.promptText?.setVisible(false);
    this.interactAvailable.value = false;
    this.handleDialogueEvents(this.dialogue.start());
  }

  private handleDialogueEvents(events: readonly DialogueEvent[]): void {
    for (const event of events) {
      if (event.type === 'line') {
        this.dialogueSpeaker.value = event.speaker ?? '';
        this.applyLineCue(event.line);
        if (event.speaker === '小白') this.showXiaobai();
      } else if (event.type === 'type') {
        this.dialogueText.value = event.text;
        this.dialogueHint.value = event.done ? '继续' : '补全';
        const gained = event.typedCount - this.lastTyped;
        if (gained > 0 && gained <= 2) audioDirector.playTypeBlip();
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
    const next = this.flow.nodeCompleted();
    this.handleEvents(next);
    // 如果 next 又开了对话，startDialogue 会把 visible 保持为 true，避免 Branch 闪一下探索按钮。
    if (!this.dialogue) {
      this.dialogueVisible.value = false;
      this.dialogueSpeaker.value = '';
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
    if (canExplore) this.startExploreAudio();
    if (!canExplore) this.promptText?.setVisible(false);
    this.updateNear();
  }

  private applyLineCue(line: DialogueLine): void {
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
        : this.dialogueSpeaker.value === '小白'
          ? 'xiaobai'
          : 'zhou');

    if (target === 'zheng') {
      const zheng = this.room.interactables.find((item) => item.id === 'zheng');
      if (!zheng) return;
      const at = interactableCenter(this.room, zheng);
      this.emotionBubble?.show(kind, at.x + 6, at.y - 62, 900);
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
      volume: settings.muted ? 0 : settings.sfx * 0.8,
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

  private beginBattle(battleId: string): void {
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
        void enterModule(this, 'battleCh01', {
          encounterId: battleId,
          seed: this.seed,
          preview: this.preview,
        }).catch((error: unknown) => {
          console.warn('[ch01-dorm] 进入战斗失败', error);
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
