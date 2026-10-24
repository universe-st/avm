import Phaser from 'phaser';
import { UIScene, prefersReducedMotion } from '@phaser-mvvm/phaser';
import { Button, Column, Row } from '@phaser-mvvm/widgets/compose';
import { enterModule } from '../app/director';
import { applyCamera, getViewportPlan } from '../app/viewport';
import { audioDirector } from '../audio/audio-director';
import {
  PROLOGUE_CUES,
  cueText,
  type PrologueCue,
} from '../story/prologue';
import { ProloguePlayer, type PrologueEvent } from '../story/prologue-player';
import {
  CinematicBackdrop,
  MUTED,
  MeteorSweep,
  PAPER,
  GOLD,
  SparkField,
  TitleCard,
  WarOverlay,
  addCinematicScrim,
  addStaticStarfield,
  flashScreen,
  makeSceneText,
  shakeScreen,
} from '../ui/cinematic';

/**
 * 开幕剧情。
 *
 * 原生 Phaser 层负责画面/文字/光效；UIScene 只挂一个右上角「跳过」。
 * 时间线在 `ProloguePlayer` 里，场景每帧把 delta 喂进去。
 */
export class PrologueScene extends UIScene {
  private player: ProloguePlayer | null = null;
  private backdrop: CinematicBackdrop | null = null;
  private sparks: SparkField | null = null;
  private meteor: MeteorSweep | null = null;
  private war: WarOverlay | null = null;
  private card: TitleCard | null = null;
  private mainText: Phaser.GameObjects.Text | null = null;
  private caption: Phaser.GameObjects.Text | null = null;
  private hint: Phaser.GameObjects.Text | null = null;
  private startTimer: Phaser.Time.TimerEvent | null = null;
  private hintTween: Phaser.Tweens.Tween | null = null;
  private captionTween: Phaser.Tweens.Tween | null = null;
  private cueImageKey: string | null = null;
  private currentCueIndex = -1;
  private started = false;
  private leaving = false;
  private readonly reduced = prefersReducedMotion();

  constructor() {
    super('prologue');
  }

  override create(): void {
    this.resetState();
    applyCamera(this);

    const plan = getViewportPlan();
    const { designWidth: w, designHeight: h } = plan;

    addStaticStarfield(this);
    this.backdrop = new CinematicBackdrop(this, this.reduced);
    addCinematicScrim(this);
    this.sparks = new SparkField(this, {
      depth: 6,
      alpha: 0.42,
      reduced: this.reduced,
    });
    this.meteor = new MeteorSweep(this, this.reduced);
    this.war = new WarOverlay(this);
    this.card = new TitleCard(this);

    this.mainText = makeSceneText(this, w / 2, h * 0.655, '', {
      size: 38,
      color: PAPER,
      originX: 0.5,
      originY: 0,
      fixedWidth: 640,
      fixedHeight: 260,
      depth: 10,
      alpha: 0,
    });
    this.caption = makeSceneText(this, w / 2, h * 0.15, '', {
      size: 22,
      color: MUTED,
      letterSpacing: 4,
      depth: 10,
      alpha: 0,
    });
    this.hint = makeSceneText(this, w / 2, h - 118, '', {
      size: 26,
      color: GOLD,
      depth: 10,
      alpha: 0,
    });

    super.create();
    audioDirector.attach(this);
    this.cameras.main.fadeIn(this.reduced ? 220 : 600, 5, 6, 10);

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.keyboard?.on('keydown-SPACE', this.onAdvanceKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);

    this.startTimer = this.time.delayedCall(420, () => {
      this.startTimer = null;
      if (this.leaving) return;
      this.startSequence();
    });
  }

  override update(_time: number, delta: number): void {
    const clamped = Math.min(100, Math.max(0, delta));
    this.sparks?.update(clamped);
    if (!this.started || this.leaving) return;
    if (!this.player) return;
    this.handleEvents(this.player.tick(clamped));
  }

  protected content(): void {
    Column({ width: 'fill', height: 'fill', padding: 24 }, () => {
      Row({ width: 'fill', justifyContent: 'end', alignItems: 'center' }, () => {
        Button('跳过', {
          variant: 'ghost',
          size: 'sm',
          onClick: () => this.skip(),
        });
      });
    });
  }

  protected override onBack(): boolean {
    if (this.leaving) return true;
    this.finish('title');
    return true;
  }

  private resetState(): void {
    this.player = null;
    this.backdrop = null;
    this.sparks = null;
    this.meteor = null;
    this.war = null;
    this.card = null;
    this.mainText = null;
    this.caption = null;
    this.hint = null;
    this.startTimer = null;
    this.hintTween = null;
    this.captionTween = null;
    this.cueImageKey = null;
    this.currentCueIndex = -1;
    this.started = false;
    this.leaving = false;
  }

  private startSequence(): void {
    this.player = new ProloguePlayer(PROLOGUE_CUES);
    this.started = true;
    this.handleEvents(this.player.start());
  }

  private handleEvents(events: readonly PrologueEvent[]): void {
    for (const event of events) {
      if (this.leaving) return;
      switch (event.type) {
        case 'enter':
          this.enterCue(event.cueIndex);
          break;
        case 'type':
          this.typeCue(event);
          break;
        case 'leave':
          this.leaveCue();
          break;
        case 'await-continue':
          this.showContinue();
          break;
        case 'complete':
          this.finish('placeholder');
          break;
      }
    }
  }

  private enterCue(index: number): void {
    const cue = this.player?.cue;
    if (!cue) return;

    const firstCue = this.currentCueIndex < 0;
    const imageChanged = this.cueImageKey !== cue.image;
    this.currentCueIndex = index;
    this.cueImageKey = cue.image;

    if (imageChanged) {
      this.backdrop?.show(cue.image, this.reduced ? 220 : 900);
      if (!firstCue) {
        flashScreen(this, { reduced: this.reduced, alpha: 0.34, duration: 440 });
        if (cue.image === 'img.prologue.disaster') shakeScreen(this, this.reduced);
      }
    }

    if (cue.image === 'img.prologue.war') {
      this.war?.start();
    } else {
      this.war?.stop();
    }

    if (cue.caption) {
      this.showCaption(cue.caption);
    } else {
      this.hideCaption(0);
    }

    if (cue.kind === 'card') {
      this.hideMainText(0);
      this.card?.show(cue.lines);
      return;
    }

    this.card?.hide();
    this.hideContinue();
    this.configureMainText(cue);
    this.fadeIn(this.mainText, 420);

    if (cue.id === 'sky-meteor') {
      this.meteor?.play();
    }
  }

  private typeCue(event: Extract<PrologueEvent, { type: 'type' }>): void {
    const cue = this.player?.cue;
    if (!cue || cue.kind === 'card') return;
    const text = event.done ? cueText(cue) : event.text;
    if (this.mainText && this.mainText.text !== text) {
      this.mainText.setText(text);
    }
  }

  private leaveCue(): void {
    const cue: PrologueCue | undefined = this.player?.cue;
    if (cue?.kind === 'card') {
      this.card?.hide();
    } else {
      this.hideMainText(260);
    }
    this.hideCaption(260);
    this.war?.stop();

    if (this.meteor) {
      this.meteor.destroy();
      this.meteor = null;
    }
  }

  private configureMainText(cue: PrologueCue): void {
    const text = this.mainText;
    if (!text) return;
    text.setFontSize(cue.size ?? 38);
    text.setColor(cue.tone === 'gold' ? '#d8b76a' : '#f2efe6');
    text.setText('');
    text.setAlpha(0);
  }

  private showCaption(caption: string): void {
    const text = this.caption;
    if (!text) return;
    this.captionTween?.stop();
    text.setText(caption).setAlpha(0);
    this.captionTween = this.tweens.add({
      targets: text,
      alpha: 0.9,
      duration: this.reduced ? 180 : 600,
      ease: 'Sine.easeOut',
    });
  }

  private hideCaption(duration: number): void {
    const text = this.caption;
    this.captionTween?.stop();
    this.captionTween = null;
    if (!text) return;
    this.tweens.add({
      targets: text,
      alpha: 0,
      duration: this.reduced ? Math.min(160, duration) : duration,
      ease: 'Sine.easeInOut',
    });
  }

  private hideMainText(duration: number): void {
    if (!this.mainText) return;
    this.tweens.add({
      targets: this.mainText,
      alpha: 0,
      duration: this.reduced ? Math.min(160, duration) : duration,
      ease: 'Sine.easeInOut',
    });
  }

  private fadeIn(target: Phaser.GameObjects.Text | null, duration: number): void {
    if (!target) return;
    this.tweens.add({
      targets: target,
      alpha: 1,
      duration: this.reduced ? Math.min(180, duration) : duration,
      ease: 'Sine.easeOut',
    });
  }

  private showContinue(): void {
    const text = this.hint;
    if (!text) return;
    text.setText('点击继续').setAlpha(0.65);
    this.hintTween?.stop();
    this.hintTween = this.tweens.add({
      targets: text,
      alpha: 1,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private hideContinue(): void {
    this.hintTween?.stop();
    this.hintTween = null;
    this.hint?.setAlpha(0);
  }

  private onPointerDown(
    pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[],
  ): void {
    if (this.leaving || !this.started) return;
    if (currentlyOver.length > 0) return;
    const plan = getViewportPlan();
    // Compose 按钮的命中区偶尔不在 currentlyOver 里；右上角整块都当作「跳过」。
    if (pointer.worldX > plan.designWidth - 200 && pointer.worldY < 150) return;
    this.advance();
  }

  private onAdvanceKey(event: KeyboardEvent): void {
    if (this.leaving || !this.started) return;
    event.preventDefault();
    this.advance();
  }

  private advance(): void {
    if (!this.player || this.leaving) return;
    this.handleEvents(this.player.requestAdvance());
  }

  private skip(): void {
    if (this.leaving) return;
    audioDirector.playClick();
    this.finish('placeholder');
  }

  private finish(destination: 'title' | 'placeholder'): void {
    if (this.leaving) return;
    this.leaving = true;
    this.started = false;
    this.hideContinue();
    this.war?.stop();
    this.startTimer?.remove();
    this.startTimer = null;
    this.cameras.main.fadeOut(this.reduced ? 220 : 480, 5, 6, 10);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      void enterModule(this, destination);
    });
  }

  private onShutdown(): void {
    this.input.off('pointerdown', this.onPointerDown, this);
    this.input.keyboard?.off('keydown-SPACE', this.onAdvanceKey, this);
    this.startTimer?.remove();
    this.startTimer = null;
    this.hintTween?.stop();
    this.captionTween?.stop();
    this.war?.stop();
    this.player = null;
    this.started = false;
    this.leaving = false;
  }
}
