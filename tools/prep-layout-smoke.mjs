#!/usr/bin/env node
/*
 * 准备阶段构图的冒烟（真浏览器，不是静态扫描）。
 *
 * 为什么需要它：2026-11-28 用户报「按正常流程走到进入御膳房前的自由活动，和读档到这里，
 * 小白站的位置不一样」。根因是场景用了个「离锚点超过 180px 才挪」的距离启发式，
 * 而黑场收尾的补间会在进入 prep 之后继续把小白拉回旧构图；玩家恰好在书桌旁存档时，
 * 读档回来的锚点又离手机位置「不够远」，她干脆留在书桌上。
 *
 * 这个脚本把三条路真跑一遍，只比较**相对主角的偏移**（读档会带着玩家的位置）：
 *   A. 正式流程：标题「继续游戏」→ 检查点 dorm.after → 战后段 → prep；
 *   B. 在 A 的位置存档 → 读档 → 回到 prep；
 *   C. 先走到书桌旁（旧代码会把她留在手机位置）再存档 → 读档。
 * A / B / C 的小白横向偏移必须完全一致，纵向一致到浮动幅度内（±8px）。
 *
 * 用法：
 *   pnpm smoke:prep-layout
 *   PORT=5396 CHROME_PATH=/path/to/chrome pnpm smoke:prep-layout
 *
 * 需要本机有 playwright-core（DSH profile 自带一份）与 Chromium；缺依赖会明确报错，不静默跳过。
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const DORM = 'ch01-dorm';
/** 小白浮动 tween 的振幅（`startXiaobaiBob` 里 y → baseY-8）。 */
const BOB_AMPLITUDE = 8;
/** 横向下标必须完全一致（只有纵向在浮动）。 */
const X_TOLERANCE = 0.5;
const Y_TOLERANCE = BOB_AMPLITUDE + 1.5;

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
  throw new Error('找不到 playwright-core：设 PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs');
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = join(process.env.HOME ?? '', 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((n) => n.startsWith('chromium-')).sort().reverse()) {
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
  if (!(await waitForServer(`http://127.0.0.1:${port}/`))) {
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 读 prep 的构图。偏移按「小白 − 玩家脚底」算，这样 A/B/C 三条路的玩家位置不同也能比。
 */
const readPrep = () => {
  const s = window.__AVM__.game.scene.getScene('ch01-dorm');
  if (!s || !s.player || !s.xiaobai) return { ready: false };
  const phase = s.flow ? s.flow.state.phase : null;
  return {
    ready: true,
    phase,
    dialogue: s.dialogue !== null,
    promptVisible: s.promptText ? s.promptText.visible === true : false,
    xiaobai: { x: s.xiaobai.x, y: s.xiaobai.y, visible: s.xiaobai.visible === true },
    player: { x: s.player.position.x, y: s.player.position.y },
    dx: s.xiaobai.x - s.player.position.x,
    dy: s.xiaobai.y - s.player.position.y,
  };
};

async function waitDormPrep(page, timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const s = await page.evaluate(readPrep);
    if (s.ready && s.phase === 'prep' && s.dialogue === false) return s;
    await sleep(120);
  }
  throw new SmokeError(`没有落到 prep：${JSON.stringify(await page.evaluate(readPrep))}`);
}

/** 战后段里点对话；遇到提问菜单直接选收尾项（等价于「三个都问完」）。 */
async function driveToPrep(page, limit = 900) {
  for (let i = 0; i < limit; i += 1) {
    const s = await page.evaluate(readPrep);
    if (s.ready && s.phase === 'prep' && s.dialogue === false) return s;
    if (!s.ready) {
      await sleep(150);
      continue;
    }
    const choice = await page.evaluate(() => {
      const scene = window.__AVM__.game.scene.getScene('ch01-dorm');
      if (scene.choiceActive && scene.choiceActive.value === true) {
        scene.choiceModal?.close?.();
        scene.choiceActive.value = false;
        scene.onInquiryPicked('closing');
        return true;
      }
      return false;
    });
    if (choice) {
      await sleep(150);
      continue;
    }
    const talking = await page.evaluate(() => {
      const scene = window.__AVM__.game.scene.getScene('ch01-dorm');
      return scene.dialogue !== null;
    });
    if (talking) await page.mouse.click(195, 560);
    await sleep(110);
  }
  throw new SmokeError(`战后段没有走到 prep（点了 ${limit} 次）`);
}

/** 存档 → 读档（同场景 restart）→ 等回到 prep。 */
async function saveAndReload(page, slot) {
  const saved = await page.evaluate((s) => {
    const scene = window.__AVM__.game.scene.getScene('ch01-dorm');
    return scene.saveToSlot(s);
  }, slot);
  assert(saved?.ok === true, `存档失败：${JSON.stringify(saved)}`);
  await page.evaluate((s) => {
    const scene = window.__AVM__.game.scene.getScene('ch01-dorm');
    const raw = window.localStorage.getItem(`avm.save.v1.slot${s}`);
    if (!raw) throw new Error(`槽 ${s} 没有写进去`);
    void scene.loadSave(JSON.parse(raw));
  }, slot);
  const restored = await waitDormPrep(page, 25000);
  // 落位有 260ms 滑行（reduced 下为 0），等它和浮动一起稳定下来。
  await sleep(900);
  const settled = await page.evaluate(readPrep);
  await page.evaluate((s) => {
    try {
      window.localStorage.removeItem(`avm.save.v1.slot${s}`);
    } catch {
      /* ignore */
    }
  }, slot);
  return { saved, restored, settled };
}

function assertSameComposition(label, a, b) {
  assert(
    Math.abs(a.dx - b.dx) <= X_TOLERANCE,
    `${label}：小白横向偏移不一致（A ${a.dx.toFixed(1)}px vs ${b.dx.toFixed(1)}px）`,
  );
  assert(
    Math.abs(a.dy - b.dy) <= Y_TOLERANCE,
    `${label}：小白纵向偏移不一致（A ${a.dy.toFixed(1)}px vs ${b.dy.toFixed(1)}px）`,
  );
}

function assertPrepComposition(label, s) {
  assert(s.phase === 'prep', `${label}：没在 prep（${String(s.phase)}）`);
  assert(s.xiaobai.visible === true, `${label}：小白不可见`);
  assert(s.promptVisible === true, `${label}：交互提示没出现`);
  assert(s.dx > 0 && s.dx < 120, `${label}：小白不在主角右侧（dx=${s.dx.toFixed(1)}）`);
  // 头部中线在脚底上方 190px（CH01_STAND_HEAD_CENTER_OFFSET），浮动再抬 8px。
  assert(
    s.dy < -140 && s.dy > -260,
    `${label}：小白不在头部高度（dy=${s.dy.toFixed(1)}，可能是停在手机/书桌那种旧构图）`,
  );
}

// ---------------------------------------------------------------- 主流程

async function main() {
  const shotDir = join(ROOT, '.evidence', 'docs', 'screenshots', '2026-11-28-prep-xiaobai');
  mkdirSync(shotDir, { recursive: true });
  const port = Number(process.env.PORT ?? 5396);
  const base = `http://127.0.0.1:${port}`;
  const chromium = await loadChromium();
  const vite = await startVite(port);
  let browser;
  try {
    browser = await chromium.launch({ executablePath: findChrome(), headless: true });
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    await context.addInitScript(() => {
      // 直接落检查点「战后 · 小白的征召」，等于标题「继续游戏」的那条路。
      localStorage.setItem(
        'avm.progress.v1',
        JSON.stringify({ version: 1, chapter: 'ch01', checkpoint: 'dorm.after', updatedAt: Date.now() }),
      );
      localStorage.removeItem('avm.save.v1.slot3');
    });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => Boolean(window.__AVM__?.game?.scene.isActive('title')), null, { timeout: 30000 });
    await sleep(2500);
    // 标题按钮列固定居中：390×844 下「继续游戏」在 (195, 570)。
    await page.mouse.click(195, 570);
    await page.waitForFunction(
      () => Boolean(window.__AVM__?.game?.scene.isActive('ch01-dorm')),
      null,
      { timeout: 30000 },
    );
    await page.waitForFunction(
      () => {
        const s = window.__AVM__.game.scene.getScene('ch01-dorm');
        return Boolean(s && s.flow && s.player && s.dialogue);
      },
      null,
      { timeout: 20000 },
    );

    // A. 正式流程 → prep
    await driveToPrep(page);
    await sleep(900);
    const normal = await page.evaluate(readPrep);
    assertPrepComposition('A 正式流程', normal);
    await page.screenshot({ path: join(shotDir, 'smoke-A-normal.png') });

    // B. 原地存档 → 读档
    const b = await saveAndReload(page, 3);
    assertPrepComposition('B 读档（原地）', b.settled);
    assertSameComposition('A vs B', normal, b.settled);
    await page.screenshot({ path: join(shotDir, 'smoke-B-loaded.png') });

    // C. 走到书桌旁再存档 → 读档（旧代码会把她留在手机位置）
    await page.keyboard.down('ArrowUp');
    const walkStarted = Date.now();
    let walked = await page.evaluate(readPrep);
    while (Date.now() - walkStarted < 4000) {
      walked = await page.evaluate(readPrep);
      if (walked.ready && walked.player.y < 470) break;
      await sleep(80);
    }
    await page.keyboard.up('ArrowUp');
    await sleep(400);
    walked = await page.evaluate(readPrep);
    assert(
      walked.player.y < 520,
      `C 准备：没有走到书桌旁（player.y=${walked.player.y.toFixed(1)}），这条用例没覆盖到`,
    );
    const c = await saveAndReload(page, 3);
    assertPrepComposition('C 读档（书桌旁）', c.settled);
    assert(
      Math.abs(c.settled.player.y - walked.player.y) < 2,
      `C：读档没有回到存档位置（存档 y=${walked.player.y.toFixed(1)}，回来 y=${c.settled.player.y.toFixed(1)}）`,
    );
    assertSameComposition('A vs C', normal, c.settled);
    await page.screenshot({ path: join(shotDir, 'smoke-C-desk.png') });

    assert(errors.length === 0, `console error ${errors.length} 条：${errors.slice(0, 3).join(' | ')}`);
    console.log(
      JSON.stringify(
        {
          A: { player: normal.player, dx: normal.dx, dy: normal.dy },
          B: { player: b.settled.player, dx: b.settled.dx, dy: b.settled.dy },
          C: { player: c.settled.player, dx: c.settled.dx, dy: c.settled.dy },
        },
        null,
        2,
      ),
    );
    console.log('PASS');
  } finally {
    await browser?.close();
    stopVite(vite);
  }
}

main().catch((error) => {
  console.error(error instanceof SmokeError ? `\nFAIL：${error.message}` : error);
  process.exit(1);
});
