import Phaser from 'phaser';
import { SCENE_KEYS } from '../app/scene-keys';
import { applyCamera } from '../app/viewport';
import { assetService } from '../resource/asset-service';
import { enterModule } from '../app/director';
import { showStageToast } from '../dev/stage-hud';
import { stageQueryToRunOptions, parseStageQuery } from '../dev/stage-query';
import { launchStage } from '../dev/stage-runner';

/**
 * 启动场景：拉起加载场景、等字体，然后二选一：
 * - 正常启动 → 标题；
 * - 带 `?stage=` → 直接启动对应舞台（验收后门，见 docs/STAGE-PREVIEW.md）。
 *
 * 不在这里加载任何游戏资源，资源统一走 AssetService。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot);
  }

  create(): void {
    applyCamera(this);
    this.scene.launch(SCENE_KEYS.loader);
    void this.start();
  }

  private async start(): Promise<void> {
    await assetService.whenReady();
    try {
      await document.fonts.ready;
    } catch {
      // 字体 API 不可用时照常启动，系统字兜底。
    }

    const query = parseStageQuery(window.location.search);
    if (query.error) {
      console.warn(`[stage] ${query.error}`);
      showStageToast(query.error, 'error');
    }

    if (query.request) {
      try {
        const options = stageQueryToRunOptions(query.request);
        await launchStage(this.game, query.request.stageId, options);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[stage] 直接启动失败：${message}`);
        showStageToast(`舞台预览失败：${message}`, 'error');
      }
    }

    await enterModule(this, 'title');
  }
}
