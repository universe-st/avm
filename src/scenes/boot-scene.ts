import Phaser from 'phaser';
import { applyCamera } from '../app/viewport';
import { assetService } from '../resource/asset-service';
import { enterModule } from '../app/director';

/**
 * 启动场景：只做三件事——拉起加载场景、等字体、进入标题。
 * 不在这里加载任何游戏资源，资源统一走 AssetService。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    applyCamera(this);
    this.scene.launch('loader');
    void this.start();
  }

  private async start(): Promise<void> {
    await assetService.whenReady();
    try {
      await document.fonts.ready;
    } catch {
      // 字体 API 不可用时照常启动，系统字兜底。
    }
    await enterModule(this, 'title');
  }
}
