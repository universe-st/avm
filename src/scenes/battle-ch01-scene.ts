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
  BATTLE_COOK_ATTACKS,
  BATTLE_HEAD_FOR_ART,
  BATTLE_HEAD_KEYS,
  BATTLE_MINER_ART,
  BATTLE_MINER_ATTACKS,
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
  BattleUnit,
  Facing8,
  SlotId,
} from '../battle/types';
import {
  applyBattleAction,
  createBattle,
  isSlotOccupied,
  playerCanAttack,
  previewPlayerAttack,
  startNextTurn,
} from '../battle/core/battle';
import { previewOrder } from '../battle/core/gauge';
import {
  railMotionAlpha,
  railTransition,
  type RailSlotMotion,
  type RailTransition,
} from '../battle/core/rail-transition';
import {
  FACING_ANGLES,
  SLOT_ORDER,
  adjacentSlots,
  isAdjacentSlot,
} from '../battle/core/slots';
import { buildPreviewState, type BattlePreviewPhase } from '../battle/core/preview';
import { planBattleLayout, type BattleLayout } from '../battle/layout';
import { resolveBattleSetup } from '../battle/data/ch01-kitchen';
import { getSkill, resolveSkill } from '../battle/data/skills';
import { loadKnownEnemies, markEnemyKnown } from '../battle/codex';
import { BattleActor, type BattleActorArt, type BattleStrikeStrip } from '../actors/battle-actor';
import { buildBattleHud } from '../ui/battle-hud';
import {
  openBattleCodex,
  openBattleDefeat,
  openBattleExit,
  openBattleIntro,
  openBattleSkill,
  openBattleVictory,
} from '../ui/battle-ch01-modals';
import {
  afterimage,
  bladeTrail,
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

function isRightFacing(facing: Facing8): boolean {
  return facing === 'right' || facing === 'upRight' || facing === 'downRight';
}

interface Step {
  (next: () => void): void;
}

/**
 * 行动表 chip 的尺寸/节奏（设计坐标）。
 *
 * 直径 44、中心距 52；去掉 SPD 量条后中心 y 从 +67 上移到 +30。
 * 双御厨同头像时在右下角加 1/2 数字徽标。
 */
const RAIL_CHIP = {
  diameter: 44,
  pitch: 52,
  /** 第一个 chip 的中心 x（「行动表」三个字右侧 8px）。 */
  firstX: 96,
  /** rail 64：44px chip 上下各留 10px，中心 y=32。 */
  yOffset: 32,
  moveMs: 190,
  pool: 12,
} as const;

interface OrderChipView {
  readonly container: Phaser.GameObjects.Container;
  readonly ring: Phaser.GameObjects.Graphics;
  readonly head: Phaser.GameObjects.Image;
  readonly fallback: Phaser.GameObjects.Text;
  readonly badge: Phaser.GameObjects.Text;
  readonly currentRing: Phaser.GameObjects.Graphics;
}

/**
 * 战斗场景（v3 · 七点位 / 无转向行动 / 多怪）。
 *
 * 职责边界：
 * - 判定全在 `src/battle/core/`（纯逻辑）；场景**只消费事件**播动画；
 * - 原生层画战场/角色/行动表/意图/伤害数字；Compose 只做顶栏与底部指令区；
 * - 预览模式（`StageLaunchContext.preview`）不写存档；phase=opening|mid|victory|defeat。
 */
export class BattleCh01Scene extends UIScene {
  private rawData: unknown = undefined;
  private context: StageLaunchContext | null = null;
  private preview = false;
  private seed = 1;
  private phaseParam: BattlePreviewPhase = 'opening';
  private previewFacing: Facing8 | null = null;
  private setup: BattleSetup = resolveBattleSetup(undefined);
  private state!: BattleState;
  private layout!: BattleLayout;
  private launchReturnTo: 'dorm' | 'kitchen' = 'dorm';
  private launchClearedEnemyId: string | null = null;
  private launchResumeAt: 'explore' | 'gate' = 'explore';

  private readonly lifecycle = new SceneLifecycle();
  private runId = 0;

  private playerActor: BattleActor | null = null;
  private readonly enemyActors = new Map<string, BattleActor>();
  private readonly enemyIndex = new Map<string, number>();
  private readonly enemyTargetZones = new Map<string, Phaser.GameObjects.Zone>();
  private highlightGraphics: Phaser.GameObjects.Graphics | null = null;

  private protocolText: Phaser.GameObjects.Text | null = null;
  private selectedTargetId: string | null = null;
  private knownEnemies: Set<string> = new Set();

  private readonly orderChips: OrderChipView[] = [];
  /** 上一帧真正画出来的顺序；用于 `railTransition(prev, next)`（同组不重播）。 */
  private displayedOrder: readonly string[] = [];
  /** 首次绘制直接落终态，不播「从右侧进场」的出场动画。 */
  private orderSettled = false;
  private railTween: Phaser.Tweens.Tween | null = null;
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
  private skillModal: ModalHandle | null = null;
  private codexModal: ModalHandle | null = null;

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
    return this.setup.arena === 'kitchen';
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

    this.previewFacing = null;
    if (context) {
      const rawFacing = stageParam(context, 'facing');
      if (rawFacing !== undefined) {
        if (FACING_VALUES.includes(rawFacing as Facing8)) {
          this.previewFacing = rawFacing as Facing8;
        } else {
          console.warn(`[battle-ch01] 未知 facing=${rawFacing}，忽略`);
        }
      }
    }

    this.launchReturnTo = launch?.returnTo ?? (this.isKitchen ? 'kitchen' : 'dorm');
    this.launchClearedEnemyId = launch?.clearedEnemyId ?? null;
    this.launchResumeAt = launch?.resumeAt ?? 'explore';

    if (this.preview && this.phaseParam !== 'opening') {
      this.state = buildPreviewState(this.setup, this.phaseParam, this.seed);
      if (this.phaseParam === 'victory' && this.state.phase !== 'victory') {
        console.warn('[battle-ch01] 该战斗不可能胜利，phase=victory 回退 mid');
        this.phaseParam = 'mid';
      }
    } else {
      this.state = createBattle(this.setup, this.seed);
    }

    if (this.previewFacing) {
      const facing = this.previewFacing;
      this.state = {
        ...this.state,
        enemies: this.state.enemies.map((enemy, index) =>
          index === 0 ? { ...enemy, facing } : enemy,
        ),
      };
    }
  }

  override create(): void {
    this.resetRun();

    applyCamera(this);
    this.cameras.main.setBackgroundColor('#05060a');
    this.layout = planBattleLayout(
      getViewportPlan().designWidth,
      getViewportPlan().designHeight,
    );
    this.knownEnemies = loadKnownEnemies();

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
    this.ensureTarget();
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
      for (const [id, actor] of this.enemyActors) {
        const enemy = this.unitById(id);
        if (!enemy || enemy.hp <= 0) actor.die({ reduced: this.reduced, player: false });
      }
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
      railHeight: this.layout.railHeight,
      onAttack: () => this.onAttack(),
      onMove: () => this.onMove(),
      onGuard: () => this.playerAction({ kind: 'guard' }),
      onCodex: () => this.openCodex(),
      onMenu: () => {
        audioDirector.playClick();
        this.openMenu();
      },
      location: this.isKitchen ? '梦域 / 御膳房' : '梦域 / 金殿',
      subtitle: this.isKitchen ? '遭遇战 · 七点位' : '剧情战 · 七点位',
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
    this.selectedTargetId = null;
    this.introModal = null;
    this.defeatModal = null;
    this.victoryModal = null;
    this.exitModal = null;
    this.menuModal = null;
    this.skillModal = null;
    this.codexModal = null;
    this.playerActor = null;
    this.enemyActors.clear();
    this.enemyIndex.clear();
    this.enemyTargetZones.clear();
    this.highlightGraphics = null;
    this.protocolText = null;
    this.orderChips.length = 0;
    this.displayedOrder = [];
    this.orderSettled = false;
    this.railTween = null;
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
    // 头像 chip 是 HD 插画，128→44 属于非整数缩放，必须 LINEAR。
    setLinearTextures(this, [
      BATTLE_HEAD_KEYS.zhou,
      BATTLE_HEAD_KEYS.miner,
      BATTLE_HEAD_KEYS.cook,
      BATTLE_HEAD_KEYS.xiaobai,
    ]);
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
        seed: this.seed ^ hashSeed('battle.v3.arena'),
        color: this.isKitchen ? 0xd8a76a : 0xd8b76a,
        alpha: 0.5,
        reduced: this.reduced,
        depth: LAYERS.effects - 40,
      }),
    );
  }

  private createArena(): void {
    this.highlightGraphics = this.add.graphics().setDepth(LAYERS.markers + 4);

    // 点位本身不常显：只保留不可见的点击区；地面圈只在 moveMode/落点选择时画。
    for (const slot of SLOT_ORDER) {
      const point = this.layout.slots[slot];
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
    const player = this.playerUnit();
    this.playerActor = new BattleActor(
      this,
      this.playerArt(),
      this.layout.slots[player.slot],
      { reduced: this.reduced, maxFeetY: this.layout.fieldBottom },
    );
    this.playerActor.setMirror(this.playerFlipForSlot(player.slot));

    this.state.enemies.forEach((enemy, index) => {
      this.enemyIndex.set(enemy.id, index + 1);
      const point = this.layout.slots[enemy.slot];
      const actor = new BattleActor(this, this.enemyArt(enemy), point, {
        reduced: this.reduced,
        maxFeetY: this.layout.fieldBottom,
      });
      actor.setFacing(enemy.facing ?? 'left');
      actor.setPosition(point.x, point.y);
      this.enemyActors.set(enemy.id, actor);
    });
  }

  private createBarsAndRail(): void {
    const railTop = this.layout.railTop;

    makeSceneText(this, 24, railTop + 10, '行动表', {
      size: 16,
      color: GOLD,
      align: 'left',
      originX: 0,
      originY: 0,
      depth: LAYERS.effects,
      stroke: 4,
      bold: true,
    });
    // 清除协议倒计时是唯一保留的战场文字提示（非意图）。
    this.protocolText = makeSceneText(this, 696, railTop + 10, '', {
      size: 14,
      color: DANGER,
      align: 'right',
      originX: 1,
      originY: 0,
      depth: LAYERS.effects,
      stroke: 4,
      bold: true,
    });
    this.createOrderChips();

    // 敌人点击区保持不可见；场上不画名字/HP/意图/目标圈。
    for (const enemy of this.state.enemies) {
      const point = this.layout.slots[enemy.slot];
      const zone = this.add
        .zone(point.x, point.y - 80, 150, 190)
        .setOrigin(0.5)
        .setDepth(LAYERS.input + 2)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.onEnemyPointer(enemy.id));
      this.enemyTargetZones.set(enemy.id, zone);
    }
  }

  // ------------------------------------------------------------------ 行动表 chip

  private createOrderChips(): void {
    for (let index = 0; index < RAIL_CHIP.pool; index += 1) {
      const ring = this.add.graphics();
      const head = this.add
        .image(0, 0, '__DEFAULT')
        .setDisplaySize(RAIL_CHIP.diameter, RAIL_CHIP.diameter)
        .setVisible(false);
      const fallback = makeSceneText(this, 0, 0, '', {
        size: 15,
        color: PAPER,
        depth: LAYERS.effects + 14,
        stroke: 3,
        bold: true,
      }).setVisible(false);
      const badge = makeSceneText(this, 14, 14, '', {
        size: 11,
        color: PAPER,
        depth: LAYERS.effects + 15,
        stroke: 3,
        bold: true,
      })
        .setOrigin(0.5)
        .setVisible(false);
      const currentRing = this.add.graphics();
      const container = this.add
        .container(0, 0, [ring, head, fallback, badge, currentRing])
        .setDepth(LAYERS.effects + 14)
        .setVisible(false);
      this.orderChips.push({ container, ring, head, fallback, badge, currentRing });
    }
  }

  private orderChipX(slot: number): number {
    return RAIL_CHIP.firstX + slot * RAIL_CHIP.pitch;
  }

  private orderChipY(): number {
    return this.layout.railTop + RAIL_CHIP.yOffset;
  }

  private headKeyFor(id: string): string | null {
    const unit = this.unitById(id);
    if (!unit) return null;
    if (unit.team === 'party') return BATTLE_HEAD_KEYS.zhou;
    return BATTLE_HEAD_FOR_ART[unit.art ?? 'miner'] ?? null;
  }

  private unitInitial(id: string): string {
    const unit = this.unitById(id);
    if (!unit) return '?';
    if (unit.team === 'party') return '周';
    return unit.art === 'cook' ? '厨' : '矿';
  }

  private paintOrderChip(view: OrderChipView, id: string, current: boolean): void {
    const unit = this.unitById(id);
    const isPlayer = unit?.team === 'party';
    const color = isPlayer ? GOLD : DANGER;
    const radius = RAIL_CHIP.diameter / 2;

    view.ring.clear();
    view.ring.fillStyle(INK, 0.94);
    view.ring.fillCircle(0, 0, radius);
    view.ring.lineStyle(2, color, current ? 0.95 : 0.66);
    view.ring.strokeCircle(0, 0, radius);

    const headKey = this.headKeyFor(id);
    if (headKey !== null && this.textures.exists(headKey)) {
      view.head
        .setTexture(headKey)
        .setDisplaySize(RAIL_CHIP.diameter, RAIL_CHIP.diameter)
        .setVisible(true);
      view.fallback.setVisible(false);
    } else {
      view.head.setVisible(false);
      view.fallback.setText(this.unitInitial(id)).setVisible(true);
    }

    const index = this.enemyIndex.get(id);
    if (!isPlayer && this.state.enemies.length > 1 && index !== undefined) {
      view.badge.setText(String(index)).setVisible(true);
    } else {
      view.badge.setVisible(false);
    }

    view.currentRing.clear();
    if (current) {
      view.currentRing.lineStyle(2, PAPER, 0.95);
      view.currentRing.strokeCircle(0, 0, radius + 2);
    }
  }

  /** 直接落终态：首帧、reduced-motion、动画结束都走这里。 */
  private settleOrder(order: readonly string[]): void {
    this.cancelRailTween();
    for (let index = 0; index < this.orderChips.length; index += 1) {
      const view = this.orderChips[index]!;
      const id = order[index];
      if (id === undefined) {
        view.container.setVisible(false);
        continue;
      }
      this.paintOrderChip(view, id, index === 0);
      view.container
        .setPosition(this.orderChipX(index), this.orderChipY())
        .setAlpha(1)
        .setVisible(true);
    }
  }

  private playOrderTransition(transition: RailTransition, next: readonly string[]): void {
    this.cancelRailTween();
    if (this.reduced) {
      this.settleOrder(next);
      return;
    }

    const moving: { view: OrderChipView; motion: RailSlotMotion }[] = [];
    for (let index = 0; index < this.orderChips.length; index += 1) {
      const view = this.orderChips[index]!;
      const motion = transition.motions[index];
      if (!motion) {
        view.container.setVisible(false);
        continue;
      }
      this.paintOrderChip(view, motion.id, false);
      view.container
        .setPosition(this.orderChipX(motion.from), this.orderChipY())
        .setAlpha(motion.fromAlpha)
        .setVisible(true);
      moving.push({ view, motion });
    }

    const clock = { t: 0 };
    this.railTween = this.tweens.add({
      targets: clock,
      t: 1,
      duration: RAIL_CHIP.moveMs,
      ease: 'Linear',
      onUpdate: () => {
        const progress = clock.t;
        const eased = 1 - Math.pow(1 - progress, 3);
        for (const { view, motion } of moving) {
          view.container.x = Phaser.Math.Linear(
            this.orderChipX(motion.from),
            this.orderChipX(motion.to),
            eased,
          );
          view.container.alpha = railMotionAlpha(motion, progress);
        }
      },
      onComplete: () => {
        this.railTween = null;
        if (!this.lifecycle.isLive(this.runId)) return;
        this.settleOrder(next);
      },
    });
  }

  private cancelRailTween(): void {
    if (!this.railTween) return;
    this.railTween.remove();
    this.railTween = null;
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

  private enemyArt(enemy: BattleUnit): BattleActorArt {
    const facing = enemy.facing ?? 'left';
    if (enemy.art === 'cook') {
      const cook = KITCHEN_CAST.cook;
      const dirs = {} as Record<Facing8, string>;
      for (const value of FACING_VALUES) dirs[value] = cook.still[castDir(cook, value)];
      const scaleForFacing = (value: Facing8): number =>
        castScale(cook, castDir(cook, value)) * BATTLE_COOK_ART.scaleFactor;
      return {
        idleKey: dirs[facing],
        dirKeys: dirs,
        facing,
        attacks: BATTLE_COOK_ATTACKS,
        displayScale: scaleForFacing(facing),
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
      facing,
      attacks: BATTLE_MINER_ATTACKS,
      displayScale: BATTLE_MINER_ART.displayScale,
      figureHeight: BATTLE_MINER_ART.figureHeight,
      shadowWidth: 168,
      placeholder: 'enemy',
    };
  }

  // ------------------------------------------------------------------ 单位查询

  private unitById(id: string | null): BattleUnit | null {
    if (!id) return null;
    return (
      this.state.party.find((unit) => unit.id === id) ??
      this.state.enemies.find((unit) => unit.id === id) ??
      null
    );
  }

  private playerUnit(): BattleUnit {
    const active = this.unitById(this.state.activeId);
    if (active?.team === 'party') return active;
    return this.state.party.find((unit) => unit.hp > 0) ?? this.state.party[0]!;
  }

  private playerSetup(): BattleSetup['party'][number] | undefined {
    return this.setup.party.find((unit) => unit.id === this.playerUnit().id);
  }

  private livingEnemies(): readonly BattleUnit[] {
    return this.state.enemies.filter((enemy) => enemy.hp > 0);
  }

  private selectedEnemyUnit(): BattleUnit | null {
    if (!this.selectedTargetId) return null;
    return (
      this.state.enemies.find(
        (enemy) => enemy.id === this.selectedTargetId && enemy.hp > 0,
      ) ?? null
    );
  }

  private attackTarget(): BattleUnit | null {
    const target = this.selectedEnemyUnit();
    if (!target) return null;
    return isAdjacentSlot(this.playerUnit().slot, target.slot) ? target : null;
  }

  private ensureTarget(): void {
    if (this.state.phase === 'defeat' || this.state.phase === 'victory') return;
    const player = this.playerUnit();
    const living = this.livingEnemies();
    if (living.length === 0) {
      this.selectedTargetId = null;
      return;
    }

    const current = this.selectedEnemyUnit();
    if (current && isAdjacentSlot(player.slot, current.slot)) return;

    const adjacent = living
      .filter((enemy) => isAdjacentSlot(player.slot, enemy.slot))
      .sort((a, b) => a.hp - b.hp || (a.id < b.id ? -1 : 1));
    if (adjacent[0]) {
      this.selectedTargetId = adjacent[0].id;
      return;
    }

    const nearest = [...living].sort((a, b) => {
      const da = this.slotDistance(player.slot, a.slot);
      const db = this.slotDistance(player.slot, b.slot);
      return da - db || a.hp - b.hp || (a.id < b.id ? -1 : 1);
    })[0];
    this.selectedTargetId = nearest?.id ?? null;
  }

  private slotDistance(from: SlotId, to: SlotId): number {
    const seen = new Set<SlotId>([from]);
    let frontier: SlotId[] = [from];
    let distance = 0;
    while (frontier.length > 0) {
      if (frontier.includes(to)) return distance;
      const next: SlotId[] = [];
      for (const slot of frontier) {
        for (const adjacent of adjacentSlots(slot)) {
          if (seen.has(adjacent)) continue;
          seen.add(adjacent);
          next.push(adjacent);
        }
      }
      frontier = next;
      distance += 1;
    }
    return Number.POSITIVE_INFINITY;
  }

  private enemyActorFor(id: string): BattleActor | undefined {
    return this.enemyActors.get(id);
  }

  private enemyPoint(enemy: BattleUnit): { readonly x: number; readonly y: number } {
    return this.layout.slots[enemy.slot];
  }

  private playerFlipForSlot(slot: SlotId): boolean {
    if (slot !== 'center') return isRightSide(slot);
    const target = this.selectedEnemyUnit() ?? this.livingEnemies()[0];
    if (!target) return false;
    return this.layout.slots[target.slot].x < this.layout.slots.center.x;
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
    if (this.state.pendingMove) {
      this.busy = false;
      this.syncHud();
      return;
    }
    this.setMoveMode(false);
    const turn = startNextTurn(this.state, this.setup);
    if (turn.events.length === 0) {
      this.refreshTurnState();
      return;
    }
    this.state = turn.state;
    const active = this.unitById(this.state.activeId);
    if (active?.team === 'party') this.ensureTarget();
    this.syncHud();

    if (this.state.phase === 'victory') {
      this.showVictoryOverlay();
      return;
    }
    if (this.state.phase === 'defeat') {
      this.showDefeatOverlay();
      return;
    }
    if (active?.team === 'enemy') {
      this.busy = true;
      this.actionsDisabled.value = true;
      this.showTurnBanner(`${active.name}的回合`, 'danger');
      this.time.delayedCall(this.reduced ? 140 : 420, () => this.runEnemyTurn());
      return;
    }
    this.busy = false;
    this.playerActor?.setPose('idle');
    this.actionsDisabled.value = false;
    this.showTurnBanner('你的回合');
  }

  private refreshTurnState(): void {
    const active = this.unitById(this.state.activeId);
    if (active?.team === 'party') {
      this.ensureTarget();
      this.syncHud();
      this.busy = false;
      this.actionsDisabled.value = false;
      this.showTurnBanner('你的回合');
      return;
    }
    if (active?.team === 'enemy') {
      this.busy = true;
      this.actionsDisabled.value = true;
      this.time.delayedCall(this.reduced ? 140 : 420, () => this.runEnemyTurn());
      return;
    }
    this.beginTurn();
  }

  private runEnemyTurn(): void {
    if (this.ended || !this.lifecycle.isLive(this.runId)) return;
    const active = this.unitById(this.state.activeId);
    if (active?.team !== 'enemy') return;
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
    if (this.skillModal?.open === true || this.codexModal?.open === true) return;
    if (this.busy || this.actionsDisabled.value) return;
    if (this.state.phase !== 'player' || this.state.activeId !== this.playerUnit().id) return;

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

    const pending = this.state.pendingMove;
    if (pending) {
      // 攻击已命中，等玩家选落点：activeId 仍是玩家，攻击/防御禁用、移动键改「留在原地」。
      this.selectedTargetId = pending.targetId;
      this.syncHud();
      return;
    }

    this.ensureTarget();
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
    if (this.state.pendingMove) return;
    if (this.skillModal?.open === true || this.codexModal?.open === true) return;
    if (!playerCanAttack(this.setup, this.playerUnit().id)) {
      this.flashHint('你还没有「解」——这一场只能移动或防御。', '还没有「解」');
      return;
    }
    const target = this.attackTarget();
    if (!target) {
      this.flashHint(
        this.selectedTargetId ? '目标不在相邻点位。' : '先点敌人选择目标。',
        this.selectedTargetId ? '够不着' : '选目标',
      );
      return;
    }

    const skillIds = this.playerSetup()?.skills ?? [];
    if (skillIds.length === 0) return;
    const skills = skillIds.map((id) => {
      const skill = getSkill(id);
      return {
        id,
        name: skill?.name ?? id,
        desc: skill?.desc ?? '',
      };
    });
    this.skillModal = openBattleSkill(this.mvvm, {
      targetName: target.name,
      skills,
      onSelect: (skillId) => {
        this.skillModal = null;
        this.playerAction({ kind: 'attack', skillId, targetId: target.id });
      },
      onClose: () => {
        this.skillModal = null;
      },
    });
  }

  private onMove(): void {
    audioDirector.playClick();
    if (this.busy || this.ended || this.actionsDisabled.value) return;
    if (this.skillModal?.open === true || this.codexModal?.open === true) return;
    if (this.state.activeId !== this.playerUnit().id) return;
    if (this.state.pendingMove) {
      this.playerAction({ kind: 'post-move', slot: this.playerUnit().slot });
      return;
    }
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
    if (this.busy || this.ended) return;
    if (this.skillModal?.open === true || this.codexModal?.open === true) return;
    if (this.state.activeId !== this.playerUnit().id) return;

    const pending = this.state.pendingMove;
    if (pending) {
      if (slot !== this.playerUnit().slot && !pending.slots.includes(slot)) return;
      this.playerAction({ kind: 'post-move', slot });
      return;
    }

    if (!this.moveMode) return;
    const from = this.playerUnit().slot;
    if (slot === from || !isAdjacentSlot(from, slot)) return;
    if (isSlotOccupied(this.state, slot)) return;
    this.setMoveMode(false);
    this.playerAction({ kind: 'move', slot });
  }

  private onEnemyPointer(id: string): void {
    if (this.ended || this.busy || this.state.pendingMove) return;
    if (this.skillModal?.open === true || this.codexModal?.open === true) return;
    if (this.menuModal?.open === true) return;
    const enemy = this.state.enemies.find((unit) => unit.id === id && unit.hp > 0);
    if (!enemy) return;
    audioDirector.playClick();
    this.selectedTargetId = id;
    this.syncHud();
  }

  private openCodex(): void {
    if (this.ended || this.busy || this.introOpen) return;
    if (this.skillModal?.open === true || this.codexModal?.open === true) return;
    if (this.menuModal?.open === true) return;
    audioDirector.playClick();
    const entries = this.setup.enemies.map((setupEnemy) => {
      const unit = this.state.enemies.find((enemy) => enemy.id === setupEnemy.id);
      return {
        id: setupEnemy.id,
        name: setupEnemy.name,
        known: this.knownEnemies.has(setupEnemy.id),
        hp: Math.max(0, unit?.hp ?? 0),
        maxHp: setupEnemy.hp,
        atk: setupEnemy.atk,
        defense: setupEnemy.defense ?? 0,
        spd: setupEnemy.spd,
        skills: setupEnemy.skills.map((skillId) => resolveSkill(skillId).name),
      };
    });
    this.codexModal = openBattleCodex(this.mvvm, {
      entries,
      onClose: () => {
        this.codexModal = null;
      },
    });
  }

  private updateSlotInteractivity(): void {
    const playerTurn =
      !this.busy &&
      !this.ended &&
      this.state.activeId === this.playerUnit().id &&
      this.state.phase === 'player';
    const from = this.playerUnit().slot;
    const pending = this.state.pendingMove;
    const targets = new Set<SlotId>();
    if (pending) {
      for (const slot of pending.slots) targets.add(slot);
      targets.add(from);
    } else if (this.moveMode) {
      for (const slot of adjacentSlots(from)) {
        if (!isSlotOccupied(this.state, slot)) targets.add(slot);
      }
    }
    for (const slot of SLOT_ORDER) {
      const zone = this.slotZones.get(slot);
      if (!zone?.input) continue;
      zone.input.enabled = playerTurn && targets.has(slot);
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
      case 'enemy-face':
        return (next) => this.animateEnemyFace(event, next);
      case 'enemy-move':
        return (next) => this.animateEnemyMove(event, next);
      case 'enemy-skill':
        return (next) => this.animateEnemySkill(event, next);
      case 'protocol':
        return (next) => this.animateProtocol(next);
      case 'victory':
        return (next) => this.animateVictory(next);
      case 'defeat':
        return (next) => this.animateDefeat(next);
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
      actor.setMirror(this.playerFlipForSlot(event.to));
      next();
      return;
    }

    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const outward = {
      x: mid.x - this.layout.slots.center.x,
      y: mid.y - this.layout.slots.center.y,
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
        actor.setMirror(this.playerFlipForSlot(event.to));
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
    const targetActor = this.enemyActorFor(event.targetId);
    if (!actor) {
      next();
      return;
    }
    this.playSfx(BATTLE_ASSET_KEYS.sfx.slash, 0.9);
    const fromPoint = this.layout.slots[event.from];
    const targetPoint =
      targetActor?.headPoint ??
      {
        x: this.layout.slots[event.targetSlot].x,
        y: this.layout.slots[event.targetSlot].y - 180,
      };
    const facesRight = targetPoint.x >= fromPoint.x;
    actor.setMirror(!facesRight);

    actor.playAttack(
      { reduced: this.reduced },
      () => {
        targetActor?.flash(0xffffff, 70);
        // 命中即解锁图鉴；预览只更新内存，不写盘。
        // markEnemyKnown 会从 storage 重新读；预览没有写盘，必须和当前内存集合求并，
        // 否则同一场预览里攻击第二只怪会把第一只的解锁状态冲掉。
        const known = markEnemyKnown(event.targetId, { preview: this.preview });
        this.knownEnemies = new Set([...this.knownEnemies, ...known]);
        bladeTrail(
          this,
          { x: fromPoint.x + (facesRight ? 74 : -74), y: fromPoint.y - 104 },
          { x: targetPoint.x, y: targetPoint.y + 34 },
          { reduced: this.reduced, depth: LAYERS.effects + 12 },
        );
        hitBurst(this, targetPoint.x, targetPoint.y + 30, {
          color: event.backstab ? 0xffe3a8 : GOLD,
          backstab: event.backstab,
          reduced: this.reduced,
          seed: this.seed + event.amount,
          depth: LAYERS.effects + 8,
        });
        this.floatNumber(
          `-${event.amount}`,
          targetPoint.x,
          targetPoint.y - 8,
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
        if (event.targetHp <= 0 && this.state.enemies.some((enemy) => enemy.hp > 0)) {
          this.time.delayedCall(this.reduced ? 60 : 220, () => {
            if (this.lifecycle.isLive(this.runId)) {
              targetActor?.die({ reduced: this.reduced, player: false });
            }
          });
        }
      },
      () => {
        next();
      },
    );
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

  private animateEnemyFace(
    event: Extract<BattleEvent, { kind: 'enemy-face' }>,
    next: () => void,
  ): void {
    const actor = this.enemyActorFor(event.actorId);
    const enemy = this.unitById(event.actorId);
    actor?.setFacing(event.facing);
    this.playSfx(BATTLE_ASSET_KEYS.sfx.turn, 0.45);
    if (enemy) {
      const point = this.enemyPoint(enemy);
      impactRing(this, point.x, point.y - 30, {
        color: PAPER,
        radius: 82,
        ms: 180,
        reduced: this.reduced,
        depth: LAYERS.effects,
      });
    }
    this.time.delayedCall(this.reduced ? 80 : 160, next);
  }

  private animateEnemyMove(
    event: Extract<BattleEvent, { kind: 'enemy-move' }>,
    next: () => void,
  ): void {
    const actor = this.enemyActorFor(event.actorId);
    const from = this.layout.slots[event.from];
    const to = this.layout.slots[event.to];
    if (!actor) {
      next();
      return;
    }
    this.playSfx(BATTLE_ASSET_KEYS.sfx.blink, 0.3, 1.1);

    if (event.blocked) {
      const dx = (to.x - from.x) * 0.18;
      const dy = (to.y - from.y) * 0.18;
      actor.nudge(dx, dy, 130);
      actor.setFacing(event.facing);
      this.floatLabel('被挡住', from.x, from.y - 190, MUTED);
      this.time.delayedCall(this.reduced ? 80 : 180, next);
      return;
    }

    if (this.reduced) {
      actor.setPosition(to.x, to.y);
      actor.setFacing(event.facing);
      next();
      return;
    }

    actor.setPosition(from.x, from.y);
    const clock = { t: 0 };
    this.tweens.add({
      targets: clock,
      t: 1,
      duration: 260,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        actor.setPosition(
          Phaser.Math.Linear(from.x, to.x, clock.t),
          Phaser.Math.Linear(from.y, to.y, clock.t),
        );
      },
      onComplete: () => {
        actor.setPosition(to.x, to.y);
        actor.setFacing(event.facing);
        impactRing(this, to.x, to.y - 36, {
          color: PAPER,
          radius: 46,
          ms: 160,
          reduced: this.reduced,
          depth: LAYERS.effects - 10,
        });
        next();
      },
    });
  }

  private enemyStrikeStrip(
    art: BattleUnit['art'] | undefined,
    skillId: string,
  ): BattleStrikeStrip | undefined {
    const attacks = art === 'cook' ? BATTLE_COOK_ATTACKS : BATTLE_MINER_ATTACKS;
    return attacks[skillId];
  }

  private playEnemyImpactFx(
    isQuake: boolean,
    point: { readonly x: number; readonly y: number },
  ): void {
    if (!isQuake) return;
    impactRing(this, point.x, point.y - 28, {
      color: DANGER,
      radius: 240,
      ms: 460,
      reduced: this.reduced,
      depth: LAYERS.effects,
    });
    this.time.delayedCall(this.reduced ? 40 : 90, () => {
      impactRing(this, point.x, point.y - 28, {
        color: DANGER,
        radius: 380,
        ms: 520,
        reduced: this.reduced,
        depth: LAYERS.effects - 4,
      });
    });
    screenRumble(this, { ms: 300, intensity: 0.009, reduced: this.reduced });
  }

  private resolveEnemyHit(
    event: Extract<BattleEvent, { kind: 'enemy-skill' }>,
    targetPoint: { readonly x: number; readonly y: number },
  ): void {
    if (!this.lifecycle.isLive(this.runId)) return;
    const target = this.state.party.find((unit) => unit.id === event.targetId);
    if (event.hit) {
      this.playerActor?.flash(0xffffff, 90);
      this.floatNumber(
        `-${event.amount}`,
        targetPoint.x,
        targetPoint.y - 170,
        DANGER,
        target?.guarding ? '防御减半' : event.skillName,
      );
      hitBurst(this, targetPoint.x, targetPoint.y - 96, {
        color: DANGER,
        reduced: this.reduced,
        seed: this.seed + this.state.seq,
        depth: LAYERS.effects + 8,
      });
      this.playSfx(
        target?.guarding ? BATTLE_ASSET_KEYS.sfx.guard : BATTLE_ASSET_KEYS.sfx.hit,
        0.85,
      );
      screenRumble(this, { ms: 160, intensity: 0.006, reduced: this.reduced });
    } else {
      this.floatLabel('打空', targetPoint.x, targetPoint.y - 150, MUTED);
    }
  }

  private animateEnemySkill(
    event: Extract<BattleEvent, { kind: 'enemy-skill' }>,
    next: () => void,
  ): void {
    const actor = this.enemyActorFor(event.actorId);
    const point = this.layout.slots[event.from];
    const facing = event.facing;
    const angle = FACING_ANGLES[facing];
    const isQuake = event.skillId.endsWith('quake');
    const target = this.state.party.find((unit) => unit.id === event.targetId);
    const targetPoint = this.layout.slots[target?.slot ?? event.targetSlot];
    const strip = this.enemyStrikeStrip(this.unitById(event.actorId)?.art, event.skillId);

    if (actor && strip && this.textures.exists(strip.key)) {
      this.playSfx(
        isQuake ? BATTLE_ASSET_KEYS.sfx.quake : BATTLE_ASSET_KEYS.sfx.sweep,
        isQuake ? 0.95 : 0.85,
      );
      actor.playStrike(
        strip,
        { reduced: this.reduced },
        () => {
          if (!this.lifecycle.isLive(this.runId)) return;
          this.playEnemyImpactFx(isQuake, point);
          this.resolveEnemyHit(event, targetPoint);
        },
        () => {
          if (this.lifecycle.isLive(this.runId)) next();
        },
        isRightFacing(facing),
      );
      return;
    }

    if (isQuake) {
      this.playSfx(BATTLE_ASSET_KEYS.sfx.quake, 0.95);
      this.playEnemyImpactFx(true, point);
    } else {
      this.playSfx(BATTLE_ASSET_KEYS.sfx.sweep, 0.85);
      const dx = Math.cos((angle * Math.PI) / 180) * 42;
      const dy = -Math.sin((angle * Math.PI) / 180) * 42;
      actor?.nudge(dx, dy, 150);
      slashArc(this, { x: point.x, y: point.y - 90 }, angle, {
        radius: 130,
        color: DANGER,
        reduced: this.reduced,
        depth: LAYERS.effects + 6,
      });
    }

    this.time.delayedCall(this.reduced ? 90 : isQuake ? 260 : 180, () => {
      this.resolveEnemyHit(event, targetPoint);
    });
    this.time.delayedCall(this.reduced ? 180 : isQuake ? 780 : 580, next);
  }

  private animateProtocol(next: () => void): void {
    this.playSfx(BATTLE_ASSET_KEYS.sfx.protocol, 1);
    const scrim = protocolScrim(this, this.reduced);
    const enemy = this.livingEnemies()[0] ?? this.state.enemies[0];
    const point = enemy ? this.layout.slots[enemy.slot] : this.layout.centerPoint;
    const pressure = protocolPressure(this, point.x, point.y, {
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
    const dead = this.state.enemies.filter((enemy) => enemy.hp <= 0);
    for (const [id, actor] of this.enemyActors) {
      const enemy = this.state.enemies.find((unit) => unit.id === id);
      if (!enemy || enemy.hp <= 0) actor.die({ reduced: this.reduced, player: false });
    }
    const point = dead[0]
      ? this.layout.slots[dead[0].slot]
      : this.layout.centerPoint;
    hitBurst(this, point.x, point.y - 120, {
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
    const player = this.playerUnit();
    const living = this.livingEnemies();
    const playerTurn =
      !this.ended &&
      !this.busy &&
      this.state.phase === 'player' &&
      this.state.activeId === player.id;

    this.turnLabel.value = `第 ${this.state.seq + 1} 动 · 敌方 ${living.length}`;
    this.playerLabel.value = `${player.name}  HP ${player.hp}/${player.maxHp}${
      player.guarding ? ' · 防御中' : ''
    }`;
    this.hintText.value = this.computeHint();
    this.logText.value = this.state.log
      .slice(-2)
      .map((entry) => entry.text)
      .join('\n');
    this.attackLabel.value = this.computeAttackLabel();
    this.moveLabel.value = this.state.pendingMove
      ? '留在原地'
      : this.moveMode
        ? '取消移动'
        : '移动';

    this.actionsDisabled.value = !playerTurn;
    this.attackDisabled.value =
      !playerTurn ||
      this.moveMode ||
      this.state.pendingMove !== null ||
      !playerCanAttack(this.setup, this.playerUnit().id) ||
      !this.attackTarget();
    this.guardDisabled.value =
      !playerTurn || this.moveMode || this.state.pendingMove !== null;

    this.syncTargetZones();
    if (this.protocolText) {
      const script = this.setup.script;
      if (script) {
        const left = Math.max(0, script.protocolAfterEnemyActions - this.state.enemyActions);
        this.protocolText.setText(`清除协议 · 剩余 ${left}`).setVisible(true);
      } else {
        this.protocolText.setVisible(false);
      }
    }

    this.drawActionBar();
    this.drawHighlights();
    this.updateSlotInteractivity();
  }

  private syncTargetZones(): void {
    // 敌人点击区保持不可见；落点选择期间锁定目标，不再换人。
    for (const enemy of this.state.enemies) {
      const zone = this.enemyTargetZones.get(enemy.id);
      if (!zone?.input) continue;
      const point = this.enemyPoint(enemy);
      zone.setPosition(point.x, point.y - 80);
      zone.input.enabled =
        enemy.hp > 0 && !this.ended && this.state.pendingMove === null;
    }
  }

  private computeHint(): string {
    if (this.state.phase === 'defeat') return '你倒下了。';
    if (this.state.phase === 'victory') return '幻影散尽。';

    const pending = this.state.pendingMove;
    if (pending) {
      const target = this.state.enemies.find((enemy) => enemy.id === pending.targetId);
      return `选择${target?.name ?? '目标'}附近的点位落地，或按「留在原地」。`;
    }
    if (this.moveMode) {
      return '只能走到相邻空点位（点亮的格子）；再按「取消移动」回到指令。';
    }
    if (!playerCanAttack(this.setup, this.playerUnit().id)) {
      return '你还没有「解」——只能移动或防御。';
    }
    if (this.state.activeId !== this.playerUnit().id) return '等待它行动……';

    const selected = this.selectedEnemyUnit();
    if (!selected) return '点敌人选择目标；只打相邻点位。';
    const target = this.attackTarget();
    if (!target) return `目标${selected.name}不在相邻点位——先移动靠近。`;

    const skillId = this.playerSetup()?.skills[0];
    if (!skillId) return '选择行动。';
    const preview = previewPlayerAttack(this.state, this.setup, skillId, target.id);
    if (!preview) return '选择行动。';
    // 未知怪只给机制提示；已知怪（图鉴已解锁）才显示预计伤害。
    const expected = this.knownEnemies.has(target.id) ? ` 预计 ${preview.amount}。` : '';
    if (preview.backstab) {
      return `目标：${target.name} · 背袭（无视一半防御），命中后留在原地。${expected}`;
    }
    return `目标：${target.name} · 命中后可选择附近落点。${expected}`;
  }

  private computeAttackLabel(): string {
    if (this.state.pendingMove) return '攻击 · 落点选择';
    if (!playerCanAttack(this.setup, this.playerUnit().id)) return '攻击 · 无「解」';
    const selected = this.selectedEnemyUnit();
    if (!selected) return '攻击 · 选目标';
    const target = this.attackTarget();
    if (!target) return '攻击 · 目标太远';
    const skillId = this.playerSetup()?.skills[0];
    if (!skillId) return '攻击';
    const preview = previewPlayerAttack(this.state, this.setup, skillId, target.id);
    if (!preview) return '攻击';
    return this.knownEnemies.has(target.id)
      ? `攻击 · ${target.name} · ${preview.amount}`
      : `攻击 · ${target.name}`;
  }

  private drawActionBar(): void {
    const order = previewOrder(this.state, 6);
    if (!this.orderSettled) {
      this.orderSettled = true;
      this.displayedOrder = [...order];
      this.settleOrder(order);
      return;
    }

    const transition = railTransition(this.displayedOrder, order);
    if (!transition.changed) return;
    this.displayedOrder = [...order];
    this.playOrderTransition(transition, order);
  }

  private drawHighlights(): void {
    const graphics = this.highlightGraphics;
    if (!graphics) return;
    graphics.clear();

    const playerSlot = this.playerUnit().slot;
    const pending = this.state.pendingMove;

    // 落点选择：当前点 + 目标相邻的空闲落点；其余时候一律不画。
    if (pending) {
      this.drawMoveMarker(graphics, playerSlot, PAPER);
      for (const slot of pending.slots) {
        this.drawMoveMarker(graphics, slot, GOLD);
      }
      return;
    }

    if (!this.moveMode) return;
    this.drawMoveMarker(graphics, playerSlot, PAPER);
    for (const slot of adjacentSlots(playerSlot)) {
      if (isSlotOccupied(this.state, slot)) continue;
      this.drawMoveMarker(graphics, slot, GOLD);
    }
  }

  /** 移动/落点选择的地面圈：只在这里出现，不画文字、不画朝向/背袭。 */
  private drawMoveMarker(
    graphics: Phaser.GameObjects.Graphics,
    slot: SlotId,
    color: number,
  ): void {
    drawSlotRing(graphics, this.layout.slots[slot], {
      color,
      alpha: 0.88,
      fillColor: color,
      fillAlpha: 0.08,
      lineWidth: 3,
    });
  }

  private syncActorPositions(): void {
    const player = this.playerActor;
    if (player) {
      const party = this.playerUnit();
      const point = this.layout.slots[party.slot];
      player.setPosition(point.x, point.y);
      player.setMirror(this.playerFlipForSlot(party.slot));
      player.setPose(party.guarding ? 'guard' : 'idle');
    }
    for (const enemy of this.state.enemies) {
      const actor = this.enemyActors.get(enemy.id);
      if (!actor) continue;
      const point = this.layout.slots[enemy.slot];
      actor.setPosition(point.x, point.y);
      actor.setFacing(enemy.facing ?? 'left');
    }
  }

  private flashHint(text: string, floatText = ''): void {
    this.hintText.value = text;
    if (floatText) {
      this.floatLabel(
        floatText,
        getViewportPlan().designWidth / 2,
        getViewportPlan().designHeight * 0.42,
        DANGER,
      );
    }
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
   * 用于 Playwright 断言「点了一下之后 seq/enemyActions/HP 各加了多少」，不靠截图猜。
   */
  private installDebugHook(): void {
    if (!import.meta.env.DEV) return;
    (window as unknown as { __avmBattle?: () => unknown }).__avmBattle = () => this.debugSnapshot();
  }

  private debugSnapshot(): unknown {
    const state = this.state;
    const party = state.party.map((unit) => ({
      id: unit.id,
      name: unit.name,
      hp: unit.hp,
      maxHp: unit.maxHp,
      slot: unit.slot,
      spd: unit.spd,
      defense: unit.defense,
      gauge: unit.gauge,
      guarding: unit.guarding,
    }));
    const enemies = state.enemies.map((unit) => ({
      id: unit.id,
      name: unit.name,
      hp: unit.hp,
      maxHp: unit.maxHp,
      slot: unit.slot,
      facing: unit.facing,
      spd: unit.spd,
      defense: unit.defense,
      gauge: unit.gauge,
      intent: state.intents[unit.id] ?? null,
    }));
    return {
      encounterId: state.encounterId,
      phase: state.phase,
      activeId: state.activeId,
      seq: state.seq,
      enemyActions: state.enemyActions,
      party,
      enemies,
      intents: state.intents,
      pendingMove: state.pendingMove,
      knownEnemies: [...this.knownEnemies],
      order: previewOrder(state, 6),
      gauges: Object.fromEntries(
        [...state.party, ...state.enemies].map((unit) => [unit.id, unit.gauge]),
      ),
      selectedTargetId: this.selectedTargetId,
      playerHp: state.party[0]?.hp,
      enemyHp: state.enemies[0]?.hp,
      slot: state.party[0]?.slot,
      facing: state.enemies[0]?.facing,
      intent: state.enemies[0] ? (state.intents[state.enemies[0].id] ?? null) : null,
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
    this.skillModal?.close('scene');
    this.skillModal = null;
    this.codexModal?.close('scene');
    this.codexModal = null;
    this.defeatModal = null;
    this.victoryModal = null;
    this.exitModal = null;
    this.playerActor?.destroy();
    this.playerActor = null;
    for (const actor of this.enemyActors.values()) actor.destroy();
    this.enemyActors.clear();
    for (const object of this.fx) object.destroy();
    this.fx.length = 0;
    this.highlightGraphics = null;
    this.enemyIndex.clear();
    this.enemyTargetZones.clear();
    this.protocolText = null;
    this.orderChips.length = 0;
    this.slotZones.clear();
    this.railTween = null;
  }
}

function nextStep(run: (index: number) => void, index: number): () => void {
  return () => run(index);
}
