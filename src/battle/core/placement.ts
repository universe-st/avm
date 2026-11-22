import type { BattleSetup, SlotId } from '../types';
import { hashSeed, mulberry32 } from '../../dev/random';
import { RING_ORDER, SLOT_ORDER } from './slots';

/**
 * 初始点位：剧情指定优先，未指定的怪物用 seed 从空点位里不放回抽取。
 *
 * - 7 个点位最多站 7 个单位；不足时抛出明确的数据错误。
 * - 同 seed + 同 setup 必定同一布置；不允许 Math.random。
 * - 玩家默认 `left`（第 1 人）；后续多人按环位顺序补空位。
 */
export interface BattlePlacement {
  readonly partySlots: readonly SlotId[];
  readonly enemySlots: readonly SlotId[];
}

export function placeUnits(setup: BattleSetup, seed = 1): BattlePlacement {
  const ids = new Set<string>();
  for (const unit of [...setup.party, ...setup.enemies]) {
    if (ids.has(unit.id)) {
      throw new Error(`[battle] 单位 id 重复：${unit.id}`);
    }
    ids.add(unit.id);
  }

  const used = new Set<SlotId>();
  const take = (slot: SlotId, who: string): void => {
    if (used.has(slot)) {
      throw new Error(`[battle] ${who} 的点位 ${slot} 已被占用`);
    }
    used.add(slot);
  };

  // 显式点位先占座，避免“未写点位的玩家默认 left”抢走剧情指定的 enemy 点位。
  for (const unit of setup.party) {
    if (unit.slot) take(unit.slot, `party:${unit.id}`);
  }
  for (const unit of setup.enemies) {
    if (unit.slot) take(unit.slot, `enemy:${unit.id}`);
  }

  const partySlots: SlotId[] = setup.party.map((unit) => {
    const slot = unit.slot ?? defaultPartySlot(used);
    if (!unit.slot) {
      used.add(slot);
    }
    return slot;
  });

  const explicitEnemies: (SlotId | undefined)[] = setup.enemies.map((unit) => unit.slot);
  const pool = SLOT_ORDER.filter((slot) => !used.has(slot));
  const random = mulberry32((seed ^ hashSeed(setup.id)) >>> 0);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(random() * (index + 1));
    [pool[index], pool[pick]] = [pool[pick]!, pool[index]!];
  }

  const enemySlots = explicitEnemies.map((slot) => {
    if (slot) return slot;
    const next = pool.shift();
    if (!next) throw new Error('[battle] 点位不足：最多只能放 7 个单位');
    used.add(next);
    return next;
  });

  return { partySlots, enemySlots };
}

function defaultPartySlot(used: ReadonlySet<SlotId>): SlotId {
  for (const slot of RING_ORDER) {
    if (!used.has(slot)) return slot;
  }
  if (!used.has('center')) return 'center';
  throw new Error('[battle] 点位不足：最多只能放 7 个单位');
}
