#!/usr/bin/env node
/**
 * 一条命令构建 Android：
 *   1. vite build（sourcemap 默认关闭）
 *   2. dist → cordova/www
 *   3. 生成 build.json（release 时，密码只写本地文件）
 *   4. cordova build android（debug / release）
 *   5. 复制 APK 到 dist/android/，release 时用 apksigner 校验
 *
 * 环境：JAVA_HOME / ANDROID_HOME 未设置时用 macOS 默认路径兜底。
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
const release = process.argv.includes('--release');

const env = { ...process.env };
env.JAVA_HOME ||= '/opt/homebrew/opt/openjdk@21';
env.ANDROID_HOME ||= join(homedir(), 'Library/Android/sdk');
env.ANDROID_SDK_ROOT ||= env.ANDROID_HOME;
const buildTools = join(env.ANDROID_HOME, 'build-tools/36.0.0');
env.PATH = [
  join(env.ANDROID_HOME, 'platform-tools'),
  buildTools,
  join(env.JAVA_HOME, 'bin'),
  join(homedir(), '.local/bin'),
  '/opt/homebrew/bin',
  env.PATH ?? '',
].join(':');

const run = (command, args, cwd = ROOT) => {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd, env, stdio: 'inherit' });
};

run(join(ROOT, 'node_modules/.bin/vite'), ['build']);
run(process.execPath, [join(ROOT, 'tools/sync-cordova.mjs')]);

if (release) {
  run(process.execPath, [join(ROOT, 'tools/make-build-json.mjs')]);
  run('cordova', ['build', 'android', '--release', '--buildConfig', 'build.json'], join(ROOT, 'cordova'));
} else {
  run('cordova', ['build', 'android'], join(ROOT, 'cordova'));
}

const apk = join(
  ROOT,
  'cordova/platforms/android/app/build/outputs/apk',
  release ? 'release/app-release.apk' : 'debug/app-debug.apk',
);
if (!existsSync(apk)) {
  console.error(`[android] 找不到 APK：${apk}`);
  process.exit(1);
}

if (release) {
  run(join(buildTools, 'apksigner'), ['verify', '--print-certs', apk]);
}

const outDir = join(ROOT, 'dist/android');
mkdirSync(outDir, { recursive: true });
const suffix = release ? '' : '-debug';
const out = join(outDir, `assassins-vs-miners-${pkg.version}${suffix}.apk`);
copyFileSync(apk, out);
const mb = (statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`\n[android] APK → ${out.replace(`${ROOT}/`, '')} (${mb} MB)`);
