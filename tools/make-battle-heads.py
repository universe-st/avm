#!/usr/bin/env python3
"""把角色「朝下（正面）」全身图裁成圆形头像 chip（战斗行动条「接下来」用）。

产物（128×128 RGBA，纯 Pillow、确定性）：
  public/assets/img/character/battle/heads/zhou.png
  public/assets/img/character/battle/heads/miner.png
  public/assets/img/character/battle/heads/cook.png

裁切规则（与设计稿一致）：
  1. 按 alpha bbox 找人物（不是画布）：top / height；
  2. 头中心 x = 人物顶部 22% 高度带内 alpha 跨度的中点（这一段在肩/手臂变宽之前，
     不会被矿工钻井臂或御厨围裙带偏）；
  3. 方形裁切：边长 = 人物高 × 40%，顶边 = 人物头顶，水平以头中心居中；
     越界部分补透明（正常素材不会越界）；
  4. LANCZOS 缩到 116×116，贴到 128×128 画布正中 → 四周 6px 透明边；
  5. 在资产里**预裁透明圆**（半径 64，4× 超采样抗锯齿）。

为什么圆形裁切放在脚本里而不是 HUD：
  行动条前移时 chip 要整体 tween `alpha`（滑出渐隐 / 右侧渐现）。Phaser 的
  GeometryMask 是 stencil，不跟随 mask 对象的 alpha 变化，淡出时会留下一个
  全不透明的圆形窗口；预裁透明圆则让 Image 自己的 alpha 直接生效。HUD 只负责
  画底色圆 + 队伍色描边环（`battle-ch01-scene.ts` 的 `createOrderChips`）。

周全为什么用 Q 版 `ch01/q/zhou_q_down.png`：
  `ch01/zhou_down.png` 只有 64×96（头部约 15px），放大到 116 会糊成色块；
  Q 版是 160×400、头部约 107px 高，且脸更大更清楚。两张是同一角色的同一套
  表情，取 Q 版能在 44px 圆形 chip 里保留眉眼。

用法：python3 tools/make-battle-heads.py
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public/assets/img/character/battle/heads"
SIZE = 128
CONTENT = 116
MARGIN = (SIZE - CONTENT) // 2  # 6px
HEAD_BAND = 0.22
CROP_RATIO = 0.40


@dataclass(frozen=True)
class Source:
    name: str
    path: str
    note: str


SOURCES = (
    Source(
        "zhou",
        "public/assets/img/character/ch01/q/zhou_q_down.png",
        "Q 版朝下全身（160×400）；非 Q 版 zhou_down.png 仅 64×96，头部约 15px，放大必糊",
    ),
    Source(
        "miner",
        "public/assets/img/character/battle/miner/miner_down.png",
        "矿工战斗八向 down（272×400）",
    ),
    Source(
        "cook",
        "public/assets/img/character/ch01/kitchen/cook/cook_down.png",
        "御厨朝下全身（224×400）",
    ),
)


def alpha_span(image: Image.Image, y0: int, y1: int, threshold: int = 16) -> tuple[int, int] | None:
    alpha = image.getchannel("A")
    y1 = min(y1, image.height)
    y0 = max(0, y0)
    if y1 <= y0:
        return None
    band = alpha.crop((0, y0, image.width, y1))
    box = band.getbbox()
    if box is None:
        return None
    return box[0], box[2]  # [left, right)


def crop_head(source: Image.Image) -> tuple[Image.Image, dict[str, int]]:
    """返回方形头像裁片与量出来的几何（写进日志，方便换素材时对账）。"""
    alpha = source.getchannel("A")
    figure = alpha.getbbox()
    if figure is None:
        raise SystemExit("源图整张透明，找不到人物")

    top = figure[1]
    figure_height = figure[3] - figure[1]
    side = max(32, round(figure_height * CROP_RATIO))

    band = alpha_span(source, top, top + max(8, round(figure_height * HEAD_BAND)))
    if band is None:
        band = (figure[0], figure[2])
    head_center_x = (band[0] + band[1]) / 2

    left = round(head_center_x - side / 2)
    crop = source.crop((left, top, left + side, top + side))

    metrics = {
        "figure_top": top,
        "figure_height": figure_height,
        "head_center_x": round(head_center_x),
        "crop_side": side,
        "crop_left": left,
        "crop_top": top,
    }
    return crop, metrics


def square_with_padding(image: Image.Image) -> Image.Image:
    """裁片理论上已是正方形；越界裁切时按实际尺寸补透明，保持边长。"""
    canvas = Image.new("RGBA", (image.width, image.height), (0, 0, 0, 0))
    canvas.paste(image, (0, 0))
    return canvas


def circular_alpha(size: int, supersample: int = 4) -> Image.Image:
    big = Image.new("L", (size * supersample, size * supersample), 0)
    draw = ImageDraw.Draw(big)
    pad = 0
    draw.ellipse((pad, pad, big.width - 1 - pad, big.height - 1 - pad), fill=255)
    return big.resize((size, size), Image.LANCZOS)


def build(source: Source) -> dict[str, object]:
    path = ROOT / source.path
    if not path.exists():
        raise SystemExit(f"源图不存在：{path}")

    image = Image.open(path).convert("RGBA")
    head, metrics = crop_head(image)
    head = square_with_padding(head)
    content = head.resize((CONTENT, CONTENT), Image.LANCZOS)

    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    out.paste(content, (MARGIN, MARGIN), content)

    alpha = out.getchannel("A")
    alpha = Image.composite(alpha, Image.new("L", alpha.size, 0), circular_alpha(SIZE))
    out.putalpha(alpha)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    target = OUT_DIR / f"{source.name}.png"
    out.save(target, "PNG", optimize=True)
    return {
        "name": source.name,
        "source": source.path,
        "note": source.note,
        "output": str(target.relative_to(ROOT)),
        "bytes": target.stat().st_size,
        **metrics,
    }


def main() -> None:
    print(f"[heads] → {OUT_DIR.relative_to(ROOT)}/  ({SIZE}×{SIZE}, content {CONTENT}px, margin {MARGIN}px)")
    for source in SOURCES:
        info = build(source)
        print(
            f"  {info['name']:5s} ← {info['source']}\n"
            f"        figure {info['figure_height']}px @top {info['figure_top']}, "
            f"head_cx {info['head_center_x']}, crop {info['crop_side']}² @({info['crop_left']},{info['crop_top']}), "
            f"→ {info['output']} ({info['bytes']} B)\n"
            f"        理由：{info['note']}"
        )
    print("[heads] 完成。圆形裁切已预裁进 PNG；HUD 不再需要 GeometryMask。")


if __name__ == "__main__":
    main()
