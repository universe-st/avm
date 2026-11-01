/**
 * 剧情战的最小数据契约。
 *
 * 本期只有 1v1、攻击/防御、固定 1 伤害；完整回合制（技能/EP/背刺/核心/队伍）
 * 按 `docs/DESIGN-BATTLE.md` 后置。类型命名尽量与设计稿保持一致，方便后续扩展。
 */

export type BattleTeam = 'party' | 'enemy';
export type BattlePhase = 'player' | 'defeat' | 'victory';

export interface BattleUnitState {
  readonly id: string;
  readonly name: string;
  readonly team: BattleTeam;
  readonly hp: number;
  readonly maxHp: number;
}

export type BattleLogTone = 'normal' | 'player' | 'enemy' | 'danger';

export interface BattleLogEntry {
  readonly round: number;
  readonly text: string;
  readonly tone: BattleLogTone;
}

export type BattleAction = 'attack' | 'guard';

export type BattleEvent =
  | {
      readonly type: 'player-attack';
      readonly amount: number;
      readonly targetHp: number;
      readonly text: string;
    }
  | {
      readonly type: 'guard';
      readonly text: string;
    }
  | {
      readonly type: 'enemy-attack';
      readonly amount: number;
      readonly playerHp: number;
      readonly text: string;
    }
  | {
      readonly type: 'protocol';
      readonly amount: number;
      readonly playerHp: number;
      readonly text: string;
    }
  | {
      readonly type: 'defeat';
      readonly text: string;
    }
  | {
      readonly type: 'round';
      readonly round: number;
    }
  | {
      readonly type: 'log';
      readonly text: string;
      readonly tone: BattleLogTone;
    };

export interface BattleState {
  readonly encounterId: string;
  readonly round: number;
  readonly phase: BattlePhase;
  readonly player: BattleUnitState;
  readonly enemy: BattleUnitState;
  readonly guarding: boolean;
  readonly playerAttacks: number;
  readonly log: readonly BattleLogEntry[];
  readonly events: readonly BattleEvent[];
}

export interface ScriptedBattleSetup {
  readonly id: string;
  readonly title: string;
  readonly player: {
    readonly id: string;
    readonly name: string;
    readonly hp: number;
    /** 主角每次攻击的伤害。未写 `damageRule` 的剧情战固定按 1 结算。 */
    readonly attackDamage: number;
  };
  readonly enemy: {
    readonly id: string;
    readonly name: string;
    readonly hp: number;
    readonly attackDamage: number;
  };
  readonly maxRounds: number;
  readonly protocolDamage: number;
  /**
   * 伤害规则：
   * - `fixed-one`（默认）：无论数值多少都只打 1，服务「打不赢的剧情战」；
   * - `use-attack`：按 `player.attackDamage` 结算，可打赢（御膳房遭遇战用）。
   */
  readonly damageRule?: 'fixed-one' | 'use-attack';
  /** 敌方 HP 归零时的收尾台词；只有 use-attack 的仗会用到。 */
  readonly victoryText?: string;
  /** 每次主角攻击后按顺序取一句；不足时用最后一句。 */
  readonly attackBarks: readonly string[];
  readonly guardText: string;
  readonly enemyAttackText: string;
  readonly protocolText: string;
  readonly defeatText: string;
}
