import Phaser from 'phaser';

/**
 * 像素纹理统一用 NEAREST；只对 2× 导出的像素素材调用。
 * UI 文本/光效保持 LINEAR。
 */
export function setPixelTexture(scene: Phaser.Scene, key: string): void {
  if (!scene.textures.exists(key)) return;
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

export function setPixelTextures(scene: Phaser.Scene, keys: readonly string[]): void {
  for (const key of keys) setPixelTexture(scene, key);
}

/** Q 版/HD 素材按 LINEAR 采样，避免非整数缩放时锯齿。 */
export function setLinearTextures(scene: Phaser.Scene, keys: readonly string[]): void {
  for (const key of keys) {
    if (!scene.textures.exists(key)) continue;
    scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
  }
}
