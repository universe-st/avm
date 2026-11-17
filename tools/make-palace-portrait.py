#!/usr/bin/env python3
"""把「游戏素材大师」出的抠像半身图裁成游戏内立绘规格：720×900 RGBA、透明底。

金殿的半身立绘（`portrait_zheng` / `portrait_chu` / `portrait_xiaobai` /
`portrait_zhou_panic`）共用一套口径，`src/ui/portrait-metrics.ts` 按 720:900 算显示尺寸，
所以这里的**唯一硬约束是画布正好 720×900**；构图只需要满足：

1. **横向留边**：内容左/右边缘各留至少 `--margin-x`（默认 24）设计 px 的透明区。
   立绘贴屏幕右侧时，画布左边约 20% 会被裁掉，内容顶到画布边缘就会出现一道直切的边
   （翅膀/帽子被切平），所以宁可整体缩一点。
2. **纵向饱满**：内容高度尽量占满 900（头顶贴到画布上沿、胸口画出下沿），
   和 chu / zheng 两张的比例一致；不够高就顶部对齐，底部留透明。
3. alpha 保持非预乘、8bit RGBA，不额外做边缘扩张（游戏里 None/线性过滤都吃得住）。

用法：
  python3 tools/make-palace-portrait.py \
    --input  ~/.dsh/game-material-master/image-jobs/<job>/keyed/img-00.png \
    --output public/assets/img/character/palace/portrait_xiaobai.png

只做「裁 + 等比缩放 + 居中」，不生成、不抠像、不改颜色。
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

CANVAS_W = 720
CANVAS_H = 900
# 与 `PALACE_ALPHA_CUTOFF`（阴影接触面口径）同量级：太小的 alpha 是抠像残留，不算内容。
ALPHA_CUTOFF = 8


def content_bbox(image: Image.Image, cutoff: int = ALPHA_CUTOFF) -> tuple[int, int, int, int]:
    """按 alpha 求内容包围盒（右下开区间）。"""
    alpha = image.split()[3].point(lambda value: 255 if value >= cutoff else 0)
    box = alpha.getbbox()
    if box is None:
        raise SystemExit("输入图全透明：没有可裁的内容")
    return box


def fit_to_canvas(image: Image.Image, margin_x: int) -> Image.Image:
    """等比缩放到 720×900 画布：高度优先，宽度超过可用宽度时按宽度收。"""
    left, top, right, bottom = content_bbox(image)
    content = image.crop((left, top, right, bottom))
    usable_w = CANVAS_W - margin_x * 2

    scale = CANVAS_H / content.height
    if content.width * scale > usable_w:
        scale = usable_w / content.width

    width = max(1, round(content.width * scale))
    height = max(1, round(content.height * scale))
    content = content.resize((width, height), Image.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    x = (CANVAS_W - width) // 2
    # 顶部对齐：和 zh / chu 两张一样「头顶贴画布上沿」，胸口随高度自然落到下沿附近。
    canvas.alpha_composite(content, (x, 0))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser(description="生成 720×900 透明底半身立绘")
    parser.add_argument("--input", required=True, type=Path, help="抠像后的 RGBA PNG")
    parser.add_argument("--output", required=True, type=Path, help="输出的 720×900 PNG")
    parser.add_argument("--margin-x", type=int, default=24, help="左右最小透明留边（设计 px）")
    args = parser.parse_args()

    source = Image.open(args.input).convert("RGBA")
    portrait = fit_to_canvas(source, args.margin_x)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    portrait.save(args.output, optimize=True)

    left, top, right, bottom = content_bbox(portrait)
    print(
        f"{args.output}  {portrait.width}×{portrait.height}  "
        f"content={right - left}×{bottom - top}  bbox=({left},{top},{right},{bottom})  "
        f"{args.output.stat().st_size // 1024} KB"
    )


if __name__ == "__main__":
    main()
