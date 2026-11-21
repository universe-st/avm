/**
 * 战斗系统的数据契约（v2 · 六站位跑条制）。
 *
 * 这里是**唯一真值**：纯逻辑层（core/）只依赖本文件，不 import Phaser；
 * 场景只消费 `BattleEvent`，不自己算伤害/顺序/命中。
 *
 * 规则摘要见 `docs/DESIGN-BATTLE.md`：
 * - 怪物居中，玩家在 6 个环形站位（左上/左/左下/右上/右/右下）；
 * - 双方有 SPD，按行动条（gauge 0..1000）决定谁先动；
 * - 怪物朝 8 方向之一，背面（相对角 ≥135°）吃背袭 ×1.5；
 * - 怪物转向占一次行动，技能只打特定方向；意图提前锁定并公示。
 */

export type BattleTeam = 'party' | 'enemy';

/** 玩家可站的 6 个站位（相对怪物中心的角度见 `core/slots.ts`）。 */
export type SlotId =
  | 'right'
  | 'upperRight'
  | 'upperLeft'
  | 'left'
  | 'lowerLeft'
  | 'lowerRight';

/** 相对怪物朝向的区域：正面 / 侧面 / 背面（背袭）。 */
export type Zone = 'front' | 'side' | 'back';

/** 怪物朝向（8 方向；转向只会选有站位的 6 个方向，上下留给演出/预览）。 */
export type Facing8 =
  | 'up'
  | 'upRight'
  | 'right'
  | 'downRight'
  | 'down'
  | 'downLeft'
  | 'left'
  | 'upLeft';

/** 技能命中范围。 */
export type SkillHit = 'single-front' | 'front-arc' | 'all-slots';

export interface SkillDef {
  readonly id: string;
  readonly name: string;
  /** 伤害倍率：`round(atk × power × 背袭 × 防御)`。 */
  readonly power: number;
  /** 是否吃背袭加成（解离突刺 true；怪物 AOE 通常 false）。 */
  readonly positional: boolean;
  /** 背袭倍率；省略按 1.5。 */
  readonly backstabMultiplier?: number;
  /**
   * 命中后的位移：
   * - `mirror-if-front`：非背袭命中后闪现到怪物镜相对位（解离突刺）。
   */
  readonly teleport?: 'mirror-if-front';
  /** 命中哪些站位。 */
  readonly hit: SkillHit;
  /** 使用后需要经过的怪物行动数（0/省略 = 无冷却）。 */
  readonly cooldown?: number;
  /** 给 HUD / 日志看的短描述。 */
  readonly desc: string;
}

/** 战斗单位的数据来源（不含运行时 gauge）。 */
export interface BattleUnitSetup {
  readonly id: string;
  readonly name: string;
  readonly hp: number;
  readonly atk: number;
  readonly spd: number;
  /** 技能 id（来自 `data/skills.ts`）。 */
  readonly skills: readonly string[];
}

export type EnemyArtId = 'miner' | 'cook';

export interface BattleSetup {
  readonly id: string;
  readonly title: string;
  readonly player: BattleUnitSetup & {
    /** 初始站位；默认 `left`。 */
    readonly slot: SlotId;
  };
  readonly enemy: BattleUnitSetup & {
    readonly facing: Facing8;
    readonly art: EnemyArtId;
  };
  /**
   * 剧情脚本：第一场「清除协议」在第 N 次怪物行动后强制战败。
   * 不写 = 正常打到 HP 0。
   */
  readonly script?: {
    readonly protocolAfterEnemyActions: number;
    readonly protocolDamage: number;
    readonly protocolText: string;
  };
  /** 开场终端卡。 */
  readonly intro: {
    readonly badge: string;
    readonly title: string;
    readonly target: string;
    readonly lines: readonly string[];
    readonly ruleText: string;
  };
  readonly victory: {
    readonly text: string;
    readonly lines: readonly string[];
  };
  readonly defeat: {
    readonly text: string;
    readonly lines: readonly string[];
  };
}

/** 运行时单位（不可变；每次行动返回新 state）。 */
export interface BattleUnit {
  readonly id: string;
  readonly name: string;
  readonly team: BattleTeam;
  readonly hp: number;
  readonly maxHp: number;
  readonly atk: number;
  readonly spd: number;
  /** 行动条 0..1000，到达 1000 的单位行动。 */
  readonly gauge: number;
  readonly guarding: boolean;
  /** 仅玩家有值。 */
  readonly slot: SlotId | null;
  /** 仅怪物有值。 */
  readonly facing: Facing8 | null;
  /** 技能 id → 剩余冷却行动数。 */
  readonly cooldowns: Readonly<Record<string, number>>;
}

/** 怪物下一行动的锁定意图（玩家回合时展示）。 */
export type EnemyIntent =
  | {
      readonly kind: 'turn';
      readonly facing: Facing8;
      /** 该意图会转向的站位方向（用于 UI 高亮「它要面向哪边」）。 */
      readonly targetSlot: SlotId | null;
      readonly text: string;
    }
  | {
      readonly kind: 'skill';
      readonly skillId: string;
      readonly skillName: string;
      readonly facing: Facing8;
      /** 该招式会覆盖的站位（红色高亮）。 */
      readonly hitSlots: readonly SlotId[];
      /** 玩家当前站位是否在覆盖范围内（HUD 危险提示）。 */
      readonly hitsPlayer: boolean;
      /** 全站位技能（核心脉冲/灶台震地）：不靠转向也能命中背后，HUD 必须写「全站位」。 */
      readonly aoe: boolean;
      readonly text: string;
    };

export type BattleLogTone = 'normal' | 'player' | 'enemy' | 'danger' | 'system';

export interface BattleLogEntry {
  /** 第几个行动（从 0 开始，仅用于排序/去重）。 */
  readonly seq: number;
  readonly text: string;
  readonly tone: BattleLogTone;
}

export type BattlePhase = 'player' | 'enemy' | 'victory' | 'defeat';

export interface BattleState {
  readonly encounterId: string;
  readonly title: string;
  readonly seed: number;
  readonly phase: BattlePhase;
  /** 当前该行动的单位；`null` = 上一行动已结算，等待 `startNextTurn`。 */
  readonly activeId: string | null;
  readonly player: BattleUnit;
  readonly enemy: BattleUnit;
  /** 怪物下一次行动（玩家回合时展示；怪物行动后重新锁定）。 */
  readonly intent: EnemyIntent | null;
  /** 怪物已经行动的次数（清除协议计数）。 */
  readonly enemyActions: number;
  /** 已经结算的行动数。 */
  readonly seq: number;
  readonly log: readonly BattleLogEntry[];
}

/** 玩家可执行的操作。怪物的行动由锁定的 `intent` 决定（`enemy-act`）。 */
export type BattleAction =
  | { readonly kind: 'move'; readonly slot: SlotId }
  | { readonly kind: 'attack'; readonly skillId: string }
  | { readonly kind: 'guard' }
  | { readonly kind: 'enemy-act' };

export type BattleEvent =
  | {
      readonly kind: 'turn-start';
      readonly actorId: string;
      readonly actorName: string;
      readonly team: BattleTeam;
    }
  | {
      readonly kind: 'move';
      readonly actorId: string;
      readonly from: SlotId;
      readonly to: SlotId;
      readonly text: string;
    }
  | {
      readonly kind: 'attack';
      readonly actorId: string;
      readonly targetId: string;
      readonly skillId: string;
      readonly skillName: string;
      readonly amount: number;
      readonly zone: Zone;
      readonly backstab: boolean;
      readonly targetHp: number;
      readonly from: SlotId;
      readonly to: SlotId;
      readonly teleported: boolean;
      readonly text: string;
    }
  | {
      readonly kind: 'guard';
      readonly actorId: string;
      readonly text: string;
    }
  | {
      readonly kind: 'enemy-turn';
      readonly actorId: string;
      readonly facing: Facing8;
      readonly text: string;
    }
  | {
      readonly kind: 'enemy-skill';
      readonly actorId: string;
      readonly skillId: string;
      readonly skillName: string;
      readonly hitSlots: readonly SlotId[];
      readonly hit: boolean;
      readonly amount: number;
      readonly playerHp: number;
      readonly text: string;
    }
  | {
      readonly kind: 'protocol';
      readonly amount: number;
      readonly text: string;
    }
  | {
      readonly kind: 'victory';
      readonly text: string;
    }
  | {
      readonly kind: 'defeat';
      readonly cause: 'hp' | 'protocol';
      readonly text: string;
    }
  | {
      readonly kind: 'intent';
      readonly intent: EnemyIntent;
    }
  | {
      readonly kind: 'log';
      readonly text: string;
      readonly tone: BattleLogTone;
    };

export interface BattleActionResult {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
}
