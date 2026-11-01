import Phaser from 'phaser';
import type { MapPoint, PatrolDef, RoomDef } from '../map/types';
import { PatrolUnit, type PatrolPhase } from '../map/core/patrol';
import { characterDepth } from '../render/layers';
import { makeSceneText } from '../ui/cinematic';
import {
  CH01_KITCHEN_FRAME,
  CH01_KITCHEN_WALK_FRAME_COUNT,
  KITCHEN_CAST,
  KITCHEN_CAST_ADULT_BIAS,
  KITCHEN_CAST_BASE_SCALE,
  castDir,
  castScale,
  type KitchenCastKeys,
} from '../assets/keys';

/**
 * 巡逻/守卫的白盒表现：胶囊 + 朝向箭头 + 头顶 `?/!`。
 *
 * 逻辑在 `PatrolUnit`（无 Phaser）；这里只负责把位置/朝向/警戒画出来。
 */
export class KitchenEnemy {
  readonly def: PatrolDef;
  readonly unit: PatrolUnit;
  private readonly mapHeight: number;
  private readonly container: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;
  private readonly alert: Phaser.GameObjects.Text;
  private coneTilesValue: ReadonlySet<string> = new Set<string>();
  private visibility = 0;
  private targetVisibility = 0;
  private facingKey: PhantomDir = 'down';
  private walkClock = 0;
  private walkFrame = 0;
  private lastX = 0;
  private lastY = 0;
  private readonly guard: boolean;
  private readonly cook: boolean;
  private readonly cast: KitchenCastKeys;

  constructor(scene: Phaser.Scene, room: RoomDef, def: PatrolDef) {
    this.def = def;
    this.unit = new PatrolUnit(room, def);
    this.mapHeight = room.size[1] * room.tileSize;
    // 探索期不再有机器人形态：门卫也是梦中人，只有进战斗才会露出铁皮。
    this.guard = def.kind === 'guard';
    this.cook = def.id.startsWith('cook');
    this.cast = resolveCast(def);
    for (const key of Object.values(this.cast.walk)) {
      if (!scene.textures.exists(key)) continue;
      const texture = scene.textures.get(key);
      for (let index = 0; index < CH01_KITCHEN_WALK_FRAME_COUNT; index += 1) {
        if (!texture.has(String(index))) {
          texture.add(index, 0, index * CH01_KITCHEN_FRAME.width, 0, CH01_KITCHEN_FRAME.width, CH01_KITCHEN_FRAME.height);
        }
      }
    }
    this.container = scene.add
      .container(0, 0)
      .setDepth(characterDepth(this.unit.position.y, this.mapHeight))
      .setAlpha(0)
      .setVisible(false);
    this.sprite = scene.add
      .sprite(0, 0, this.cast.still.down)
      .setOrigin(0.5, 394 / 400)
      // 矿工机器人本体只占帧高的一半（内容 ~196px），按人类那套 0.6138 缩完只剩 120px，
      // 站在玩家旁边像个零件；单独放大到 0.8，让它仍然比人矮、但不至于看不见。
      // 按"这个方向"的实际身高反算缩放：各方向被宽度卡的程度不同，
      // 用一个统一值会让怪物转身忽大忽小。
      .setScale(castScale(this.cast, castDir(this.cast, this.facingKey)));
    const bodyScale = (KITCHEN_CAST_BASE_SCALE * KITCHEN_CAST_ADULT_BIAS) / this.cast.heightRatio;
    const labelY = Math.round(-246 * (bodyScale / KITCHEN_CAST_BASE_SCALE));
    const alertY = Math.round(-276 * (bodyScale / KITCHEN_CAST_BASE_SCALE));
    this.label = makeSceneText(scene, 0, labelY, def.label ?? (this.guard ? '门卫' : this.cook ? '御厨' : '幻影'), {
      size: 14,
      color: this.guard ? 0xff9a86 : this.cook ? 0xf0c070 : 0xe8d6b0,
      alpha: 0.8,
      originX: 0.5,
      originY: 0.5,
      depth: 0,
    });
    this.alert = makeSceneText(scene, 0, alertY, '', {
      size: 24,
      color: 0xffd166,
      alpha: 0,
      originX: 0.5,
      originY: 0.5,
      depth: 0,
    });
    this.container.add([this.sprite, this.label, this.alert]);
    this.lastX = this.unit.position.x;
    this.lastY = this.unit.position.y;
    this.sync();
  }

  get position(): MapPoint {
    return this.unit.position;
  }

  get facingRad(): number {
    return this.unit.facingRad;
  }

  get phase(): PatrolPhase {
    return this.unit.phase;
  }

  get alertValue(): number {
    return this.unit.alert;
  }

  get caught(): boolean {
    return this.unit.caught;
  }

  get coneTiles(): ReadonlySet<string> {
    return this.coneTilesValue;
  }

  setConeTiles(tiles: ReadonlySet<string>): void {
    this.coneTilesValue = tiles;
  }

  /** 目标可见性；实际透明度由 updateVisibility 做 ~180ms 淡入淡出。 */
  setBodyVisible(visible: boolean): void {
    this.targetVisibility = visible ? 1 : 0;
  }

  updateVisibility(dtMs: number): void {
    const step = Math.min(1, Math.max(0, dtMs) / 180);
    this.visibility += (this.targetVisibility - this.visibility) * step;
    if (this.visibility < 0.01) {
      this.visibility = 0;
      this.container.setVisible(false);
      return;
    }
    this.container.setVisible(true).setAlpha(this.visibility);
  }

  sync(): void {
    const position = this.unit.position;
    this.container.setPosition(position.x, position.y);
    this.container.setDepth(characterDepth(position.y, this.mapHeight));
    this.facingKey = directionFromRad(this.unit.facingRad);
    const alert = this.unit.alert;
    if (this.unit.phase === 'chase') {
      this.alert.setText('!').setColor('#ff5a4a').setAlpha(1);
    } else if (this.unit.phase === 'suspicious' || alert > 0.1) {
      this.alert.setText('?').setColor('#ffd166').setAlpha(0.85);
    } else {
      this.alert.setAlpha(0);
    }
  }

  /** 每帧：脚底位移驱动 20 帧行走；停下回静态八向。 */
  updateAnimation(dtMs: number): void {
    const position = this.unit.position;
    const moved = Math.hypot(position.x - this.lastX, position.y - this.lastY) > 0.18;
    this.lastX = position.x;
    this.lastY = position.y;
    if (!moved || this.cook) {
      this.walkClock = 0;
      this.walkFrame = 0;
      this.sprite.setTexture(this.cast.still[castDir(this.cast, this.facingKey)]);
      this.sprite.setScale(castScale(this.cast, castDir(this.cast, this.facingKey)));
      this.sprite.setFrame(0);
      return;
    }
    this.walkClock += Math.max(0, dtMs);
    if (this.walkClock >= 65) {
      this.walkClock %= 65;
      this.walkFrame = (this.walkFrame + 1) % CH01_KITCHEN_WALK_FRAME_COUNT;
    }
    this.sprite.setTexture(this.cast.walk[castDir(this.cast, this.facingKey)]);
    // 行走帧比静态图更矮（抽帧时宽度更容易被卡），要按行走身高单独补偿，否则一迈步就变矮。
    this.sprite.setScale(castScale(this.cast, castDir(this.cast, this.facingKey), true));
    this.sprite.setFrame(this.walkFrame);
  }

  destroy(): void {
    this.container.destroy(true);
  }
}


type PhantomDir = 'down' | 'up' | 'left' | 'right' | 'downLeft' | 'downRight' | 'upLeft' | 'upRight';

function resolveCast(def: PatrolDef): KitchenCastKeys {
  // 每个巡逻一套自己的形象：御厨胖厨子、太监宦官、门卫禁军，其余按人形幻影处理。
  if (def.kind === 'guard') return KITCHEN_CAST.guard;
  if (def.id.includes('pantry')) return KITCHEN_CAST.eunuch;
  if (def.id.startsWith('cook')) return KITCHEN_CAST.cook;
  if (def.label === '太监') return KITCHEN_CAST.eunuch;
  return KITCHEN_CAST.cook;
}

function directionFromRad(rad: number): PhantomDir {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  const dirs: PhantomDir[] = ['right', 'downRight', 'down', 'downLeft', 'left', 'upLeft', 'up', 'upRight'];
  const index = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return dirs[index] ?? 'down';
}
