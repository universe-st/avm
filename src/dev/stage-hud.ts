import { listStages } from './stage-catalog';
import type { StageDef } from './stage-types';
import { STAGE_KIND_LABEL, type StageKind } from './stage-types';

/**
 * 预览 HUD：只在通过 `?stage=` / 控制台 / 目录启动舞台时出现。
 *
 * 用 DOM 而不是 Phaser UI，原因：
 * - 它必须覆盖任意场景，包括还没接入 UIScene 的战斗；
 * - 它是测试工具，不应该占用游戏的设计空间、相机或输入焦点；
 * - DOM 按钮在 Android WebView 里也能点，无需开 devtools。
 *
 * 根节点 pointer-events: none，只有顶部胶囊和目录面板接收点击，避免挡住游戏。
 */

interface StageHudHandlers {
  readonly onSelect: (stageId: string) => void;
  readonly onRestart: () => void;
  readonly onTitle: () => void;
}

export interface StageHudOptions extends StageHudHandlers {
  readonly stage: StageDef;
}

type DiagramFilter = StageKind | 'all';

const STYLE_ID = 'avm-stage-hud-style';
const ROOT_ID = 'avm-stage-hud';
const TOAST_ID = 'avm-stage-toast';

let root: HTMLDivElement | null = null;
let bar: HTMLDivElement | null = null;
let pillKind: HTMLSpanElement | null = null;
let pillId: HTMLSpanElement | null = null;
let showButton: HTMLButtonElement | null = null;
let backdrop: HTMLDivElement | null = null;
let panel: HTMLDivElement | null = null;
let listBox: HTMLDivElement | null = null;
let countLabel: HTMLSpanElement | null = null;
let filterInput: HTMLInputElement | null = null;
let tabs: readonly HTMLButtonElement[] = [];

let handlers: StageHudHandlers | null = null;
let currentStage: StageDef | null = null;
let hidden = false;
let panelOpen = false;
let kindFilter: DiagramFilter = 'all';
let textFilter = '';
let keydownHandler: ((event: KeyboardEvent) => void) | null = null;
let toast: HTMLDivElement | null = null;
let toastTimer: number | null = null;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#${ROOT_ID}, #${TOAST_ID} { box-sizing: border-box; }
#${ROOT_ID} * { box-sizing: border-box; }
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 2147483000; pointer-events: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "PingFang SC", monospace;
  color: #f2efe6; font-size: 12px; line-height: 1.35;
  -webkit-font-smoothing: antialiased;
}
#${ROOT_ID} button, #${ROOT_ID} input { font: inherit; color: inherit; }
#${ROOT_ID} button { cursor: pointer; }
#${ROOT_ID} [hidden] { display: none !important; }
.avm-stage-bar {
  position: absolute; top: calc(6px + env(safe-area-inset-top, 0px)); left: 50%;
  transform: translateX(-50%); display: flex; align-items: center; gap: 3px;
  max-width: calc(100vw - 12px); padding: 3px; pointer-events: auto;
  background: rgba(5, 6, 10, 0.82); border: 1px solid rgba(216, 183, 106, 0.55);
  border-radius: 999px; backdrop-filter: blur(8px); box-shadow: 0 6px 24px rgba(0,0,0,.45);
}
.avm-stage-pill {
  display: flex; align-items: center; gap: 6px; min-width: 0; max-width: 190px;
  height: 28px; padding: 0 7px; border: 0; border-radius: 999px; background: transparent;
  color: #d8b76a; white-space: nowrap;
}
.avm-stage-pill:hover { background: rgba(216, 183, 106, 0.12); }
.avm-stage-dot { width: 6px; height: 6px; border-radius: 50%; background: #d8b76a; flex: none; }
.avm-stage-kind { font-size: 10px; letter-spacing: .08em; color: #d8b76a; flex: none; }
.avm-stage-id { overflow: hidden; text-overflow: ellipsis; color: #f2efe6; font-size: 11px; }
.avm-stage-actions { display: flex; align-items: center; gap: 2px; }
.avm-stage-actions button, .avm-stage-close {
  height: 28px; padding: 0 7px; border: 0; border-radius: 999px; background: transparent;
  color: #9b9486; white-space: nowrap;
}
.avm-stage-actions button:hover, .avm-stage-close:hover { background: rgba(242, 239, 230, 0.1); color: #f2efe6; }
.avm-stage-show {
  position: absolute; top: calc(8px + env(safe-area-inset-top, 0px)); left: 50%;
  transform: translateX(-50%); width: 32px; height: 28px; pointer-events: auto;
  border: 1px solid rgba(216, 183, 106, 0.5); border-radius: 999px;
  background: rgba(5, 6, 10, 0.75); color: #d8b76a;
}
.avm-stage-backdrop {
  position: absolute; inset: 0; pointer-events: auto; background: rgba(0, 0, 0, 0.58);
  backdrop-filter: blur(2px);
}
.avm-stage-panel {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: min(560px, calc(100vw - 20px)); max-height: min(78vh, 760px);
  display: flex; flex-direction: column; pointer-events: auto; overflow: hidden;
  background: rgba(8, 10, 16, 0.97); border: 1px solid rgba(216, 183, 106, 0.55);
  border-radius: 6px; box-shadow: 0 20px 70px rgba(0, 0, 0, 0.7);
}
.avm-stage-head {
  display: flex; align-items: center; gap: 10px; padding: 12px 14px;
  border-bottom: 1px solid rgba(216, 183, 106, 0.22);
}
.avm-stage-head strong { color: #d8b76a; font-size: 14px; letter-spacing: .08em; }
.avm-stage-head .avm-stage-hint { color: #6f6a5f; font-size: 10px; margin-left: auto; }
.avm-stage-close { font-size: 16px; line-height: 1; }
.avm-stage-tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 10px 14px 0; }
.avm-stage-tab {
  height: 26px; padding: 0 10px; border: 1px solid rgba(216, 183, 106, 0.22);
  border-radius: 999px; background: transparent; color: #9b9486;
}
.avm-stage-tab[data-active="true"] {
  border-color: rgba(216, 183, 106, 0.75); background: rgba(216, 183, 106, 0.14); color: #f2efe6;
}
.avm-stage-filter { margin: 10px 14px 8px; }
.avm-stage-filter input {
  width: 100%; height: 32px; padding: 0 10px; border-radius: 3px;
  border: 1px solid rgba(155, 148, 134, 0.35); background: rgba(255, 255, 255, 0.04);
  color: #f2efe6; outline: none;
}
.avm-stage-filter input:focus { border-color: rgba(216, 183, 106, 0.7); }
.avm-stage-list { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 14px 10px; display: flex; flex-direction: column; gap: 5px; }
.avm-stage-item {
  display: grid; grid-template-columns: 42px 1fr auto; align-items: center; gap: 8px;
  width: 100%; padding: 8px 10px; text-align: left; border-radius: 4px;
  border: 1px solid rgba(155, 148, 134, 0.18); background: rgba(255, 255, 255, 0.025);
}
.avm-stage-item:hover { border-color: rgba(216, 183, 106, 0.55); background: rgba(216, 183, 106, 0.08); }
.avm-stage-item[disabled] { opacity: .45; cursor: not-allowed; }
.avm-stage-item-kind {
  font-size: 10px; letter-spacing: .06em; color: #d8b76a; border: 1px solid rgba(216, 183, 106, 0.35);
  border-radius: 999px; padding: 1px 0; text-align: center;
}
.avm-stage-item-title { display: block; color: #f2efe6; font-size: 13px; }
.avm-stage-item-id { display: block; color: #6f6a5f; font-size: 10px; margin-top: 2px; }
.avm-stage-item-status { color: #9b9486; font-size: 10px; }
.avm-stage-empty { padding: 22px 8px; color: #6f6a5f; text-align: center; }
.avm-stage-foot {
  display: flex; align-items: center; gap: 8px; padding: 9px 14px;
  border-top: 1px solid rgba(216, 183, 106, 0.18); color: #6f6a5f; font-size: 10px;
}
.avm-stage-foot code { color: #9b9486; }
#${TOAST_ID} {
  position: fixed; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%); z-index: 2147483001; max-width: calc(100vw - 24px);
  padding: 9px 14px; border-radius: 4px; pointer-events: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.45;
  background: rgba(8, 10, 16, 0.96); color: #f2efe6;
  border: 1px solid rgba(216, 183, 106, 0.55); box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55);
}
#${TOAST_ID}[data-tone="error"] { border-color: rgba(192, 57, 43, 0.85); color: #f0cbc6; }
@media (max-width: 480px) {
  .avm-stage-pill { max-width: 128px; }
  .avm-stage-actions button { padding: 0 5px; font-size: 10px; }
  .avm-stage-head .avm-stage-hint { display: none; }
  .avm-stage-panel { max-height: 84vh; }
}
`;
  document.head.appendChild(style);
}

function make<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className !== undefined) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeButton(label: string, className: string, action: string): HTMLButtonElement {
  const button = make('button', className, label);
  button.type = 'button';
  button.dataset.act = action;
  return button;
}

function updatePill(): void {
  if (!currentStage) return;
  if (pillKind) pillKind.textContent = STAGE_KIND_LABEL[currentStage.kind];
  if (pillId) {
    pillId.textContent = currentStage.id;
    pillId.title = `${currentStage.title} · ${currentStage.id}`;
  }
}

function renderPanel(): void {
  if (!listBox || !countLabel) return;
  listBox.replaceChildren();
  const needle = textFilter.trim().toLowerCase();
  const stages = listStages(true).filter((stage) => {
    if (kindFilter !== 'all' && stage.kind !== kindFilter) return false;
    if (needle.length === 0) return true;
    const haystack = [stage.id, stage.title, ...(stage.tags ?? [])].join(' ').toLowerCase();
    return haystack.includes(needle);
  });

  for (const stage of stages) {
    const button = make('button', 'avm-stage-item');
    button.type = 'button';
    button.disabled = stage.status !== 'ready';
    const kind = make('span', 'avm-stage-item-kind', STAGE_KIND_LABEL[stage.kind]);
    const main = make('span');
    main.append(
      make('span', 'avm-stage-item-title', stage.title),
      make('span', 'avm-stage-item-id', stage.id),
    );
    const status = make(
      'span',
      'avm-stage-item-status',
      stage.status === 'ready' ? '→' : '未接入',
    );
    button.append(kind, main, status);
    button.addEventListener('click', () => {
      if (stage.status !== 'ready') return;
      closePanel();
      handlers?.onSelect(stage.id);
    });
    listBox.appendChild(button);
  }

  if (stages.length === 0) {
    listBox.appendChild(make('div', 'avm-stage-empty', '没有匹配的舞台'));
  }
  countLabel.textContent = `${stages.length} 项`;
}

function openPanel(): void {
  if (!panel || !backdrop) return;
  panelOpen = true;
  panel.hidden = false;
  backdrop.hidden = false;
  renderPanel();
}

function closePanel(): void {
  if (!panel || !backdrop) return;
  panelOpen = false;
  panel.hidden = true;
  backdrop.hidden = true;
}

function ensureRoot(): void {
  if (root) return;

  root = make('div');
  root.id = ROOT_ID;

  bar = make('div', 'avm-stage-bar');

  const pill = make('button', 'avm-stage-pill');
  pill.type = 'button';
  pill.dataset.act = 'panel';
  pill.title = '打开舞台目录（Alt+Shift+D 隐藏/显示）';
  pill.append(make('span', 'avm-stage-dot'), make('span', 'avm-stage-kind', 'STAGE'));
  pillKind = pill.querySelector<HTMLSpanElement>('.avm-stage-kind');
  pillId = make('span', 'avm-stage-id', '');
  pill.append(pillId);
  bar.append(pill);

  const actions = make('div', 'avm-stage-actions');
  actions.append(
    makeButton('目录', 'avm-stage-action', 'panel'),
    makeButton('重开', 'avm-stage-action', 'restart'),
    makeButton('标题', 'avm-stage-action', 'title'),
    makeButton('×', 'avm-stage-action', 'hide'),
  );
  bar.append(actions);
  const barActions = actions.querySelectorAll<HTMLButtonElement>('button');
  for (const button of barActions) {
    button.className = 'avm-stage-action';
    button.style.border = '0';
    button.style.background = 'transparent';
  }

  showButton = make('button', 'avm-stage-show', '◈');
  showButton.type = 'button';
  showButton.title = '显示舞台 HUD';
  showButton.hidden = true;

  backdrop = make('div', 'avm-stage-backdrop');
  backdrop.hidden = true;

  panel = make('div', 'avm-stage-panel');
  panel.hidden = true;
  const head = make('div', 'avm-stage-head');
  head.append(
    make('strong', undefined, '舞台目录'),
    make('span', 'avm-stage-hint', 'Alt+Shift+D 隐藏 · Esc 关闭'),
    makeButton('×', 'avm-stage-close', 'close'),
  );
  panel.append(head);

  const tabRow = make('div', 'avm-stage-tabs');
  const tabDefs: readonly [DiagramFilter, string][] = [
    ['all', '全部'],
    ['scene', '场景'],
    ['cg', 'CG'],
    ['battle', '战斗'],
  ];
  tabs = tabDefs.map(([kind, label]) => {
    const button = makeButton(label, 'avm-stage-tab', 'tab');
    button.dataset.kind = kind;
    button.dataset.active = kind === kindFilter ? 'true' : 'false';
    tabRow.append(button);
    return button;
  });
  panel.append(tabRow);

  const filter = make('div', 'avm-stage-filter');
  filterInput = make('input');
  filterInput.type = 'search';
  filterInput.placeholder = '筛选 id / 标题 / tag';
  filterInput.value = textFilter;
  filter.append(filterInput);
  panel.append(filter);

  listBox = make('div', 'avm-stage-list');
  panel.append(listBox);

  const foot = make('div', 'avm-stage-foot');
  countLabel = make('span');
  foot.append(
    countLabel,
    make('span', undefined, '· URL 后门：'),
    make('code', undefined, '?stage=<id>'),
  );
  panel.append(foot);

  root.append(bar, showButton, backdrop, panel);
  document.body.appendChild(root);

  bar.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!target) return;
    const action = target.dataset.act;
    if (action === 'panel') {
      if (panelOpen) closePanel();
      else openPanel();
    } else if (action === 'restart') {
      closePanel();
      handlers?.onRestart();
    } else if (action === 'title') {
      closePanel();
      handlers?.onTitle();
    } else if (action === 'hide') {
      setStageHudVisible(false);
    }
  });

  showButton.addEventListener('click', () => setStageHudVisible(true));
  backdrop.addEventListener('click', closePanel);
  panel.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!target) return;
    if (target.dataset.act === 'close') closePanel();
  });

  for (const tab of tabs) {
    tab.addEventListener('click', () => {
      const kind = tab.dataset.kind;
      if (kind === 'all' || kind === 'scene' || kind === 'cg' || kind === 'battle') {
        kindFilter = kind;
      }
      for (const item of tabs) item.dataset.active = item === tab ? 'true' : 'false';
      renderPanel();
    });
  }

  filterInput.addEventListener('input', () => {
    textFilter = filterInput?.value ?? '';
    renderPanel();
  });

  keydownHandler = (event: KeyboardEvent) => {
    if (event.altKey && event.shiftKey && (event.key === 'd' || event.key === 'D')) {
      event.preventDefault();
      setStageHudVisible(hidden);
      return;
    }
    if (event.key === 'Escape' && panelOpen) {
      event.preventDefault();
      event.stopPropagation();
      closePanel();
    }
  };
  window.addEventListener('keydown', keydownHandler, true);
}

/** 启动/切换舞台时调用；HUD 已存在则只更新 id 和回调。 */
export function mountStageHud(options: StageHudOptions): void {
  currentStage = options.stage;
  handlers = {
    onSelect: options.onSelect,
    onRestart: options.onRestart,
    onTitle: options.onTitle,
  };
  ensureStyle();
  ensureRoot();
  updatePill();
  if (panelOpen) renderPanel();
  setStageHudVisible(true);
}

export function unmountStageHud(): void {
  if (keydownHandler) {
    window.removeEventListener('keydown', keydownHandler, true);
    keydownHandler = null;
  }
  root?.remove();
  root = null;
  bar = null;
  pillKind = null;
  pillId = null;
  showButton = null;
  backdrop = null;
  panel = null;
  listBox = null;
  countLabel = null;
  filterInput = null;
  tabs = [];
  handlers = null;
  currentStage = null;
  hidden = false;
  panelOpen = false;
  kindFilter = 'all';
  textFilter = '';
}

export function isStageHudMounted(): boolean {
  return root !== null;
}

export function isStageHudVisible(): boolean {
  return root !== null && !hidden;
}

/** 返回实际可见状态；没有挂载时返回 false。 */
export function setStageHudVisible(visible: boolean): boolean {
  if (!root || !bar || !showButton) return false;
  hidden = !visible;
  bar.hidden = hidden;
  showButton.hidden = !hidden;
  if (hidden) closePanel();
  return !hidden;
}

/** 临时提示（未知 id、加载失败、启动成功等）；不会抢焦点。 */
export function showStageToast(message: string, tone: 'info' | 'error' = 'info'): void {
  ensureStyle();
  toast?.remove();
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
  toast = make('div');
  toast.id = TOAST_ID;
  toast.dataset.tone = tone;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;
  document.body.appendChild(toast);
  toastTimer = window.setTimeout(() => {
    toast?.remove();
    toast = null;
    toastTimer = null;
  }, 4200);
}
