/**
 * 战斗系统的数据契约（v3.3 · 十一点位四三四 / 无转向行动 / 多怪）。
 *
 * 这里是**唯一真值**：纯逻辑层（core/）只依赖本文件，不 import Phaser；
 * 场景只消费 `BattleEvent`，不自己算伤害/顺序/命中。
 *
 * 规则摘要见 `docs/DESIGN-BATTLE.md`：
 * - 11 个点位：四三四三排（上 4 / 中 3 / 下 4）；占据互斥，中心空出后可站；
 * - 判定按**真实网格坐标**算角度（邻点方向相差 60°），不再有 45° 环抽象；
 * - 跑条决定先后（gauge 0..1000），顶部只显示头像行动表，不画量条；
 * - 攻击/技能只打相邻点位；怪物技能可自由瞄准，执行时免费转身；
 * - 怪物不再有单独的转向行动；受击后免费转向攻击来向；
 * - 怪物可以移动到相邻点位并面朝移动方向；意图不上屏，执行时按当前目标重选；
 * - 闪避：有相邻空位时按 1-200/(3x+200) 判定，成功则移动到空位并免伤；
 * - party / enemies 都是数组，按 activeId 找当前行动者（当前 party 只有 1 人）。
 */

export type BattleTeam = 'party' | 'enemy';

/**
 * 11 个点位（四三四）。
 *
 * 原有 7 个名字沿用 v2（减少无意义 diff），新增的是三排两端的 4 个「端」点。
 * 11 个点位语义完全一致：玩家/怪物都能站、都能走；互斥占据，中心空出后可站。
 */
export type SlotId =
  | 'center'
  | 'right'
  | 'upperRight'
  | 'upperLeft'
  | 'left'
  | 'lowerLeft'
  | 'lowerRight'
  | 'upperFarLeft'
  | 'upperFarRight'
  | 'lowerFarLeft'
  | 'lowerFarRight';

/** 相对目标朝向的区域：正面 / 侧面 / 背面（背袭）。 */
export type Zone = 'front' | 'side' | 'back';

/** 8 方向（屏幕坐标；转向/移动后按这个表取贴图）。 */
export type Facing8 =
  | 'up'
  | 'upRight'
  | 'right'
  | 'downRight'
  | 'down'
  | 'downLeft'
  | 'left'
  | 'upLeft';

/** 技能命中范围（v3 语义见 `core/slots.ts` 的 `hitPointsFor`）。 */
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
   * 命中后的落点选择：
   * - `near-target`：非背袭命中后进入 pendingMove，可选目标相邻的空闲点位。
   * 不再有自动镜像闪现（2026-11-22 删除 `teleport`）。
   */
  readonly postHitMove?: 'near-target';
  /**
   * 背袭时无视目标防御的比例（0..1）；0.5 = 只扣一半防御。
   * 只在 backstab 为 true 时生效；省略按 0。
   */
  readonly backstabDefensePierce?: number;
  /** 命中范围；玩家解离突刺是单一目标，不走这里的锥形集合。 */
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
  /** 平减防御；省略 0。 */
  readonly defense?: number;
  /** 闪避点（整数）；省略 0。闪避率 = 1 - 200/(3x+200)。 */
  readonly dodge?: number;
  /** 技能 id（来自 `data/skills.ts`）。 */
  readonly skills: readonly string[];
}

export type EnemyArtId = 'miner' | 'cook';

/** 怪物行为：追击（默认）或站桩（第一场教程战）。 */
export type BattleBehavior = 'chaser' | 'stationary';

/** 战场舞台；场景/背景/返回目标不再靠 battle id 猜。 */
export type BattleArena = 'palace' | 'kitchen';

export interface BattlePartySetup extends BattleUnitSetup {
  /** 初始点位；不写时第 1 人默认 `left`。 */
  readonly slot?: SlotId;
}

export interface BattleEnemySetup extends BattleUnitSetup {
  readonly art: EnemyArtId;
  /** 初始点位；不写时用 seed 从空点位里随机。 */
  readonly slot?: SlotId;
  /** 不写默认 `chaser`。 */
  readonly behavior?: BattleBehavior;
}

export interface BattleSetup {
  readonly id: string;
  readonly title: string;
  readonly arena: BattleArena;
  readonly party: readonly BattlePartySetup[];
  readonly enemies: readonly BattleEnemySetup[];
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
  /** 平减防御（≥0）；伤害结算时先减它，再乘防御动作 0.5。 */
  readonly defense: number;
  /** 闪避点（≥0）；闪避率 = 1 - 200/(3x+200)。 */
  readonly dodge: number;
  /** 行动条 0..1000，到达 1000 的单位行动。 */
  readonly gauge: number;
  readonly guarding: boolean;
  /** 所有单位都有点位（11 点位之一）。 */
  readonly slot: SlotId;
  /** 只有怪物有值；玩家表现层按目标/左右决定镜像。 */
  readonly facing: Facing8 | null;
  /** 技能 id → 剩余冷却行动数。 */
  readonly cooldowns: Readonly<Record<string, number>>;
  /** 怪物渲染/AI 用。 */
  readonly art?: EnemyArtId;
  readonly behavior?: BattleBehavior;
}

/** 怪物下一行动的锁定意图（玩家回合时展示）。 */
export type EnemyIntent =
  | {
      readonly kind: 'skill';
      readonly skillId: string;
      readonly skillName: string;
      /** 出招时怪物所在点位（意图锁定时）。 */
      readonly origin: SlotId;
      /** 自由选择的瞄准点；执行时转向它。 */
      readonly aim: SlotId;
      readonly facing: Facing8;
      readonly targetId: string;
      readonly targetSlot: SlotId;
      /** 该招式会覆盖的点位（红色高亮）。 */
      readonly hitSlots: readonly SlotId[];
      /** 目标角色当前点位是否在覆盖范围内（HUD 危险提示）。 */
      readonly hitsPlayer: boolean;
      /** 全站位技能：HUD 必须写「全站位」。 */
      readonly aoe: boolean;
      readonly text: string;
    }
  | {
      readonly kind: 'move';
      readonly from: SlotId;
      readonly to: SlotId;
      /** 移动后面朝移动方向。 */
      readonly facing: Facing8;
      readonly targetId: string;
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

/**
 * 攻击命中后的落点选择（解离突刺的非背袭命中）。
 *
 * `activeId` 仍是玩家、gauge 先不归零；玩家必须用 `post-move` 选一个
 * `slots` 里的点位，或选自己当前点（留在原地）才结束这次行动。
 */
export interface PendingMove {
  readonly actorId: string;
  readonly targetId: string;
  readonly targetSlot: SlotId;
  readonly slots: readonly SlotId[];
}

export interface BattleState {
  readonly encounterId: string;
  readonly title: string;
  readonly seed: number;
  readonly phase: BattlePhase;
  /** 当前该行动的单位；`null` = 上一行动已结算，等待 `startNextTurn`。 */
  readonly activeId: string | null;
  readonly party: readonly BattleUnit[];
  readonly enemies: readonly BattleUnit[];
  /** 每只活着的怪物一条计划意图；执行时重算。 */
  readonly intents: Readonly<Record<string, EnemyIntent>>;
  /** 攻击命中后的落点选择；null = 没有待选落点。 */
  readonly pendingMove: PendingMove | null;
  /** 所有怪物已经行动的次数（清除协议计数；技能/移动都算）。 */
  readonly enemyActions: number;
  /** 已经结算的行动数。 */
  readonly seq: number;
  readonly log: readonly BattleLogEntry[];
}

/** 玩家可执行的操作。怪物的行动由锁定的意图决定（`enemy-act`）。 */
export type BattleAction =
  | { readonly kind: 'move'; readonly slot: SlotId }
  | { readonly kind: 'attack'; readonly skillId: string; readonly targetId: string }
  | { readonly kind: 'post-move'; readonly slot: SlotId }
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
      readonly targetSlot: SlotId;
      readonly skillId: string;
      readonly skillName: string;
      readonly amount: number;
      readonly zone: Zone;
      readonly backstab: boolean;
      readonly targetHp: number;
      readonly from: SlotId;
      /** 目标是否闪避了这次攻击。 */
      readonly dodged?: boolean;
      readonly text: string;
    }
  | {
      readonly kind: 'guard';
      readonly actorId: string;
      readonly text: string;
    }
  | {
      /** 免费转身：出招瞄准 / 受击转向；不算行动。 */
      readonly kind: 'enemy-face';
      readonly actorId: string;
      readonly facing: Facing8;
      readonly reason: 'aim' | 'hit';
      readonly text: string;
    }
  | {
      readonly kind: 'enemy-move';
      readonly actorId: string;
      readonly from: SlotId;
      readonly to: SlotId;
      readonly facing: Facing8;
      readonly blocked: boolean;
      readonly text: string;
    }
  | {
      readonly kind: 'enemy-skill';
      readonly actorId: string;
      readonly targetId: string;
      readonly targetSlot: SlotId;
      readonly skillId: string;
      readonly skillName: string;
      readonly from: SlotId;
      readonly aim: SlotId;
      readonly facing: Facing8;
      readonly hitSlots: readonly SlotId[];
      readonly hit: boolean;
      readonly amount: number;
      readonly targetHp: number;
      readonly aoe: boolean;
      /** 目标是否闪避了这次技能。 */
      readonly dodged?: boolean;
      readonly text: string;
    }
  | {
      readonly kind: 'dodge';
      readonly actorId: string;
      readonly attackerId: string;
      readonly skillId: string;
      readonly from: SlotId;
      readonly to: SlotId;
      readonly aoe: boolean;
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
      readonly kind: 'log';
      readonly text: string;
      readonly tone: BattleLogTone;
    };

export interface BattleActionResult {
  readonly state: BattleState;
  readonly events: readonly BattleEvent[];
}
