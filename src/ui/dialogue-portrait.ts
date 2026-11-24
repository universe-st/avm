import Phaser from 'phaser';
import type { DialogueLine } from '../story/dialogue';
import { reducePortraitForLine, type SpeakerPortrait } from '../story/portraits';
import { PortraitLayer } from './portrait-layer';

/** 一句台词里能影响立绘的字段（场景只把 `DialogueLine` 的子集交给它）。 */
export type PortraitLine = Pick<
  DialogueLine,
  'speaker' | 'role' | 'cg' | 'blackout' | 'dark'
>;

/**
 * 对话里的「谁说话谁上脸」表现层（寝室 / 御膳房 / 战斗共用）。
 *
 * 金殿过场有自己的 act 拍（`portrait` / `portraitHide`）与逐步对位归约，保持不变；
 * 其它场景没有手动拍，只需要在每句台词显示时调用 {@link alignForLine}：
 * 归约函数（`src/story/portraits.ts`）决定换脸/收脸/保持，本类只负责让贴图入场、呼吸、退场。
 *
 * 生命周期：`create()` 里 new，SHUTDOWN 里 `destroy()`；对话结束/跳过一律 `hide()`，
 * 否则最后一张脸会挂在探索画面上。
 */
export class DialoguePortrait {
  private readonly scene: Phaser.Scene;
  private readonly layer: PortraitLayer;
  private current: SpeakerPortrait | null = null;

  constructor(scene: Phaser.Scene, reduced: boolean) {
    this.scene = scene;
    this.layer = new PortraitLayer(scene, reduced);
  }

  /** 当前屏幕上挂着的立绘（调试/验收用）。 */
  get currentKey(): string | null {
    return this.current?.key ?? null;
  }

  /** 每句台词显示时调用一次：换人换脸、旁白保持、CG/黑场收脸。 */
  alignForLine(line: PortraitLine): void {
    const step = reducePortraitForLine(line, this.current);
    if (step.action === 'keep') return;
    if (step.action === 'hide') {
      this.hide();
      return;
    }
    if (!this.scene.textures.exists(step.key)) {
      // 包漏了图属于接线错误：宁可空着，也不让上一张脸冒充说话人。
      console.warn(`[dialogue-portrait] 缺少立绘纹理：${step.key}`);
      this.hide();
      return;
    }
    this.layer.show(step.key, step.side, { soft: step.soft === true });
    this.current = { key: step.key, side: step.side };
  }

  hide(ms = 180): void {
    this.current = null;
    this.layer.hide(ms);
  }

  destroy(): void {
    this.current = null;
    this.layer.destroy();
  }
}
