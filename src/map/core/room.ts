import {
  DEFAULT_INTERACT_RADIUS,
  type FootBox,
  type InteractableDef,
  type MapPoint,
  type RoomDef,
  type RoomTile,
  type TileChar,
} from '../types';

const VALID_TILES = new Set<string>(['#', '.', '~', 'P', '=']);
const WALKABLE = new Set<string>(['.', '~', 'P', '=']);

export function tileAt(room: RoomDef, col: number, row: number): RoomTile | null {
  if (col < 0 || row < 0 || col >= room.size[0] || row >= room.size[1]) return null;
  const line = room.ascii[row];
  const char = line?.[col];
  if (char === undefined || !VALID_TILES.has(char)) return null;
  return { col, row, char: char as TileChar };
}

export function isWalkableTile(room: RoomDef, col: number, row: number): boolean {
  const tile = tileAt(room, col, row);
  return tile !== null && WALKABLE.has(tile.char);
}

/** 设计坐标 → tile 坐标；越界返回 null。 */
export function worldToTile(room: RoomDef, point: MapPoint): { col: number; row: number } | null {
  const col = Math.floor((point.x - room.origin.x) / room.tileSize);
  const row = Math.floor((point.y - room.origin.y) / room.tileSize);
  if (col < 0 || row < 0 || col >= room.size[0] || row >= room.size[1]) return null;
  return { col, row };
}

/** tile 中心的设计坐标。 */
export function tileCenter(room: RoomDef, col: number, row: number): MapPoint {
  return {
    x: room.origin.x + col * room.tileSize + room.tileSize / 2,
    y: room.origin.y + row * room.tileSize + room.tileSize / 2,
  };
}

export function isWalkableAt(room: RoomDef, point: MapPoint): boolean {
  const tile = worldToTile(room, point);
  return tile !== null && isWalkableTile(room, tile.col, tile.row);
}

/** 四角 + 底边中点；脚底盒完全落在可走格上才算站得住。 */
export function canStandAt(room: RoomDef, feet: MapPoint, foot: FootBox): boolean {
  const half = foot.width / 2;
  const left = feet.x - half;
  const right = feet.x + half;
  const top = feet.y - foot.height;
  const bottom = feet.y;

  const probes: readonly MapPoint[] = [
    { x: left, y: top },
    { x: right, y: top },
    { x: left, y: bottom },
    { x: right, y: bottom },
    { x: feet.x, y: bottom },
  ];
  for (const probe of probes) {
    if (!isWalkableAt(room, probe)) return false;
  }
  return true;
}

export function interactableCenter(room: RoomDef, item: InteractableDef): MapPoint {
  return tileCenter(room, item.at[0], item.at[1]);
}

export function distance(a: MapPoint, b: MapPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 最近的可交互物；没有进入半径的返回 null。 */
export function findInteractableNear(
  room: RoomDef,
  feet: MapPoint,
  radiusOverride?: number,
): InteractableDef | null {
  let best: InteractableDef | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of room.interactables) {
    const radius = radiusOverride ?? item.radius ?? DEFAULT_INTERACT_RADIUS;
    const dist = distance(feet, interactableCenter(room, item));
    if (dist <= radius && dist < bestDistance) {
      best = item;
      bestDistance = dist;
    }
  }
  return best;
}

function walkableNeighbors(room: RoomDef, col: number, row: number): boolean {
  return (
    isWalkableTile(room, col - 1, row) ||
    isWalkableTile(room, col + 1, row) ||
    isWalkableTile(room, col, row - 1) ||
    isWalkableTile(room, col, row + 1)
  );
}

/** 从出生点做 BFS，返回可达的可走格集合（key = `col,row`）。 */
export function reachableTiles(room: RoomDef): ReadonlySet<string> {
  const start = room.spawn.at;
  if (!isWalkableTile(room, start[0], start[1])) return new Set<string>();

  const seen = new Set<string>();
  const queue: [number, number][] = [[start[0], start[1]]];
  seen.add(`${start[0]},${start[1]}`);

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    const [col, row] = next;
    const candidates: readonly [number, number][] = [
      [col - 1, row],
      [col + 1, row],
      [col, row - 1],
      [col, row + 1],
    ];
    for (const [c, r] of candidates) {
      const key = `${c},${r}`;
      if (seen.has(key) || !isWalkableTile(room, c, r)) continue;
      seen.add(key);
      queue.push([c, r]);
    }
  }
  return seen;
}

/** 交互点是否至少在相邻一格可站；用于「床/柜子本体不可走」的房间。 */
export function interactableReachable(room: RoomDef, item: InteractableDef): boolean {
  const [col, row] = item.at;
  if (isWalkableTile(room, col, row)) return true;
  return walkableNeighbors(room, col, row);
}

/**
 * 构建期 / 单测校验。返回空数组表示通过。
 * 规则只覆盖本期数据需要的最小集合，后续接多房间时再扩展。
 */
export function validateRoom(room: RoomDef): string[] {
  const errors: string[] = [];
  const [cols, rows] = room.size;

  if (cols <= 0 || rows <= 0) errors.push('size 必须为正整数');
  if (room.tileSize <= 0) errors.push('tileSize 必须为正整数');
  if (room.ascii.length !== rows) {
    errors.push(`ascii 行数 ${room.ascii.length} 与 size[1]=${rows} 不一致`);
  }

  let spawnCount = 0;
  for (let row = 0; row < room.ascii.length; row += 1) {
    const line = room.ascii[row] ?? '';
    if (line.length !== cols) {
      errors.push(`第 ${row} 行长度 ${line.length} 与 size[0]=${cols} 不一致`);
    }
    for (let col = 0; col < line.length; col += 1) {
      const char = line[col] ?? '';
      if (!VALID_TILES.has(char)) {
        errors.push(`(${col},${row}) 非法字符：${JSON.stringify(char)}`);
      }
      if (char === 'P') spawnCount += 1;
      if (row === 0 || row === rows - 1 || col === 0 || col === cols - 1) {
        if (char !== '#' && char !== '=') {
          errors.push(`(${col},${row}) 边界必须是 # 或 =，当前为 ${JSON.stringify(char)}`);
        }
      }
    }
  }

  if (spawnCount !== 1) errors.push(`P 出生点必须恰好一个，当前 ${spawnCount} 个`);
  const [spawnCol, spawnRow] = room.spawn.at;
  if (tileAt(room, spawnCol, spawnRow)?.char !== 'P') {
    errors.push(`spawn.at=(${spawnCol},${spawnRow}) 必须落在 P 上`);
  }
  if (!isWalkableTile(room, spawnCol, spawnRow)) errors.push('出生点必须可走');

  const ids = new Set<string>();
  for (const item of room.interactables) {
    if (ids.has(item.id)) errors.push(`交互点 id 重复：${item.id}`);
    ids.add(item.id);
    const [col, row] = item.at;
    if (col < 0 || row < 0 || col >= cols || row >= rows) {
      errors.push(`交互点 ${item.id} 越界：(${col},${row})`);
      continue;
    }
    if (!interactableReachable(room, item)) {
      errors.push(`交互点 ${item.id} 周围没有可走格`);
    }
  }

  const reachable = reachableTiles(room);
  for (const item of room.interactables) {
    const [col, row] = item.at;
    const neighbors: readonly [number, number][] = [
      [col, row],
      [col - 1, row],
      [col + 1, row],
      [col, row - 1],
      [col, row + 1],
    ];
    if (!neighbors.some(([c, r]) => reachable.has(`${c},${r}`))) {
      errors.push(`交互点 ${item.id} 从出生点不可达`);
    }
  }

  return errors;
}
