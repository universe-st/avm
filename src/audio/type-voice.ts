/**
 * 逐字提示音的「声线」分配（纯逻辑，不依赖 Phaser）。
 *
 * 没有配音时，逐字音就是玩家判断「谁在说话」的主要线索：
 * - 旁白 / 周全 / 郑卿 / 小白 各有一条专属声线；
 * - 其他角色（主持、太监、矿工……）用两条普通 blip 轮换。
 *
 * 说话人字符串来自 `DialogueLine.speaker`；`undefined` 视作旁白。
 */
import type { DialogueRole } from '../story/dialogue';

export type TypeVoice = 'narrator' | 'zhou' | 'zheng' | 'xiaobai' | 'generic';

/** 每个声线的混音响度（乘在 `settings.sfx` 上）；旁白最轻，周全最实。 */
export const TYPE_VOICE_GAIN: Readonly<Record<TypeVoice, number>> = {
  narrator: 0.55,
  zhou: 0.95,
  zheng: 0.85,
  xiaobai: 0.72,
  generic: 0.85,
};

/**
 * 把说话人映射到声线。
 *
 * 用 `includes` 而不是全等，是因为原文里还有「郑卿（梦中）」这类带后缀的说话人；
 * 它们仍然属于同一个角色，应该沿用郑卿的低沉声线。
 */
export function typeVoiceForSpeaker(
  speaker: string | undefined,
  role?: DialogueRole | undefined,
): TypeVoice {
  // 显示名会变（？？？ / 莫名其妙出现的白色小娃娃 / 小白），声线只认角色 id。
  if (role === 'xiaobai') return 'xiaobai';
  if (speaker === undefined || speaker === '' || speaker === '旁白') return 'narrator';
  if (speaker.includes('郑卿')) return 'zheng';
  if (speaker.includes('周全')) return 'zhou';
  if (speaker === '小白') return 'xiaobai';
  return 'generic';
}
