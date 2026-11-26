import { describe, expect, it } from 'vitest';
import {
  SAVE_BLOCK_MESSAGES,
  SAVE_BLOCK_ORDER,
  evaluateSaveAvailability,
  isFreeRoamPhase,
  type SaveAvailabilityContext,
} from '../src/app/save/save-availability';

/**
 * 「允许自由活动」判定表。
 *
 * 需求 §6：只有自由探索 phase（寝室/御膳房 phase === 'explore'）且不在
 * 对话/表演/过场/切场/结束/模态中、且非预览模式才能存档；金殿/战斗不许存。
 */

const BASE: SaveAvailabilityContext = {
  preview: false,
  module: 'ch01Dorm',
  phase: 'explore',
};

const blocked = (context: SaveAvailabilityContext): string | null => {
  const result = evaluateSaveAvailability(context);
  return result.allowed ? null : result.reason;
};

describe('存档可用性 · 自由活动判定表', () => {
  it('两个可存档模块的 explore 阶段可以存', () => {
    expect(evaluateSaveAvailability(BASE)).toMatchObject({ allowed: true });
    expect(
      evaluateSaveAvailability({ preview: false, module: 'ch01Kitchen', phase: 'explore' }).allowed,
    ).toBe(true);
  });

  it('寝室其它 phase 全部不许存', () => {
    for (const phase of ['intro', 'dream', 'battle', 'after', 'complete']) {
      expect(blocked({ ...BASE, phase }), phase).toBe('not-free-roam');
    }
  });

  it('御膳房其它 phase 全部不许存', () => {
    for (const phase of ['intro', 'gate', 'hide', 'pair', 'haystack', 'done', 'failed']) {
      expect(blocked({ preview: false, module: 'ch01Kitchen', phase }), phase).toBe(
        'not-free-roam',
      );
    }
  });

  it('金殿 / 战斗 / 标题这类模块不许存（跟 phase 无关）', () => {
    for (const module of ['ch01Palace', 'battleCh01', 'title', 'other'] as const) {
      expect(blocked({ ...BASE, module }), module).toBe('unsupported-module');
    }
  });

  it('预览模式优先级最高', () => {
    expect(blocked({ ...BASE, preview: true })).toBe('preview');
    // 预览 + 金殿：提示预览（它才是玩家该知道的根因）
    expect(blocked({ ...BASE, preview: true, module: 'ch01Palace' })).toBe('preview');
    // 预览 + 对话：同上
    expect(blocked({ ...BASE, preview: true, dialogue: true })).toBe('preview');
  });

  it('对话 / 表演 / 过场 / 切场 / 章节卡 / 结束 / 弹窗逐项都拦', () => {
    const cases: ReadonlyArray<[keyof SaveAvailabilityContext, string]> = [
      ['dialogue', 'dialogue'],
      ['performance', 'performance'],
      ['transition', 'transition'],
      ['cutscene', 'cutscene'],
      ['card', 'card'],
      ['ended', 'ended'],
      ['modalOpen', 'modal'],
    ];
    for (const [key, reason] of cases) {
      expect(blocked({ ...BASE, [key]: true }), key).toBe(reason);
    }
  });

  it('规则顺序固定：表演 > 对话 > 弹窗 > phase', () => {
    expect(
      blocked({ ...BASE, performance: true, dialogue: true, modalOpen: true }),
    ).toBe('performance');
    expect(blocked({ ...BASE, dialogue: true, modalOpen: true })).toBe('dialogue');
    // 不在 explore 时，即使没有别的标记也只报 not-free-roam
    expect(blocked({ ...BASE, phase: 'intro', modalOpen: true })).toBe('modal');
  });

  it('每条规则都有玩家能读懂的中文提示', () => {
    for (const reason of SAVE_BLOCK_ORDER) {
      expect(SAVE_BLOCK_MESSAGES[reason].length).toBeGreaterThan(3);
    }
  });

  it('isFreeRoamPhase 认两个模块的 explore + 寝室的 prep', () => {
    expect(isFreeRoamPhase('ch01Dorm', 'explore')).toBe(true);
    expect(isFreeRoamPhase('ch01Dorm', 'prep')).toBe(true);
    expect(isFreeRoamPhase('ch01Kitchen', 'explore')).toBe(true);
    expect(isFreeRoamPhase('ch01Kitchen', 'prep')).toBe(false);
    expect(isFreeRoamPhase('ch01Dorm', 'after')).toBe(false);
    expect(isFreeRoamPhase('ch01Palace', 'explore')).toBe(false);
  });
});
