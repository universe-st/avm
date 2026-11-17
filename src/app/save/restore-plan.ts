import type { BgmId } from '../../audio/bgm-tracks';
import { canStandAt, tileCenter, worldToTile } from '../../map/core/room';
import type { Facing, FootBox, MapPoint, RoomDef } from '../../map/types';
import type { Ch01FlowSnapshot } from '../../story/ch01-flow';
import { SAVE_FACINGS, type SaveDataV1, type SaveModule } from './schema';

/**
 * 读档时的「怎么落地」纯逻辑（不依赖 Phaser，可在 Node 里单测）。
 *
 * 三件事：
 * 1. 玩家坐标/朝向的校验与回退（异常坐标绝不直接 `setPosition`，否则会卡在墙里）；
 * 2. BGM 这类**状态型 cue** 的恢复决策（`docs/CUE-CONTRACT.md`：状态必须显式恢复，不能靠场景绑定表）；
 * 3. 存档 → 场景启动参数的路由（标题页读档与场景内读档共用同一份）。
 */

// ------------------------------------------------------------------ 玩家落点

export type PlayerRestoreReason =
  /** 坐标合法且站得住，精确落点。 */
  | 'exact'
  /** 存档里的坐标本身不合法（非有限数/越界）。 */
  | 'invalid'
  /** 坐标在房间里但脚盒压着不可走格（换视口/改地图后旧档常见）。 */
  | 'blocked';

export interface PlayerRestorePlan {
  /** 世界坐标（已加回房间 origin）。 */
  readonly position: MapPoint;
  readonly facing: Facing;
  /** true = 用存档坐标；false = 已回退到房间出生点。 */
  readonly exact: boolean;
  readonly reason: PlayerRestoreReason;
}

const FACING_SET = new Set<string>(SAVE_FACINGS);

/**
 * 存档里的 `player.x/y` 是**房间局部**坐标；这里加回 `room.origin` 得到世界坐标。
 *
 * 校验链条：有限数 → 在房间矩形内 → 脚盒完全站在可走格（`canStandAt`）→ 朝向合法。
 * 任一步失败就回退 `room.spawn`（出生点一定是可走的，地图数据由 `test/map-room.test.ts` 守着）。
 */
export function resolvePlayerRestore(
  room: RoomDef,
  foot: FootBox,
  saved: SaveDataV1['player'],
): PlayerRestorePlan {
  const facing = FACING_SET.has(saved.facing) ? saved.facing : room.spawn.facing;
  const fallback: PlayerRestorePlan = {
    position: tileCenter(room, room.spawn.at[0], room.spawn.at[1]),
    facing,
    exact: false,
    reason: 'invalid',
  };
  if (!Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return fallback;

  const world: MapPoint = { x: room.origin.x + saved.x, y: room.origin.y + saved.y };
  const roomWidth = room.size[0] * room.tileSize;
  const roomHeight = room.size[1] * room.tileSize;
  const localX = world.x - room.origin.x;
  const localY = world.y - room.origin.y;
  if (localX < 0 || localY < 0 || localX > roomWidth || localY > roomHeight) return fallback;
  if (worldToTile(room, world) === null) return fallback;

  if (!canStandAt(room, world, foot)) {
    return { ...fallback, reason: 'blocked' };
  }
  return { position: world, facing, exact: true, reason: 'exact' };
}

// ------------------------------------------------------------------ BGM

export type BgmRestorePlan =
  /** 真的去 `bgmManager.play(id)`。 */
  | { readonly action: 'play'; readonly id: BgmId; readonly reason: 'requested' }
  /** 不用动：没存 BGM，或当前已经正是那首且在播（同实例续播，不能重头播）。 */
  | { readonly action: 'none'; readonly reason: 'no-saved-bgm' | 'already-current' };

export interface BgmRestoreInput {
  readonly saved: BgmId | null;
  readonly currentId: BgmId | null;
  readonly playing: boolean;
}

/**
 * BGM 恢复决策。
 *
 * 规矩（`docs/CUE-CONTRACT.md` + 740ec3d/ede0145 的教训）：BGM 是**状态型**，
 * 场景绑定表只给出「这个场景默认放什么」，存档里那首（例如寝室回忆段的《危机来临》）
 * 必须由场景在 `enterScene()` 之后显式 `play()` 补上。
 *
 * 与当前曲目相同且正在播时不要去 play：`BgmManager.applyBinding()` 会判成 `continue`，
 * 虽然不会重头播，但白跑一次淡入逻辑没有意义。相同但**被暂停**的情况交给管理器 resume。
 */
export function planBgmRestore(input: BgmRestoreInput): BgmRestorePlan {
  if (input.saved === null) return { action: 'none', reason: 'no-saved-bgm' };
  if (input.saved === input.currentId && input.playing) {
    return { action: 'none', reason: 'already-current' };
  }
  return { action: 'play', id: input.saved, reason: 'requested' };
}

// ------------------------------------------------------------------ Ch01Flow

/**
 * 寝室流程的恢复快照。
 *
 * 只有寝室存档里有意义：御膳房的存档带的是「第一节已完成」的固定 `dorm` 字段，
 * 不拿去恢复寝室流程（用户是从标题/御膳房菜单读档的，不会跳回寝室）。
 */
export function flowSnapshotFromSave(save: SaveDataV1): Ch01FlowSnapshot | null {
  if (save.module !== 'ch01Dorm') return null;
  return {
    // 存档只在自由探索时写入，所以恢复的 phase 恒为 explore（见 `docs/SAVE-SYSTEM.md` §3）。
    phase: 'explore',
    objective: save.objective,
    talkedZheng: save.dorm.talkedZheng,
    phoneFound: save.dorm.phoneFound,
  };
}

// ------------------------------------------------------------------ 读档路由

export interface SaveLoadRoute {
  readonly module: SaveModule;
  readonly data: { readonly restore: SaveDataV1 };
}

/**
 * 标题页 / 场景内读档的唯一路由：进哪个模块、带什么数据。
 *
 * 存档的 `module` 已经在 `parseSaveValue()` 里限定为 `SAVE_MODULES`，所以这里不会再落到
 * 金殿/战斗；返回 null 只用于「调用方拿到的不是一份合法存档」的防御性场景。
 */
export function saveLoadRoute(save: SaveDataV1): SaveLoadRoute | null {
  if (save.module !== 'ch01Dorm' && save.module !== 'ch01Kitchen') return null;
  return { module: save.module, data: { restore: save } };
}
