#!/usr/bin/env python3
"""把行走 sheet 的比例拉回静态图的水平，并消掉逐帧的大小抖动。

背景两件事：

1. `make-walk-sheet.py` 抽出来的行走帧比转圈静态图**矮胖**
   （实测御厨 down：静态 221x371，行走 209x257；宽高比 0.596 → 0.813）。
   重新生成视频也还是这样，模型画行走就是更矮更宽。
   → 所以按方向算一组**非等比**缩放，把中位高拉到静态高、中位宽拉到静态宽高比。

2. `up`（背对镜头）那一组视频里，模型画的是「往远处走」：人物在同一段动画里
   先变小再变大（实测高的跨度 318→376，±18%）。放大后看着就是**走路时一会儿变大一会儿变小**。
   → 所以每帧再叠一个**等比**的逐帧校正，把每帧内容高度统一到目标高。
   等比 = 只改大小不改宽高比，不会像非等比那样把人拉瘦。

脚底对齐、水平居中，不裁切（超框优先缩小）。
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

DIRS = ["down", "up", "left", "right", "down_left", "down_right", "up_left", "up_right"]
FIGURE_BOTTOM = 394
ALPHA = 128
# 逐帧校正的上下限。放宽到 0.6~1.8 是因为 up（背对镜头）那组视频是"往远处走"，
# 首尾帧比中间帧小一大截，夹太紧就仍然会看到大小变化；等比放大只是变软一点，
# 但显示尺寸才 237px，看不出损失。
PER_FRAME_MIN = 0.60
PER_FRAME_MAX = 1.80
# 四周留白，避免内容顶到帧边被裁。
MARGIN = 6


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

    cells = img.width // frame_w
    boxes: list[tuple[int, int, int, int]] = []
    heights: list[int] = []
    widths: list[int] = []
    for i in range(cells):
        box = content_bbox(src[:, i * frame_w : (i + 1) * frame_w])
        boxes.append(box)
        widths.append(box[2] - box[0])
        heights.append(box[3] - box[1])

    h_med = int(np.median([h for h in heights if h])) or 0
    w_med = int(np.median([w for w in widths if w])) or 0
    if h_med <= 0 or w_med <= 0:
        return {}

    aspect = static_w / static_h

    # 目标尺寸：先按静态身高（371）算，再看"逐帧等高"之后最宽的那一帧能不能塞进帧宽。
    # 每帧等比校正到同一个高度后，宽度会变成 w_i * (target_w/w_med) * (h_med/h_i)，
    # 取 95 分位当"最宽帧"，反推允许的 target_w —— 这样既不裁切，也不再逐帧忽大忽小。
    usable_w = frame_w - MARGIN * 2
    usable_h = frame_h - MARGIN
    ratios = [
        (w / w_med) * (h_med / h)
        for w, h in zip(widths, heights)
        if w > 0 and h > 0 and w_med > 0 and h_med > 0
    ]
    ratio = float(np.percentile(ratios, 95)) if ratios else 1.0
    target_h = float(static_h)
    target_w = target_h * aspect
    if ratio > 0 and target_w * ratio > usable_w:
        target_w = usable_w / ratio
        target_h = target_w / aspect
    if target_h > usable_h:
        target_h = usable_h
        target_w = target_h * aspect

    sy = target_h / h_med
    sx = target_w / w_med

    result = Image.new("RGBA", (cells * frame_w, frame_h), (0, 0, 0, 0))
    applied: list[float] = []
    for i, box in enumerate(boxes):
        if box[2] - box[0] <= 0 or box[3] - box[1] <= 0:
            applied.append(0.0)
            continue
        cell = img.crop((i * frame_w, 0, (i + 1) * frame_w, frame_h))
        content = cell.crop(box)

        # 逐帧等比校正：让每帧的内容高度都落在 target_h 上。
        frame_h_now = content.height * sy
        k = target_h / frame_h_now if frame_h_now > 0 else 1.0
        k = max(PER_FRAME_MIN, min(PER_FRAME_MAX, k))
        # 逐帧再保证不超框
        nw_f = content.width * sx * k
        nh_f = content.height * sy * k
        room = min((frame_w - MARGIN * 2) / nw_f if nw_f else 1, (frame_h - MARGIN) / nh_f if nh_f else 1)
        if room < 1:
            k *= room
        applied.append(round(k, 3))

        nw = max(1, round(content.width * sx * k))
        nh = max(1, round(content.height * sy * k))
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
        "per_frame": (min(applied), max(applied)),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="行走 sheet 比例对齐静态图 + 消逐帧大小抖动")
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
                f" 逐帧 k={info['per_frame'][0]}~{info['per_frame'][1]}"
            )


if __name__ == "__main__":
    main()
