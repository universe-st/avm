#!/usr/bin/env node
/**
 * 资源清单校验（M0 版）：
 *  1. bundles.ts 里的 key 不能重复；
 *  2. 每个 url 必须真实存在；
 *  3. 未被任何 bundle 引用的文件给出 warning（允许，不失败）。
 *
 * 这是轻量正则版；等资源规模上来后再换成 AST/JSON 清单。
 */
import { readFileSync, existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const BUNDLES = join(ROOT, 'src/assets/bundles.ts');
const PUBLIC_DIR = join(ROOT, 'public');
const ASSETS_DIR = join(PUBLIC_DIR, 'assets');

const source = readFileSync(BUNDLES, 'utf-8');
const keys = [...source.matchAll(/\bkey:\s*'([^']+)'/g)].map((m) => m[1]);
const urls = [...source.matchAll(/\burl:\s*'([^']+)'/g)].map((m) => m[1]);

let failed = false;
const seen = new Map();
for (const key of keys) {
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  if (n > 1) {
    console.error(`[assets] duplicate key: ${key}`);
    failed = true;
  }
}

for (const url of urls) {
  if (!existsSync(join(PUBLIC_DIR, url))) {
    console.error(`[assets] missing file: ${url}`);
    failed = true;
  }
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(abs)));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

const referenced = new Set(urls);
for (const abs of await walk(ASSETS_DIR)) {
  const url = relative(PUBLIC_DIR, abs).split(sep).join('/');
  if (!referenced.has(url)) console.warn(`[assets] unreferenced: ${url}`);
}

console.log(`[assets] ${keys.length} key(s), ${urls.length} url(s) checked`);
if (failed) process.exit(1);
