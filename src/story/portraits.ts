import { PORTRAIT_ASSET_KEYS } from '../assets/keys';
import {
  isMinerSpeaker,
  isXiaobaiSpeaker,
  type DialogueLine,
  type DialogueRole,
  type PortraitEmotion,
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
 * 4. 这一行带 CG / 黑场 / 压迫演出 / 趴地起身 → 不挂立绘：画面已经由 CG 或暗场承载，
 *    再叠一张半身像会挡住内容（新闻里那两位主持人就是 CG 里的人物）。
 * 5. 这一行写了 `portraitEmotion` → 换成该角色的情绪差分（目前周全 / 郑卿）；
 *    没写或没登记 → 用默认脸。差分只影响「看图」，不改变谁上脸的判定。
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
 * 角色 → 情绪 → 立绘 key（2026-11-25「情绪差分立绘」）。
 *
 * 只有登记过差分的角色会换脸；`neutral` 就是该角色的默认立绘（`SPEAKER_PORTRAITS` 那张）。
 * 台词没有 `portraitEmotion` 时用默认脸；写了但这里没登记（或角色没有差分）时同样回落到默认脸，
 * 不会因为数据笔误把别人脸挂上来。
 *
 * 周全的默认脸换成新画的「平常」，2026-11-24 那张皱眉图降级为 `frown` 差分。
 * 金殿的周全用的是「被按跪慌张」特写（`PALACE_SPEAKER_PORTRAIT` 的覆盖），不参与这套差分。
 */
export const SPEAKER_PORTRAIT_EMOTIONS: Readonly<
  Record<string, Partial<Record<PortraitEmotion, string>>>
> = {
  周全: {
    neutral: PORTRAIT_ASSET_KEYS.zhou,
    frown: PORTRAIT_ASSET_KEYS.zhouFrown,
    shocked: PORTRAIT_ASSET_KEYS.zhouShocked,
    happy: PORTRAIT_ASSET_KEYS.zhouHappy,
    awkward: PORTRAIT_ASSET_KEYS.zhouAwkward,
  },
  郑卿: {
    neutral: PORTRAIT_ASSET_KEYS.zheng,
    shocked: PORTRAIT_ASSET_KEYS.zhengShocked,
    happy: PORTRAIT_ASSET_KEYS.zhengHappy,
    awkward: PORTRAIT_ASSET_KEYS.zhengAwkward,
  },
};

/** 反查一张立绘 key 属于哪个角色（表情差分原地换图用）。 */
export function portraitOwnerOfKey(key: string): string | null {
  for (const [name, entry] of Object.entries(SPEAKER_PORTRAITS)) {
    if (entry?.key === key) return name;
  }
  if (XIAOBAI_PORTRAIT.key === key) return 'xiaobai';
  for (const [name, variants] of Object.entries(SPEAKER_PORTRAIT_EMOTIONS)) {
    if (Object.values(variants).includes(key)) return name;
  }
  return null;
}

/** 这个说话人在这句里的情绪差分 key；没登记/没图返回 null（回落基础立绘）。 */
function emotionPortraitKey(
  speaker: string | undefined,
  role: DialogueRole | undefined,
  emotion: PortraitEmotion | undefined,
): string | null {
  if (emotion === undefined) return null;
  const name = (speaker ?? '').trim();
  const canonical = isXiaobaiSpeaker(speaker, role)
    ? 'xiaobai'
    : name.includes('周全')
      ? '周全'
      : name.includes('郑卿')
        ? '郑卿'
        : Object.prototype.hasOwnProperty.call(SPEAKER_PORTRAIT_EMOTIONS, name)
          ? name
          : null;
  if (canonical === null) return null;
  return SPEAKER_PORTRAIT_EMOTIONS[canonical]?.[emotion] ?? null;
}

/**
 * 查表：`undefined` = 旁白/空说话人（保持现状）；`null` = 明确无立绘（收脸）。
 *
 * 名字兜底按「角色身份」判（小白/矿工/周全），因为剧本里的显示名会变：
 * `？？？`、`莫名其妙出现的白色小精灵`、`白色小精灵` 都是小白。
 */
export function portraitForSpeaker(
  speaker?: string,
  role?: DialogueRole,
  emotion?: PortraitEmotion,
): SpeakerPortrait | null | undefined {
  const base = basePortraitForSpeaker(speaker, role);
  if (base === undefined || base === null) return base;
  const variant = emotionPortraitKey(speaker, role, emotion);
  return variant === null ? base : { key: variant, side: base.side };
}

function basePortraitForSpeaker(
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
  | {
      readonly action: 'show';
      readonly key: string;
      readonly side: 'left' | 'right';
      /**
       * 同一个人只是换表情（情绪差分）：原地换图，不播「从画面外滑入」的入场动画，
       * 否则每换一次表情人都要从边上飞进来一次。
       */
      readonly soft?: boolean;
    }
  | { readonly action: 'hide' };

/** 这一行的画面已经被 CG / 黑场 / 压迫演出接管，不要再叠半身像。 */
function lineSuppressesPortrait(
  line: Pick<DialogueLine, 'cg' | 'blackout' | 'dark' | 'getUp'>,
): boolean {
  return (
    // `cg: null` 是「主动收起 CG」，这一行起画面回到场景，立绘可以正常上脸。
    line.cg != null ||
    line.blackout !== undefined ||
    line.dark !== undefined ||
    // 趴在地上喘气的那一行：人还没站起来，不能挂一张站姿半身像。
    line.getUp === true
  );
}

/**
 * 台词开口前，把当前立绘对齐到说话人。
 *
 * - 同一个人已经在场 → `keep`：保留显式站位，不要每句都从画面边上滑回来；
 * - 换人 → `show` 该角色的立绘与默认站位；
 * - 说话人明确没有立绘 / 未登记的陌生人 → `hide`（宁可空着，也不挂别人的脸）；
 * - 旁白 → `hide`（旁白不挂立绘，2026-11-25 用户要求）；
 * - CG/黑场行 → `hide`，CG 结束后的旁白也保持收脸，直到下一位有脸的人开口。
 */
export function reducePortraitForLine(
  line: Pick<
    DialogueLine,
    'speaker' | 'role' | 'cg' | 'blackout' | 'dark' | 'getUp' | 'portraitEmotion'
  >,
  current: { readonly key: string } | null,
): PortraitStep {
  if (lineSuppressesPortrait(line)) return current ? { action: 'hide' } : { action: 'keep' };
  const entry = portraitForSpeaker(line.speaker, line.role, line.portraitEmotion);
  // 旁白（undefined）与「明确没立绘」（null）都收脸：2026-11-25 用户明确「旁白时候不需要有立绘」。
  // 下一位说话人会重新入场；同一个人再开口时由 `DialoguePortrait` 走 soft 淡回来（不滑入）。
  if (entry === undefined || entry === null) {
    return current ? { action: 'hide' } : { action: 'keep' };
  }
  if (current?.key === entry.key) return { action: 'keep' };
  const soft =
    current !== null &&
    portraitOwnerOfKey(current.key) !== null &&
    portraitOwnerOfKey(current.key) === portraitOwnerOfKey(entry.key);
  return soft
    ? { action: 'show', key: entry.key, side: entry.side, soft: true }
    : { action: 'show', key: entry.key, side: entry.side };
}
