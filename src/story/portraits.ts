import { PORTRAIT_ASSET_KEYS } from '../assets/keys';
import {
  isMinerSpeaker,
  isXiaobaiSpeaker,
  type DialogueLine,
  type DialogueRole,
} from './dialogue';

/**
 * 对话立绘「说话人 → 脸」的唯一真值（第一章全场景共用）。
 *
 * 2026-11-24 用户要求：**所有对话都要有贴图**，战斗里的插入对话也要和剧情对话一个样式。
 * 之前的立绘对位表只活在金殿（`PALACE_SPEAKER_PORTRAIT`），寝室/御膳房/战斗各自没有，
 * 于是同一个角色在不同场景里「有时有脸、有时没脸」。
 *
 * 现在的契约：
 * 1. 谁开口，屏幕上就只能是那个人的立绘；旁白不换脸（停在上一位说话人身上，避免每句闪一下）。
 * 2. 角色明确没有立绘 → `null`，开口时**收脸**，不许顶上一张别人的脸。
 * 3. 未登记的新说话人 → `null`（同样收脸）+ 护栏测试报错：加角色必须在这张表里表态。
 * 4. 这一行带 CG / 黑场 / 压迫演出 → 不挂立绘：画面已经由 CG 或暗场承载，
 *    再叠一张半身像会挡住内容（新闻里那两位主持人就是 CG 里的人物）。
 *
 * 判定唯一入口是 {@link reducePortraitForLine}；场景只消费它的结果，不许自己写 if。
 */

export interface SpeakerPortrait {
  readonly key: string;
  readonly side: 'left' | 'right';
}

/** 显示名 → 立绘。`null` = 明确没有立绘（比如只在 CG 里出现的主持人）。 */
export const SPEAKER_PORTRAITS: Readonly<Record<string, SpeakerPortrait | null>> = {
  周全: { key: PORTRAIT_ASSET_KEYS.zhou, side: 'left' },
  老麦: { key: PORTRAIT_ASSET_KEYS.laomai, side: 'left' },
  老肯: { key: PORTRAIT_ASSET_KEYS.laoken, side: 'right' },
  郑卿: { key: PORTRAIT_ASSET_KEYS.zheng, side: 'right' },
  楚公公: { key: PORTRAIT_ASSET_KEYS.chu, side: 'left' },
  侍卫: { key: PORTRAIT_ASSET_KEYS.shiwei, side: 'left' },
  // 殿前那两个蓝袍壮汉＝后文裂皮的「太监」，共用一张立绘。
  太监: { key: PORTRAIT_ASSET_KEYS.shiwei, side: 'left' },
  矿工: { key: PORTRAIT_ASSET_KEYS.miner, side: 'left' },
  // 第一场剧情战的敌人：金殿里裂皮后的同一台铁皮机器人。
  侍卫机器人: { key: PORTRAIT_ASSET_KEYS.miner, side: 'left' },
  清除单元: { key: PORTRAIT_ASSET_KEYS.miner, side: 'left' },
  // 沉睡症新闻里的两位主持人是 `cg.news` 里的人物（黑白电视画面），不叠立绘。
  男主持: null,
  女主持: null,
};

/** 小白所有会出现的显示名（名字会随剧情变，脸不变）。 */
const XIAOBAI_PORTRAIT: SpeakerPortrait = {
  key: PORTRAIT_ASSET_KEYS.xiaobai,
  side: 'right',
};

/**
 * 查表：`undefined` = 旁白/空说话人（保持现状）；`null` = 明确无立绘（收脸）。
 *
 * 名字兜底按「角色身份」判（小白/矿工/周全），因为剧本里的显示名会变：
 * `？？？`、`莫名其妙出现的白色小精灵`、`白色小精灵` 都是小白。
 */
export function portraitForSpeaker(
  speaker?: string,
  role?: DialogueRole,
): SpeakerPortrait | null | undefined {
  if (isXiaobaiSpeaker(speaker, role)) return XIAOBAI_PORTRAIT;
  const name = (speaker ?? '').trim();
  if (name === '' || name === '旁白') return undefined;
  if (isMinerSpeaker(name) || name.includes('机器人')) {
    return { key: PORTRAIT_ASSET_KEYS.miner, side: 'left' };
  }
  if (name.includes('周全')) return { key: PORTRAIT_ASSET_KEYS.zhou, side: 'left' };
  if (Object.prototype.hasOwnProperty.call(SPEAKER_PORTRAITS, name)) {
    return SPEAKER_PORTRAITS[name] ?? null;
  }
  return null;
}

/** 一句台词对应立绘该怎么处理；场景与单测共用这一个归约。 */
export type PortraitStep =
  | { readonly action: 'keep' }
  | { readonly action: 'show'; readonly key: string; readonly side: 'left' | 'right' }
  | { readonly action: 'hide' };

/** 这一行的画面已经被 CG / 黑场 / 压迫演出接管，不要再叠半身像。 */
function lineSuppressesPortrait(
  line: Pick<DialogueLine, 'cg' | 'blackout' | 'dark'>,
): boolean {
  return line.cg !== undefined || line.blackout !== undefined || line.dark !== undefined;
}

/**
 * 台词开口前，把当前立绘对齐到说话人。
 *
 * - 同一个人已经在场 → `keep`：保留显式站位，不要每句都从画面边上滑回来；
 * - 换人 → `show` 该角色的立绘与默认站位；
 * - 说话人明确没有立绘 / 未登记的陌生人 → `hide`（宁可空着，也不挂别人的脸）；
 * - 旁白 → `keep`（不闪）；
 * - CG/黑场行 → `hide`，CG 结束后的旁白也保持收脸，直到下一位有脸的人开口。
 */
export function reducePortraitForLine(
  line: Pick<DialogueLine, 'speaker' | 'role' | 'cg' | 'blackout' | 'dark'>,
  current: { readonly key: string } | null,
): PortraitStep {
  if (lineSuppressesPortrait(line)) return current ? { action: 'hide' } : { action: 'keep' };
  const entry = portraitForSpeaker(line.speaker, line.role);
  if (entry === undefined) return { action: 'keep' };
  if (entry === null) return current ? { action: 'hide' } : { action: 'keep' };
  if (current?.key === entry.key) return { action: 'keep' };
  return { action: 'show', key: entry.key, side: entry.side };
}
