#!/usr/bin/env python3
"""把行走 sheet 的比例拉回静态图的水平。

背景：`make-walk-sheet.py` 抽出来的行走帧，人物整体比转圈静态图**矮胖**
（实测御厨 down：静态 221x371，行走 209x257；宽高比 0.596 → 0.813）。
重新生成视频也还是这样，模型画行走就是更矮更宽。

所以这里按方向算一次**非等比**缩放：
  - 高度：把行走帧中位高拉到静态图的高度（371）
  - 宽度：把行走帧中位宽拉到「静态宽高比 × 目标高」
所有帧共用同一组 (sx, sy)，脚底对齐、水平居中，保留行走的上下起伏。
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

DIRS = ["down", "up", "left", "right", "down_left", "down_right", "up_left", "up_right"]
FIGURE_BOTTOM = 394
ALPHA = 128


def content_bbox(arr: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(arr > ALPHA)
    if len(xs) == 0:
        return (0, 0, 0, 0)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def normalize(static: Path, sheet: Path, out: Path, frame_w: int, frame_h: int) -> dict:
    st = np.array(Image.open(static).convert("RGBA").split()[3])
    sx0, sy0, sx1, sy1 = content_bbox(st)
    static_w, static_h = sx1 - sx0, sy1 - sy0
    if static_w <= 0 or static_h <= 0:
        return {}

    img = Image.open(sheet).convert("RGBA")
    src = np.array(img.split()[3])

    heights, widths = [], []
    for i in range(img.width // frame_w):
        box = content_bbox(src[:, i * frame_w : (i + 1) * frame_w])
        widths.append(box[2] - box[0])
        heights.append(box[3] - box[1])
    h_med = int(np.median([h for h in heights if h]))
    w_med = int(np.median([w for w in widths if w]))
    if h_med <= 0 or w_med <= 0:
        return {}

    target_h = static_h
    target_w = target_h * (static_w / static_h)
    sy = target_h / h_med
    sx = target_w / w_med

    cells = img.width // frame_w
    result = Image.new("RGBA", (cells * frame_w, frame_h), (0, 0, 0, 0))
    for i in range(cells):
        cell = img.crop((i * frame_w, 0, (i + 1) * frame_w, frame_h))
        box = content_bbox(np.array(cell.split()[3]))
        if box[2] - box[0] <= 0:
            continue
        content = cell.crop(box)
        nw = max(1, round(content.width * sx))
        nh = max(1, round(content.height * sy))
        if nw > frame_w or nh > frame_h:
            # 超框就整体等比缩回去，宁可小一点也不裁掉手脚。
            k = min(frame_w / nw, frame_h / nh)
            nw, nh = max(1, round(nw * k)), max(1, round(nh * k))
        content = content.resize((nw, nh), Image.Resampling.LANCZOS)
        x = i * frame_w + (frame_w - nw) // 2
        y = FIGURE_BOTTOM - nh
        result.alpha_composite(content, (max(0, x), max(0, y)))

    out.parent.mkdir(parents=True, exist_ok=True)
    result.save(out, "WEBP", quality=78, method=6)
    return {
        "static": (static_w, static_h),
        "walk": (w_med, h_med),
        "scale": (round(sx, 3), round(sy, 3)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="行走 sheet 比例对齐静态图")
    parser.add_argument("--dir", type=Path, required=True, help="角色目录（含 <slug>_<dir>.png 与 <slug>_walk_<dir>.webp）")
    parser.add_argument("--slug", required=True)
    parser.add_argument("--frame-size", default="224x400")
    parser.add_argument("--only", default=None, help="只处理这几个方向")
    args = parser.parse_args()

    frame_w, frame_h = (int(v) for v in args.frame_size.lower().split("x"))
    dirs = [d for d in (args.only.split(",") if args.only else DIRS) if d]
    for d in dirs:
        static = args.dir / f"{args.slug}_{d}.png"
        sheet = args.dir / f"{args.slug}_walk_{d}.webp"
        if not static.exists() or not sheet.exists():
            print(f"[skip] {d}: 缺文件")
            continue
        info = normalize(static, sheet, sheet, frame_w, frame_h)
        if info:
            print(
                f"[norm] {d:11s} 静态 {info['static'][0]}x{info['static'][1]}"
                f" / 行走 {info['walk'][0]}x{info['walk'][1]}"
                f" → sx={info['scale'][0]} sy={info['scale'][1]}"
            )


if __name__ == "__main__":
    main()
