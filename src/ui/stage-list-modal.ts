import type { ModalHandle, MVVMPlugin } from '@phaser-mvvm/phaser';
import { Button, Column, Divider, Panel, Row, Scroll, Text } from '@phaser-mvvm/widgets/compose';
import { listStages } from '../dev/stage-catalog';
import { STAGE_KIND_LABEL, type StageDef, type StageKind } from '../dev/stage-types';

/**
 * 标题页左下角「测试入口」的场景清单。
 *
 * 规则（docs/STAGE-PREVIEW.md §11）：
 * - 清单**只从 `STAGE_CATALOG` 生成**，这里不许手写第二份列表；
 * - 新增场景/CG/战斗只需要登记 `stage-catalog.ts`，这里自动出现；
 * - `status: 'planned'` 的条目会显示成灰色并禁止点击，用来占位「还没做」的后台页面。
 */
export interface StageListModalCallbacks {
  readonly onPick: (stage: StageDef) => void;
}

const KIND_ORDER: readonly StageKind[] = ['scene', 'cg', 'battle'];
const STATUS_LABEL: Readonly<Record<string, string>> = {
  ready: '',
  planned: '（未接入）',
};

export function openStageListModal(
  mvvm: MVVMPlugin,
  callbacks: StageListModalCallbacks,
): { modal: ModalHandle } {
  let modal: ModalHandle | null = null;
  const stages = listStages(true);

  modal = mvvm.modal.open(
    () => {
      Panel({ width: 660, padding: 26, gap: 10, variant: 'surface' }, () => {
        Text('测试入口', { size: 'lg', style: { fontStyle: 'bold' } });
        Text('直接跳到任意章节 / 场景。条目来自舞台目录，新增场景登记后自动出现。', {
          size: 'xs',
          tone: 'muted',
        });
        Divider({});
        Scroll({ height: 560, width: 'fill' }, () => {
          Column({ width: 'fill', gap: 14 }, () => {
            for (const kind of KIND_ORDER) {
              const group = stages.filter((stage) => stage.kind === kind);
              if (group.length === 0) continue;
              Text(STAGE_KIND_LABEL[kind], { size: 'sm', tone: 'muted' });
              for (const stage of group) {
                const ready = stage.status === 'ready';
                Button(`${stage.title}${STATUS_LABEL[stage.status] ?? ''}`, {
                  variant: ready ? 'secondary' : 'ghost',
                  size: 'md',
                  width: 'fill',
                  disabled: !ready,
                  onClick: () => {
                    modal?.close();
                    callbacks.onPick(stage);
                  },
                });
              }
            }
          });
        });
        Divider({});
        Row({ width: 'fill', justifyContent: 'center' }, () => {
          Button('关闭', {
            variant: 'ghost',
            size: 'md',
            width: 160,
            onClick: () => modal?.close(),
          });
        });
      });
    },
    { dismissible: true, name: 'stage-list' },
  );
  return { modal };
}
