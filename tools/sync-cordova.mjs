#!/usr/bin/env node
/** 把 Vite 构建产物同步到 Cordova 的 www/（清空旧文件，保留目录）。 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIST = join(ROOT, 'dist');
const WWW = join(ROOT, 'cordova/www');

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('[android] dist/index.html 不存在，先跑 pnpm build');
  process.exit(1);
}

rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });
cpSync(DIST, WWW, { recursive: true });
console.log('[android] dist → cordova/www 完成');
