import {
  CH01_BATTLE_ID,
  CH01_CHAPTER_CARD,
  CH01_INTERACTABLE_NODES,
  CH01_NODES,
  CH01_OBJECTIVES,
  type Ch01InteractableId,
  type Ch01Node,
  type Ch01NodeId,
} from './ch01-dorm';
import type { DialogueLine } from './dialogue';

/**
 * 第一章第一节的纯状态机。
 *
 * 场景只消费事件；这里不 import Phaser，也不碰输入/渲染。
 * 目标顺序：章节卡 → 叫醒郑卿 → 找手机 → 小白说明 → 战斗 → 战后征召 → 结束。
 */

export type Ch01Phase = 'intro' | 'explore' | 'dream' | 'battle' | 'after' | 'complete';

export interface Ch01FlowState {
  readonly phase: Ch01Phase;
  readonly objective: string;
  readonly talkedZheng: boolean;
  readonly phoneFound: boolean;
  readonly currentNode: Ch01NodeId | null;
}

export type Ch01Event =
  | { readonly type: 'chapter-card'; readonly lines: readonly string[] }
  | { readonly type: 'objective'; readonly text: string }
  | {
      readonly type: 'dialogue';
      readonly nodeId: Ch01NodeId;
      readonly lines: readonly DialogueLine[];
    }
  | { readonly type: 'battle'; readonly battleId: string }
  | { readonly type: 'complete' };

export interface Ch01FlowOptions {
  /**
   * 从哪一段继续：
   * - `start`：章节卡 + 开场（默认）；
   * - `afterBattle`：战后征召；
   * - `explore`：标题「继续游戏」回到寝室自由探索；
   * - `complete`：直接结束卡。
   */
  readonly resume?: 'start' | 'afterBattle' | 'explore' | 'complete';
  /** 舞台预览的 phase 参数；未知值回退 opening。 */
  readonly previewPhase?: string;
}

export const CH01_PREVIEW_PHASES = ['opening', 'explore', 'after', 'complete'] as const;
export type Ch01PreviewPhase = (typeof CH01_PREVIEW_PHASES)[number];

export function normalizeCh01PreviewPhase(value: string | undefined): Ch01PreviewPhase {
  if (value === 'explore' || value === 'after' || value === 'complete') return value;
  return 'opening';
}

export class Ch01Flow {
  private phase: Ch01Phase = 'intro';
  private objectiveValue: string = CH01_OBJECTIVES.wakeZheng;
  private talkedZheng = false;
  private phoneFound = false;
  private currentNodeId: Ch01NodeId | null = null;
  private started = false;
  private readonly initialPhase: Ch01PreviewPhase;

  constructor(options: Ch01FlowOptions = {}) {
    if (options.resume === 'afterBattle') {
      this.initialPhase = 'after';
    } else if (options.resume === 'explore') {
      this.initialPhase = 'explore';
    } else if (options.resume === 'complete') {
      this.initialPhase = 'complete';
    } else {
      this.initialPhase = normalizeCh01PreviewPhase(options.previewPhase);
    }
  }

  get state(): Ch01FlowState {
    return {
      phase: this.phase,
      objective: this.objectiveValue,
      talkedZheng: this.talkedZheng,
      phoneFound: this.phoneFound,
      currentNode: this.currentNodeId,
    };
  }

  start(): Ch01Event[] {
    if (this.started) return [];
    this.started = true;

    if (this.initialPhase === 'complete') {
      this.phase = 'complete';
      this.objectiveValue = CH01_OBJECTIVES.complete;
      return [{ type: 'complete' }];
    }

    if (this.initialPhase === 'after') {
      this.phase = 'after';
      return this.enterNode('after');
    }

    if (this.initialPhase === 'explore') {
      this.phase = 'explore';
      this.objectiveValue = CH01_OBJECTIVES.wakeZheng;
      return [{ type: 'objective', text: this.objectiveValue }];
    }

    this.phase = 'intro';
    this.objectiveValue = CH01_OBJECTIVES.wakeZheng;
    return [
      { type: 'chapter-card', lines: CH01_CHAPTER_CARD },
      { type: 'objective', text: this.objectiveValue },
      ...this.enterNode('intro'),
    ];
  }

  /** 自由探索时与地图对象交互；对话中/非探索阶段一律忽略。 */
  interact(objectId: string): Ch01Event[] {
    if (this.phase !== 'explore' || this.currentNodeId !== null) return [];
    if (!(objectId in CH01_INTERACTABLE_NODES)) return [];

    const id = objectId as Ch01InteractableId;

    if (id === 'zheng') {
      if (this.talkedZheng) return this.enterNode('zheng-repeat');
      this.talkedZheng = true;
      return this.enterNode('zheng');
    }

    if (id === 'phone') {
      if (!this.talkedZheng) return this.enterNode('phone-locked');
      this.phoneFound = true;
      return this.enterNode('phone');
    }

    return this.enterNode(CH01_INTERACTABLE_NODES[id]);
  }

  /** 当前对话最后一句确认后调用。 */
  nodeCompleted(): Ch01Event[] {
    if (this.currentNodeId === null) return [];
    const node: Ch01Node = CH01_NODES[this.currentNodeId];
    this.currentNodeId = null;

    const events: Ch01Event[] = [];
    if (node.objective !== undefined) {
      this.objectiveValue = node.objective;
      events.push({ type: 'objective', text: this.objectiveValue });
    }

    if (node.battle !== undefined) {
      this.phase = 'battle';
      this.objectiveValue = CH01_OBJECTIVES.survive;
      events.push({ type: 'objective', text: this.objectiveValue });
      events.push({ type: 'battle', battleId: node.battle });
      return events;
    }

    if (node.next !== undefined) {
      return [...events, ...this.enterNode(node.next)];
    }

    if (node.id === 'intro' || node.id === 'zheng') {
      this.phase = 'explore';
      if (node.id === 'intro') {
        this.objectiveValue = CH01_OBJECTIVES.wakeZheng;
        events.push({ type: 'objective', text: this.objectiveValue });
      }
    }

    return events;
  }

  /** 剧情战失败后回寝室。 */
  onBattleDefeat(): Ch01Event[] {
    if (this.phase !== 'battle') return [];
    this.phase = 'after';
    this.objectiveValue = CH01_OBJECTIVES.afterBattle;
    return this.enterNode('after');
  }

  private enterNode(nodeId: Ch01NodeId): Ch01Event[] {
    const node = CH01_NODES[nodeId];
    this.currentNodeId = nodeId;

    if (nodeId === 'complete') {
      this.phase = 'complete';
      this.objectiveValue = CH01_OBJECTIVES.complete;
      return [{ type: 'complete' }];
    }

    if (nodeId === 'dream') this.phase = 'dream';
    else if (nodeId === 'after') this.phase = 'after';

    const events: Ch01Event[] = [];
    if (node.objective !== undefined) {
      this.objectiveValue = node.objective;
      events.push({ type: 'objective', text: this.objectiveValue });
    }
    events.push({ type: 'dialogue', nodeId, lines: node.lines });
    return events;
  }
}

/** 战斗/继续游戏通过 payload 回来时使用。 */
export type Ch01ResumeData = { readonly resume: 'afterBattle' | 'explore' | 'complete' };

export function isCh01ResumeData(value: unknown): value is Ch01ResumeData {
  return (
    value !== null &&
    typeof value === 'object' &&
    ['afterBattle', 'explore', 'complete'].includes(
      String((value as { resume?: unknown }).resume),
    )
  );
}

/**
 * 「重看本节」restart 时传给场景的干净 data。
 *
 * Phaser 的 `ScenePlugin.restart(data?)` 在不传 data 时会**沿用上一次启动的 data**：
 * 从标题「继续游戏」进 `ch01.complete` 检查点时 data 是 `{ resume: 'complete' }`，
 * 点「重看本节」后 `init(data)` 又收到同一个 `{ resume: 'complete' }` → 又进结束状态 → 死循环。
 *
 * 这里显式给出 `resume: 'start'`（`isCh01ResumeData` 只认 afterBattle/explore/complete，
 * 所以场景会解析成 `resumeMode = 'start'`，从章节卡/开场整段重演）。
 *
 * - `preview`：预览会话 restart 后必须还认得自己，否则会写进真实进度；正式流程不能带这个键。
 * - `seed`：保住同一 seed 的确定性（预览选过的种子不该被 restart 换成默认值）。
 */
export interface Ch01EndCardRestartData {
  readonly resume: 'start';
  readonly preview?: true;
  readonly seed?: number;
}

export function endCardRestartData(
  options: { readonly preview?: boolean; readonly seed?: number } = {},
): Ch01EndCardRestartData {
  const seed = options.seed;
  return {
    resume: 'start',
    ...(options.preview === true ? { preview: true as const } : {}),
    ...(typeof seed === 'number' && Number.isFinite(seed) ? { seed } : {}),
  };
}

export { CH01_BATTLE_ID };
