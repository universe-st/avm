#!/usr/bin/env python3
"""金殿角色贴图的「脚底接触面」测量工具 —— 阴影对位的唯一真值来源。

用途：给每张角色贴图算出「看得见的底边」和底边附近的不透明宽度/中心，
再把它们换算成阴影椭圆应该放的位置。换贴图后重跑一遍，把输出抄进
`src/scenes/ch01-palace-shadow.ts` 的 `PALACE_FOOTPRINTS` 表；
`test/palace-shadow.test.ts` 会现场重算同一份数字并逐项对表，飘了立刻红。

用法：
  python3 tools/measure-actor-footprint.py                       # 全部金殿角色贴图
  python3 tools/measure-actor-footprint.py --keys zhou_kneel_up  # 只看几张
  python3 tools/measure-actor-footprint.py --json                # 机器可读

口径说明（与 TS 侧常量一一对应，改这里的口径必须同步改测试）：
- 角色帧 200×420，脚底基准线在画布第 400 行（`ACTOR_FOOT_RATIO = 400/420`）。
- 「不透明」= alpha ≥ 40/255。贴图最底下几行常是 alpha ≤ 32 的抗锯齿余烬
  （zhou_kneel_up 有 384–386 三行 max alpha 32/3/2），算进去会让阴影上移后
  仍然看起来悬空，所以按 40 阈值切掉。
- `contactBottomY`：满足阈值的**最低一行**（画布坐标，0 起）。
- `contactBand`：底边往上 `CONTACT_BAND_TEX`（24）行这一段。
- `contactWidth` / `contactCenterX`：这一段里**最宽的一行**的不透明跨度，
  以及该跨度的中心（相对画布中线 100 的偏移）。跪姿的膝+小腿、站立的鞋+袍脚
  都在这个带里，比只看最底一行（只剩鞋尖）稳。
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PALACE_DIR = os.path.join(ROOT, "public/assets/img/character/palace")

# ---------------------------------------------------------------- 与 TS 侧同步的口径
CANVAS_W = 200
CANVAS_H = 420
FOOT_ANCHOR_Y = 400  # setOrigin(0.5, 400/420) 的那条线
ACTOR_SCALE = 0.5  # 金殿 ACTOR_SCALE
ALPHA_CUTOFF = 40  # alpha < 40/255 视为不可见（抗锯齿余烬）
CONTACT_BAND_TEX = 24  # 底边往上多少画布像素算「接触带」

# 默认扫目录里所有角色贴图：半身立绘（portrait_*）不落地，不在此列。
# 行走 sheet 是 .webp，不在扫描范围内。
EXCLUDED_PREFIXES = ("portrait_",)

# 姿态是人读贴图决定的（矿工站得矮，不能按高矮自动判）：这张表只做参考输出。
POSE_HINTS = {
    "zhou_kneel_up": "kneel",
    "zhou_kneel_down": "kneel",
    "chu_gonggong_kneel": "kneel",
}


def discover() -> list[str]:
    names = sorted(
        name[:-4]
        for name in os.listdir(PALACE_DIR)
        if name.endswith(".png") and not name.startswith(EXCLUDED_PREFIXES)
    )
    return names


def measure(name: str) -> dict:
    path = os.path.join(PALACE_DIR, f"{name}.png")
    image = Image.open(path).convert("RGBA")
    if image.size != (CANVAS_W, CANVAS_H):
        raise SystemExit(f"{name}.png 画布 {image.size} 不是 {CANVAS_W}×{CANVAS_H}")
    pixels = image.load()

    # 每行的不透明跨度（alpha ≥ ALPHA_CUTOFF）
    rows: dict[int, tuple[int, int]] = {}
    for y in range(CANVAS_H):
        xs = [x for x in range(CANVAS_W) if pixels[x, y][3] >= ALPHA_CUTOFF]
        if xs:
            rows[y] = (xs[0], xs[-1])

    if not rows:
        raise SystemExit(f"{name}.png 全透明")
    bottom = max(rows)
    band_top = max(0, bottom - CONTACT_BAND_TEX)
    band = {y: span for y, span in rows.items() if y >= band_top}
    widest_y = max(band, key=lambda y: band[y][1] - band[y][0])
    x0, x1 = band[widest_y]
    width = x1 - x0 + 1
    center = (x0 + x1) / 2.0

    bbox_top = min(rows)
    return {
        "name": name,
        "poseHint": POSE_HINTS.get(name, "stand"),
        "bboxTopY": bbox_top,
        "contactBottomY": bottom,
        "contactBandTopY": band_top,
        "contactWidestRowY": widest_y,
        "contactWidth": width,
        "contactCenterX": center,
        "canvasCenterX": CANVAS_W / 2.0,
        # 换算到设计像素（ACTOR_SCALE 之后）
        "bottomOffsetDesign": (bottom - FOOT_ANCHOR_Y) * ACTOR_SCALE,
        "centerOffsetDesign": (center - CANVAS_W / 2.0) * ACTOR_SCALE,
        "contactWidthDesign": width * ACTOR_SCALE,
        "visibleHeightDesign": (bottom - bbox_top) * ACTOR_SCALE,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keys", nargs="*", help="只测这几张（文件名，不带 .png）")
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    parser.add_argument("--ts", action="store_true", help="输出可直接粘进 PALACE_FOOTPRINTS 的表行")
    parser.add_argument("--pattern", default=None, help="只测文件名包含该子串的贴图")
    args = parser.parse_args()

    names = args.keys or discover()
    if args.pattern:
        names = [n for n in names if args.pattern in n]
    results = [measure(name) for name in names]

    if args.json:
        print(json.dumps(results, ensure_ascii=False, indent=2))
        return 0

    if args.ts:
        for r in results:
            key = "img.char.palace." + r["name"]
            print(
                f"  ['{key}', {{ pose: '{r['poseHint']}', file: '{r['name']}.png', "
                f"contactBottomY: {r['contactBottomY']}, contactWidth: {r['contactWidth']}, "
                f"contactCenterX: {r['contactCenterX']:g} }}],"
            )
        return 0

    header = (
        f"{'texture':26s} {'bboxTop':>7s} {'bottom':>6s} {'bandTop':>7s} "
        f"{'widestRow':>9s} {'width':>5s} {'center':>6s} {'dX(design)':>10s} {'dBottom':>8s} {'w(design)':>9s}"
    )
    print(header)
    print("-" * len(header))
    for r in results:
        print(
            f"{r['name']:26s} {r['bboxTopY']:7d} {r['contactBottomY']:6d} {r['contactBandTopY']:7d} "
            f"{r['contactWidestRowY']:9d} {r['contactWidth']:5d} {r['contactCenterX']:6.1f} "
            f"{r['centerOffsetDesign']:+10.2f} {r['bottomOffsetDesign']:+8.1f} {r['contactWidthDesign']:9.1f}"
        )
    print()
    print(f"口径：alpha ≥ {ALPHA_CUTOFF}/255，接触带 = 底边往上 {CONTACT_BAND_TEX} 画布 px；"
          f"画布 {CANVAS_W}×{CANVAS_H}，脚底基准线 y={FOOT_ANCHOR_Y}，ACTOR_SCALE={ACTOR_SCALE}")
    print("dBottom = 不透明底边相对落点（toPixel 给的 y）的设计像素偏移，负数=比落点高。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
