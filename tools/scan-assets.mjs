#!/usr/bin/env node
/**
 * 扫描 public/assets → src/assets/catalog.gen.json
 *
 * 只做一件事：把磁盘上的真实文件与字节数记下来，供资源管理器算权重、CI 算体积。
 * 资源清单的「真值」是 src/assets/bundles.ts；这个文件是派生产物。
 */
import { readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const PUBLIC_DIR = join(ROOT, 'public');
const ASSETS_DIR = join(PUBLIC_DIR, 'assets');
const OUT = join(ROOT, 'src/assets/catalog.gen.json');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(abs)));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

const files = (await walk(ASSETS_DIR)).sort();
const catalog = {};
for (const abs of files) {
  const url = relative(PUBLIC_DIR, abs).split(sep).join('/');
  const info = await stat(abs);
  catalog[url] = { bytes: info.size, mtimeMs: Math.round(info.mtimeMs) };
}

await mkdir(join(ROOT, 'src/assets'), { recursive: true });
await writeFile(OUT, `${JSON.stringify(catalog, null, 2)}\n`, 'utf-8');
console.log(`[assets] ${files.length} file(s) → ${relative(ROOT, OUT)}`);
