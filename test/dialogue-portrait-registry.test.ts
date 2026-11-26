import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BUNDLES, expandBundleIds } from '../src/assets/bundles';
import { MODULES } from '../src/app/modules';
import type { BundleId } from '../src/assets/types';
import { XIAOBAI_SPEAKER } from '../src/story/ch01-palace';
import {
  SPEAKER_PORTRAIT_EMOTIONS,
  SPEAKER_PORTRAITS,
  portraitForSpeaker,
  reducePortraitForLine,
} from '../src/story/portraits';
import { reducePortraitForSay } from '../src/story/ch01-palace';

/**
 * 「所有对话都有贴图」的护栏。
 *
 * 2026-11-24 用户要求：战斗里的插入对话要和剧情对话同一套样式，并且**给所有对话都加上人物贴图**；
 * 缺图就用游戏素材大师生成。这条需求最容易在执行里漏掉的地方不是画图，而是**接线**：
 * 加了一个新说话人、或者把立绘塞进了错的 bundle，单测/类型检查都不会报，只有玩家看到
 * 「只有文字没有脸」。所以这里守三件事：
 *
 * 1. 每个剧本里出现过的说话人都在 `SPEAKER_PORTRAITS` 里表过态（有脸给 key，没脸给 null）；
 * 2. 那个 key 所在的 bundle **真的被该场景加载**（不是画了图却没打进去）；
 * 3. 归约语义：旁白收脸、换人换脸、没脸收脸、CG/黑场不叠图。
 */

const STORY_SOURCES = [
  'src/story/ch01-dorm.ts',
  'src/story/ch01-after.ts',
  'src/story/ch01-kitchen.ts',
  'src/story/ch01-palace.ts',
  'src/story/ch01-first-battle.ts',
] as const;

/** 剧本源文件里的显示名字面量（旁白/说明文字用 `speaker: '旁白'` 也在这里）。 */
function literalSpeakers(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/speaker:\s*'([^']*)'/g)].map((match) => match[1] ?? '');
}

/** 说话人 → 立绘 key 所属的 bundle（找不到 = 没登记）。 */
function bundleOfKey(key: string): BundleId | null {
  for (const [id, bundle] of Object.entries(BUNDLES)) {
    if (bundle.assets.some((asset) => asset.key === key)) return id as BundleId;
  }
  return null;
}

describe('对话立绘对位表：每个开口的人都有交代', () => {
  const speakers = [...new Set(STORY_SOURCES.flatMap(literalSpeakers))].filter(
    (name) => name !== '' && name !== '旁白',
  );

  it('剧本里的非旁白说话人都能在表里查到（未知的人不许静默收脸）', () => {
    const missing = speakers.filter((name) => {
      const entry = portraitForSpeaker(name);
      if (entry !== null && entry !== undefined) return false;
      // 返回 null 时必须是在表里明确写了 null（主持人在 CG 里），而不是「没登记」。
      return !Object.prototype.hasOwnProperty.call(SPEAKER_PORTRAITS, name);
    });
    expect(missing, '这些说话人没有在 SPEAKER_PORTRAITS 里表态').toEqual([]);
  });

  it('金殿里改名的小白（XIAOBAI_SPEAKER）也挂同一张脸', () => {
    const entry = portraitForSpeaker(XIAOBAI_SPEAKER);
    expect(entry?.key).toBe('img.char.portrait.xiaobai');
  });

  it('战斗里的「侍卫机器人」挂矿工立绘（同一台铁皮机器人）', () => {
    expect(portraitForSpeaker('侍卫机器人')?.key).toBe('img.char.portrait.miner');
  });

  it('表里每张立绘 key 都只登记在一个 bundle 里，且文件存在', () => {
    const keys = new Set<string>();
    for (const entry of Object.values(SPEAKER_PORTRAITS)) {
      if (entry) keys.add(entry.key);
    }
    for (const variants of Object.values(SPEAKER_PORTRAIT_EMOTIONS)) {
      for (const key of Object.values(variants)) keys.add(key);
    }
    keys.add('img.char.portrait.xiaobai');
    for (const key of keys) {
      const bundle = bundleOfKey(key);
      expect(bundle, `${key} 没登记进任何 bundle`).not.toBeNull();
    }
  });
});

describe('场景加载的 bundle 里必须有该场景说话人的立绘', () => {
  const sceneSpeakers: readonly { module: keyof typeof MODULES; files: readonly string[] }[] = [
    { module: 'ch01Dorm', files: ['src/story/ch01-dorm.ts', 'src/story/ch01-after.ts'] },
    { module: 'ch01Kitchen', files: ['src/story/ch01-kitchen.ts'] },
    { module: 'ch01Palace', files: ['src/story/ch01-palace.ts'] },
    { module: 'battleCh01', files: ['src/story/ch01-first-battle.ts'] },
  ];

  it('每个场景里开口的人，其立绘所在 bundle 都在该模块的依赖闭包里', () => {
    const problems: string[] = [];
    for (const scene of sceneSpeakers) {
      const loaded = new Set(expandBundleIds(MODULES[scene.module].requires));
      const names = [...new Set(scene.files.flatMap(literalSpeakers))];
      for (const name of names) {
        if (name === '' || name === '旁白') continue;
        const entry = portraitForSpeaker(name);
        if (!entry) continue; // 明确没立绘（CG 里的主持人）
        const bundle = bundleOfKey(entry.key);
        if (bundle === null || !loaded.has(bundle)) {
          problems.push(`${scene.module}: ${name} → ${entry.key}（bundle ${bundle ?? '未登记'} 未加载）`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('reducePortraitForLine：谁开口谁上脸', () => {
  const zhou = { key: 'img.char.portrait.zhou' };
  const xiaobai = { key: 'img.char.portrait.xiaobai' };

  it('同一个人继续说：保持（不重复滑入）', () => {
    expect(reducePortraitForLine({ speaker: '周全' }, zhou)).toEqual({ action: 'keep' });
  });

  it('换人：换成新说话人的脸与默认站位', () => {
    expect(reducePortraitForLine({ speaker: '老麦' }, zhou)).toEqual({
      action: 'show',
      key: 'img.char.portrait.laomai',
      side: 'left',
    });
    expect(reducePortraitForLine({ speaker: '小白' }, zhou)).toEqual({
      action: 'show',
      key: 'img.char.portrait.xiaobai',
      side: 'right',
    });
  });

  it('旁白不挂立绘（有脸就收掉；本来没脸则什么都不做）', () => {
    expect(reducePortraitForLine({ speaker: '旁白' }, zhou)).toEqual({ action: 'hide' });
    expect(reducePortraitForLine({}, xiaobai)).toEqual({ action: 'hide' });
    expect(reducePortraitForLine({ speaker: '旁白' }, null)).toEqual({ action: 'keep' });
    expect(reducePortraitForLine({}, null)).toEqual({ action: 'keep' });
  });

  it('明确没立绘的人（新闻主持人）开口：收脸，不顶别人的脸', () => {
    expect(reducePortraitForLine({ speaker: '男主持' }, zhou)).toEqual({ action: 'hide' });
  });

  it('未登记的陌生人开口：收脸（宁可空着也不冒充）', () => {
    expect(reducePortraitForLine({ speaker: '路人甲' }, zhou)).toEqual({ action: 'hide' });
  });

  it('CG / 黑场 / 压迫演出行不叠立绘（画面已经由它们承载）', () => {
    expect(
      reducePortraitForLine({ speaker: '男主持', cg: 'img.cg.ch01.news' }, zhou),
    ).toEqual({ action: 'hide' });
    expect(reducePortraitForLine({ speaker: '周全', blackout: true }, zhou)).toEqual({
      action: 'hide',
    });
    expect(reducePortraitForLine({ speaker: '小白', dark: 'grip' }, xiaobai)).toEqual({
      action: 'hide',
    });
  });

  it('cg: null 是「收起 CG」而不是「挂着 CG」：说话人可以重新上脸', () => {
    expect(
      reducePortraitForLine({ speaker: '小白', cg: null }, null),
    ).toEqual({
      action: 'show',
      key: 'img.char.portrait.xiaobai',
      side: 'right',
    });
  });
});

describe('战斗对话与剧情对话共用同一套面板', () => {
  const battleScene = readFileSync('src/scenes/battle-ch01-scene.ts', 'utf8');
  const battleHud = readFileSync('src/ui/battle-hud.ts', 'utf8');
  const modals = readFileSync('src/ui/battle-ch01-modals.ts', 'utf8');

  it('战斗 HUD 的对话分支画的就是 buildDialoguePanel', () => {
    expect(battleHud).toContain('buildDialoguePanel(dialogue)');
  });

  it('战斗对话走 DialoguePlayer（打字机/分页/补全），不再用居中模态卡', () => {
    expect(battleScene).toContain('new DialoguePlayer(');
    expect(battleScene).toContain('new DialoguePortrait(');
    expect(battleScene).not.toContain('openBattleTalk');
    expect(modals).not.toContain('openBattleTalk');
  });

  it('立绘是屏幕层贴图：必须 setScrollFactor(0)（御膳房相机跟着玩家滚动）', () => {
    const layer = readFileSync('src/ui/portrait-layer.ts', 'utf8');
    expect(layer).toContain('.setScrollFactor(0)');
  });

  it('寝室 / 御膳房 / 战斗三个场景都接了立绘', () => {
    for (const file of [
      'src/scenes/ch01-dorm-scene.ts',
      'src/scenes/ch01-kitchen-scene.ts',
      'src/scenes/battle-ch01-scene.ts',
    ]) {
      const source = readFileSync(file, 'utf8');
      expect(source, `${file} 没接 DialoguePortrait`).toContain('new DialoguePortrait(');
      expect(source, `${file} 没在台词显示时对位`).toContain('alignForLine(');
    }
  });
});


describe('情绪差分立绘：按台词内容换脸', () => {
  it('周全四套差分都登记，并且各自是独立 key', () => {
    const variants = SPEAKER_PORTRAIT_EMOTIONS['周全'];
    expect(variants?.neutral).toBe('img.char.portrait.zhou');
    expect(variants?.frown).toBe('img.char.portrait.zhou_frown');
    expect(variants?.shocked).toBe('img.char.portrait.zhou_shocked');
    expect(variants?.happy).toBe('img.char.portrait.zhou_happy');
    expect(variants?.awkward).toBe('img.char.portrait.zhou_awkward');
    expect(new Set(Object.values(variants ?? {})).size).toBe(5);
  });

  it('郑卿四套差分都登记（平常沿用现有那张）', () => {
    const variants = SPEAKER_PORTRAIT_EMOTIONS['郑卿'];
    expect(variants?.neutral).toBe('img.char.portrait.zheng');
    expect(variants?.shocked).toBe('img.char.portrait.zheng_shocked');
    expect(variants?.happy).toBe('img.char.portrait.zheng_happy');
    expect(variants?.awkward).toBe('img.char.portrait.zheng_awkward');
  });

  it('台词写了情绪就换对应差分；没写/未登记回落默认脸', () => {
    expect(portraitForSpeaker('周全', undefined, 'shocked')?.key).toBe(
      'img.char.portrait.zhou_shocked',
    );
    expect(portraitForSpeaker('郑卿', undefined, 'happy')?.key).toBe(
      'img.char.portrait.zheng_happy',
    );
    expect(portraitForSpeaker('周全')?.key).toBe('img.char.portrait.zhou');
    // 小白没有差分：写了情绪也还是那张小白立绘。
    expect(portraitForSpeaker('小白', undefined, 'shocked')?.key).toBe(
      'img.char.portrait.xiaobai',
    );
    // 机器人没有差分。
    expect(portraitForSpeaker('矿工', undefined, 'happy')?.key).toBe('img.char.portrait.miner');
  });

  it('同一角色的表情切换是 soft（原地换图），换人才播入场动画', () => {
    const current = { key: 'img.char.portrait.zhou' };
    expect(
      reducePortraitForLine({ speaker: '周全', portraitEmotion: 'shocked' }, current),
    ).toEqual({
      action: 'show',
      key: 'img.char.portrait.zhou_shocked',
      side: 'left',
      soft: true,
    });
    expect(reducePortraitForLine({ speaker: '老麦' }, current)).toEqual({
      action: 'show',
      key: 'img.char.portrait.laomai',
      side: 'left',
    });
  });

  it('趴地起身那一行不挂立绘（人还在地上）', () => {
    expect(
      reducePortraitForLine(
        { speaker: '周全', getUp: true },
        { key: 'img.char.portrait.zhou' },
      ),
    ).toEqual({ action: 'hide' });
  });

  it('金殿：郑卿按台词换差分；周全在金殿是慌张特写，不套平常/震惊差分', () => {
    expect(reducePortraitForSay('郑卿', null, 'shocked')).toEqual({
      action: 'show',
      key: 'img.char.portrait.zheng_shocked',
      side: 'right',
    });
    expect(reducePortraitForSay('周全', { key: 'img.char.portrait.zhou_panic' }, 'shocked')).toEqual(
      { action: 'keep' },
    );
  });
});
