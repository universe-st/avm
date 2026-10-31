import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string };

export default defineConfig({
  // Cordova 用 file:// / https://localhost 加载，必须是相对路径。
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    // 监听所有网卡，方便手机 / 同网段设备直连 http://<局域网 IP>:5173/
    host: true,
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'es2017',
    sourcemap: process.env.SOURCE_MAP === '1',
    assetsInlineLimit: 4096,
  },
});
