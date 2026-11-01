/**
 * 地图数据的最小契约。
 *
 * M1a 只实现「一屏一屋」：一张 ASCII 碰撞网格 + 一张预烘焙房间图 + 若干交互点。
 * 多房间、门、巡逻、视线等仍按 `docs/DESIGN-MAP.md` 的分期计划后置。
 */

/** 八向朝向；地图角色用八向，战斗的左右排是另一套语义。 */
export type Facing =
  | 'up'
  | 'upRight'
  | 'right'
  | 'downRight'
  | 'down'
  | 'downLeft'
  | 'left'
  | 'upLeft';

/**
 * ASCII 图例（与 `docs/DESIGN-MAP.md` 对齐）：
 * - `#` 墙 / 高家具，不可走，挡视线
 * - `.` 地板，可走
 * - `~` 装饰地面（地毯/干草），可走
 * - `P` 默认出生点，可走
 * - `=` 门，可走（本期是交互物，不做切房）
 * - `o` 矮障碍（案台/坛子），不可走，不挡视线
 */
export type TileChar = '#' | '.' | '~' | 'P' | '=' | 'o';

export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface InteractableDef {
  /** 与 `src/story/` 中的交互映射一致；场景不靠 id 硬编码台词。 */
  readonly id: string;
  /** marker 所在 tile；可以是家具/墙格，只要附近有可走格。 */
  readonly at: readonly [number, number];
  /** 玩家脚底到 marker 中心的最大距离（设计单位）。 */
  readonly radius?: number;
}

export interface RoomSpawn {
  readonly at: readonly [number, number];
  readonly facing: Facing;
}

/** 一条巡逻/静止守卫。`path` 用 tile 坐标，必须轴对齐且可走。 */
export interface PatrolDef {
  readonly id: string;
  /**
   * 探索期的敌人一律是「梦中人」形态。
   * 机器人形态只在战斗里出现（`battle-ch01` 自己挑机器人图），
   * 所以这里不再有 `miner`——探索地图上不该出现铁皮怪物。
   */
  readonly kind: 'phantom' | 'guard';
  readonly path: readonly (readonly [number, number])[];
  /** 设计 px/s；0 = 原地站岗。 */
  readonly speed: number;
  readonly pauseMs: number;
  /** 到点停顿时左右扫视的角度（总角度）。 */
  readonly scanDeg: number;
  readonly vision: { readonly fovDeg: number; readonly rangeTiles: number };
  /** 头顶显示名，例如「御厨」「门卫」。 */
  readonly label?: string;
}

export type HideKind = 'hay' | 'cabinet' | 'screen';

/** 躲藏点：`at` 是玩家可站的格；橱柜/屏风本体在相邻的 `#` 上。 */
export interface HideDef {
  readonly id: string;
  readonly at: readonly [number, number];
  readonly kind: HideKind;
  readonly peek: boolean;
  readonly enterMs: number;
  readonly exitMs: number;
  /** 第三幕老肯/老麦的脚本搜索。 */
  readonly scriptedSearch?: boolean;
}

/** 矩形触发区，坐标沿 tile 网格：[c0,r0,c1,r1]。 */
export interface TriggerDef {
  readonly id: string;
  readonly rect: readonly [number, number, number, number];
  readonly once: boolean;
  readonly event: string;
}

export interface RoomDef {
  readonly id: string;
  readonly chapter: string;
  /** 给玩家看的房间名，例如「寝室」。 */
  readonly title: string;
  /** [列, 行]。 */
  readonly size: readonly [number, number];
  /** tile 的设计单位边长；M1a 固定 64。 */
  readonly tileSize: number;
  /** 房间左上角在设计坐标里的位置。 */
  readonly origin: MapPoint;
  /** `size[1]` 行，每行 `size[0]` 个字符。 */
  readonly ascii: readonly string[];
  readonly spawn: RoomSpawn;
  readonly interactables: readonly InteractableDef[];
  /** 挡视线的 tile；省略时只认 `#`。 */
  readonly sightBlockers?: readonly TileChar[];
  readonly patrols?: readonly PatrolDef[];
  readonly hides?: readonly HideDef[];
  readonly triggers?: readonly TriggerDef[];
}

/** 脚底碰撞盒；坐标是脚底中心。 */
export interface FootBox {
  readonly width: number;
  readonly height: number;
  /**
   * 脚盒向外扩的「视觉间余」（设计 px）。
   *
   * 碰撞是**几何**判定：脚底探针正好落在障碍格边界上就算站住，于是角色能贴着床沿站，
   * 实机上看起来就是「脚踩在床框上」。这个 padding 让探针比脚盒再外扩一点，
   * 角色会在离障碍几像素处停下，脚与床/墙之间留出一条缝。
   */
  readonly padding?: number;
}

export interface RoomTile {
  readonly col: number;
  readonly row: number;
  readonly char: TileChar;
}

export const DEFAULT_INTERACT_RADIUS = 100;
