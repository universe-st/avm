#!/usr/bin/env node
/*
 * 场景生命周期冒烟（真浏览器，不是静态扫描）。
 *
 * 为什么需要它：`test/scene-lifecycle.test.ts` 只能证明「源码里接了线」，证明不了
 * 「这条线真的会被调用」——金殿的清理曾经写在场景子类 shutdown() 里，静态断言一直是绿的，
 * 但 Phaser 从不调用那个方法。这个脚本把两件最容易被静态护栏漏掉的事跑一遍：
 *
 *   A. 读档（= scene.restart）之后再看手机：CG 播完必须接回小白台词（不是自由行动）。
 *   B. 金殿离场：SHUTDOWN 里的清理必须真的执行（立绘/舞台框/世界层销毁、闩置为收尾）。
 *
 * 用法：
 *   pnpm smoke:lifecycle
 *   PORT=5299 CHROME_PATH=/path/to/chrome pnpm smoke:lifecycle
 *
 * 需要本机有 playwright-core（DSH profile 自带一份）与 Chromium；缺依赖会明确报错，不静默跳过。
 */
import { existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const DORM = 'ch01-dorm';
const PALACE = 'ch01-palace';

// ---------------------------------------------------------------- playwright-core

async function loadChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_CORE,
    join(process.env.HOME ?? '', '.dsh', 'profiles', 'desktop', 'node_modules', 'playwright-core', 'index.mjs'),
    'playwright-core',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const url = candidate.startsWith('/') ? pathToFileURL(candidate).href : candidate;
      const mod = await import(url);
      if (mod.chromium) return mod.chromium;
    } catch {
      /* 换下一个 */
    }
  }
  throw new Error(
    '找不到 playwright-core：设 PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs，或在本仓库装 devDependency。',
  );
}

/** Chromium 可执行文件：CHROME_PATH > playwright 缓存 > 系统路径。 */
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(process.env.HOME ?? '', 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) {
    const dirs = readdirSync(cache)
      .filter((name) => name.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const dir of dirs) {
      for (const app of ['chrome-mac-arm64', 'chrome-mac']) {
        const exe = join(cache, dir, app, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
        if (existsSync(exe)) return exe;
      }
    }
  }
  for (const exe of [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]) {
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

// ---------------------------------------------------------------- vite

async function waitForServer(url, timeoutMs = 40000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function startVite(port) {
  const child = spawn('pnpm', ['dev', '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  let log = '';
  child.stdout.on('data', (chunk) => (log += chunk.toString()));
  child.stderr.on('data', (chunk) => (log += chunk.toString()));
  const ready = await waitForServer(`http://127.0.0.1:${port}/`);
  if (!ready) {
    child.kill('SIGTERM');
    throw new Error(`vite 没起来（port ${port}）：\n${log.slice(-2000)}`);
  }
  return child;
}

function stopVite(child) {
  if (!child) return;
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM');
    else child.kill('SIGTERM');
  } catch {
    /* 已经退出 */
  }
}

// ---------------------------------------------------------------- 断言

class SmokeError extends Error {}

function assert(condition, message) {
  if (!condition) throw new SmokeError(message);
}

async function waitScene(page, key) {
  await page.waitForFunction(
    (k) => Boolean(window.__AVM__?.game?.scene.isActive(k)),
    key,
    { timeout: 30000 },
  );
}

/** 读寝室关键状态（preview 模式下只读，不写盘）。 */
const readDorm = () => {
  const s = window.__AVM__.game.scene.getScene('ch01-dorm');
  return {
    phase: s.flow ? s.flow.state.phase : null,
    objective: s.objective ? s.objective.value : null,
    cutscene: s.cutscene !== null,
    dialogueVisible: s.dialogueVisible.value === true,
    text: s.dialogueText.value,
    runId: s.lifecycle ? s.lifecycle.runId : null,
    closing: s.lifecycle ? s.lifecycle.shuttingDown : null,
  };
};

/** 读金殿清理结果（这些引用只会在 SHUTDOWN 收尾里被置空）。 */
const readPalace = () => {
  const p = window.__AVM__.game.scene.getScene('ch01-palace');
  return {
    active: p.scene.isActive(),
    portrait: p.portrait !== null,
    stageFrame: p.stageFrame !== null,
    worldRoot: p.worldRoot !== null,
    closing: p.lifecycle ? p.lifecycle.shuttingDown : null,
  };
};

// ---------------------------------------------------------------- 两个检查

async function checkDormRestart(page, base) {
  await page.goto(`${base}/?stage=scene.ch01.dorm&phase=explore&hud=0`, { waitUntil: 'load' });
  await waitScene(page, DORM);
  await page.waitForTimeout(1200);
  const before = await page.evaluate(readDorm);
  assert(before.phase === 'explore', `寝室没进 explore：${String(before.phase)}`);

  // 读档 = 同场景 scene.restart({restore})；这里用等价的最小 data，只为走重启路径。
  await page.evaluate(() => {
    window.__AVM__.game.scene.getScene('ch01-dorm').scene.restart({ resume: 'explore' });
  });
  await page.waitForTimeout(900);
  await page.waitForFunction(
    () => {
      const s = window.__AVM__.game.scene.getScene('ch01-dorm');
      return Boolean(s && s.flow && s.flow.state.phase === 'explore' && s.player);
    },
    null,
    { timeout: 15000 },
  );
  const afterRestart = await page.evaluate(readDorm);
  assert(afterRestart.runId !== before.runId, '重启后 runId 没有递增：生命周期闩没有换轮');
  assert(afterRestart.closing === false, '重启后场景仍处于收尾态：异步回调会被全部吞掉');

  // 直接走「手机节点」的同一段代码（真实流程里由走到手机旁按 E 触发）：
  // flow.interact('phone') → handleEvents → startPhoneCutscene。
  await page.evaluate(() => {
    const s = window.__AVM__.game.scene.getScene('ch01-dorm');
    s.flow.talkedZheng = true;
    s.handleEvents(s.flow.interact('phone'));
  });
  await page.waitForFunction(
    () => window.__AVM__.game.scene.getScene('ch01-dorm').cutscene !== null,
    null,
    { timeout: 8000 },
  );
  // 跳过 CG（等价于点「跳过」，走 finish('skipped') → onDone）。
  await page.evaluate(() => {
    const s = window.__AVM__.game.scene.getScene('ch01-dorm');
    if (s.cutscene) s.cutscene.destroy();
  });
  // 手机节点第一句（ch01-dorm 文案真值）。逐字面板按字距排版，中文字符之间会插全角空格，
  // 所以先去掉空白再比；同时要等逐字打完，不能只等「有字」。
  const expected = '你瘫坐在地上';
  try {
    await page.waitForFunction(
      (needle) => {
        const s = window.__AVM__.game.scene.getScene('ch01-dorm');
        if (s.dialogueVisible.value !== true) return false;
        return s.dialogueText.value.replace(/[\s\u3000]/g, '').includes(needle);
      },
      expected,
      { timeout: 10000 },
    );
  } catch {
    const state = await page.evaluate(readDorm);
    throw new SmokeError(
      `CG 之后没有接回小白剧情：对话框=${JSON.stringify(state.text.slice(0, 40))}，objective=${String(state.objective)}`,
    );
  }
  const afterCg = await page.evaluate(readDorm);
  assert(afterCg.phase === 'explore', 'CG 之后流程 phase 不对');
  return { beforeRunId: before.runId, afterRunId: afterRestart.runId, firstLine: afterCg.text.slice(0, 16) };
}

async function checkPalaceCleanup(page, base) {
  await page.goto(`${base}/?stage=scene.ch01.palace&phase=skip`, { waitUntil: 'load' });
  await waitScene(page, PALACE);
  await page.waitForTimeout(1500);
  const before = await page.evaluate(readPalace);
  assert(before.portrait && before.stageFrame && before.worldRoot, '金殿没有建起立绘/舞台框/世界层');

  await page.evaluate(() => {
    window.__AVM__.game.scene.getScene('ch01-palace').scene.start('title');
  });
  await waitScene(page, 'title');
  await page.waitForTimeout(400);
  const after = await page.evaluate(readPalace);
  assert(after.active === false, '金殿切走后仍在运行');
  assert(after.closing === true, 'SHUTDOWN 收尾没有执行：lifecycle.close() 没跑（死代码钩子？）');
  assert(!after.portrait && !after.stageFrame && !after.worldRoot, 'SHUTDOWN 收尾没有清掉立绘/舞台框/世界层');

  // 再进一次：新一轮必须复位（收尾态不能把下一次的演出也吞掉）。
  await page.goto(`${base}/?stage=scene.ch01.palace&phase=skip`, { waitUntil: 'load' });
  await waitScene(page, PALACE);
  await page.waitForTimeout(1200);
  const again = await page.evaluate(readPalace);
  assert(again.closing === false, '重进金殿后仍是收尾态：beginRun() 没有复位');
  assert(again.portrait && again.worldRoot, '重进金殿后没有重新建起立绘/世界层');
  return { cleanedAfterLeave: true, reopened: true };
}

// ---------------------------------------------------------------- main

async function main() {
  const chromium = await loadChromium();
  const port = Number(process.env.PORT ?? 5299);
  let vite = null;
  let browser = null;
  const results = [];
  try {
    vite = await startVite(port);
    const base = `http://127.0.0.1:${port}`;
    browser = await chromium.launch({
      executablePath: findChrome(),
      headless: true,
      args: ['--autoplay-policy=no-user-gesture-required'],
    });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(`[pageerror] ${error.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    const dorm = await checkDormRestart(page, base);
    results.push(['A 读档后手机 CG → 小白台词', true, JSON.stringify(dorm)]);
    const palace = await checkPalaceCleanup(page, base);
    results.push(['B 金殿离场清理 / 重进复位', true, JSON.stringify(palace)]);
    assert(errors.length === 0, `控制台有 error：${errors.slice(0, 3).join(' | ')}`);
    results.push(['C 控制台 0 error', true, '']);
  } catch (error) {
    results.push(['✗ 冒烟失败', false, error instanceof SmokeError ? error.message : String(error)]);
    process.exitCode = 1;
  } finally {
    await browser?.close().catch(() => {});
    stopVite(vite);
  }

  for (const [name, ok, detail] of results) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  }
}

await main();
