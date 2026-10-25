import Phaser from 'phaser';
import { SCENE_KEYS } from '../app/scene-keys';
import { ref } from '@phaser-mvvm/core';
import { UIScene } from '@phaser-mvvm/phaser';
import { Button, Column, Panel, Row, Text } from '@phaser-mvvm/widgets/compose';
import { enterModule } from '../app/director';
import { applyCamera, getViewportPlan } from '../app/viewport';
import { audioDirector } from '../audio/audio-director';
import { findStage, type CgStageDef } from '../dev/stage-catalog';
import {
  createStageContext,
  isStageLaunchContext,
  type StageLaunchContext,
} from '../dev/stage-types';
import { addScrims } from '../ui/background';

const FALLBACK_CG_ID = 'cg.prologue.sky';

/**
 * 通用 CG 查看器。
 *
 * 目录里所有 `kind: 'cg'` 的条目都由这个场景显示：全屏封面图 + 底部说明 + 帧翻页。
 * CG 本身不需要为预览写专门的场景，只要在 `stage-catalog.ts` 登记帧和 bundle。
 */
export class CgStageScene extends UIScene {
  private stageDef: CgStageDef | null = null;
  private context: StageLaunchContext | null = null;
  private frameIndex = 0;
  private image: Phaser.GameObjects.Image | null = null;

  private readonly caption = ref('');
  private readonly counter = ref('');

  constructor() {
    super(SCENE_KEYS.cgStage);
  }

  init(data: unknown): void {
    const found =
      data !== null && typeof data === 'object' && 'stageId' in data
        ? findStage(String((data as { stageId: unknown }).stageId))
        : undefined;
    const stage = found?.kind === 'cg' ? found : findStage(FALLBACK_CG_ID);
    if (!stage || stage.kind !== 'cg') {
      throw new Error('CgStageScene: 舞台目录缺少 cg.prologue.sky');
    }
    this.stageDef = stage;

    const rawFrame = isStageLaunchContext(data) ? data.frame : 0;
    this.context = isStageLaunchContext(data)
      ? createStageContext(stage, {
          seed: data.seed,
          skip: data.skip,
          frame: rawFrame,
          params: data.params,
          origin: data.origin,
        })
      : createStageContext(stage, { origin: 'code' });
    this.frameIndex = this.context.frame;
    this.image = null;
  }

  override create(): void {
    applyCamera(this);
    this.cameras.main.setBackgroundColor('#05060a');

    this.mountFrame(this.frameIndex, false);
    addScrims(this);
    super.create();
    this.cameras.main.fadeIn(this.context?.skip === true ? 100 : 360, 5, 6, 10);

    this.input.keyboard?.on('keydown-LEFT', this.handlePrev);
    this.input.keyboard?.on('keydown-RIGHT', this.handleNext);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.onShutdown, this);
  }

  protected content(): void {
    const stage = this.stageDef;
    if (!stage) return;
    const frames = stage.frames;

    Column(
      {
        width: 'fill',
        height: 'fill',
        padding: 32,
        justifyContent: 'end',
        alignItems: 'center',
      },
      () => {
        Panel({ width: 640, padding: 22, gap: 10, variant: 'surface' }, () => {
          Text(this.caption, { size: 'lg', align: 'center' });
          Text(this.counter, { size: 'sm', tone: 'muted', align: 'center' });
          Row({ width: 'fill', gap: 10, justifyContent: 'center', alignItems: 'center' }, () => {
            if (frames.length > 1) {
              Button('上一张', {
                variant: 'secondary',
                size: 'md',
                onClick: () => {
                  audioDirector.playClick();
                  this.showFrame(this.frameIndex - 1);
                },
              });
              Button('下一张', {
                variant: 'secondary',
                size: 'md',
                onClick: () => {
                  audioDirector.playClick();
                  this.showFrame(this.frameIndex + 1);
                },
              });
            }
            Button('返回标题', {
              variant: 'primary',
              size: 'md',
              onClick: () => {
                audioDirector.playClick();
                void enterModule(this, 'title');
              },
            });
          });
        });
      },
    );
  }

  protected override onBack(): boolean {
    void enterModule(this, 'title');
    return true;
  }

  private readonly handlePrev = (): void => {
    this.showFrame(this.frameIndex - 1);
  };

  private readonly handleNext = (): void => {
    this.showFrame(this.frameIndex + 1);
  };

  private mountFrame(index: number, animate: boolean): void {
    const stage = this.stageDef;
    if (!stage || stage.frames.length === 0) return;

    const total = stage.frames.length;
    const next = ((index % total) + total) % total;
    this.frameIndex = next;
    const frame = stage.frames[next];
    if (!frame) return;

    this.caption.value = frame.caption ?? stage.title;
    this.counter.value = `${next + 1} / ${total} · ${stage.id}`;

    if (!this.textures.exists(frame.key)) {
      console.warn(`[stage] CG 纹理缺失：${frame.key}`);
      this.image?.setVisible(false);
      return;
    }

    if (!this.image) {
      const plan = getViewportPlan();
      this.image = this.add
        .image(plan.designWidth / 2, plan.designHeight / 2, frame.key)
        .setOrigin(0.5)
        .setDepth(0)
        .setAlpha(animate ? 0 : 1);
    } else {
      this.image.setTexture(frame.key).setVisible(true);
      if (animate) this.image.setAlpha(0);
    }

    const plan = getViewportPlan();
    const cover = Math.max(plan.designWidth / this.image.width, plan.designHeight / this.image.height);
    this.image.setScale(cover);

    if (animate && this.context?.skip !== true) {
      this.tweens.add({
        targets: this.image,
        alpha: 1,
        duration: 220,
        ease: 'Sine.easeOut',
      });
    } else {
      this.image.setAlpha(1);
    }
  }

  private showFrame(index: number): void {
    this.mountFrame(index, true);
  }

  private onShutdown(): void {
    this.input.keyboard?.off('keydown-LEFT', this.handlePrev);
    this.input.keyboard?.off('keydown-RIGHT', this.handleNext);
    this.image = null;
    this.stageDef = null;
    this.context = null;
  }
}
