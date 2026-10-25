import Phaser from 'phaser';
import { ref } from '@phaser-mvvm/core';
import { UIScene, prefersReducedMotion, type ModalHandle } from '@phaser-mvvm/phaser';
import { enterModule } from '../app/director';
import { SCENE_KEYS } from '../app/scene-keys';
import { applyCamera, getViewportPlan } from '../app/viewport';
import { audioDirector } from '../audio/audio-director';
import { bgmManager } from '../audio/bgm-manager';
import {
  isStageLaunchContext,
  stageParam,
  type StageLaunchContext,
} from '../dev/stage-types';
import { CH01_FIRST_BATTLE } from '../battle/data/ch01-first';
import { CH01_ASSET_KEYS } from '../assets/keys';
import { LAYERS, characterDepth } from '../render/layers';
import {
  advanceForPreview,
  applyBattleAction,
  createBattle,
} from '../battle/core/scripted-battle';
import type { BattleAction, BattleState } from '../battle/types';
import { DANGER, GOLD, INK, makeSceneText } from '../ui/cinematic';
import { hashSeed, mulberry32 } from '../dev/random';
import { addCoverImage } from '../ui/background';
import { setPixelTextures } from '../ui/pixel';
import { buildBattleCh01Hud } from '../ui/battle-ch01-hud';
import { openBattleDefeat, openBattleExit, openBattleIntro } from '../ui/battle-ch01-modals';

type BattlePreviewPhase = 'opening' | 'mid' | 'defeat';

const PREVIEW_PHASES = ['opening', 'mid', 'defeat'] as const;

function normalizePhase(value: string | undefined): BattlePreviewPhase {
  if (value === 'mid' || value === 'defeat') return value;
  return 'opening';
}

interface BattleLaunchData {
  readonly encounterId?: string;
  readonly seed?: number;
  readonly preview?: boolean;
}

function isBattleLaunchData(value: unknown): value is BattleLaunchData {
  return value !== null && typeof value === 'object' && 'encounterId' in value;
}

/**
 * 第一场剧情战：梦域金殿 · 矿工清除单元。
 *
 * 这是 1v1 的剧情战，不是完整回合制：攻击/防御、HP、固定 1 伤害、3 回合必败。
 * 战斗结果由 `src/battle/core/scripted-battle.ts` 纯逻辑决定，场景只播放。
 */
export class BattleCh01Scene extends UIScene {
  private rawData: unknown = undefined;
  private context: StageLaunchContext | null = null;
  private preview = false;
  private seed = 1;
  private phaseParam: BattlePreviewPhase = 'opening';
  private state!: BattleState;
  private enemySprite: Phaser.GameObjects.Image | null = null;
  private playerSprite: Phaser.GameObjects.Image | null = null;
  private hpGraphics: Phaser.GameObjects.Graphics | null = null;
  private busy = false;
  private ended = false;
  private transitioning = false;
  private introOpen = false;
  private defeatModal: ModalHandle | null = null;
  private exitModal: ModalHandle | null = null;
  private readonly reduced = prefersReducedMotion();

  private readonly roundLabel = ref('第 1 回合');
  private readonly enemyLabel = ref('');
  private readonly playerLabel = ref('');
  private readonly logText = ref('');
  private readonly hintText = ref('你的攻击只能造成 1 点伤害。');
  private readonly actionsDisabled = ref(true);

  constructor() {
    super(SCENE_KEYS.battleCh01);
  }

  init(data: unknown): void {
    this.rawData = data;
    const context = isStageLaunchContext(data) ? data : null;
    this.context = context;
    this.preview = context?.preview === true || (isBattleLaunchData(data) && data.preview === true);

    const launch = isBattleLaunchData(data) ? data : null;
    this.seed = context?.seed ?? launch?.seed ?? 1;
    this.phaseParam = context ? normalizePhase(stageParam(context, 'phase')) : 'opening';
    if (context && stageParam(context, 'phase') !== undefined) {
      const raw = stageParam(context, 'phase');
      if (raw !== undefined && !PREVIEW_PHASES.includes(raw as BattlePreviewPhase)) {
        console.warn(`[battle-ch01] 未知 phase=${raw}，回退 opening`);
      }
    }

    this.state = createBattle(CH01_FIRST_BATTLE);
    if (this.preview && this.phaseParam === 'mid') {
      this.state = advanceForPreview(this.state, CH01_FIRST_BATTLE, 1);
    } else if (this.preview && this.phaseParam === 'defeat') {
      this.state = advanceForPreview(this.state, CH01_FIRST_BATTLE, CH01_FIRST_BATTLE.maxRounds);
    }
  }

  override create(): void {
    this.busy = false;
    this.ended = false;
    this.transitioning = false;
    this.introOpen = false;
    this.defeatModal = null;
    this.exitModal = null;
    this.enemySprite = null;
    this.playerSprite = null;
    this.hpGraphics = null;

    applyCamera(this);
    this.cameras.main.setBackgroundColor('#05060a');
    setPixelTextures(this, [CH01_ASSET_KEYS.battle.dreamHall, CH01_ASSET_KEYS.characters.miner, CH01_ASSET_KEYS.characters.zhouDown]);

    if (!addCoverImage(this, CH01_ASSET_KEYS.battle.dreamHall)) {
      this.add.rectangle(0, 0, getViewportPlan().designWidth, getViewportPlan().designHeight, 0x1a1012)
        .setOrigin(0, 0);
    }
    this.add.rectangle(0, 0, getViewportPlan().designWidth, getViewportPlan().designHeight, 0x05060a, 0.28)
      .setOrigin(0, 0)
      .setDepth(LAYERS.props);

    this.createCombatants();
    this.addDust();
    super.create();
    audioDirector.attach(this);
    bgmManager.enterScene(this);
    this.cameras.main.fadeIn(this.reduced ? 180 : 420, 5, 6, 10);
    this.syncHud();

    if (this.state.phase === 'defeat') {
      this.actionsDisabled.value = true;
      this.time.delayedCall(this.reduced ? 120 : 420, () => this.showDefeatOverlay());
    } else if (this.phaseParam === 'mid' || this.context?.skip === true) {
      this.actionsDisabled.value = false;
    } else {
      this.time.delayedCall(this.reduced ? 120 : 360, () => this.showBattleIntro());
    }
  }

  protected content(): void {
    buildBattleCh01Hud({
      roundLabel: this.roundLabel,
      enemyLabel: this.enemyLabel,
      playerLabel: this.playerLabel,
      logText: this.logText,
      hintText: this.hintText,
      actionsDisabled: this.actionsDisabled,
      onAttack: () => this.playerAction('attack'),
      onGuard: () => this.playerAction('guard'),
      onMenu: () => {
        audioDirector.playClick();
        this.openExitConfirm();
      },
    });
  }

  protected override onBack(): boolean {
    if (this.defeatModal?.open === true) return true;
    this.openExitConfirm();
    return true;
  }

  private addDust(): void {
    // seed 只影响尘埃/光点位置，不影响战斗判定；同 seed 同一画面。
    const rng = mulberry32((this.seed ^ hashSeed('battle.ch01.first')) >>> 0);
    const plan = getViewportPlan();
    for (let index = 0; index < 18; index += 1) {
      const x = 40 + rng() * (plan.designWidth - 80);
      const y = plan.designHeight * 0.25 + rng() * plan.designHeight * 0.45;
      const dot = this.add.circle(x, y, 1 + rng() * 2, 0xd8b76a, 0.15 + rng() * 0.2).setDepth(LAYERS.props + 1);
      this.tweens.add({
        targets: dot,
        y: y - 20 - rng() * 30,
        alpha: 0,
        duration: 2400 + rng() * 2200,
        delay: rng() * 1200,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  private createCombatants(): void {
    const plan = getViewportPlan();
    const centerX = plan.designWidth / 2;

    if (this.textures.exists(CH01_ASSET_KEYS.characters.miner)) {
      this.enemySprite = this.add
        .image(centerX, plan.designHeight * 0.48, CH01_ASSET_KEYS.characters.miner)
        .setOrigin(0.5, 1)
        .setDepth(characterDepth(plan.designHeight * 0.48));
    }
    if (this.textures.exists(CH01_ASSET_KEYS.characters.zhouDown)) {
      this.playerSprite = this.add
        .image(plan.designWidth * 0.25, plan.designHeight * 0.66, CH01_ASSET_KEYS.characters.zhouDown)
        .setOrigin(0.5, 1)
        .setDepth(characterDepth(plan.designHeight * 0.66));
      this.playerSprite.setFlipX(false);
    }

    this.add.ellipse(centerX, plan.designHeight * 0.48 + 4, 180, 32, 0x000000, 0.32).setDepth(LAYERS.props);
    this.add.ellipse(plan.designWidth * 0.25, plan.designHeight * 0.66 + 4, 90, 20, 0x000000, 0.32).setDepth(LAYERS.props);

    this.hpGraphics = this.add.graphics().setDepth(LAYERS.effects);
  }

  private playerAction(action: BattleAction): void {
    if (this.busy || this.ended || this.transitioning) return;
    if (this.state.phase !== 'player') return;
    if (this.actionsDisabled.value) return;

    this.busy = true;
    this.actionsDisabled.value = true;
    const result = applyBattleAction(this.state, action, CH01_FIRST_BATTLE);
    this.state = result.state;
    this.syncHud();

    const attack = result.events.find((event) => event.type === 'player-attack');
    const enemyHit = result.events.find((event) => event.type === 'enemy-attack');
    const protocol = result.events.find((event) => event.type === 'protocol');

    if (attack?.type === 'player-attack') {
      audioDirector.playSfx('audio.sfx.ch01_punch');
      this.floatNumber('1', this.enemySprite?.x ?? 360, (this.enemySprite?.y ?? 520) - 180, GOLD);
      if (!this.reduced) this.cameras.main.shake(90, 0.002);
    } else {
      audioDirector.playClick();
      this.floatNumber('防御', this.playerSprite?.x ?? 180, (this.playerSprite?.y ?? 760) - 120, 0xf2efe6);
    }

    if (enemyHit?.type === 'enemy-attack') {
      this.time.delayedCall(220, () => {
        audioDirector.playSfx('audio.sfx.ch01_metal');
        this.floatNumber(
          `-${enemyHit.amount}`,
          this.playerSprite?.x ?? 180,
          (this.playerSprite?.y ?? 760) - 160,
          DANGER,
        );
        if (!this.reduced) this.cameras.main.shake(130, 0.004);
      });
    }

    if (protocol?.type === 'protocol') {
      this.time.delayedCall(420, () => {
        audioDirector.playSfx('audio.sfx.ch01_metal');
        this.floatNumber('清除协议', this.playerSprite?.x ?? 180, (this.playerSprite?.y ?? 760) - 190, DANGER);
        if (!this.reduced) this.cameras.main.flash(180, 192, 57, 43);
      });
    }

    this.time.delayedCall(this.reduced ? 120 : 700, () => {
      this.busy = false;
      if (this.state.phase === 'defeat') {
        this.showDefeatOverlay();
      } else {
        this.actionsDisabled.value = false;
      }
    });
  }

  private syncHud(): void {
    this.roundLabel.value = `第 ${this.state.round} 回合`;
    this.enemyLabel.value = `${this.state.enemy.name}  HP ${this.state.enemy.hp}/${this.state.enemy.maxHp}`;
    this.playerLabel.value = `${this.state.player.name}  HP ${this.state.player.hp}/${this.state.player.maxHp}`;
    const lines = this.state.log.slice(-2).map((entry) => entry.text);
    this.logText.value = lines.join('\n');
    this.hintText.value =
      this.state.phase === 'defeat'
        ? '这不是你能赢的战斗。'
        : '你的攻击只能造成 1 点伤害。';
    this.drawHpBars();
  }

  private drawHpBars(): void {
    const graphics = this.hpGraphics;
    if (!graphics) return;
    const plan = getViewportPlan();
    graphics.clear();

    this.drawBar(graphics, 220, plan.designHeight * 0.22, 280, 10, this.state.enemy.hp / this.state.enemy.maxHp, DANGER);
    this.drawBar(graphics, 40, plan.designHeight * 0.7, 280, 10, this.state.player.hp / this.state.player.maxHp, GOLD);
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
    graphics.fillStyle(INK, 0.72);
    graphics.fillRoundedRect(x, y, width, height, 3);
    graphics.lineStyle(1, 0x3a3428, 0.9);
    graphics.strokeRoundedRect(x, y, width, height, 3);
    if (safe > 0) {
      graphics.fillStyle(color, 0.9);
      graphics.fillRoundedRect(x + 1, y + 1, (width - 2) * safe, height - 2, 2);
    }
  }

  private floatNumber(text: string, x: number, y: number, color: number): void {
    const label = makeSceneText(this, x, y, text, {
      size: 34,
      color,
      depth: 600,
      stroke: 5,
      bold: true,
    });
    this.tweens.add({
      targets: label,
      y: y - 46,
      alpha: 0,
      duration: this.reduced ? 240 : 780,
      ease: 'Sine.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private showBattleIntro(): void {
    if (this.introOpen || this.ended) return;
    this.introOpen = true;
    this.actionsDisabled.value = true;
    openBattleIntro(this.mvvm, {
      onClose: () => {
        this.introOpen = false;
        if (!this.ended) this.actionsDisabled.value = false;
      },
    });
  }

  private showDefeatOverlay(): void {
    if (this.defeatModal?.open === true) return;
    this.ended = true;
    this.busy = false;
    this.actionsDisabled.value = true;
    this.syncHud();

    this.defeatModal = openBattleDefeat(this.mvvm, {
      preview: this.preview,
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
        this.cameras.main.fadeOut(this.reduced ? 160 : 360, 255, 255, 255);
        this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
          void enterModule(this, 'ch01Dorm', { resume: 'afterBattle' });
        });
      },
      onClose: () => {
        this.defeatModal = null;
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

}
