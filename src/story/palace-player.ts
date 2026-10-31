/**
 * 梦域·金殿：可演出的殿上过场（纯逻辑时间线）。
 *
 * 不依赖 Phaser：场景每帧把 delta 喂进来，这里只吐「该做什么」。
 * 与开幕的区别：这里不是逐字打字，而是**走位/换姿势/换贴图/震屏**为主的舞台调度，
 * 台词一句一句等玩家点（或点「跳过」整段）。
 *
 * 原文依据：`reference/刺客与矿工/第001章-天子.txt`、`第002章-小白.txt`。
 * 楚老师 = 楚公公（同一个人，梦里被投影成太监总管）。
 */

export type PalaceActorId = 'zhou' | 'zheng' | 'chu' | 'eunuchLeft' | 'eunuchRight' | 'miner';

export type PalaceFx = 'flash' | 'flashRed' | 'shake' | 'rumble';

export type PalaceAction =
  | { readonly kind: 'spawn'; readonly actor: PalaceActorId; readonly x: number; readonly y: number }
  | {
      readonly kind: 'move';
      readonly actor: PalaceActorId;
      readonly x: number;
      readonly y: number;
      readonly ms: number;
    }
  | { readonly kind: 'texture'; readonly actor: PalaceActorId; readonly texture: string }
  | { readonly kind: 'faceLeft'; readonly actor: PalaceActorId }
  | { readonly kind: 'faceRight'; readonly actor: PalaceActorId }
  | { readonly kind: 'hide'; readonly actor: PalaceActorId }
  | { readonly kind: 'fx'; readonly fx: PalaceFx }
  | { readonly kind: 'camera'; readonly zoom: number; readonly ms: number }
  | { readonly kind: 'pan'; readonly dx: number; readonly dy: number; readonly ms: number }
  | { readonly kind: 'letterbox'; readonly on: boolean; readonly ms?: number }
  | { readonly kind: 'speedlines'; readonly color: 'white' | 'red'; readonly ms?: number }
  | { readonly kind: 'stamp'; readonly text: string; readonly tone?: 'gold' | 'danger'; readonly ms?: number }
  | { readonly kind: 'cut'; readonly color?: 'black' | 'white'; readonly ms?: number }
  | { readonly kind: 'hitstop'; readonly ms?: number }
  | { readonly kind: 'portrait'; readonly key: string; readonly side?: 'left' | 'right' }
  | { readonly kind: 'portraitHide' }
  | {
      readonly kind: 'sfx';
      readonly key: string;
      readonly volume?: number;
      readonly loop?: boolean;
    };

export interface PalaceSay {
  readonly kind: 'say';
  readonly speaker?: string;
  readonly text: string;
  /** 说话人的稳定角色 id（名字会变时，声线/立绘认这个）。 */
  readonly role?: 'xiaobai';
}

export interface PalaceAct {
  readonly kind: 'act';
  readonly actions: readonly PalaceAction[];
  /** 这些动作占用的演出时长；到点自动进入下一步。 */
  readonly ms: number;
}

export type PalaceBeat = PalaceSay | PalaceAct;

export type PalaceEvent =
  | { readonly type: 'action'; readonly action: PalaceAction }
  | { readonly type: 'say'; readonly index: number; readonly speaker?: string; readonly text: string; readonly role?: 'xiaobai' }
  | { readonly type: 'complete' };

export interface PalacePlayerState {
  readonly index: number;
  readonly waiting: boolean;
  readonly done: boolean;
}

/**
 * 舞台调度播放器。
 *
 * - `act`：进入时把所有 action 一次性吐出去，等 `ms` 到点再进下一步；
 * - `say`：进入时吐一句，然后停住，等场景调用 `advance()`（点屏幕或按空格）；
 * - 全部播完吐一次 `complete`。
 */
export class PalacePlayer {
  private readonly beats: readonly PalaceBeat[];
  private index = 0;
  private entered = false;
  private elapsed = 0;
  private waiting = false;
  private done = false;

  constructor(beats: readonly PalaceBeat[]) {
    if (beats.length === 0) throw new Error('PalacePlayer: beats 不能为空');
    this.beats = beats;
  }

  get state(): PalacePlayerState {
    return { index: this.index, waiting: this.waiting, done: this.done };
  }

  /** 喂一帧；返回这一帧产生的所有事件。 */
  tick(deltaMs: number): PalaceEvent[] {
    const events: PalaceEvent[] = [];
    let budget = Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0);

    // 一帧里可能要跨过多个 0ms 的 act，所以循环消费预算。
    for (let guard = 0; guard < 64; guard += 1) {
      if (this.done || this.waiting) break;
      if (this.index >= this.beats.length) {
        this.done = true;
        events.push({ type: 'complete' });
        break;
      }

      const beat = this.beats[this.index] as PalaceBeat;

      if (!this.entered) {
        this.entered = true;
        this.elapsed = 0;
        if (beat.kind === 'say') {
          events.push({
            type: 'say',
            index: this.index,
            ...(beat.speaker === undefined ? {} : { speaker: beat.speaker }),
            text: beat.text,
            ...(beat.role === undefined ? {} : { role: beat.role }),
          });
          this.waiting = true;
          break;
        }
        for (const action of beat.actions) events.push({ type: 'action', action });
        if (beat.ms <= 0) {
          this.index += 1;
          this.entered = false;
          continue;
        }
      }

      if (beat.kind === 'say') {
        this.waiting = true;
        break;
      }

      const remain = Math.max(0, beat.ms - this.elapsed);
      if (budget >= remain) {
        budget -= remain;
        this.index += 1;
        this.entered = false;
        continue;
      }
      this.elapsed += budget;
      budget = 0;
      break;
    }

    return events;
  }

  /** 点一下/按空格：放行当前台词。 */
  advance(): PalaceEvent[] {
    if (this.done) return [];
    if (!this.waiting) return [];
    this.waiting = false;
    this.index += 1;
    this.entered = false;
    this.elapsed = 0;
    return [];
  }

  /** 跳过：直接结束（场景拿去切战斗）。 */
  skip(): PalaceEvent[] {
    if (this.done) return [];
    this.done = true;
    this.waiting = false;
    this.index = this.beats.length;
    return [{ type: 'complete' }];
  }
}
