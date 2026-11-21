import Phaser from 'phaser';
import { ref } from '@phaser-mvvm/core';
import { UIScene, type ModalHandle } from '@phaser-mvvm/phaser';
import { enterModule } from '../app/director';
import { SCENE_KEYS } from '../app/scene-keys';
import { applyCamera, getViewportPlan } from '../app/viewport';
import { resolveReducedMotion } from '../app/settings';
import { saveProgress } from '../app/progress';
import { SceneLifecycle } from '../app/scene-lifecycle';
import { evaluateSaveAvailability } from '../app/save/save-availability';
import { restoreSaveFromScene } from '../app/save/load';
import { audioDirector } from '../audio/audio-director';
import { bgmManager } from '../audio/bgm-manager';
import {
  BATTLE_ASSET_KEYS,
  BATTLE_COOK_ART,
  BATTLE_MINER_ART,
  BATTLE_PLAYER_ART,
  KITCHEN_CAST,
  castDir,
  castScale,
} from '../assets/keys';
import type {
  BattleAction,
  BattleEvent,
  BattleSetup,
  BattleState,
  Facing8,
  SlotId,
} from '../battle/types';
import {
  applyBattleAction,
  createBattle,
  playerCanAttack,
  previewPlayerAttack,
  startNextTurn,
} from '../battle/core/battle';
import { formatIntent } from '../battle/core/ai';
import { previewOrder } from '../battle/core/gauge';
import {
  FACING_ANGLES,
  SLOT_LABELS,
  SLOT_ORDER,
  facingLabel,
  slotLabel,
} from '../battle/core/slots';
import { buildPreviewState, type BattlePreviewPhase } from '../battle/core/preview';
import { planBattleLayout, type BattleLayout } from '../battle/layout';
import {
  CH01_KITCHEN_BATTLE_ID,
  resolveBattleSetup,
} from '../battle/data/ch01-kitchen';
import { BattleActor, type BattleActorArt } from '../actors/battle-actor';
import { buildBattleHud } from '../ui/battle-hud';
import {
  openBattleDefeat,
  openBattleExit,
  openBattleIntro,
  openBattleVictory,
} from '../ui/battle-ch01-modals';
import {
  afterimage,
  bladeTrail,
  drawBackArc,
  drawFacingMark,
  drawSlotRing,
  guardShield,
  hitBurst,
  protocolPressure,
  protocolScrim,
  slashArc,
} from '../ui/battle-fx';
import { addCoverImage } from '../ui/background';
import {
  addDustMotes,
  addLightShaft,
  addVignette,
  impactRing,
  screenRumble,
} from '../ui/fx-kit';
import { setLinearTextures, setPixelTextures } from '../ui/pixel';
import { LAYERS } from '../render/layers';
import { DANGER, GOLD, INK, MUTED, PAPER, makeSceneText } from '../ui/cinematic';
import { openGameMenu } from '../ui/game-menu';
import { hashSeed } from '../dev/random';
import {
  isStageLaunchContext,
  stageParam,
  type StageLaunchContext,
} from '../dev/stage-types';

const FACING_VALUES: readonly Facing8[] = [
  'up',
  'upRight',
  'right',
  'downRight',
  'down',
  'downLeft',
  'left',
  'upLeft',
];

const PREVIEW_PHASES: readonly BattlePreviewPhase[] = ['opening', 'mid', 'victory', 'defeat'];

function normalizePhase(value: string | undefined): BattlePreviewPhase {
  if (value === 'mid' || value === 'victory' || value === 'defeat') return value;
  return 'opening';
}

interface BattleLaunchData {
  readonly encounterId?: string;
  readonly seed?: number;
  readonly preview?: boolean;
  readonly returnTo?: 'dorm' | 'kitchen';
  readonly clearedEnemyId?: string;
  readonly resumeAt?: 'explore' | 'gate';
}

function isBattleLaunchData(value: unknown): value is BattleLaunchData {
  return value !== null && typeof value === 'object' && 'encounterId' in value;
}

function isRightSide(slot: SlotId): boolean {
  return slot === 'right' || slot === 'upperRight' || slot === 'lowerRight';
}

interface Step {
  (next: () => void): void;
}

/**
 * 战斗场景（v2 · 六站位跑条制）。
 *
 * 职责边界：
 * - 判定全在 `src/battle/core/`（纯逻辑，已有单测）；场景**只消费事件**播动画；
 * - 原生层画战场/角色/跑条/意图/伤害数字；Compose 只做顶栏与底部指令区；
 * - 预览模式（`StageLaunchContext.preview`）不写存档；phase=opening|mid|victory|defeat。
 */
export class BattleCh01Scene extends UIScene {
  private rawData: unknown = undefined;
  private context: StageLaunchContext | null = null;
  private preview = false;
  private seed = 1;
  private phaseParam: BattlePreviewPhase = 'opening';
  private setup: BattleSetup = resolveBattleSetup(undefined);
  private state!: BattleState;
  private layout!: BattleLayout;
  private launchReturnTo: 'dorm' | 'kitchen' = 'dorm';
  private launchClearedEnemyId: string | null = null;
  private launchResumeAt: 'explore' | 'gate' = 'explore';

  private readonly lifecycle = new SceneLifecycle();
  private runId = 0;

  private playerActor: BattleActor | null = null;
  private enemyActor: BattleActor | null = null;
  private highlightGraphics: Phaser.GameObjects.Graphics | null = null;
  private hpGraphics: Phaser.GameObjects.Graphics | null = null;
  private gaugeGraphics: Phaser.GameObjects.Graphics | null = null;

  private enemyNameText: Phaser.GameObjects.Text | null = null;
  private enemyHpText: Phaser.GameObjects.Text | null = null;
  private railPlayerText: Phaser.GameObjects.Text | null = null;
  private railEnemyText: Phaser.GameObjects.Text | null = null;
  private railOrderText: Phaser.GameObjects.Text | null = null;
  private railIntentText: Phaser.GameObjects.Text | null = null;
  private readonly slotLabels = new Map<SlotId, Phaser.GameObjects.Text>();
  private readonly slotZones = new Map<SlotId, Phaser.GameObjects.Zone>();
  private readonly fx: Phaser.GameObjects.GameObject[] = [];

  private busy = false;
  private ended = false;
  private transitioning = false;
  private introOpen = false;
  private moveMode = false;

  private introModal: ModalHandle | null = null;
  private defeatModal: ModalHandle | null = null;
  private victoryModal: ModalHandle | null = null;
  private exitModal: ModalHandle | null = null;
  private menuModal: ModalHandle | null = null;

  private readonly turnLabel = ref('战斗');
  private readonly playerLabel = ref('');
  private readonly hintText = ref('');
  private readonly logText = ref('');
  private readonly attackLabel = ref('攻击');
  private readonly moveLabel = ref('移动');
  private readonly actionsDisabled = ref(true);
  private readonly attackDisabled = ref(true);
  private readonly guardDisabled = ref(true);

  private get reduced(): boolean {
    return resolveReducedMotion();
  }

  private get isKitchen(): boolean {
    return this.setup.id === CH01_KITCHEN_BATTLE_ID;
  }

  constructor() {
    super(SCENE_KEYS.battleCh01);
  }

  init(data: unknown): void {
    this.rawData = data;
    const context = isStageLaunchContext(data) ? data : null;
    this.context = context;
    const launch = isBattleLaunchData(data) ? data : null;
    this.preview = context?.preview === true || launch?.preview === true;
    this.seed = context?.seed ?? launch?.seed ?? 1;

    const rawPhase = context ? stageParam(context, 'phase') : undefined;
    this.phaseParam = context ? normalizePhase(rawPhase) : 'opening';
    if (rawPhase !== undefined && !PREVIEW_PHASES.includes(rawPhase as BattlePreviewPhase)) {
      console.warn(`[battle-ch01] 未知 phase=${rawPhase}，回退 opening`);
    }

    const encounterId = launch?.encounterId ?? context?.stageId;
    this.setup = resolveBattleSetup(encounterId);

    // 预览专用：`facing=upRight` 等，用来逐个验收怪物八向图。
    if (context) {
      const rawFacing = stageParam(context, 'facing');
      if (rawFacing !== undefined) {
        if (FACING_VALUES.includes(rawFacing as Facing8)) {
          this.setup = {
            ...this.setup,
            enemy: { ...this.setup.enemy, facing: rawFacing as Facing8 },
          };
        } else {
          console.warn(`[battle-ch01] 未知 facing=${rawFacing}，忽略`);
        }
      }
    }

    this.launchReturnTo = launch?.returnTo ?? (this.isKitchen ? 'kitchen' : 'dorm');
    this.launchClearedEnemyId = launch?.clearedEnemyId ?? null;
    this.launchResumeAt = launch?.resumeAt ?? 'explore';

    const base = createBattle(this.setup, this.seed);
    if (this.preview && this.phaseParam !== 'opening') {
      this.state = buildPreviewState(this.setup, this.phaseParam, this.seed);
      if (this.phaseParam === 'victory' && this.state.phase !== 'victory') {
        console.warn('[battle-ch01] 该战斗不可能胜利，phase=victory 回退 mid');
        this.phaseParam = 'mid';
      }
    } else {
      this.state = base;
    }
  }

  override create(): void {
    this.resetRun();

    applyCamera(this);
    this.cameras.main.setBackgroundColor('#05060a');
    this.layout = planBattleLayout(getViewportPlan().designWidth, getViewportPlan().designHeight);

    this.prepareTextures();
    this.createBackdrop();
    this.createArena();
    this.createActors();
    this.createBarsAndRail();

    super.create();
    audioDirector.attach(this);
    bgmManager.enterScene(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    this.syncActorPositions();
    this.syncHud();
    this.installDebugHook();
    this.cameras.main.fadeIn(this.reduced ? 160 : 380, 5, 6, 10);

    if (this.preview && this.phaseParam === 'defeat') {
      this.ended = true;
      this.actionsDisabled.value = true;
      this.playerActor?.die({ reduced: this.reduced, player: true });
      this.time.delayedCall(this.reduced ? 160 : 520, () => this.showDefeatOverlay());
      return;
    }
    if (this.preview && this.phaseParam === 'victory') {
      this.ended = true;
      this.actionsDisabled.value = true;
      this.playSfx(BATTLE_ASSET_KEYS.sfx.victory, 0.9);
      this.enemyActor?.die({ reduced: this.reduced, player: false });
      this.time.delayedCall(this.reduced ? 160 : 700, () => this.showVictoryOverlay());
      return;
    }

    if (this.preview && this.phaseParam === 'mid') {
      this.refreshTurnState();
      return;
    }

    if (this.context?.skip === true) {
      this.beginTurn();
      return;
    }

    this.time.delayedCall(this.reduced ? 120 : 380, () => this.showBattleIntro());
  }

  protected content(): void {
    buildBattleHud({
      turnLabel: this.turnLabel,
      playerLabel: this.playerLabel,
      hintText: this.hintText,
      logText: this.logText,
      attackLabel: this.attackLabel,
      moveLabel: this.moveLabel,
      actionsDisabled: this.actionsDisabled,
      attackDisabled: this.attackDisabled,
      guardDisabled: this.guardDisabled,
      onAttack: () => this.onAttack(),
      onMove: () => this.onMove(),
      onGuard: () => this.playerAction({ kind: 'guard' }),
      onMenu: () => {
        audioDirector.playClick();
        this.openMenu();
      },
      location: this.isKitchen ? '梦域 / 御膳房' : '梦域 / 金殿',
      subtitle: this.isKitchen ? '遭遇战 · 六站位' : '剧情战 · 六站位',
    });
  }

  // ------------------------------------------------------------------ 场景搭建

  private resetRun(): void {
    this.runId = this.lifecycle.beginRun();
    this.busy = false;
    this.ended = false;
    this.transitioning = false;
    this.introOpen = false;
    this.moveMode = false;
    this.introModal = null;
    this.defeatModal = null;
    this.victoryModal = null;
    this.exitModal = null;
    this.menuModal = null;
    this.playerActor = null;
    this.enemyActor = null;
    this.highlightGraphics = null;
    this.hpGraphics = null;
    this.gaugeGraphics = null;
    this.enemyNameText = null;
    this.enemyHpText = null;
    this.railPlayerText = null;
    this.railEnemyText = null;
    this.railOrderText = null;
    this.railIntentText = null;
    this.slotLabels.clear();
    this.slotZones.clear();
    for (const object of this.fx) object.destroy();
    this.fx.length = 0;
  }

  private prepareTextures(): void {
    setLinearTextures(this, [
      BATTLE_ASSET_KEYS.player.idleRight,
      BATTLE_ASSET_KEYS.player.guardRight,
      BATTLE_ASSET_KEYS.player.attackRight,
      BATTLE_ASSET_KEYS.stage.kitchenHall,
    ]);
    // 新八向是 HD 插画（不是 2× 像素图），按 LINEAR 采样；旧单面兜底保持 NEAREST。
    setLinearTextures(this, [
      BATTLE_ASSET_KEYS.miner.dirs.down,
      BATTLE_ASSET_KEYS.miner.dirs.up,
      BATTLE_ASSET_KEYS.miner.dirs.left,
      BATTLE_ASSET_KEYS.miner.dirs.right,
      BATTLE_ASSET_KEYS.miner.dirs.downLeft,
      BATTLE_ASSET_KEYS.miner.dirs.downRight,
      BATTLE_ASSET_KEYS.miner.dirs.upLeft,
      BATTLE_ASSET_KEYS.miner.dirs.upRight,
    ]);
    setPixelTextures(this, [BATTLE_ASSET_KEYS.miner.fallback]);
  }

  private createBackdrop(): void {
    const plan = getViewportPlan();
    const hallKey = this.isKitchen
      ? BATTLE_ASSET_KEYS.stage.kitchenHall
      : BATTLE_ASSET_KEYS.stage.minerHall;
    if (!addCoverImage(this, hallKey)) {
      this.add
        .rectangle(0, 0, plan.designWidth, plan.designHeight, this.isKitchen ? 0x211812 : 0x1a1012)
        .setOrigin(0, 0)
        .setDepth(LAYERS.background);
    }
    this.add
      .rectangle(0, 0, plan.designWidth, plan.designHeight, 0x05060a, 0.32)
      .setOrigin(0, 0)
      .setDepth(LAYERS.props);

    this.fx.push(
      addLightShaft(this, {
        x: plan.designWidth * 0.5,
        y: 40,
        width: 440,
        height: 980,
        angleDeg: this.isKitchen ? -6 : 8,
        color: this.isKitchen ? 0xffc98a : 0xffdfa0,
        alpha: 0.1,
        reduced: this.reduced,
        depth: LAYERS.props + 2,
      }),
      addVignette(this, { alpha: 0.46 }),
      addDustMotes(this, {
        x: 40,
        y: plan.designHeight * 0.24,
        width: plan.designWidth - 80,
        height: plan.designHeight * 0.46,
        count: 24,
        seed: this.seed ^ hashSeed('battle.v2.arena'),
        color: this.isKitchen ? 0xd8a76a : 0xd8b76a,
        alpha: 0.5,
        reduced: this.reduced,
        depth: LAYERS.effects - 40,
      }),
    );
  }

  private createArena(): void {
    const graphics = this.add.graphics().setDepth(LAYERS.markers);
    for (const slot of SLOT_ORDER) {
      drawSlotRing(graphics, this.layout.slots[slot], {
        color: GOLD,
        alpha: 0.22,
        radiusX: 52,
        radiusY: 16,
      });
    }
    drawSlotRing(graphics, this.layout.monster, {
      color: DANGER,
      alpha: 0.2,
      radiusX: 112,
      radiusY: 32,
      lineWidth: 2,
    });
    this.highlightGraphics = this.add
      .graphics()
      .setDepth(LAYERS.markers + 4);

    for (const slot of SLOT_ORDER) {
      const point = this.layout.slots[slot];
      const label = makeSceneText(this, point.x, point.y + 18, SLOT_LABELS[slot], {
        size: 18,
        color: PAPER,
        depth: LAYERS.markers + 6,
        stroke: 4,
      });
      this.slotLabels.set(slot, label);

      const zone = this.add
        .zone(point.x, point.y - 46, 104, 124)
        .setOrigin(0.5)
        .setDepth(LAYERS.input)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.onSlotPointer(slot));
      zone.input!.enabled = false;
      this.slotZones.set(slot, zone);
    }
  }

  private createActors(): void {
    const playerArt = this.playerArt();
    this.playerActor = new BattleActor(
      this,
      playerArt,
      this.layout.slots[this.state.player.slot ?? this.setup.player.slot],
      { reduced: this.reduced, maxFeetY: this.layout.fieldBottom },
    );
    this.playerActor.setMirror(isRightSide(this.state.player.slot ?? 'left'));

    const enemyArt = this.enemyArt();
    this.enemyActor = new BattleActor(
      this,
      enemyArt,
      this.layout.monster,
      { reduced: this.reduced, maxFeetY: this.layout.fieldBottom },
    );
    const facing = this.state.enemy.facing ?? this.setup.enemy.facing;
    this.enemyActor.setFacing(facing);
    this.enemyActor.setPosition(this.layout.monster.x, this.layout.monster.y);
  }

  private createBarsAndRail(): void {
    this.hpGraphics = this.add.graphics().setDepth(LAYERS.effects + 10);
    this.gaugeGraphics = this.add.graphics().setDepth(LAYERS.effects + 12);

    const railTop = this.layout.railTop;
    this.railPlayerText = makeSceneText(this, 24, railTop + 6, '', {
      size: 18,
      color: PAPER,
      align: 'left',
      originX: 0,
      originY: 0,
      depth: LAYERS.effects,
      stroke: 4,
    });
    this.railEnemyText = makeSceneText(this, 372, railTop + 6, '', {
      size: 18,
      color: DANGER,
      align: 'left',
      originX: 0,
      originY: 0,
      depth: LAYERS.effects,
      stroke: 4,
    });
    this.railOrderText = makeSceneText(this, 24, railTop + 46, '', {
      size: 16,
      color: MUTED,
      align: 'left',
      originX: 0,
      originY: 0,
      depth: LAYERS.effects,
      stroke: 3,
    });
    this.railIntentText = makeSceneText(this, 24, railTop + 66, '', {
      size: 17,
      color: GOLD,
      align: 'left',
      originX: 0,
      originY: 0,
      depth: LAYERS.effects,
      stroke: 4,
    });

    this.enemyNameText = makeSceneText(this, this.layout.monster.x, this.layout.monsterHeadY - 58, '', {
      size: 20,
      color: DANGER,
      depth: LAYERS.effects + 20,
      stroke: 5,
      bold: true,
    });
    this.enemyHpText = makeSceneText(this, this.layout.monster.x, this.layout.monsterHeadY - 34, '', {
      size: 14,
      color: MUTED,
      depth: LAYERS.effects + 20,
      stroke: 3,
    });
  }

  private playerArt(): BattleActorArt {
    return {
      idleKey: BATTLE_PLAYER_ART.key,
      guardKey: BATTLE_PLAYER_ART.guardKey,
      attack: {
        key: BATTLE_PLAYER_ART.attackKey,
        frameCount: BATTLE_PLAYER_ART.frameCount,
        frameWidth: BATTLE_PLAYER_ART.frameWidth,
        frameHeight: BATTLE_PLAYER_ART.frameHeight,
        frameMs: BATTLE_PLAYER_ART.frameMs,
        hitFrame: BATTLE_PLAYER_ART.hitFrame,
        hitFreezeMs: 60,
      },
      displayScale: BATTLE_PLAYER_ART.displayScale,
      figureHeight: BATTLE_PLAYER_ART.figureHeight,
      shadowWidth: 78,
      placeholder: 'player',
    };
  }

  private enemyArt(): BattleActorArt {
    if (this.setup.enemy.art === 'cook') {
      const cook = KITCHEN_CAST.cook;
      const dirs = {} as Record<Facing8, string>;
      for (const facing of FACING_VALUES) {
        dirs[facing] = cook.still[castDir(cook, facing)];
      }
      const scaleForFacing = (facing: Facing8): number =>
        castScale(cook, castDir(cook, facing)) * BATTLE_COOK_ART.scaleFactor;
      return {
        idleKey: dirs[this.state.enemy.facing ?? 'left'],
        dirKeys: dirs,
        facing: this.state.enemy.facing ?? 'left',
        displayScale: scaleForFacing(this.state.enemy.facing ?? 'left'),
        figureHeight: 371,
        scaleForFacing,
        shadowWidth: 104,
        placeholder: 'enemy',
      };
    }

    const hasDirs = this.textures.exists(BATTLE_MINER_ART.dirs.down);
    if (!hasDirs && this.textures.exists(BATTLE_ASSET_KEYS.miner.fallback)) {
      return {
        idleKey: BATTLE_ASSET_KEYS.miner.fallback,
        displayScale: BATTLE_MINER_ART.fallbackScale,
        figureHeight: 160,
        shadowWidth: 150,
        placeholder: 'enemy',
      };
    }
    return {
      idleKey: BATTLE_MINER_ART.dirs.down,
      dirKeys: BATTLE_MINER_ART.dirs,
      facing: this.state.enemy.facing ?? 'left',
      displayScale: BATTLE_MINER_ART.displayScale,
      figureHeight: BATTLE_MINER_ART.figureHeight,
      shadowWidth: 168,
      placeholder: 'enemy',
    };
  }

  // ------------------------------------------------------------------ 回合循环

  private showBattleIntro(): void {
    if (this.introOpen || this.ended) return;
    this.introOpen = true;
    this.actionsDisabled.value = true;
    this.introModal = openBattleIntro(this.mvvm, {
      badge: this.setup.intro.badge,
      title: this.setup.intro.title,
      target: this.setup.intro.target,
      lines: this.setup.intro.lines,
      ruleText: this.setup.intro.ruleText,
      onClose: () => {
        this.introOpen = false;
        this.introModal = null;
        if (!this.ended) this.beginTurn();
      },
    });
  }

  private beginTurn(): void {
    if (this.ended || !this.lifecycle.isLive(this.runId)) return;
    this.setMoveMode(false);
    const turn = startNextTurn(this.state);
    if (turn.events.length === 0) {
      this.refreshTurnState();
      return;
    }
    this.state = turn.state;
    this.syncHud();
    if (this.state.activeId === this.state.enemy.id) {
      this.busy = true;
      this.actionsDisabled.value = true;
      this.showTurnBanner(`${this.state.enemy.name}的回合`, 'danger');
      this.time.delayedCall(this.reduced ? 140 : 420, () => this.runEnemyTurn());
      return;
    }
    this.busy = false;
    this.playerActor?.setPose('idle');
    this.actionsDisabled.value = false;
    this.showTurnBanner('你的回合');
    this.pulseIntentSlots();
  }

  private refreshTurnState(): void {
    if (this.state.activeId === this.state.player.id) {
      this.busy = false;
      this.actionsDisabled.value = false;
      this.showTurnBanner('你的回合');
      this.pulseIntentSlots();
      return;
    }
    if (this.state.activeId === this.state.enemy.id) {
      this.busy = true;
      this.actionsDisabled.value = true;
      this.time.delayedCall(this.reduced ? 140 : 420, () => this.runEnemyTurn());
      return;
    }
    this.beginTurn();
  }

  private runEnemyTurn(): void {
    if (this.ended || !this.lifecycle.isLive(this.runId)) return;
    if (this.state.activeId !== this.state.enemy.id) return;
    this.busy = true;
    this.actionsDisabled.value = true;
    const result = applyBattleAction(this.state, { kind: 'enemy-act' }, this.setup);
    if (result.events.length === 0) {
      this.afterAction();
      return;
    }
    this.state = result.state;
    this.playSteps(result.events, () => this.afterAction());
  }

  private playerAction(action: BattleAction): void {
    if (this.ended || this.transitioning || !this.lifecycle.isLive(this.runId)) return;
    if (this.menuModal?.open === true) return;
    if (this.busy || this.actionsDisabled.value) return;
    if (this.state.phase !== 'player' || this.state.activeId !== this.state.player.id) return;

    const result = applyBattleAction(this.state, action, this.setup);
    if (result.events.length === 0) return;

    this.busy = true;
    this.actionsDisabled.value = true;
    this.setMoveMode(false);
    this.state = result.state;
    this.playSteps(result.events, () => this.afterAction());
  }

  private afterAction(): void {
    if (!this.lifecycle.isLive(this.runId)) return;
    this.busy = false;
    this.setMoveMode(false);
    this.syncActorPositions();
    this.syncHud();

    if (this.state.phase === 'victory') {
      this.showVictoryOverlay();
      return;
    }
    if (this.state.phase === 'defeat') {
      this.showDefeatOverlay();
      return;
    }
    this.beginTurn();
  }

  // ------------------------------------------------------------------ 操作

  private onAttack(): void {
    audioDirector.playClick();
    if (!playerCanAttack(this.setup)) {
      this.flashHint('你还没有「解」——这一场只能移动或防御。');
      return;
    }
    const skillId = this.setup.player.skills[0];
    if (!skillId) return;
    this.playerAction({ kind: 'attack', skillId });
  }

  private onMove(): void {
    audioDirector.playClick();
    if (this.busy || this.ended || this.actionsDisabled.value) return;
    if (this.state.activeId !== this.state.player.id) return;
    this.setMoveMode(!this.moveMode);
  }

  private setMoveMode(enabled: boolean): void {
    if (this.moveMode === enabled) {
      this.updateSlotInteractivity();
      return;
    }
    this.moveMode = enabled;
    this.updateSlotInteractivity();
    this.syncHud();
  }

  private onSlotPointer(slot: SlotId): void {
    if (!this.moveMode || this.busy || this.ended) return;
    if (this.state.activeId !== this.state.player.id) return;
    if (slot === this.state.player.slot) return;
    this.setMoveMode(false);
    this.playerAction({ kind: 'move', slot });
  }

  private updateSlotInteractivity(): void {
    const playerTurn =
      !this.busy &&
      !this.ended &&
      this.state.activeId === this.state.player.id &&
      this.state.phase === 'player';
    for (const slot of SLOT_ORDER) {
      const zone = this.slotZones.get(slot);
      if (!zone?.input) continue;
      zone.input.enabled = this.moveMode && playerTurn && slot !== this.state.player.slot;
    }
  }

  // ------------------------------------------------------------------ 动画队列

  private playSteps(events: readonly BattleEvent[], done: () => void): void {
    const steps: Step[] = [];
    for (const event of events) {
      const step = this.stepForEvent(event);
      if (step) steps.push(step);
    }
    const run = (index: number): void => {
      if (!this.lifecycle.isLive(this.runId) || this.ended) return;
      if (index >= steps.length) {
        done();
        return;
      }
      steps[index]!(nextStep(run, index + 1));
    };
    run(0);
  }

  private stepForEvent(event: BattleEvent): Step | null {
    switch (event.kind) {
      case 'turn-start':
        return (next) => next();
      case 'move':
        return (next) => this.animateMove(event, next);
      case 'attack':
        return (next) => this.animateAttack(event, next);
      case 'guard':
        return (next) => this.animateGuard(next);
      case 'enemy-turn':
        return (next) => this.animateEnemyTurn(event, next);
      case 'enemy-skill':
        return (next) => this.animateEnemySkill(event, next);
      case 'protocol':
        return (next) => this.animateProtocol(next);
      case 'victory':
        return (next) => this.animateVictory(next);
      case 'defeat':
        return (next) => this.animateDefeat(next);
      case 'intent':
      case 'log':
        return (next) => next();
      default:
        return (next) => next();
    }
  }

  private animateMove(
    event: Extract<BattleEvent, { kind: 'move' }>,
    next: () => void,
  ): void {
    const actor = this.playerActor;
    const from = this.layout.slots[event.from];
    const to = this.layout.slots[event.to];
    if (!actor) {
      next();
      return;
    }
    actor.setPosition(from.x, from.y);
    this.playSfx(BATTLE_ASSET_KEYS.sfx.blink, 0.28, 1.1);

    if (this.reduced) {
      actor.setPosition(to.x, to.y);
      actor.setMirror(isRightSide(event.to));
      next();
      return;
    }

    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const outward = {
      x: mid.x - this.layout.monster.x,
      y: mid.y - this.layout.monster.y,
    };
    const length = Math.max(1, Math.hypot(outward.x, outward.y));
    const control = {
      x: mid.x + (outward.x / length) * 70,
      y: mid.y + (outward.y / length) * 70,
    };
    const clock = { t: 0 };
    let trailed = 0;
    this.tweens.add({
      targets: clock,
      t: 1,
      duration: 340,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const t = clock.t;
        const one = 1 - t;
        const x = one * one * from.x + 2 * one * t * control.x + t * t * to.x;
        const y = one * one * from.y + 2 * one * t * control.y + t * t * to.y;
        actor.setPosition(x, y);
        if (!this.reduced && trailed < 2 && t > (trailed + 1) * 0.3) {
          trailed += 1;
          afterimage(this, BATTLE_PLAYER_ART.key, x, y, {
            scale: BATTLE_PLAYER_ART.displayScale,
            flipX: actor.display.flipX,
            alpha: 0.32,
            ms: 220,
          });
        }
      },
      onComplete: () => {
        actor.setPosition(to.x, to.y);
        actor.setMirror(isRightSide(event.to));
        impactRing(this, to.x, to.y - 46, {
          color: PAPER,
          radius: 50,
          ms: 180,
          reduced: this.reduced,
          depth: LAYERS.effects - 10,
        });
        next();
      },
    });
  }

  private animateAttack(
    event: Extract<BattleEvent, { kind: 'attack' }>,
    next: () => void,
  ): void {
    const actor = this.playerActor;
    const enemy = this.enemyActor;
    if (!actor) {
      next();
      return;
    }
    this.playSfx(BATTLE_ASSET_KEYS.sfx.slash, 0.9);

    actor.playAttack(
      { reduced: this.reduced },
      () => {
        const target = enemy?.headPoint ?? {
          x: this.layout.monster.x,
          y: this.layout.monsterHeadY,
        };
        enemy?.flash(0xffffff, 70);
        // 帧动画的刃尖会在峰值冲出帧缘：从手部补一条光刃到目标，接住被裁掉的那一段。
        const slot = this.state.player.slot ?? 'left';
        const hand = this.layout.slots[slot];
        const facingRight = !isRightSide(slot);
        bladeTrail(
          this,
          { x: hand.x + (facingRight ? 74 : -74), y: hand.y - 104 },
          { x: target.x, y: target.y + 34 },
          { reduced: this.reduced, depth: LAYERS.effects + 12 },
        );
        hitBurst(this, target.x, target.y + 30, {
          color: event.backstab ? 0xffe3a8 : GOLD,
          backstab: event.backstab,
          reduced: this.reduced,
          seed: this.seed + event.amount,
          depth: LAYERS.effects + 8,
        });
        this.floatNumber(
          `-${event.amount}`,
          target.x,
          target.y - 8,
          event.backstab ? GOLD : DANGER,
          event.backstab ? '背袭 ×1.5' : event.zone === 'side' ? '侧面' : '正面',
        );
        this.playSfx(
          event.backstab ? BATTLE_ASSET_KEYS.sfx.backstab : BATTLE_ASSET_KEYS.sfx.hit,
          event.backstab ? 1 : 0.85,
        );
        screenRumble(this, {
          ms: event.backstab ? 200 : 110,
          intensity: event.backstab ? 0.01 : 0.005,
          reduced: this.reduced,
        });
        if (event.backstab && !this.reduced) this.cameras.main.flash(90, 216, 183, 106);
      },
      () => {
        if (!event.teleported) {
          next();
          return;
        }
        this.animateBlink(event.from, event.to, next);
      },
    );
  }

  private animateBlink(from: SlotId, to: SlotId, next: () => void): void {
    const actor = this.playerActor;
    const fromPoint = this.layout.slots[from];
    const toPoint = this.layout.slots[to];
    if (!actor) {
      next();
      return;
    }
    this.playSfx(BATTLE_ASSET_KEYS.sfx.blink, 0.85);
    actor.setPosition(fromPoint.x, fromPoint.y);
    if (this.reduced) {
      actor.setPosition(toPoint.x, toPoint.y);
      actor.setMirror(isRightSide(to));
      next();
      return;
    }
    actor.display.setAlpha(0.9);
    afterimage(this, BATTLE_PLAYER_ART.key, fromPoint.x, fromPoint.y, {
      scale: BATTLE_PLAYER_ART.displayScale,
      flipX: isRightSide(from),
      alpha: 0.55,
      ms: 260,
    });
    this.tweens.add({
      targets: actor.display,
      alpha: 0,
      duration: 100,
      ease: 'Quad.easeIn',
      onComplete: () => {
        actor.setPosition(toPoint.x, toPoint.y);
        actor.setMirror(isRightSide(to));
        actor.display.setAlpha(1);
        actor.flash(0xffffff, 70);
        impactRing(this, toPoint.x, toPoint.y - 60, {
          color: PAPER,
          radius: 72,
          ms: 220,
          reduced: this.reduced,
          depth: LAYERS.effects,
        });
        next();
      },
    });
  }

  private animateGuard(next: () => void): void {
    const actor = this.playerActor;
    actor?.setPose('guard');
    if (actor) {
      guardShield(this, actor.position.x, actor.headPoint.y + 54, {
        reduced: this.reduced,
        depth: LAYERS.effects + 8,
      });
    }
    this.playSfx(BATTLE_ASSET_KEYS.sfx.guard, 0.75);
    this.time.delayedCall(this.reduced ? 120 : 280, next);
  }

  private animateEnemyTurn(
    event: Extract<BattleEvent, { kind: 'enemy-turn' }>,
    next: () => void,
  ): void {
    const enemy = this.enemyActor;
    enemy?.setFacing(event.facing);
    this.playSfx(BATTLE_ASSET_KEYS.sfx.turn, 0.8);
    impactRing(this, this.layout.monster.x, this.layout.monster.y - 30, {
      color: PAPER,
      radius: 150,
      ms: 340,
      reduced: this.reduced,
      depth: LAYERS.effects,
    });
    this.floatLabel(
      `面朝${facingLabel(event.facing)}`,
      this.layout.monster.x,
      this.layout.monsterHeadY - 70,
      GOLD,
    );
    screenRumble(this, { ms: 140, intensity: 0.004, reduced: this.reduced });
    this.time.delayedCall(this.reduced ? 140 : 380, next);
  }

  private animateEnemySkill(
    event: Extract<BattleEvent, { kind: 'enemy-skill' }>,
    next: () => void,
  ): void {
    const enemy = this.enemyActor;
    const facing = this.state.enemy.facing ?? 'left';
    const angle = FACING_ANGLES[facing];
    const isQuake = event.skillId.endsWith('quake');
    const playerPoint = this.layout.slots[this.state.player.slot ?? 'left'];

    if (isQuake) {
      this.playSfx(BATTLE_ASSET_KEYS.sfx.quake, 0.95);
      impactRing(this, this.layout.monster.x, this.layout.monster.y - 28, {
        color: DANGER,
        radius: 240,
        ms: 460,
        reduced: this.reduced,
        depth: LAYERS.effects,
      });
      screenRumble(this, { ms: 300, intensity: 0.009, reduced: this.reduced });
    } else {
      this.playSfx(BATTLE_ASSET_KEYS.sfx.sweep, 0.85);
      const dx = Math.cos((angle * Math.PI) / 180) * 42;
      const dy = -Math.sin((angle * Math.PI) / 180) * 42;
      enemy?.nudge(dx, dy, 150);
      slashArc(this, { x: this.layout.monster.x, y: this.layout.monster.y - 90 }, angle, {
        radius: 130,
        color: DANGER,
        reduced: this.reduced,
        depth: LAYERS.effects + 6,
      });
    }

    this.time.delayedCall(this.reduced ? 90 : isQuake ? 260 : 180, () => {
      if (!this.lifecycle.isLive(this.runId)) return;
      if (event.hit) {
        this.playerActor?.flash(0xffffff, 90);
        this.floatNumber(
          `-${event.amount}`,
          playerPoint.x,
          playerPoint.y - 170,
          DANGER,
          this.state.player.guarding ? '防御减半' : event.skillName,
        );
        hitBurst(this, playerPoint.x, playerPoint.y - 96, {
          color: DANGER,
          reduced: this.reduced,
          seed: this.seed + this.state.seq,
          depth: LAYERS.effects + 8,
        });
        this.playSfx(
          this.state.player.guarding
            ? BATTLE_ASSET_KEYS.sfx.guard
            : BATTLE_ASSET_KEYS.sfx.hit,
          0.85,
        );
        screenRumble(this, { ms: 160, intensity: 0.006, reduced: this.reduced });
      } else {
        this.floatLabel('打空', playerPoint.x, playerPoint.y - 150, MUTED);
      }
    });

    this.time.delayedCall(this.reduced ? 180 : isQuake ? 780 : 580, next);
  }

  private animateProtocol(next: () => void): void {
    this.playSfx(BATTLE_ASSET_KEYS.sfx.protocol, 1);
    const scrim = protocolScrim(this, this.reduced);
    const pressure = protocolPressure(this, this.layout.monster.x, this.layout.monster.y, {
      reduced: this.reduced,
    });
    this.fx.push(scrim, pressure);
    const label = makeSceneText(
      this,
      getViewportPlan().designWidth / 2,
      getViewportPlan().designHeight * 0.36,
      '清除协议',
      {
        size: 52,
        color: DANGER,
        depth: LAYERS.cinematic + 10,
        stroke: 8,
        bold: true,
      },
    );
    this.fx.push(label);
    this.tweens.add({
      targets: label,
      alpha: { from: 0, to: 1 },
      scale: { from: 0.9, to: 1 },
      duration: 220,
      ease: 'Quad.easeOut',
    });
    if (!this.reduced) this.cameras.main.flash(220, 192, 57, 43);
    screenRumble(this, { ms: 320, intensity: 0.012, reduced: this.reduced });
    this.time.delayedCall(this.reduced ? 320 : 1000, next);
  }

  private animateVictory(next: () => void): void {
    this.playSfx(BATTLE_ASSET_KEYS.sfx.victory, 0.95);
    this.enemyActor?.die({ reduced: this.reduced, player: false });
    hitBurst(this, this.layout.monster.x, this.layout.monster.y - 120, {
      color: GOLD,
      backstab: true,
      reduced: this.reduced,
      seed: this.seed + 99,
      depth: LAYERS.effects + 8,
    });
    this.time.delayedCall(this.reduced ? 180 : 620, next);
  }

  private animateDefeat(next: () => void): void {
    this.playerActor?.die({ reduced: this.reduced, player: true });
    if (!this.reduced) this.cameras.main.flash(160, 192, 57, 43);
    this.time.delayedCall(this.reduced ? 160 : 480, next);
  }

  // ------------------------------------------------------------------ HUD / 绘制

  private syncHud(): void {
    const player = this.state.player;
    const enemy = this.state.enemy;
    const facing = enemy.facing ?? this.setup.enemy.facing;
    const playerTurn =
      !this.ended &&
      !this.busy &&
      this.state.phase === 'player' &&
      this.state.activeId === player.id;

    this.turnLabel.value = `SPD ${player.spd} / ${enemy.spd} · 第 ${this.state.seq + 1} 动`;
    this.playerLabel.value = `${player.name}  HP ${player.hp}/${player.maxHp} · SPD ${player.spd}${
      player.guarding ? ' · 防御中' : ''
    }`;
    this.hintText.value = this.computeHint();
    this.logText.value = this.state.log
      .slice(-2)
      .map((entry) => entry.text)
      .join('\n');
    this.attackLabel.value = this.computeAttackLabel();
    this.moveLabel.value = this.moveMode ? '取消移动' : '移动';

    this.actionsDisabled.value = !playerTurn;
    this.attackDisabled.value =
      !playerTurn || this.moveMode || !playerCanAttack(this.setup);
    this.guardDisabled.value = !playerTurn || this.moveMode;

    if (this.enemyNameText) {
      this.enemyNameText.setText(`${enemy.name} · 面朝${facingLabel(facing)}`);
    }
    if (this.enemyHpText) {
      this.enemyHpText.setText(`HP ${enemy.hp}/${enemy.maxHp}`);
    }
    if (this.railPlayerText) {
      this.railPlayerText.setText(`${player.name}  SPD ${player.spd}  HP ${player.hp}/${player.maxHp}`);
    }
    if (this.railEnemyText) {
      this.railEnemyText.setText(`${enemy.name}  SPD ${enemy.spd}  HP ${enemy.hp}/${enemy.maxHp}`);
    }
    if (this.railOrderText) {
      const order = previewOrder(this.state, 6)
        .map((id) => (id === player.id ? '你' : '它'))
        .join(' → ');
      this.railOrderText.setText(`接下来：${order}`);
    }
    if (this.railIntentText) {
      const script = this.setup.script;
      if (script) {
        const left = Math.max(0, script.protocolAfterEnemyActions - this.state.enemyActions);
        this.railIntentText
          .setText(`清除协议 · 剩余 ${left} 次行动　｜　意图：${formatIntent(this.state.intent)}`)
          .setColor(`#${DANGER.toString(16).padStart(6, '0')}`);
      } else {
        const tone = this.state.intent?.kind === 'skill' ? DANGER : GOLD;
        this.railIntentText
          .setText(`意图：${formatIntent(this.state.intent)}`)
          .setColor(`#${tone.toString(16).padStart(6, '0')}`);
      }
    }

    this.drawBars();
    this.drawGauges();
    this.drawHighlights();
    this.updateSlotInteractivity();
  }

  private computeHint(): string {
    if (this.state.phase === 'defeat') return '你倒下了。';
    if (this.state.phase === 'victory') return '它散成了齑粉。';
    if (this.moveMode) return '点一个站位落脚；再按「取消移动」回到指令。';
    if (!playerCanAttack(this.setup)) {
      return '你还没有「解」——只能移动或防御。先看清它下一招打哪边。';
    }
    if (this.state.activeId !== this.state.player.id) return '等待它行动……';
    const skillId = this.setup.player.skills[0];
    if (!skillId) return '选择行动。';
    const preview = previewPlayerAttack(this.state, this.setup, skillId);
    if (!preview) return '选择行动。';
    if (preview.backstab) {
      return '解离突刺 · 背袭 ×1.5，命中后留在原地。';
    }
    return `解离突刺 · 正面命中后闪现到${slotLabel(preview.to)}（它对面）。`;
  }

  private computeAttackLabel(): string {
    if (!playerCanAttack(this.setup)) return '攻击 · 无「解」';
    const skillId = this.setup.player.skills[0];
    if (!skillId) return '攻击';
    const preview = previewPlayerAttack(this.state, this.setup, skillId);
    if (!preview) return '攻击';
    return `攻击 · ${preview.amount}`;
  }

  private drawBars(): void {
    const graphics = this.hpGraphics;
    if (!graphics) return;
    graphics.clear();

    const enemyPoint = this.enemyActor?.headPoint ?? {
      x: this.layout.monster.x,
      y: this.layout.monsterHeadY,
    };
    this.drawBar(
      graphics,
      enemyPoint.x - 110,
      enemyPoint.y - 16,
      220,
      10,
      this.state.enemy.hp / this.state.enemy.maxHp,
      DANGER,
    );

    // 玩家血条不画在头顶：短设计高（1200×648 → 1100）时上排站位离跑条只有 10px，
    // 头顶血条会钻进跑条文字里。玩家 HP 在底部指令区和跑条里已经有两份，不再重复。
  }

  private drawBar(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    ratio: number,
    color: number,
  ): void {
    const safe = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
    graphics.fillStyle(INK, 0.74);
    graphics.fillRoundedRect(x, y, width, height, 3);
    graphics.lineStyle(1, 0x3a3428, 0.9);
    graphics.strokeRoundedRect(x, y, width, height, 3);
    if (safe > 0) {
      graphics.fillStyle(color, 0.92);
      graphics.fillRoundedRect(x + 1, y + 1, (width - 2) * safe, height - 2, 2);
    }
  }

  private drawGauges(): void {
    const graphics = this.gaugeGraphics;
    if (!graphics) return;
    graphics.clear();
    const top = this.layout.railTop + 30;
    this.drawGauge(graphics, 24, top, 300, 10, this.state.player.gauge / 1000, GOLD);
    this.drawGauge(graphics, 372, top, 300, 10, this.state.enemy.gauge / 1000, DANGER);
  }

  private drawGauge(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    ratio: number,
    color: number,
  ): void {
    const cells = 10;
    const gap = 3;
    const cellWidth = (width - gap * (cells - 1)) / cells;
    const safe = Math.min(1, Math.max(0, Number.isFinite(ratio) ? ratio : 0));
    for (let index = 0; index < cells; index += 1) {
      const cellX = x + index * (cellWidth + gap);
      const filled = safe > index / cells;
      graphics.fillStyle(INK, 0.72);
      graphics.fillRect(cellX, y, cellWidth, height);
      if (filled) {
        graphics.fillStyle(color, 0.9);
        graphics.fillRect(cellX, y, cellWidth, height);
      }
    }
    graphics.lineStyle(1, 0x3a3428, 0.8);
    graphics.strokeRect(x, y, width, height);
  }

  private drawHighlights(): void {
    const graphics = this.highlightGraphics;
    if (!graphics) return;
    graphics.clear();
    const playerSlot = this.state.player.slot ?? this.setup.player.slot;
    const facing = this.state.enemy.facing ?? this.setup.enemy.facing;
    const intent = this.state.intent;

    drawBackArc(
      graphics,
      { x: this.layout.monster.x, y: this.layout.monster.y },
      facing,
      205,
      { color: GOLD, alpha: this.state.phase === 'defeat' ? 0.04 : 0.09 },
    );
    drawFacingMark(
      graphics,
      { x: this.layout.monster.x, y: this.layout.monster.y },
      facing,
      108,
      GOLD,
    );

    const hitSet = new Set<SlotId>(
      intent?.kind === 'skill' ? intent.hitSlots : [],
    );
    for (const slot of SLOT_ORDER) {
      const point = this.layout.slots[slot];
      const isPlayer = slot === playerSlot;
      const danger = hitSet.has(slot);
      // 玩家站在「下一击会打到的格」时：红描边 + 金填充，不能只用金色盖掉危险。
      const stroke = danger ? DANGER : GOLD;
      const alpha = isPlayer ? 0.95 : danger ? 0.8 : this.moveMode ? 0.5 : 0.22;
      drawSlotRing(graphics, point, {
        color: stroke,
        fillColor: isPlayer ? GOLD : DANGER,
        alpha,
        fillAlpha: isPlayer ? 0.12 : danger ? 0.08 : 0,
        lineWidth: isPlayer || danger ? 3 : 2,
      });
      const label = this.slotLabels.get(slot);
      if (label) {
        label.setColor(
          `#${(danger ? DANGER : isPlayer ? GOLD : MUTED).toString(16).padStart(6, '0')}`,
        );
        label.setAlpha(isPlayer ? 1 : danger ? 0.95 : this.moveMode ? 0.8 : 0.55);
      }
    }

    if (intent?.kind === 'turn') {
      drawFacingMark(
        graphics,
        { x: this.layout.monster.x, y: this.layout.monster.y },
        intent.facing,
        148,
        DANGER,
      );
      if (intent.targetSlot) {
        drawSlotRing(graphics, this.layout.slots[intent.targetSlot], {
          color: DANGER,
          alpha: 0.9,
          lineWidth: 3,
        });
      }
    }

    // 攻击预览：闪现目标用白环提前告诉玩家会落到哪。
    if (this.state.activeId === this.state.player.id && playerCanAttack(this.setup)) {
      const skillId = this.setup.player.skills[0];
      const preview = skillId
        ? previewPlayerAttack(this.state, this.setup, skillId)
        : null;
      if (preview?.teleported) {
        drawSlotRing(graphics, this.layout.slots[preview.to], {
          color: PAPER,
          alpha: 0.75,
          lineWidth: 2,
          radiusX: 58,
          radiusY: 18,
        });
      }
    }
  }

  private pulseIntentSlots(): void {
    const graphics = this.highlightGraphics;
    if (!graphics || this.reduced) return;
    this.tweens.killTweensOf(graphics);
    graphics.setAlpha(1);
    this.tweens.add({
      targets: graphics,
      alpha: 0.55,
      duration: 260,
      yoyo: true,
      repeat: 1,
      onComplete: () => graphics.setAlpha(1),
    });
  }

  private syncActorPositions(): void {
    const player = this.playerActor;
    if (player) {
      const point = this.layout.slots[this.state.player.slot ?? this.setup.player.slot];
      player.setPosition(point.x, point.y);
      player.setMirror(isRightSide(this.state.player.slot ?? 'left'));
      player.setPose(this.state.player.guarding ? 'guard' : 'idle');
    }
    const enemy = this.enemyActor;
    if (enemy) {
      enemy.setPosition(this.layout.monster.x, this.layout.monster.y);
      const facing = this.state.enemy.facing ?? this.setup.enemy.facing;
      enemy.setFacing(facing);
    }
  }

  private flashHint(text: string): void {
    this.hintText.value = text;
    this.floatLabel('还没有「解」', getViewportPlan().designWidth / 2, getViewportPlan().designHeight * 0.42, DANGER);
  }

  // ------------------------------------------------------------------ 文本 / 音效

  private floatNumber(
    text: string,
    x: number,
    y: number,
    color: number,
    sub?: string,
  ): void {
    const label = makeSceneText(this, x, y, text, {
      size: 44,
      color,
      depth: LAYERS.effects + 60,
      stroke: 6,
      bold: true,
    });
    const extras: Phaser.GameObjects.Text[] = [label];
    if (sub) {
      extras.push(
        makeSceneText(this, x, y + 42, sub, {
          size: 18,
          color: PAPER,
          depth: LAYERS.effects + 60,
          stroke: 4,
        }),
      );
    }
    this.tweens.add({
      targets: extras,
      y: '-=46',
      alpha: 0,
      duration: this.reduced ? 260 : 820,
      ease: 'Sine.easeOut',
      onComplete: () => {
        for (const object of extras) object.destroy();
      },
    });
  }

  private floatLabel(text: string, x: number, y: number, color: number): void {
    const label = makeSceneText(this, x, y, text, {
      size: 24,
      color,
      depth: LAYERS.effects + 55,
      stroke: 5,
      bold: true,
    });
    this.tweens.add({
      targets: label,
      y: '-=30',
      alpha: 0,
      duration: this.reduced ? 200 : 620,
      ease: 'Sine.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private showTurnBanner(text: string, tone: 'gold' | 'danger' = 'gold'): void {
    const plan = getViewportPlan();
    const label = makeSceneText(this, plan.designWidth / 2, plan.designHeight * 0.3, text, {
      size: 32,
      color: tone === 'danger' ? DANGER : GOLD,
      depth: LAYERS.effects + 70,
      stroke: 6,
      bold: true,
    });
    label.setAlpha(0);
    this.tweens.add({
      targets: label,
      alpha: 1,
      duration: 140,
      yoyo: true,
      hold: 480,
      onComplete: () => label.destroy(),
    });
  }

  private playSfx(key: string, volume = 1, rate?: number): void {
    if (!this.cache.audio.exists(key)) return;
    audioDirector.playSfxAt(key, {
      volume,
      ...(rate === undefined ? {} : { rate }),
    });
  }

  // ------------------------------------------------------------------ 模态 / 流程

  private showVictoryOverlay(): void {
    if (this.victoryModal) return;
    this.ended = true;
    this.actionsDisabled.value = true;
    this.victoryModal = openBattleVictory(this.mvvm, {
      title: this.setup.title,
      lines: this.setup.victory.lines,
      preview: this.preview,
      returnLabel: this.isKitchen ? '回御膳房' : '继续',
      onReturn: () => {
        audioDirector.playClick();
        this.transitioning = true;
        this.cameras.main.fadeOut(this.reduced ? 160 : 320, 8, 10, 16);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          if (this.isKitchen) {
            void enterModule(this, 'ch01Kitchen', {
              retry: this.launchResumeAt,
              cleared: this.launchClearedEnemyId ?? undefined,
              preview: this.preview,
            });
            return;
          }
          void enterModule(this, 'ch01Dorm', { resume: 'afterBattle' });
        });
      },
      onRestart: () => {
        audioDirector.playClick();
        this.scene.restart(this.rawData as object | undefined);
      },
      onTitle: () => {
        audioDirector.playClick();
        void enterModule(this, 'title');
      },
      onClose: () => {
        this.victoryModal = null;
      },
    });
  }

  private showDefeatOverlay(): void {
    if (this.defeatModal?.open === true) return;
    this.ended = true;
    this.busy = false;
    this.actionsDisabled.value = true;
    this.syncHud();
    if (this.launchReturnTo === 'dorm') {
      saveProgress('dorm.after', { preview: this.preview });
    }

    this.defeatModal = openBattleDefeat(this.mvvm, {
      preview: this.preview,
      title: this.isKitchen ? '遭遇 · 战败' : '剧情战 · 战败',
      lines: this.setup.defeat.lines,
      hint: this.isKitchen
        ? '回到最近的落脚处，再来一次。'
        : '这不是游戏结束。你只是被踢出了梦域。',
      wakeLabel: this.isKitchen ? '重来' : '醒来',
      onRestart: () => {
        audioDirector.playClick();
        this.scene.restart(this.rawData as object | undefined);
      },
      onTitle: () => {
        audioDirector.playClick();
        void enterModule(this, 'title');
      },
      onWake: () => {
        audioDirector.playClick();
        this.transitioning = true;
        this.cameras.main.fadeOut(
          this.reduced ? 160 : 360,
          this.isKitchen ? 8 : 255,
          this.isKitchen ? 10 : 255,
          this.isKitchen ? 16 : 255,
        );
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          if (this.isKitchen) {
            void enterModule(this, 'ch01Kitchen', {
              retry: this.launchResumeAt,
              preview: this.preview,
            });
            return;
          }
          void enterModule(this, 'ch01Dorm', { resume: 'afterBattle' });
        });
      },
      onClose: () => {
        this.defeatModal = null;
      },
    });
  }

  private openMenu(): void {
    if (this.menuModal?.open === true) return;
    this.menuModal = openGameMenu(this.mvvm, {
      availability: evaluateSaveAvailability({
        preview: this.preview,
        module: this.isKitchen ? 'battleKitchen' : 'battleCh01',
        phase: this.state.phase,
        ended: this.ended,
      }),
      sceneLabel: this.isKitchen ? '御膳房 · 遭遇战' : '梦域 · 遭遇战',
      onSave: (slot) => ({ ok: false, slot, reason: 'io' }),
      onLoad: (save) => {
        void restoreSaveFromScene(this, save);
      },
      onRequestTitle: () => this.openExitConfirm(),
      onClose: () => {
        this.menuModal = null;
      },
    });
  }

  private openExitConfirm(): void {
    if (this.exitModal?.open === true) return;
    this.exitModal = openBattleExit(this.mvvm, {
      onTitle: () => {
        audioDirector.playClick();
        void enterModule(this, 'title');
      },
      onClose: () => {
        this.exitModal = null;
      },
    });
  }

  protected override onBack(): boolean {
    if (this.defeatModal?.open === true) return true;
    this.openExitConfirm();
    return true;
  }

  /**
   * DEV 验收后门：`__avmBattle()` 返回当前战斗 state 的只读快照。
   *
   * 用于 Playwright 里断言「点了一下之后 seq/enemyActions/HP 各加了多少」，
   * 不靠截图猜。正常构建不会挂。
   */
  private installDebugHook(): void {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __avmBattle?: () => unknown }).__avmBattle = () => this.debugSnapshot();
  }

  private debugSnapshot(): unknown {
    const state = this.state;
    return {
      encounterId: state.encounterId,
      phase: state.phase,
      activeId: state.activeId,
      seq: state.seq,
      enemyActions: state.enemyActions,
      playerHp: state.player.hp,
      enemyHp: state.enemy.hp,
      slot: state.player.slot,
      facing: state.enemy.facing,
      intent: state.intent,
      gauges: { player: state.player.gauge, enemy: state.enemy.gauge },
      log: state.log.slice(-4).map((entry) => entry.text),
      busy: this.busy,
      actionsDisabled: this.actionsDisabled.value,
      attackDisabled: this.attackDisabled.value,
    };
  }

  private cleanup(): void {
    this.lifecycle.close();
    if (import.meta.env.DEV) {
      delete (window as unknown as { __avmBattle?: () => unknown }).__avmBattle;
    }
    this.menuModal?.close('scene');
    this.menuModal = null;
    this.introModal?.close('scene');
    this.introModal = null;
    this.defeatModal = null;
    this.victoryModal = null;
    this.exitModal = null;
    this.playerActor?.destroy();
    this.playerActor = null;
    this.enemyActor?.destroy();
    this.enemyActor = null;
    for (const object of this.fx) object.destroy();
    this.fx.length = 0;
    this.hpGraphics = null;
    this.gaugeGraphics = null;
    this.highlightGraphics = null;
    this.enemyNameText = null;
    this.enemyHpText = null;
    this.railPlayerText = null;
    this.railEnemyText = null;
    this.railOrderText = null;
    this.railIntentText = null;
    this.slotLabels.clear();
    this.slotZones.clear();
  }
}

function nextStep(run: (index: number) => void, index: number): () => void {
  return () => run(index);
}
