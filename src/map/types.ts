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
 * ASCII 图例（与 `docs/DESIGN-MAP.md` 对齐，先只开放本期用到的字符）：
 * - `#` 墙 / 家具，不可走
 * - `.` 地板，可走
 * - `~` 装饰地面（地毯），可走
 * - `P` 默认出生点，可走
 * - `=` 门，可走（本期是交互物，不做切房）
 */
export type TileChar = '#' | '.' | '~' | 'P' | '=';

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
}

/** 脚底碰撞盒；坐标是脚底中心。 */
export interface FootBox {
  readonly width: number;
  readonly height: number;
}

export interface RoomTile {
  readonly col: number;
  readonly row: number;
  readonly char: TileChar;
}

export const DEFAULT_INTERACT_RADIUS = 100;
