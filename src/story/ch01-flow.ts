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
  /** 战斗返回时从战后节点继续；默认从章节卡开始。 */
  readonly resume?: 'start' | 'afterBattle';
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

/** 战斗场景通过 payload 回来时使用；与 `Ch01FlowOptions['resume']` 一致。 */
export function isCh01ResumeData(
  value: unknown,
): value is { readonly resume: 'afterBattle' } {
  return (
    value !== null &&
    typeof value === 'object' &&
    (value as { resume?: unknown }).resume === 'afterBattle'
  );
}

export { CH01_BATTLE_ID };
