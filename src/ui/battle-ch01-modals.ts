import type { ModalHandle, MVVMPlugin } from '@phaser-mvvm/phaser';
import { MODAL_NO_AUTOFOCUS } from './modal-guard';
import { Button, Column, Divider, Panel, Row, Text } from '@phaser-mvvm/widgets/compose';
import { CH01_BATTLE_BANNER } from '../story/ch01-dorm';
import { TONE_TEXT_COLOR } from './hud-kit';

/**
 * 战斗相关模态（v2）。
 *
 * 三张卡都允许由战斗数据覆盖文案：金殿剧情战与御膳房遭遇战的规则/收尾完全不同，
 * 不能再把「固定 1 伤害」「矿场清除协议」写死在这层 UI 里。
 */
export function openBattleIntro(
  mvvm: MVVMPlugin,
  callbacks: {
    onClose: () => void;
    readonly badge?: string;
    readonly title?: string;
    readonly target?: string;
    readonly lines?: readonly string[];
    readonly ruleText?: string;
    readonly buttonLabel?: string;
  },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 620, padding: 30, gap: 12, variant: 'surface' }, () => {
        Text(callbacks.badge ?? 'PROTOCOL / CLEAR', { size: 'xs', tone: 'muted', align: 'center' });
        Text(callbacks.title ?? '矿场清除协议', { size: 'xl', tone: 'danger', align: 'center' });
        Divider({});
        Text(`目标：${callbacks.target ?? CH01_BATTLE_BANNER.subtitle}`, {
          size: 'md',
          align: 'center',
        });
        Text((callbacks.lines ?? CH01_BATTLE_BANNER.intro).join('\n'), {
          size: 'sm',
          tone: 'muted',
          align: 'center',
        });
        Text(callbacks.ruleText ?? '你只能移动与防御。', {
          size: 'sm',
          tone: 'primary',
          align: 'center',
        });
        Row({ width: 'fill', justifyContent: 'center' }, () => {
          Button(callbacks.buttonLabel ?? '迎战', {
            variant: 'primary',
            size: 'lg',
            width: 240,
            onClick: () => {
              modal?.close();
            },
          });
        });
      });
    },
    {
      ...MODAL_NO_AUTOFOCUS,
      dismissible: false,
      name: 'ch01-battle-intro',
      onClose: callbacks.onClose,
    },
  );
  return modal;
}

export function openBattleDefeat(
  mvvm: MVVMPlugin,
  options: {
    readonly preview: boolean;
    readonly title?: string;
    readonly lines?: readonly string[];
    readonly hint?: string;
    readonly wakeLabel?: string;
    readonly onRestart: () => void;
    readonly onTitle: () => void;
    readonly onWake: () => void;
    readonly onClose: () => void;
  },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 640, padding: 32, gap: 14, variant: 'surface' }, () => {
        Text('战斗 · 战败', { size: 'xs', tone: 'muted', align: 'center' });
        Text(options.title ?? '剧情战 · 战败', { size: 'xl', tone: 'danger', align: 'center' });
        Divider({});
        Text((options.lines ?? CH01_BATTLE_BANNER.defeat).join('\n'), {
          size: 'md',
          align: 'center',
        });
        Text(options.hint ?? '这不是游戏结束。你只是被踢出了梦域。', {
          size: 'sm',
          tone: 'muted',
          align: 'center',
        });
        Row({ width: 'fill', gap: 12, justifyContent: 'center' }, () => {
          if (options.preview) {
            Button('重开战斗', {
              variant: 'secondary',
              size: 'md',
              width: 200,
              onClick: () => {
                modal?.close();
                options.onRestart();
              },
            });
            Button('返回标题', {
              variant: 'primary',
              size: 'md',
              width: 200,
              onClick: () => {
                modal?.close();
                options.onTitle();
              },
            });
          } else {
            Button(options.wakeLabel ?? '醒来', {
              variant: 'primary',
              size: 'lg',
              width: 260,
              onClick: () => {
                modal?.close();
                options.onWake();
              },
            });
          }
        });
      });
    },
    {
      ...MODAL_NO_AUTOFOCUS,
      dismissible: false,
      name: 'ch01-battle-defeat',
      onClose: options.onClose,
    },
  );
  return modal;
}

/**
 * 打赢后的收尾卡。
 *
 * 御膳房遭遇战打赢 = 回到地图继续潜行；预览里的胜利则给「重开 / 返回标题」，
 * 不能把验收者扔回一张没打开的地图。
 */
export function openBattleVictory(
  mvvm: MVVMPlugin,
  callbacks: {
    title: string;
    lines: readonly string[];
    preview: boolean;
    returnLabel?: string;
    onReturn: () => void;
    onRestart: () => void;
    onTitle: () => void;
    onClose: () => void;
  },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 640, padding: 32, gap: 14, variant: 'surface' }, () => {
        Text('战斗 · 解决', { size: 'xs', tone: 'muted', align: 'center' });
        Text(callbacks.title, { size: 'xl', tone: 'primary', align: 'center' });
        Divider({});
        Text(callbacks.lines.join('\n'), { size: 'md', align: 'center' });
        Row({ width: 'fill', gap: 12, justifyContent: 'center' }, () => {
          if (callbacks.preview) {
            Button('重开战斗', {
              variant: 'secondary',
              size: 'md',
              width: 200,
              onClick: () => {
                modal?.close();
                callbacks.onRestart();
              },
            });
            Button('返回标题', {
              variant: 'primary',
              size: 'md',
              width: 200,
              onClick: () => {
                modal?.close();
                callbacks.onTitle();
              },
            });
          } else {
            Button(callbacks.returnLabel ?? '回御膳房', {
              variant: 'primary',
              size: 'lg',
              width: 260,
              onClick: () => {
                modal?.close();
                callbacks.onReturn();
              },
            });
          }
        });
      });
    },
    {
      ...MODAL_NO_AUTOFOCUS,
      dismissible: false,
      name: 'ch01-battle-victory',
      onClose: callbacks.onClose,
    },
  );
  return modal;
}

export interface BattleSkillOption {
  readonly id: string;
  readonly name: string;
  readonly desc: string;
}

/** 点「攻击」先选技能；一个技能也走这个窗口。目标在技能选好后再点敌人选择。 */
export function openBattleSkill(
  mvvm: MVVMPlugin,
  options: {
    readonly skills: readonly BattleSkillOption[];
    readonly onSelect: (skillId: string) => void;
    readonly onClose: () => void;
  },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 620, padding: 28, gap: 12, variant: 'surface' }, () => {
        Text('选择技能', { size: 'xl', tone: 'primary', align: 'center' });
        Text('选好技能后，点敌人选择目标', { size: 'md', align: 'center' });
        Divider({});
        if (options.skills.length === 0) {
          Text('没有可用技能。', { size: 'sm', tone: 'muted', align: 'center' });
        }
        for (const skill of options.skills) {
          Column({ width: 'fill', gap: 4 }, () => {
            Button(skill.name, {
              variant: 'primary',
              size: 'md',
              width: 520,
              onClick: () => {
                modal?.close();
                options.onSelect(skill.id);
              },
            });
            Text(skill.desc, {
              size: 'sm',
              tone: 'muted',
              wrap: true,
              maxLines: 2,
            });
          });
        }
        Row({ width: 'fill', justifyContent: 'center' }, () => {
          Button('取消', {
            variant: 'secondary',
            size: 'md',
            width: 200,
            onClick: () => {
              modal?.close();
            },
          });
        });
      });
    },
    {
      ...MODAL_NO_AUTOFOCUS,
      dismissible: true,
      name: 'ch01-battle-skill',
      onClose: options.onClose,
    },
  );
  return modal;
}

export interface BattleCodexEntry {
  readonly id: string;
  readonly name: string;
  readonly known: boolean;
  readonly hp: number;
  readonly maxHp: number;
  readonly atk: number;
  readonly defense: number;
  readonly spd: number;
  readonly dodge: number;
  readonly skills: readonly string[];
}

/** 小白图鉴：已知怪给数值，未知怪只给问号。 */
export function openBattleCodex(
  mvvm: MVVMPlugin,
  options: {
    readonly entries: readonly BattleCodexEntry[];
    readonly onClose: () => void;
  },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 640, padding: 28, gap: 10, variant: 'surface' }, () => {
        Text('小白图鉴', { size: 'xl', tone: 'primary', align: 'center' });
        Text('攻击过它一次，小白就能看出底细。', {
          size: 'sm',
          tone: 'muted',
          align: 'center',
        });
        Divider({});
        for (const entry of options.entries) {
          Column({ width: 'fill', gap: 3 }, () => {
            Text(entry.name, {
              size: 'md',
              tone: entry.known ? 'primary' : 'muted',
            });
            if (entry.known) {
              Text(
                `HP ${entry.hp}/${entry.maxHp} · 攻击 ${entry.atk} · 防御 ${entry.defense} · 速度 ${entry.spd} · 闪避 ${entry.dodge}`,
                { size: 'sm', tone: 'muted', wrap: true },
              );
              Text(`技能：${entry.skills.length > 0 ? entry.skills.join(' / ') : '—'}`, {
                size: 'sm',
                tone: 'muted',
                wrap: true,
                maxLines: 2,
              });
            } else {
              Text('HP ？？？ · 攻击 ？？？ · 防御 ？？？ · 速度 ？？？ · 闪避 ？？？', {
                size: 'sm',
                tone: 'muted',
                wrap: true,
              });
              Text('技能 ？？？', { size: 'sm', tone: 'muted' });
            }
          });
          Divider({});
        }
        Row({ width: 'fill', justifyContent: 'center' }, () => {
          Button('关闭', {
            variant: 'secondary',
            size: 'md',
            width: 200,
            onClick: () => {
              modal?.close();
            },
          });
        });
      });
    },
    {
      ...MODAL_NO_AUTOFOCUS,
      dismissible: true,
      name: 'ch01-battle-codex',
      onClose: options.onClose,
    },
  );
  return modal;
}

export function openBattleExit(
  mvvm: MVVMPlugin,
  callbacks: { onTitle: () => void; onClose: () => void },
): ModalHandle {
  let modal: ModalHandle | null = null;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 580, padding: 28, gap: 14, variant: 'surface' }, () => {
        Text('离开战斗？', { size: 'lg' });
        Text('进度已记在「继续游戏」里，下次会从战后接着走。', {
          size: 'sm',
          tone: 'muted',
        });
        Row({ width: 'fill', gap: 12, justifyContent: 'end' }, () => {
          Button('继续战斗', {
            variant: 'secondary',
            size: 'md',
            width: 180,
            onClick: () => {
              modal?.close();
            },
          });
          Button('返回标题', {
            variant: 'primary',
            size: 'md',
            width: 180,
            onClick: () => {
              modal?.close();
              callbacks.onTitle();
            },
          });
        });
      });
    },
    {
      dismissible: true,
      name: 'ch01-battle-exit',
      onClose: callbacks.onClose,
    },
  );
  return modal;
}

/**
 * 第一场教程对话：逐句插入在战斗中。旁白/小白/机器人/周全用统一的语义色，
 * 场景在两句之间播放真实攻击/出拳，再由玩家点「继续」推进。
 */
export function openBattleTalk(
  mvvm: MVVMPlugin,
  options: {
    readonly speaker: string;
    readonly text: string;
    readonly tone: 'narration' | 'zhou' | 'zheng' | 'xiaobai' | 'miner' | 'default';
    readonly onClose: () => void;
  },
): ModalHandle {
  let modal: ModalHandle | null = null;
  const color = TONE_TEXT_COLOR[options.tone] ?? TONE_TEXT_COLOR.default;
  modal = mvvm.modal.open(
    () => {
      Panel({ width: 620, padding: 26, gap: 12, variant: 'surface' }, () => {
        Text(options.speaker, {
          size: 'sm',
          style: { color },
          align: 'left',
        });
        Text(options.text, {
          size: 'lg',
          wrap: true,
          style: { color },
        });
        Row({ width: 'fill', justifyContent: 'end' }, () => {
          Button('继续', {
            variant: 'primary',
            size: 'md',
            width: 160,
            onClick: () => {
              modal?.close();
            },
          });
        });
      });
    },
    {
      ...MODAL_NO_AUTOFOCUS,
      dismissible: false,
      name: 'ch01-battle-talk',
      onClose: options.onClose,
    },
  );
  return modal;
}
