#!/usr/bin/env python3
"""《刺客大战矿工》战斗姿态与「解离突刺」序列帧的后期制作。

只做本地计算（抠像 / 归一 / 拼图 / 联络表），不调生成模型。两件事：

1) `--still`：把 image job 生成的纯绿底全身图 → 160×400 游戏静帧
   （人物高 371 / 底边 394 / 水平中心 80，与 `CH01_Q_FRAME` 同一基准）。
   用于战斗起手式 `zhou_idle_right.png` 与格挡 `zhou_guard_right.png`。

2) `--frames-dir`：把 sequence job 的视频抽帧 → 12 帧横排 WebP + manifest + 联络表。
   对齐铁律（见 `.dsh/skills/avm-8dir-sprite/SKILL.md` §4.5）：
   - 按 **12 帧并集 bbox** 缩放（一次缩放系数，不逐帧各缩），否则人物会越刺越瘦；
   - 底边统一 394，水平基准取**首帧身体中心 ≈ 80**，但整段并集必须落在 160 宽内；
   - 突刺的前后位移**保留**（因为 12 帧裁的是同一个并集矩形、贴同一个 draw_x），
     绝不逐帧各自居中——那样冲刺会变成原地抖。

抠像复用 `tools/make-zhou-sit-standup.py` 的 `key_green` / `fit_frame`：
背景绿度按四角实测自适应、剔掉暗绿地面投影、压绿溢。别再另写一套。

用法：
  python3 tools/make-battle-player-art.py --still <green.png> --out <out.png>
  python3 tools/make-battle-player-art.py --frames-dir <dir> --out <sheet.webp> \
      --manifest <manifest.json> --contact <contact.png> --job <sequenceJobId>
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent

FRAME_W, FRAME_H = 160, 400
FIGURE_CX_DEFAULT = 80
FIGURE_H = 371
FIGURE_BOTTOM = 394
FIGURE_CX = 80
# 人物横向最多占 158：留 1px 透明边，任何一步都不许横向裁掉身体。
MAX_FIGURE_W = FRAME_W - 2


def _load_kit():
    """把 `make-zhou-sit-standup.py` 当模块加载（文件名带连字符，只能走 importlib）。"""
    path = ROOT / "tools" / "make-zhou-sit-standup.py"
    spec = importlib.util.spec_from_file_location("zhou_sit_standup", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


kit = _load_kit()


def key(path: Path) -> np.ndarray:
    """绿幕帧 → RGBA（已抠好的透明图原样返回）。"""
    return kit.load_frame(path)


def main_component(rgba: np.ndarray, cutoff: int = kit.ALPHA_CUTOFF):
    """从脚底灌色，取与人物连通的那一块（含手里连着的光刃）。

    实测坑：视频第 2 帧有一条**脱离人物**的细光条（模型的光效残影），
    它的顶端比头顶高 176px；若把它算进并集 bbox，整个人物会被压到 78% 身高
    （290/371）。这里只认脚底连通块，并把其他 detached 亮块从 alpha 里清掉，
    否则成品里会飘着一条无源光线。
    """
    alpha = rgba[..., 3]
    mask = (alpha > cutoff).astype(np.uint8) * 255
    if not mask.any():
        return None, None
    img = Image.fromarray(np.dstack([mask] * 3), "RGB")
    ys, xs = np.where(mask > 0)
    seed_y = int(ys.max())
    seed_x = int(np.median(np.where(mask[seed_y] > 0)[0]))
    ImageDraw.floodfill(img, (seed_x, seed_y), (128, 128, 128), thresh=0)
    arr = np.asarray(img)
    comp = (arr[..., 0] == 128) & (arr[..., 1] == 128) & (arr[..., 2] == 128)
    if not comp.any():
        return None, None
    ys2, xs2 = np.where(comp)
    box = (int(xs2.min()), int(ys2.min()), int(xs2.max()) + 1, int(ys2.max()) + 1)
    return box, comp


def clean_detached(rgba: np.ndarray, comp: np.ndarray) -> np.ndarray:
    """清掉不属于人物连通块的亮块（alpha > 40 的 detached 光条），软边保留。"""
    out = rgba.copy()
    junk = (rgba[..., 3] > kit.ALPHA_CUTOFF) & ~comp
    out[junk, 3] = 0
    return out


def robust_bbox(rgba: np.ndarray) -> tuple[int, int, int, int] | None:
    """内容包围盒：先做 3×3 开运算，剔掉绿幕上 1~2px 的孤点噪点。

    实测坑：优云智算的绿幕里偶尔留一个 (43,69,65) 的单像素点（画面右缘附近），
    `content_bbox` 直接把它算进 bbox，人物宽度虚增 230px → 被误判成「太宽」，
    身高从 371 被压到 303。孤点在 160 宽下根本看不见，但它能毁掉整张对齐。
    开运算只用来**定 bbox**，不用来改 alpha，所以发丝/细描边原样保留。
    """
    alpha = Image.fromarray(rgba[..., 3])
    opened = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    mask = np.asarray(opened) > kit.ALPHA_CUTOFF
    mask[:2, :] = False
    mask[-2:, :] = False
    mask[:, :2] = False
    mask[:, -2:] = False
    ys, xs = np.where(mask)
    if len(ys) < 500:
        return kit.content_bbox(rgba)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def measure(rgba: np.ndarray) -> dict[str, object]:
    box, _ = main_component(rgba)
    if box is None:
        return {"empty": True}
    left, top, right, bottom = box
    return {
        "bbox": [int(left), int(top), int(right), int(bottom)],
        "w": int(right - left),
        "h": int(bottom - top),
        "cx": (left + right) / 2,
        "bottom": int(bottom),
    }


def clean(frame: Image.Image) -> Image.Image:
    """残绿清理：alpha < 16 的像素清成全 0（软键在边缘会留纯绿 RGB）。"""
    data = np.asarray(frame).copy()
    data[data[..., 3] < 16] = 0
    return Image.fromarray(data)


# --------------------------------------------------------------- 静帧


def build_still(source: Path, out: Path, height: int = FIGURE_H) -> dict[str, object]:
    source = source.expanduser().resolve()
    out = out.expanduser().resolve()
    rgba = key(source)
    box = robust_bbox(rgba)
    if box is None:
        raise SystemExit(f"{source.name}: 抠像后找不到角色")
    crop = Image.fromarray(rgba).crop(box)
    width = max(1, round(crop.width * height / crop.height))
    actual_h = height
    limited = False
    if width > MAX_FIGURE_W:
        # 宁可矮一点也不能横向压扁；同时把「宽受限」报出来，不要静默交付。
        actual_h = max(1, round(height * MAX_FIGURE_W / width))
        width = MAX_FIGURE_W
        limited = True
    resized = crop.resize((width, actual_h), Image.Resampling.LANCZOS)
    tight = resized.getchannel("A").point(lambda v: 255 if v > kit.ALPHA_CUTOFF else 0).getbbox()
    if tight is not None:
        resized = resized.crop(tight)
    frame = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    frame.alpha_composite(
        resized,
        (
            min(max(0, round(FIGURE_CX - resized.width / 2)), FRAME_W - resized.width),
            FIGURE_BOTTOM - resized.height,
        ),
    )
    fit = {"h": resized.height, "w": resized.width}
    frame = clean(frame)
    out.parent.mkdir(parents=True, exist_ok=True)
    frame.save(out, "PNG", optimize=True)
    box = frame.getchannel("A").point(lambda v: 255 if v > kit.ALPHA_CUTOFF else 0).getbbox()
    assert box is not None
    result = {
        "file": str(out.relative_to(ROOT)),
        "canvas": [FRAME_W, FRAME_H],
        "figureW": int(box[2] - box[0]),
        "figureH": int(box[3] - box[1]),
        "bottom": int(box[3]),
        "centerX": (box[0] + box[2]) / 2,
        "left": int(box[0]),
        "right": int(FRAME_W - box[2]),
        "widthLimited": bool(limited),
        "target": {"height": FIGURE_H, "bottom": FIGURE_BOTTOM, "centerX": FIGURE_CX},
    }
    print(f"[still] {source.name} → {out.name} " + json.dumps(result, ensure_ascii=False))
    if result["widthLimited"]:
        print(
            f"[still] 警告：人物 {result['figureW']}px 宽放不进 {FRAME_W} 画布，"
            f"身高被压到 {result['figureH']}px（不是 371）",
            flush=True,
        )
    return result


# --------------------------------------------------------------- 序列帧


def union_placement(
    measures: list[dict[str, object]], frame_w: int = FRAME_W, allow_overflow: bool = False
) -> dict[str, float]:
    """12 帧并集 bbox + 统一缩放 + 落点（一次算完，所有帧共用）。"""
    left = min(int(m["bbox"][0]) for m in measures if not m.get("empty"))
    top = min(int(m["bbox"][1]) for m in measures if not m.get("empty"))
    right = max(int(m["bbox"][2]) for m in measures if not m.get("empty"))
    bottom = max(int(m["bbox"][3]) for m in measures if not m.get("empty"))
    union_w, union_h = right - left, bottom - top
    scale = FIGURE_H / union_h
    limited = False
    if union_w * scale > MAX_FIGURE_W:
        if allow_overflow:
            # 只按身高归一；多出来的横向跨度（光刃）留给画布右缘裁掉，
            # 绝不为了塞进画布把人物缩小。
            pass
        else:
            scale = MAX_FIGURE_W / union_w
            limited = True
    width = max(1, round(union_w * scale))
    height = max(1, round(union_h * scale))
    # 水平基准：首帧身体中心落在 80；整段并集不许出画，冲突时优先不出画。
    first = measures[0]
    first_cx = float(first["cx"])
    ideal = FIGURE_CX - (first_cx - left) * scale
    draw_x = int(round(ideal))
    if allow_overflow:
        draw_x = max(0, draw_x)
    else:
        draw_x = max(0, min(figure_limit(frame_w, width), draw_x))
    return {
        "left": left,
        "top": top,
        "right": right,
        "bottom": bottom,
        "unionW": union_w,
        "unionH": union_h,
        "scale": scale,
        "width": width,
        "height": height,
        "drawX": draw_x,
        "drawY": FIGURE_BOTTOM - height,
        "widthLimited": limited,
    }


def figure_limit(frame_w: int, width: int) -> int:
    return max(0, frame_w - width)


def build_sheet(
    frames: list[Path],
    out: Path,
    manifest_path: Path | None,
    contact_path: Path | None,
    job: str,
    frame_ms: int,
    display_scale: float,
    extra: dict[str, object] | None = None,
    frame_size: tuple[int, int] = (160, 400),
    cx: int = 80,
    allow_overflow: bool = False,
) -> dict[str, object]:
    global FRAME_W, FRAME_H, MAX_FIGURE_W, FIGURE_CX
    FRAME_W, FRAME_H = frame_size
    MAX_FIGURE_W = FRAME_W - 2
    FIGURE_CX = cx
    if not frames:
        raise SystemExit("没有输入帧")
    frames = [path.expanduser().resolve() for path in frames]
    out = out.expanduser().resolve()
    rgba_frames = []
    measures = []
    for path in frames:
        rgba = key(path)
        box, comp = main_component(rgba)
        if comp is not None:
            rgba = clean_detached(rgba, comp)
        rgba_frames.append(rgba)
        measures.append(measure(rgba))
    empty = [i for i, m in enumerate(measures) if m.get("empty")]
    if empty:
        raise SystemExit(f"这些帧抠像后是空的：{empty}")

    place = union_placement(measures, allow_overflow=allow_overflow)
    cells: list[Image.Image] = []
    cell_stats: list[dict[str, object]] = []
    for rgba in rgba_frames:
        crop = Image.fromarray(rgba).crop(
            (place["left"], place["top"], place["right"], place["bottom"])
        )
        scaled = crop.resize((place["width"], place["height"]), Image.Resampling.LANCZOS)
        cell = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
        cell.alpha_composite(scaled, (place["drawX"], place["drawY"]))
        cell = clean(cell)
        box = cell.getchannel("A").point(lambda v: 255 if v > kit.ALPHA_CUTOFF else 0).getbbox()
        if box is None:
            raise SystemExit("成品帧是空的")
        cells.append(cell)
        cell_stats.append(
            {
                "index": len(cell_stats),
                "source": frames[len(cell_stats)].name,
                "bbox": [int(box[0]), int(box[1]), int(box[2]), int(box[3])],
                "h": int(box[3] - box[1]),
                "bottom": int(box[3]),
                "cx": round((box[0] + box[2]) / 2, 1),
                "w": int(box[2] - box[0]),
                "touchRight": bool(box[2] >= FRAME_W),
                "touchLeft": bool(box[0] <= 0),
                "touchTop": bool(box[1] <= 0),
                "touchBottom": bool(box[3] >= FRAME_H),
            }
        )

    out.parent.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (FRAME_W * len(cells), FRAME_H), (0, 0, 0, 0))
    for index, cell in enumerate(cells):
        sheet.alpha_composite(cell, (index * FRAME_W, 0))
    sheet.save(out, "WEBP", quality=92, method=6)

    heights = [int(s["h"]) for s in cell_stats]
    bottoms = [int(s["bottom"]) for s in cell_stats]
    widths = [int(s["w"]) for s in cell_stats]
    centers = [float(s["cx"]) for s in cell_stats]

    result: dict[str, object] = {
        "file": str(out.relative_to(ROOT)),
        "frames": len(cells),
        "sheet": [sheet.width, sheet.height],
        "frameSize": [FRAME_W, FRAME_H],
        "frameMs": frame_ms,
        "displayScale": display_scale,
        "baseline": {
            "figureHeight": FIGURE_H,
            "bottom": FIGURE_BOTTOM,
            "centerX": FIGURE_CX,
            "maxFigureWidth": MAX_FIGURE_W,
        },
        "placement": {
            "unionBox": [place["left"], place["top"], place["right"], place["bottom"]],
            "unionW": place["unionW"],
            "unionH": place["unionH"],
            "scale": round(float(place["scale"]), 5),
            "scaledW": place["width"],
            "scaledH": place["height"],
            "drawX": place["drawX"],
            "drawY": place["drawY"],
            "widthLimited": place["widthLimited"],
        },
        "measured": {
            "figureHMin": min(heights),
            "figureHMax": max(heights),
            "bottomMin": min(bottoms),
            "bottomMax": max(bottoms),
            "widthMin": min(widths),
            "widthMax": max(widths),
            "centerXMin": round(min(centers), 1),
            "centerXMax": round(max(centers), 1),
            "centerXDrift": round(max(centers) - min(centers), 1),
        },
        "cells": cell_stats,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "sourceJob": job,
        "sourceFrames": [str(p) for p in frames],
    }
    if extra:
        result.update(extra)

    if contact_path is not None:
        write_contact(cells, contact_path, result)

    if manifest_path is not None:
        manifest_path = manifest_path.expanduser().resolve()
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")

    print(
        f"[sheet] {len(cells)} 帧 → {out.name} {sheet.width}×{sheet.height}"
        f" · 高 {min(heights)}–{max(heights)} · 底边 {min(bottoms)}–{max(bottoms)}"
        f" · 宽 {min(widths)}–{max(widths)} · 中心 {min(centers):.0f}–{max(centers):.0f}"
        f" · 并集缩放 {place['scale']:.4f}"
        + ("（宽受限：身高被压）" if place["widthLimited"] else "")
    )
    return result


def write_contact(cells: list[Image.Image], path: Path, result: dict[str, object]) -> None:
    """12 帧联络表：4 列 × 3 行，2 倍放大 + 脚底基准线，用 `read_image` 亲自看。"""
    zoom = 2
    cols = 4
    rows = (len(cells) + cols - 1) // cols
    pad = 12
    label_h = 20
    cell_w, cell_h = FRAME_W * zoom, FRAME_H * zoom
    width = pad + (cell_w + pad) * cols
    height = pad + (cell_h + label_h + pad) * rows
    board = Image.new("RGBA", (width, height), (18, 20, 28, 255))
    draw = ImageDraw.Draw(board)
    f_label = kit.font(12)
    measured = result["measured"]
    draw.text(
        (pad, 4),
        f"zhou attack · {len(cells)}f · 高 {measured['figureHMin']}–{measured['figureHMax']}px"
        f" · 底边 {measured['bottomMin']}–{measured['bottomMax']}",
        font=f_label,
        fill=(190, 200, 220, 255),
    )
    for index, cell in enumerate(cells):
        col, row = index % cols, index // cols
        x = pad + col * (cell_w + pad)
        y = pad + row * (cell_h + label_h + pad) + label_h
        scaled = cell.resize((cell_w, cell_h), Image.LANCZOS)
        board.alpha_composite(scaled, (x, y))
        foot = y + round(FIGURE_BOTTOM * zoom)
        draw.line((x, foot, x + cell_w, foot), fill=(90, 220, 140, 110))
        draw.line((x + cell_w // 2, y, x + cell_w // 2, y + cell_h), fill=(90, 140, 220, 70))
        draw.text((x, y - label_h + 2), f"f{index:02d}", font=f_label, fill=(210, 216, 230, 255))
    path = path.expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    board.convert("RGB").save(path, "PNG", optimize=True)
    print(f"[sheet] 联络表 → {path}")


# --------------------------------------------------------------- main


def main() -> None:
    parser = argparse.ArgumentParser(description="战斗姿态静帧归一 / 突刺序列帧合成")
    parser.add_argument("--still", type=Path, help="绿幕静帧源图")
    parser.add_argument("--out", type=Path, help="静帧输出 PNG 或 sheet 输出 WebP")
    parser.add_argument("--frames-dir", type=Path, help="序列帧目录（f00.png…）")
    parser.add_argument("--pattern", default="f*.png", help="序列帧文件名模式")
    parser.add_argument("--manifest", type=Path, help="manifest JSON 输出路径")
    parser.add_argument("--contact", type=Path, help="联络表 PNG 输出路径")
    parser.add_argument("--job", default="", help="sequence / image job id（写进 manifest）")
    parser.add_argument("--frame-ms", type=int, default=55)
    parser.add_argument("--display-scale", type=float, default=0.55)
    parser.add_argument("--height", type=int, default=FIGURE_H)
    parser.add_argument("--extra", default="", help="附加写进 manifest 的 JSON 字符串")
    parser.add_argument("--frame-size", default="160x400", help="WxH，单帧画布")
    parser.add_argument("--allow-overflow", action="store_true",
                        help="只按身高归一，横向超出画布的部分（光刃）允许被裁")
    args = parser.parse_args()

    if args.still:
        if not args.out:
            raise SystemExit("--still 需要 --out")
        build_still(args.still, args.out, args.height)
        return

    if args.frames_dir:
        if not args.out:
            raise SystemExit("--frames-dir 需要 --out")
        frames = sorted(args.frames_dir.glob(args.pattern))
        extra = json.loads(args.extra) if args.extra else None
        frame_w, frame_h = (int(v) for v in args.frame_size.lower().split("x"))
        build_sheet(
            frames,
            args.out,
            args.manifest,
            args.contact,
            args.job,
            args.frame_ms,
            args.display_scale,
            extra,
            frame_size=(frame_w, frame_h),
            cx=frame_w // 2,
            allow_overflow=args.allow_overflow,
        )
        return

    raise SystemExit("给 --still 或 --frames-dir")


if __name__ == "__main__":
    main()
