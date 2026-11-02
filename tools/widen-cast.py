#!/usr/bin/env python3
"""把某个角色横向加宽一点（只改宽度、不改高度）。

用途：Q 版人形角色统一按「内容高 = 371」归一化之后，先天画得瘦的角色会显得像纸片人
（实测太监静态宽/高比只有 0.30–0.38，而御厨 0.60、门卫 0.53）。
横向拉伸是**非等比**的，但整组按同一系数、静态和行走一起改，所以：
- 站立 ↔ 行走不会跳；
- 转身时各方向的原始差异仍然保留（不会变成"每个方向一样宽"）。

锚点：内容水平居中、脚底贴 `FIGURE_BOTTOM`，与 normalize-walk-sheet.py 一致。
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

DIRS = ["down", "up", "left", "right", "down_left", "down_right", "up_left", "up_right"]
FIGURE_BOTTOM = 394
ALPHA = 128
MARGIN = 4


def bbox(arr: np.ndarray) -> tuple[int, int, int, int]:
    ys, xs = np.nonzero(arr > ALPHA)
    if len(xs) == 0:
        return (0, 0, 0, 0)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def widen_image(im: Image.Image, factor: float, cell_w: int) -> Image.Image:
    """把整张图里每个 cell 的内容横向拉伸，保持高度与脚底位置。"""
    w, h = im.size
    cells = max(1, w // cell_w)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for i in range(cells):
        cell = im.crop((i * cell_w, 0, (i + 1) * cell_w, h))
        box = bbox(np.array(cell.split()[3]))
        if box[2] - box[0] <= 0:
            continue
        content = cell.crop(box)
        nw = min(cell_w - MARGIN * 2, max(1, round(content.width * factor)))
        content = content.resize((nw, content.height), Image.Resampling.LANCZOS)
        x = i * cell_w + (cell_w - nw) // 2
        y = FIGURE_BOTTOM - content.height
        out.alpha_composite(content, (max(0, x), max(0, y)))
    return out


def main() -> None:
    p = argparse.ArgumentParser(description="角色横向加宽（静态 PNG + 行走 sheet 同步）")
    p.add_argument("--dir", type=Path, required=True)
    p.add_argument("--slug", required=True)
    p.add_argument("--factor", type=float, required=True, help="横向放大倍数，例如 1.22")
    p.add_argument("--static-frame", default="224x400")
    p.add_argument("--walk-frame", default="192x400")
    args = p.parse_args()

    static_w = int(args.static_frame.lower().split("x")[0])
    walk_w = int(args.walk_frame.lower().split("x")[0])

    for d in DIRS:
        static = args.dir / f"{args.slug}_{d}.png"
        if static.exists():
            im = Image.open(static).convert("RGBA")
            widen_image(im, args.factor, static_w).save(static, "PNG")
        sheet = args.dir / f"{args.slug}_walk_{d}.webp"
        if sheet.exists():
            im = Image.open(sheet).convert("RGBA")
            widen_image(im, args.factor, walk_w).save(sheet, "WEBP", quality=78, method=6)
        print(f"[widen] {d:11s} x{args.factor}")


if __name__ == "__main__":
    main()
