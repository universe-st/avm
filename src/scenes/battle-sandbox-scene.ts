import { SCENE_KEYS } from '../app/scene-keys';
import { UIScene } from '@phaser-mvvm/phaser';
import { Button, Column, Divider, Panel, Row, Text } from '@phaser-mvvm/widgets/compose';
import { enterModule } from '../app/director';
import { applyCamera, getViewportPlan } from '../app/viewport';
import { audioDirector } from '../audio/audio-director';
import { findStage, type BattleStageDef } from '../dev/stage-catalog';
import { launchStage } from '../dev/stage-runner';
import { hashSeed, mulberry32 } from '../dev/random';
import {
  createStageContext,
  isStageLaunchContext,
  stageIntParam,
  stageParam,
  type StageLaunchContext,
} from '../dev/stage-types';
import { addStaticStarfield } from '../ui/cinematic';
import { addScrims } from '../ui/background';

const FALLBACK_BATTLE_ID = 'battle.sandbox';
const DEFAULT_ENEMIES = ['miner.mask', 'miner.core', 'miner.elite'] as const;

/**
 * 战斗舞台的「契约沙盒」。
 *
 * 这里不实现战斗玩法——它只证明三件事：战斗舞台能被单独启动、能收到 seed/params、
 * 能在不写存档的前提下返回标题。真实战斗接入后新增 `battle.<chapter>.<encounter>` 条目，
 * 把 `sceneKey` 指向战斗场景即可；本沙盒继续作为回归入口保留。
 */
export class BattleSandboxScene extends UIScene {
  private stageDef: BattleStageDef | null = null;
  private context: StageLaunchContext | null = null;
  private enemyIds: readonly string[] = DEFAULT_ENEMIES;
  private turns = 10;
  private seed = 1;

  constructor() {
    super(SCENE_KEYS.battleSandbox);
  }

  init(data: unknown): void {
    const found =
      data !== null && typeof data === 'object' && 'stageId' in data
        ? findStage(String((data as { stageId: unknown }).stageId))
        : undefined;
    const stage = found?.kind === 'battle' ? found : findStage(FALLBACK_BATTLE_ID);
    if (!stage || stage.kind !== 'battle') {
      throw new Error('BattleSandboxScene: 舞台目录缺少 battle.sandbox');
    }
    this.stageDef = stage;

    this.context = isStageLaunchContext(data)
      ? createStageContext(stage, {
          seed: data.seed,
          skip: data.skip,
          frame: data.frame,
          params: data.params,
          origin: data.origin,
        })
      : createStageContext(stage, { origin: 'code' });
    this.seed = this.context.seed;

    const rawEnemies = stageParam(this.context, 'enemies');
    const enemies = (rawEnemies ? rawEnemies.split(',') : [...DEFAULT_ENEMIES])
      .map((id) => id.trim().slice(0, 48))
      .filter((id) => id.length > 0)
      .slice(0, 12);
    this.enemyIds = enemies.length > 0 ? enemies : [...DEFAULT_ENEMIES];
    this.turns = stageIntParam(this.context, 'turns', 10, 1, 99);
  }

  override create(): void {
    applyCamera(this);
    this.cameras.main.setBackgroundColor('#05060a');
    addStaticStarfield(this);
    addScrims(this);
    this.drawEnemies();
    super.create();
    this.cameras.main.fadeIn(this.context?.skip === true ? 100 : 320, 5, 6, 10);
  }

  protected content(): void {
    const stage = this.stageDef;
    if (!stage) return;

    Column(
      {
        width: 'fill',
        height: 'fill',
        padding: 32,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
      },
      () => {
        Text('BATTLE STAGE · CONTRACT', {
          size: 'sm',
          tone: 'primary',
          align: 'center',
        });
        Panel({ width: 660, padding: 28, gap: 12, variant: 'surface' }, () => {
          Text('战斗舞台 · 接口自检', { size: 'xl', align: 'center' });
          Text(stage.description ?? '', { size: 'sm', tone: 'muted', align: 'center' });
          Divider({});
          Text(`舞台  ${stage.id}`, { size: 'sm', tone: 'muted' });
          Text(
            `seed  ${this.seed}   ·   enemies  ${this.enemyIds.length}   ·   turns  ${this.turns}`,
            { size: 'sm' },
          );
          Text(`敌人  ${this.enemyIds.join('、')}`, { size: 'sm', tone: 'muted' });
          Text('验收契约', { size: 'md' });
          Text(
            '· init(data) 接收 seed / params\n' +
              '· 同一 seed + params 得到同一开局\n' +
              '· 预览模式不写存档、不改进度\n' +
              '· 不需要打赢也能返回标题\n' +
              '· 资源只走 bundle，不出现 this.load',
            { size: 'sm', tone: 'muted' },
          );
          Row({ width: 'fill', gap: 10, justifyContent: 'center', alignItems: 'center' }, () => {
            Button('换一个 seed', {
              variant: 'secondary',
              size: 'md',
              onClick: () => {
                audioDirector.playClick();
                const context = this.context;
                if (!context || !this.stageDef) return;
                // 走舞台启动器而不是 scene.restart：HUD 和 __AVM__.stages.current() 才能同步新 seed。
                void launchStage(this.game, this.stageDef.id, {
                  seed: (context.seed + 1) >>> 0,
                  skip: context.skip,
                  params: context.params,
                  origin: 'hud',
                }).catch((error: unknown) => {
                  console.warn('[battle-sandbox] 重开失败', error);
                });
              },
            });
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

  /** 用 seed 画一排敌人剪影：换 seed 时剪影的配色/高度会变，证明确定性参数真的到了场景。 */
  private drawEnemies(): void {
    const plan = getViewportPlan();
    const random = mulberry32((this.seed ^ hashSeed('battle.sandbox')) >>> 0);
    const count = this.enemyIds.length;
    const unitWidth = 44;
    const gap = 16;
    const totalWidth = count * unitWidth + (count - 1) * gap;
    const startX = (plan.designWidth - totalWidth) / 2 + unitWidth / 2;
    const baseY = plan.designHeight * 0.19;

    const graphics = this.add.graphics().setDepth(1);
    for (let index = 0; index < count; index += 1) {
      const jitter = (random() - 0.5) * 18;
      const height = 50 + Math.round(random() * 26);
      const x = startX + index * (unitWidth + gap);
      const y = baseY + jitter;
      const shade = 0x11151f + Math.round(random() * 0x0c0c0c);

      graphics.fillStyle(shade, 1);
      graphics.fillRoundedRect(x - unitWidth / 2, y - height / 2, unitWidth, height, 4);
      graphics.lineStyle(1, 0x3a3428, 1);
      graphics.strokeRoundedRect(x - unitWidth / 2, y - height / 2, unitWidth, height, 4);
      graphics.fillStyle(0xc0392b, 0.9);
      graphics.fillCircle(x, y - height * 0.18, 2.5);
    }

    // 顶部一行 seed 色块：截图时能直观看到「同一 seed 同一画面」。
    const swatch = this.add.graphics().setDepth(1);
    const countSwatches = 24;
    const swatchWidth = 10;
    const swatchGap = 4;
    const swatchTotal = countSwatches * swatchWidth + (countSwatches - 1) * swatchGap;
    const swatchX = (plan.designWidth - swatchTotal) / 2;
    const swatchY = plan.designHeight * 0.105;
    const randomSwatch = mulberry32(this.seed >>> 0);
    for (let index = 0; index < countSwatches; index += 1) {
      const tint = randomSwatch();
      swatch.fillStyle(tint > 0.66 ? 0xd8b76a : tint > 0.33 ? 0x9b9486 : 0x3a3428, 0.85);
      swatch.fillRect(swatchX + index * (swatchWidth + swatchGap), swatchY, swatchWidth, 4);
    }
  }
}
