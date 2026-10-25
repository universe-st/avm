import { describe, expect, it } from 'vitest';
import { MODULES } from '../src/app/modules';
import { CONTENT_SCENE_KEYS, SCENE_KEYS } from '../src/app/scene-keys';
import {
  STAGE_CATALOG,
  findStage,
  listStages,
  stageCatalogStats,
  toStageSummary,
  validateStageCatalog,
} from '../src/dev/stage-catalog';
import type { CgStageDef, SceneStageDef } from '../src/dev/stage-types';
import { isStageId } from '../src/dev/stage-types';

const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value) => right.includes(value));

describe('stage catalog', () => {
  it('passes structural validation', () => {
    expect(validateStageCatalog()).toEqual([]);
  });

  it('has a unique, valid id for every entry', () => {
    const ids = STAGE_CATALOG.map((stage) => stage.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(isStageId(id)).toBe(true);
  });

  it('registers one stage entry per game module with the same kind and resource gate', () => {
    for (const module of Object.values(MODULES)) {
      const match = STAGE_CATALOG.find(
        (stage) => stage.kind === module.kind && stage.sceneKey === module.sceneKey,
      );
      expect(match, `缺少舞台入口：${module.sceneKey}`).toBeDefined();
      if (!match) continue;
      expect(match.requires).toEqual(module.requires);
      expect(match.status).toBe('ready');
    }
  });

  it('covers every content scene key with at least one launchable entry', () => {
    const covered = new Set<string>();
    for (const stage of STAGE_CATALOG) {
      if (stage.status !== 'ready') continue;
      if (stage.kind === 'cg') covered.add(SCENE_KEYS.cgStage);
      else covered.add(stage.sceneKey);
    }
    for (const sceneKey of CONTENT_SCENE_KEYS) {
      expect(covered.has(sceneKey), `内容场景没有舞台入口：${sceneKey}`).toBe(true);
    }
  });

  it('declares the three kinds and keeps the current inventory complete', () => {
    const stats = stageCatalogStats();
    expect(stats.byKind.scene).toBeGreaterThanOrEqual(3);
    expect(stats.byKind.cg).toBeGreaterThanOrEqual(6);
    expect(stats.byKind.battle).toBeGreaterThanOrEqual(1);
    expect(stats.total).toBe(STAGE_CATALOG.length);
  });

  it('resolves ids case-insensitively and exposes frame counts', () => {
    const stage = findStage(' CG.PROLOGUE.DISASTER ');
    expect(stage?.kind).toBe('cg');
    const summary = toStageSummary(stage!);
    expect(summary.id).toBe('cg.prologue.disaster');
    expect(summary.frameCount).toBe(1);
    expect(summary.sceneKey).toBeUndefined();
  });

  it('sorts scenes before CG and battles', () => {
    const kinds = listStages(true).map((stage) => stage.kind);
    const firstCg = kinds.indexOf('cg');
    const firstBattle = kinds.indexOf('battle');
    expect(kinds.indexOf('scene')).toBeLessThan(firstCg);
    expect(firstCg).toBeLessThan(firstBattle);
  });

  it('can hide planned entries', () => {
    expect(listStages(false).every((stage) => stage.status === 'ready')).toBe(true);
  });
});

describe('stage catalog validation', () => {
  const scene = (patch: Partial<SceneStageDef> = {}): SceneStageDef => ({
    id: 'scene.alpha',
    kind: 'scene',
    sceneKey: SCENE_KEYS.title,
    title: '测试场景',
    status: 'ready',
    requires: ['core'],
    ...patch,
  });

  const cg = (patch: Partial<CgStageDef> = {}): CgStageDef => ({
    id: 'cg.alpha.one',
    kind: 'cg',
    title: '测试 CG',
    status: 'ready',
    requires: ['cutscene.prologue'],
    frames: [{ key: 'img.prologue.sky' }],
    ...patch,
  });

  it('accepts a minimal valid catalog', () => {
    expect(validateStageCatalog([scene(), cg()])).toEqual([]);
  });

  it('rejects kind/id prefix mismatches and duplicates', () => {
    expect(validateStageCatalog([scene({ id: 'cg.alpha' })])).not.toEqual([]);
    expect(validateStageCatalog([scene(), scene()])).toEqual(
      expect.arrayContaining([expect.stringContaining('id 重复')]),
    );
  });

  it('rejects aliases that collide with ids or other aliases', () => {
    const errors = validateStageCatalog([
      scene({ aliases: ['scene.old'] }),
      scene({ id: 'scene.beta', aliases: ['scene.old'] }),
    ]);
    expect(errors.some((error) => error.includes('alias'))).toBe(true);
  });

  it('rejects unknown bundles, unknown scene keys and missing CG textures', () => {
    expect(
      validateStageCatalog([scene({ requires: ['core', 'not.a.bundle' as unknown as 'core'] })]),
    ).toEqual(expect.arrayContaining([expect.stringContaining('未知 bundle')]));
    expect(
      validateStageCatalog([scene({ sceneKey: 'not-a-scene' })]),
    ).toEqual(expect.arrayContaining([expect.stringContaining('sceneKey 未登记')]));
    expect(
      validateStageCatalog([cg({ frames: [{ key: 'img.not.exists' }] })]),
    ).toEqual(expect.arrayContaining([expect.stringContaining('资源闭包')]));
  });

  it('rejects planned entries without a host implementation only at launch time', () => {
    // planned 只影响启动；目录结构本身仍然必须完整。
    expect(validateStageCatalog([scene({ status: 'planned' })])).toEqual([]);
  });

  it('keeps module gates and catalog gates in sync', () => {
    for (const module of Object.values(MODULES)) {
      const match = STAGE_CATALOG.find(
        (stage) => stage.kind === module.kind && stage.sceneKey === module.sceneKey,
      );
      expect(match).toBeDefined();
      expect(sameSet(match!.requires, module.requires)).toBe(true);
    }
  });
});
