import Phaser from 'phaser';
import { applyCamera, getViewportPlan } from '../app/viewport';
import type { LoadState } from '../assets/types';
import { assetService } from './asset-service';

const FONT = '"PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
const GOLD = 0xd8b76a;
const PAPER = 0xf2efe6;
const MUTED = 0x9b9486;

/**
 * 常驻加载场景：不参与玩法，只负责在资源批次进行时把进度画出来。
 *
 * 用 Phaser 原生对象而不是 phaser-mvvm 控件——加载 UI 自己不能依赖任何待加载资源，
 * 否则「加载字体/图集才能显示加载条」会变成死锁。
 */
export class LoaderScene extends Phaser.Scene {
  private overlay!: Phaser.GameObjects.Container;
  private backdrop!: Phaser.GameObjects.Rectangle;
  private statusText!: Phaser.GameObjects.Text;
  private percentText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private barTrack!: Phaser.GameObjects.Rectangle;
  private barFill!: Phaser.GameObjects.Rectangle;
  private barWidth = 480;
  private overlayVisible = false;
  private shownAt = 0;
  private pendingShow: Phaser.Time.TimerEvent | null = null;
  private pendingHide: Phaser.Time.TimerEvent | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    super('loader');
  }

  create(): void {
    applyCamera(this);
    this.scene.bringToTop();
    assetService.attach(this);
    this.build();
    this.unsubscribe = assetService.onChange((state) => this.apply(state));
    this.apply(assetService.state.value);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
    });
  }

  private text(
    x: number,
    y: number,
    value: string,
    size: number,
    color: number,
    originX = 0,
  ): Phaser.GameObjects.Text {
    const obj = this.add
      .text(x, y, value, {
        fontFamily: FONT,
        fontSize: `${size}px`,
        color: `#${color.toString(16).padStart(6, '0')}`,
      })
      .setOrigin(originX, 0);
    obj.setResolution(getViewportPlan().scale);
    return obj;
  }

  private build(): void {
    const plan = getViewportPlan();
    const { designWidth: w, designHeight: h } = plan;

    this.overlay = this.add.container(0, 0).setDepth(10000);
    this.backdrop = this.add
      .rectangle(0, 0, w, h, 0x05060a, 0.97)
      .setOrigin(0, 0)
      .setInteractive();
    this.overlay.add(this.backdrop);

    // 星尘：纯 Graphics，零资源依赖。
    const stars = this.add.graphics();
    stars.fillStyle(0xdfe6ff, 0.55);
    for (let i = 0; i < 90; i += 1) {
      const x = (i * 137.3) % w;
      const y = (i * 293.7) % h;
      const r = i % 11 === 0 ? 1.6 : 1;
      stars.fillCircle(x, y, r);
    }
    this.overlay.add(stars);

    const glow = this.add.graphics();
    glow.fillStyle(0x8ea6ff, 0.05);
    glow.fillCircle(w / 2, h * 0.42, 230);
    glow.fillStyle(0xd8b76a, 0.04);
    glow.fillCircle(w / 2, h * 0.42, 150);
    this.overlay.add(glow);

    const title = this.text(w / 2, h * 0.32, '正在潜入梦域', 46, PAPER, 0.5).setOrigin(0.5, 0);
    this.overlay.add(title);

    const en = this.text(w / 2, h * 0.32 + 64, 'D I V I N G   I N T O   T H E   D R E A M', 18, MUTED, 0.5).setOrigin(0.5, 0);
    this.overlay.add(en);

    const barY = h * 0.52;
    this.barWidth = Math.min(480, w - 200);
    const barX = (w - this.barWidth) / 2;
    this.barTrack = this.add
      .rectangle(barX, barY, this.barWidth, 10, 0x2a2a33, 1)
      .setOrigin(0, 0.5);
    this.barFill = this.add.rectangle(barX, barY, this.barWidth, 10, GOLD, 1).setOrigin(0, 0.5);
    this.barFill.scaleX = 0;
    this.overlay.add(this.barTrack);
    this.overlay.add(this.barFill);

    this.statusText = this.text(barX, barY + 30, '准备中…', 24, MUTED);
    this.percentText = this.text(barX + this.barWidth, barY + 30, '0%', 24, GOLD, 1).setOrigin(1, 0);
    this.overlay.add(this.statusText);
    this.overlay.add(this.percentText);

    this.hintText = this.text(
      w / 2,
      h - 110,
      '梦域规则由梦主的认知决定 · 矿工的核心是暗红色节点',
      22,
      MUTED,
      0.5,
    ).setOrigin(0.5, 0);
    this.overlay.add(this.hintText);

    this.overlay.setAlpha(0).setVisible(false);
    this.backdrop.disableInteractive();
  }

  private apply(state: LoadState): void {
    if (state.phase === 'loading') {
      this.renderProgress(state);
      this.maybeShow(state);
      return;
    }
    if (state.phase === 'error') {
      this.renderProgress(state);
      this.showNow();
      this.statusText.setText(state.error ?? '资源加载失败');
      this.statusText.setColor('#e05a4e');
      this.percentText.setText('—');
      return;
    }
    if (state.phase === 'ready') {
      this.renderProgress(state);
      this.scheduleHide();
    }
  }

  private renderProgress(state: LoadState): void {
    const pct = Math.round(state.progress * 100);
    this.barFill.scaleX = Math.min(1, Math.max(0, state.progress));
    this.percentText.setText(`${pct}%`);
    const prefix = state.label ? `${state.label} · ` : '';
    this.statusText.setText(`${prefix}${state.currentLabel || '准备中…'}`);
    this.statusText.setColor('#9b9486');
  }

  private maybeShow(state: LoadState): void {
    if (state.show === 'never') return;
    if (this.overlayVisible || this.pendingShow) return;
    const delay = state.show === 'always' ? 0 : 120;
    this.pendingShow = this.time.delayedCall(delay, () => {
      this.pendingShow = null;
      this.showNow();
    });
  }

  private showNow(): void {
    this.pendingShow?.remove();
    this.pendingShow = null;
    this.pendingHide?.remove();
    this.pendingHide = null;
    this.tweens.killTweensOf(this.overlay);

    if (!this.overlayVisible) {
      this.overlayVisible = true;
      this.overlay.setVisible(true).setAlpha(0);
      this.backdrop.setInteractive();
      this.shownAt = performance.now();
      this.tweens.add({ targets: this.overlay, alpha: 1, duration: 150 });
    }
  }

  private scheduleHide(): void {
    // 加载在 120ms 的「延迟显示」窗口内就完成了：把待显示的定时器取消，不要闪一下。
    this.pendingShow?.remove();
    this.pendingShow = null;
    if (!this.overlayVisible) return;
    this.pendingHide?.remove();
    const elapsed = performance.now() - this.shownAt;
    const wait = Math.max(0, 420 - elapsed) + 120;
    this.pendingHide = this.time.delayedCall(wait, () => {
      this.pendingHide = null;
      this.hideNow();
    });
  }

  private hideNow(): void {
    if (!this.overlayVisible) return;
    this.tweens.killTweensOf(this.overlay);
    this.tweens.add({
      targets: this.overlay,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        this.overlay.setVisible(false);
        this.backdrop.disableInteractive();
        this.overlayVisible = false;
      },
    });
  }
}
