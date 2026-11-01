import Phaser from 'phaser';
import type { MapPoint } from '../map/types';
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
 * 老麦/老肯的替身：幻影立绘 + 名字，沿路径走。
 *
 * 两位都是**人形幻影**（一个觉得御膳房是他们的了，一个是老肯），不是矿工：
 * 游戏里「矿工」专指因泰里的机器人门卫，别把人类角色套成机器人。
 */
export class PairActor {
  readonly name: string;
  private readonly container: Phaser.GameObjects.Container;
  private readonly sprite: Phaser.GameObjects.Sprite;
  private readonly label: Phaser.GameObjects.Text;
  private readonly mapHeight: number;
  private positionValue: MapPoint;
  private path: MapPoint[] = [];
  private index = 0;
  private speed = 100;
  private onDone: (() => void) | null = null;
  private done = true;
  private scriptVisible = false;
  private visionVisible = true;
  private visibility = 0;
  private targetVisibility = 0;
  private facingKey: PairDir = 'down';
  private readonly cast: KitchenCastKeys;
  private walkClock = 0;
  private walkFrame = 0;

  constructor(
    scene: Phaser.Scene,
    name: string,
    color: number,
    start: MapPoint,
    mapHeight: number,
    cast: KitchenCastKeys = KITCHEN_CAST.oldMai,
  ) {
    this.name = name;
    this.cast = cast;
    this.mapHeight = mapHeight;
    this.positionValue = start;
    this.container = scene.add
      .container(start.x, start.y)
      .setDepth(characterDepth(start.y, mapHeight))
      .setAlpha(0)
      .setVisible(false);
    this.sprite = scene.add
      .sprite(0, 0, cast.still[castDir(cast, 'down')])
      .setOrigin(0.5, 394 / 400)
      // 同 KitchenEnemy：按方向补偿，转身不会忽大忽小。
      .setScale(castScale(cast, castDir(cast, 'down')));
    // 新美术自带配色，不再染色（tint 会把小丑脸糊成一片橙）。
    const bodyScale = (KITCHEN_CAST_BASE_SCALE * KITCHEN_CAST_ADULT_BIAS) / cast.heightRatio;
    this.label = makeSceneText(scene, 0, Math.round(-246 * (bodyScale / KITCHEN_CAST_BASE_SCALE)), name, {
      size: 15,
      color,
      alpha: 0.85,
      originX: 0.5,
      originY: 0.5,
      depth: 0,
    });
    this.container.add([this.sprite, this.label]);
    for (const key of Object.values(cast.walk)) {
      if (!scene.textures.exists(key)) continue;
      const texture = scene.textures.get(key);
      for (let index = 0; index < CH01_KITCHEN_WALK_FRAME_COUNT; index += 1) {
        if (!texture.has(String(index))) {
          texture.add(index, 0, index * CH01_KITCHEN_FRAME.width, 0, CH01_KITCHEN_FRAME.width, CH01_KITCHEN_FRAME.height);
        }
      }
    }
  }

  /** 当前朝向（用于"他有没有看见你"判定，不是给渲染用的）。 */
  get facing(): PairDir {
    return this.facingKey;
  }

  get position(): MapPoint {
    return this.positionValue;
  }

  get walking(): boolean {
    return !this.done;
  }

  setPosition(point: MapPoint): void {
    const dx = point.x - this.positionValue.x;
    const dy = point.y - this.positionValue.y;
    if (Math.hypot(dx, dy) > 0.2) {
      // 只记朝向；贴图由 updateAnimation 统一决定（静止→静态图，行走→行走 sheet）。
      this.facingKey = directionFromVector(dx, dy);
    }
    this.positionValue = point;
    this.container.setPosition(point.x, point.y);
    this.container.setDepth(characterDepth(point.y, this.mapHeight));
  }

  /**
   * 行走帧推进：只在真正移动时切到行走 sheet，站定时回到静态图。
   * 帧表用 `texture.add` 注册（和 KitchenEnemy 同一套），否则 Phaser 会报 no frame。
   */
  updateAnimation(dtMs: number): void {
    if (!this.walking) {
      const stillKey = this.cast.still[castDir(this.cast, this.facingKey)];
      if (this.sprite.texture.key !== stillKey) {
        this.sprite.setTexture(stillKey);
      }
      this.sprite.setScale(castScale(this.cast, castDir(this.cast, this.facingKey)));
      return;
    }
    const walkKey = this.cast.walk[castDir(this.cast, this.facingKey)];
    if (this.sprite.texture.key !== walkKey) {
      this.sprite.setTexture(walkKey);
      this.sprite.setScale(castScale(this.cast, castDir(this.cast, this.facingKey), true));
      this.walkFrame = 0;
      this.walkClock = 0;
    }
    this.walkClock += dtMs;
    if (this.walkClock >= PAIR_WALK_FRAME_MS) {
      this.walkClock = 0;
      this.walkFrame = (this.walkFrame + 1) % PAIR_WALK_FRAME_COUNT;
      this.sprite.setFrame(this.walkFrame);
    }
  }

  setVisible(visible: boolean): void {
    this.scriptVisible = visible;
    this.applyVisibilityTarget();
  }

  /** 玩家视线是否落在该角色格；被挡住/出视野时淡出。 */
  setVisionVisible(visible: boolean): void {
    this.visionVisible = visible;
    this.applyVisibilityTarget();
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

  private applyVisibilityTarget(): void {
    this.targetVisibility = this.scriptVisible && this.visionVisible ? 1 : 0;
  }

  walk(path: readonly MapPoint[], speed: number, onDone?: () => void): void {
    this.path = [...path];
    this.index = 0;
    this.speed = Math.max(1, speed);
    this.onDone = onDone ?? null;
    this.done = this.path.length === 0;
    if (this.done) this.onDone?.();
  }

  update(dtMs: number): void {
    if (this.done) return;
    const target = this.path[this.index];
    if (!target) {
      this.done = true;
      this.onDone?.();
      return;
    }
    const dx = target.x - this.positionValue.x;
    const dy = target.y - this.positionValue.y;
    const remaining = Math.hypot(dx, dy);
    const step = (this.speed * Math.min(100, Math.max(0, dtMs))) / 1000;
    if (remaining <= Math.max(4, step)) {
      this.setPosition(target);
      this.index += 1;
      if (this.index >= this.path.length) {
        this.done = true;
        this.onDone?.();
      }
      return;
    }
    this.setPosition({
      x: this.positionValue.x + (dx / remaining) * step,
      y: this.positionValue.y + (dy / remaining) * step,
    });
  }

  destroy(): void {
    this.container.destroy(true);
  }
}


/** 行走帧播放速度：65ms/帧 ≈ 1.3s 一循环，和主角一致。 */
const PAIR_WALK_FRAME_MS = 65;
const PAIR_WALK_FRAME_COUNT = CH01_KITCHEN_WALK_FRAME_COUNT;

type PairDir = 'down' | 'up' | 'left' | 'right' | 'downLeft' | 'downRight' | 'upLeft' | 'upRight';

function directionFromVector(dx: number, dy: number): PairDir {
  const angle = Math.atan2(dy, dx);
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  const dirs: PairDir[] = ['right', 'downRight', 'down', 'downLeft', 'left', 'upLeft', 'up', 'upRight'];
  return dirs[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8] ?? 'down';
}
