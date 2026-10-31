import Phaser from 'phaser';
import { ref } from '@phaser-mvvm/core';
import { UIScene, type ModalHandle } from '@phaser-mvvm/phaser';
import { enterModule } from '../app/director';
import { SCENE_KEYS } from '../app/scene-keys';
import { applyCamera, getViewportPlan } from '../app/viewport';
import { resolveReducedMotion } from '../app/settings';
import { saveProgress } from '../app/progress';
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
import {
  addContactShadow,
  addDustMotes,
  addLightShaft,
  addVignette,
  impactRing,
  ledPulse,
  screenRumble,
  sparkBurst,
} from '../ui/fx-kit';
import { hashSeed } from '../dev/random';
import { addCoverImage } from '../ui/background';
import { setLinearTextures, setPixelTextures } from '../ui/pixel';
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
  /** 氛围/特效对象，shutdown 统一销毁。 */
  private fx: Phaser.GameObjects.GameObject[] = [];
  private corePulse: Phaser.GameObjects.Container | null = null;

  private get reduced(): boolean {
    return resolveReducedMotion();
  }

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
    for (const object of this.fx) object.destroy();
    this.fx = [];
    this.corePulse = null;

    applyCamera(this);
    this.cameras.main.setBackgroundColor('#05060a');
    setPixelTextures(this, [CH01_ASSET_KEYS.characters.miner, CH01_ASSET_KEYS.characters.zhouDown]);
    setLinearTextures(this, [CH01_ASSET_KEYS.battle.minerHall]);

    if (!addCoverImage(this, CH01_ASSET_KEYS.battle.minerHall)) {
      this.add.rectangle(0, 0, getViewportPlan().designWidth, getViewportPlan().designHeight, 0x1a1012)
        .setOrigin(0, 0);
    }
    this.add.rectangle(0, 0, getViewportPlan().designWidth, getViewportPlan().designHeight, 0x05060a, 0.34)
      .setOrigin(0, 0)
      .setDepth(LAYERS.props);

    this.createCombatants();
    this.addDust();
    this.fx.push(
      addLightShaft(this, {
        x: getViewportPlan().designWidth * 0.5,
        y: 40,
        width: 420,
        height: 980,
        angleDeg: 8,
        color: 0xffdfa0,
        alpha: 0.1,
        reduced: this.reduced,
        depth: LAYERS.props + 2,
      }),
      addVignette(this, { alpha: 0.46 }),
    );
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
    const plan = getViewportPlan();
    this.fx.push(
      addDustMotes(this, {
        x: 40,
        y: plan.designHeight * 0.24,
        width: plan.designWidth - 80,
        height: plan.designHeight * 0.46,
        count: 24,
        seed: this.seed ^ hashSeed('battle.ch01.first'),
        color: 0xd8b76a,
        alpha: 0.55,
        reduced: this.reduced,
        depth: LAYERS.effects,
      }),
    );
  }

  private createCombatants(): void {
    const plan = getViewportPlan();
    const centerX = plan.designWidth / 2;
    const enemyY = plan.designHeight * 0.52;
    const playerY = plan.designHeight * 0.7;

    if (this.textures.exists(CH01_ASSET_KEYS.characters.miner)) {
      this.enemySprite = this.add
        .image(centerX, enemyY, CH01_ASSET_KEYS.characters.miner)
        // 128×160 的像素图按 2× 显示，才有「Boss 该有的体积」；整数倍不糊。
        .setScale(2)
        .setOrigin(0.5, 1)
        .setDepth(characterDepth(enemyY));
      // 待机呼吸：只缩放不改位置，血条锚点不会跟着晃。
      if (!this.reduced) {
        this.tweens.add({
          targets: this.enemySprite,
          scaleY: 2.04,
          duration: 1500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
      this.corePulse = ledPulse(this, centerX, enemyY - 178, {
        color: 0xff3b30,
        radius: 11,
        reduced: this.reduced,
        depth: LAYERS.effects,
      });
      this.fx.push(this.corePulse);
    }
    if (this.textures.exists(CH01_ASSET_KEYS.characters.zhouDown)) {
      this.playerSprite = this.add
        .image(plan.designWidth * 0.26, playerY, CH01_ASSET_KEYS.characters.zhouDown)
        .setScale(2)
        .setOrigin(0.5, 1)
        .setDepth(characterDepth(playerY));
      this.playerSprite.setFlipX(false);
    }

    this.fx.push(
      addContactShadow(this, { x: centerX, y: enemyY + 2, width: 210, height: 38, alpha: 0.34, depth: LAYERS.props }),
      addContactShadow(this, {
        x: plan.designWidth * 0.26,
        y: playerY + 2,
        width: 110,
        height: 22,
        alpha: 0.34,
        depth: LAYERS.props,
      }),
    );

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
      this.playerLunge();
      this.time.delayedCall(this.reduced ? 30 : 110, () => {
        this.hitEnemy();
        this.floatNumber('1', this.enemySprite?.x ?? 360, (this.enemySprite?.y ?? 520) - 220, GOLD, '毫无作用');
      });
    } else {
      audioDirector.playClick();
      this.floatNumber('防御', this.playerSprite?.x ?? 180, (this.playerSprite?.y ?? 760) - 150, 0xf2efe6);
      impactRing(this, this.playerSprite?.x ?? 180, (this.playerSprite?.y ?? 760) - 80, {
        color: 0xf2efe6,
        radius: 110,
        ms: 360,
        reduced: this.reduced,
        depth: LAYERS.effects,
      });
    }

    if (enemyHit?.type === 'enemy-attack') {
      this.time.delayedCall(220, () => {
        audioDirector.playSfx('audio.sfx.ch01_metal');
        this.enemyLunge();
        this.floatNumber(
          `-${enemyHit.amount}`,
          this.playerSprite?.x ?? 180,
          (this.playerSprite?.y ?? 760) - 190,
          DANGER,
        );
        if (!this.reduced) {
          screenRumble(this, { ms: 160, intensity: 0.006, reduced: this.reduced });
          this.cameras.main.flash(120, 192, 57, 43);
        }
        sparkBurst(this, this.playerSprite?.x ?? 180, (this.playerSprite?.y ?? 760) - 120, {
          color: 0xffb26b,
          count: 14,
          seed: this.seed,
          reduced: this.reduced,
          depth: LAYERS.effects,
        });
      });
    }

    if (protocol?.type === 'protocol') {
      this.time.delayedCall(420, () => {
        audioDirector.playSfx('audio.sfx.ch01_metal');
        this.floatNumber('清除协议', this.playerSprite?.x ?? 180, (this.playerSprite?.y ?? 760) - 230, DANGER);
        if (!this.reduced) this.cameras.main.flash(180, 192, 57, 43);
      });
    }

    this.time.delayedCall(this.reduced ? 120 : 700, () => {
      this.busy = false;
      if (this.state.phase === 'defeat') {
        this.showDefeatOverlay();
      } else {
        this.actionsDisabled.value = false;
        this.showTurnBanner('你的回合');
      }
    });
  }

  /** 玩家前冲一小步再回位；不改变实际坐标，只改表现。 */
  private playerLunge(): void {
    const sprite = this.playerSprite;
    if (!sprite || this.reduced) return;
    const homeX = sprite.x;
    this.tweens.add({
      targets: sprite,
      x: homeX + 56,
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  /** 敌方俯冲 + 受击闪白；`hitEnemy` 同时给火花与冲击环。 */
  private enemyLunge(): void {
    const sprite = this.enemySprite;
    if (!sprite || this.reduced) return;
    const homeY = sprite.y;
    this.tweens.add({
      targets: sprite,
      y: homeY + 28,
      duration: 120,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
  }

  private hitEnemy(): void {
    const sprite = this.enemySprite;
    if (!sprite) return;
    if (!this.reduced) {
      sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      this.time.delayedCall(70, () => sprite.clearTint());
    }
    impactRing(this, sprite.x, sprite.y - 150, {
      color: 0xd8b76a,
      radius: 90,
      ms: 320,
      reduced: this.reduced,
      depth: LAYERS.effects,
    });
    sparkBurst(this, sprite.x, sprite.y - 150, {
      color: 0xffe3a8,
      count: 16,
      seed: this.seed + 3,
      reduced: this.reduced,
      depth: LAYERS.effects,
    });
    if (!this.reduced) screenRumble(this, { ms: 90, intensity: 0.003, reduced: this.reduced });
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
    graphics.clear();

    // 血条贴着角色头顶，而不是钉在屏幕坐标上。
    const enemy = this.enemySprite;
    if (enemy) {
      this.drawBar(graphics, enemy.x - 110, enemy.y - 344, 220, 12, this.state.enemy.hp / this.state.enemy.maxHp, DANGER);
    }
    const player = this.playerSprite;
    if (player) {
      this.drawBar(graphics, player.x - 58, player.y - 214, 116, 9, this.state.player.hp / this.state.player.maxHp, GOLD);
    }
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

  private floatNumber(text: string, x: number, y: number, color: number, sub?: string): void {
    const label = makeSceneText(this, x, y, text, {
      size: 44,
      color,
      depth: 600,
      stroke: 6,
      bold: true,
    });
    const extras: Phaser.GameObjects.Text[] = [label];
    if (sub) {
      extras.push(
        makeSceneText(this, x, y + 40, sub, {
          size: 20,
          color: 0xf2efe6,
          depth: 600,
          stroke: 4,
        }),
      );
    }
    this.tweens.add({
      targets: extras,
      y: `-=46`,
      alpha: 0,
      duration: this.reduced ? 240 : 780,
      ease: 'Sine.easeOut',
      onComplete: () => {
        for (const object of extras) object.destroy();
      },
    });
  }

  /** 回合提示：屏幕中央偏上的小字卡，不抢对话/按钮。 */
  private showTurnBanner(text: string, tone: 'gold' | 'danger' = 'gold'): void {
    const plan = getViewportPlan();
    const label = makeSceneText(this, plan.designWidth / 2, plan.designHeight * 0.34, text, {
      size: 34,
      color: tone === 'danger' ? DANGER : GOLD,
      depth: 640,
      stroke: 6,
      bold: true,
      originX: 0.5,
      originY: 0.5,
    });
    label.setAlpha(0);
    this.tweens.add({
      targets: label,
      alpha: 1,
      duration: 160,
      yoyo: true,
      hold: 520,
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
        if (!this.ended) {
          this.actionsDisabled.value = false;
          this.showTurnBanner('你的回合');
        }
      },
    });
  }

  private showDefeatOverlay(): void {
    if (this.defeatModal?.open === true) return;
    this.ended = true;
    this.busy = false;
    this.actionsDisabled.value = true;
    this.syncHud();
    // 战败即视为走到「战后征召」这一段，继续游戏直接回到寝室醒来。
    saveProgress('dorm.after', { preview: this.preview });

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

  shutdown(): void {
    for (const object of this.fx) object.destroy();
    this.fx = [];
    this.corePulse = null;
    this.hpGraphics = null;
    this.enemySprite = null;
    this.playerSprite = null;
  }
}
