#!/usr/bin/env python3
"""矿工·清除单元 三个技能「左向攻击」序列帧的本地后期（不调生成模型）。

三个子命令：

1) `plate`：把已有的透明静态图 `miner_left.png` 合成到纯绿 `#00FF00` 画布上，
   作为 sequence 任务的**首帧**上传（3:4，与视频输出同比例，人物占约 60% 高，
   四周留大片纯绿，模型才有空间做动作而不把自己顶出画）。
2) `sheet`：把 sequence 任务 keyed/ 下的 12 帧 → 横排 WebP + 统计 JSON。
3) `combine`：三份统计 + 三张 WebP → `miner-attack-manifest.json` + 3×12 联络表。

对齐铁律（.dsh/skills/avm-8dir-sprite/SKILL.md §4.5，本角色基准见 AGENTS.md §5）：
- 12 帧**并集 bbox** 一次性缩放，绝不逐帧各缩（会越挥越瘦）；
- 人物高 371、底边 394、水平中心 136（与 `miner_left.png` 同一个基准）；
- 只把**首帧**身体中心对齐到 136，其余帧保留整段并集里的相对位移——
  逐帧居中会把突刺/横扫变成原地摆拍；
- 动作幅度导致并集宽 > 帧宽时，**整段等比缩小**（人物可矮一点），绝不横向裁手脚/钻头；
  缩到 94% 以下就换成 320/336/340 宽帧（12×340=4080 < 4096），并在 manifest 里给
  `originX = 身体中心 / 帧宽`，让 BattleActor 播放这条 strip 时按 originX 设原点，
  避免换帧时横向跳；
- 配色对齐：绿幕视频会把矿工的青灰铁甲染成橄榄绿，整段用一个通道增益拉回静态图
  （逐帧对齐会闪），增益夹在 1/cap..cap。

用法：
  python3 tools/make-miner-attack-sheets.py plate \
      --source public/assets/img/character/battle/miner/miner_left.png \
      --out .evidence/character/battle/miner_left_green.png
  python3 tools/make-miner-attack-sheets.py sheet --frames-dir <job>/keyed \
      --out public/assets/img/character/battle/miner_attack_thrust.webp \
      --stats .evidence/character/battle/stats/thrust.json --skill thrust --job sxxxx --hit 7 --frame-width 340
  python3 tools/make-miner-attack-sheets.py combine --stats a.json b.json c.json \
      --manifest assets-src/character/battle/miner-attack-manifest.json \
      --contact assets-src/character/battle/miner-attack-contact.png
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from datetime import datetime
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent

FRAME_H = 400
FIGURE_H = 371
FIGURE_BOTTOM = 394
FIGURE_CX = 136
FRAME_MS = 55
FRAME_COUNT = 12

SKILLS = {
    "sweep": {"label": "铁臂横扫", "hit": 6},
    "thrust": {"label": "钻头突进", "hit": 7},
    "quake": {"label": "核心脉冲", "hit": 7},
}

# 逐条交付备注（写进 manifest）：尺寸/动作语义上的降级必须留痕，别让下游当成完美素材。
SKILL_NOTES = {
    "sweep": (
        "动作语义降级：v2 保证了正侧朝左、脚不跨步、无裁切，但手臂是「前伸→回拉→落下」，"
        "不是干净的左→右横扫黑弧；峰值前伸在 f02，hitFrame 取 2。"
        "并集宽 470px，帧宽 272 要保 371 高只能把内容居中，故 originX=0.6165。"
    ),
    "thrust": (
        "钻头前伸到体前约 60% 身高，并集宽 630px；272 帧只能压到 288（78%），"
        "故改 336×400（12×336=4032<4096），起手 355、突刺峰值 314（蹲姿/压低重心，不是整段缩小）。"
        "内容居中后身体中心在 214px，originX=0.6373。"
    ),
    "quake": (
        "砸地读作「举拳→半蹲砸下」，但举拳只到头顶附近、远侧手被身体挡住，"
        "命中取第一次触地的 f05；下蹲最深 f05/f07=301（81%），是蹲姿不是整体缩放。"
        "originX=0.6735。"
    ),
}


def _load_kit():
    """`make-zhou-sit-standup.py` 文件名带连字符，只能走 importlib 复用它的抠像。"""
    path = ROOT / "tools" / "make-zhou-sit-standup.py"
    spec = importlib.util.spec_from_file_location("miner_attack_kit", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


kit = _load_kit()


# ------------------------------------------------------------------ plate


def build_plate(source: Path, out: Path, size: tuple[int, int], height_ratio: float) -> dict:
    """透明静态图 → 纯绿 3:4 首帧（人物居中、四周留绿、脚底不贴边）。"""
    source = source.expanduser().resolve()
    image = Image.open(source).convert("RGBA")
    box = image.getchannel("A").point(lambda v: 255 if v > kit.ALPHA_CUTOFF else 0).getbbox()
    if box is None:
        raise SystemExit(f"{source.name}: 透明图里找不到角色")
    figure = image.crop(box)
    target_h = max(1, round(size[1] * height_ratio))
    target_w = max(1, round(figure.width * target_h / figure.height))
    if target_w > size[0] * 0.8:
        target_h = round(target_h * size[0] * 0.8 / target_w)
        target_w = round(figure.width * target_h / figure.height)
    figure = figure.resize((target_w, target_h), Image.Resampling.LANCZOS)

    plate = Image.new("RGB", size, (0, 255, 0))
    # 脚底放在画面 86% 处：下面留 14% 绿，防止模型把脚/钻头压出画。
    x = (size[0] - target_w) // 2
    y = round(size[1] * 0.86) - target_h
    plate.paste(figure, (x, y), figure)

    out = out.expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    plate.save(out, "PNG", optimize=True)

    rgb = np.asarray(plate).astype(int)
    greenish = (rgb[..., 1] >= 250) & (rgb[..., 0] <= 5) & (rgb[..., 2] <= 5)
    info = {
        "file": str(out),
        "canvas": list(size),
        "figureBox": [x, y, x + target_w, y + target_h],
        "figureSize": [target_w, target_h],
        "figureHeightRatio": round(target_h / size[1], 4),
        "greenFraction": round(float(greenish.mean()), 4),
    }
    print("[plate] " + json.dumps(info, ensure_ascii=False))
    return info


# ------------------------------------------------------------------ measure


def main_component(rgba: np.ndarray, cutoff: int = kit.ALPHA_CUTOFF):
    """取与脚底连通的那一块（模型偶尔会画脱离人物的亮点/残影，不能算进并集）。"""
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
    out = rgba.copy()
    junk = (rgba[..., 3] > kit.ALPHA_CUTOFF) & ~comp
    out[junk, 3] = 0
    return out


def measure(rgba: np.ndarray) -> dict:
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
    data = np.asarray(frame).copy()
    data[data[..., 3] < 16] = 0
    return Image.fromarray(data)


def body_median(rgba: np.ndarray) -> np.ndarray:
    """不透明身体的通道中位数（alpha>200），用于和静态图做整体配色对齐。"""
    mask = rgba[..., 3] > 200
    if not mask.any():
        return np.zeros(3, dtype=np.float32)
    return np.median(rgba[..., :3][mask].astype(np.float32), axis=0)


def color_gains(frames: list[np.ndarray], reference: Path, cap: float) -> np.ndarray:
    """整段共用一个通道增益（逐帧对齐会闪），对齐到静态图的身体中位数。"""
    ref = kit.load_frame(reference)
    target = body_median(ref)
    source = np.median(np.array([body_median(f) for f in frames]), axis=0)
    source[source <= 1] = 1
    return np.clip(target / source, 1.0 / cap, cap).astype(np.float32)


def apply_gains(rgba: np.ndarray, gains: np.ndarray) -> np.ndarray:
    out = rgba.astype(np.float32)
    out[..., :3] = np.clip(out[..., :3] * gains, 0, 255)
    return out.astype(np.uint8)


def union_placement(measures: list[dict], frame_w: int) -> dict:
    """12 帧并集 bbox + 统一缩放 + 落点（一次算完，所有帧共用）。"""
    left = min(int(m["bbox"][0]) for m in measures)
    top = min(int(m["bbox"][1]) for m in measures)
    right = max(int(m["bbox"][2]) for m in measures)
    bottom = max(int(m["bbox"][3]) for m in measures)
    union_w, union_h = right - left, bottom - top
    max_w = frame_w - 2
    scale = FIGURE_H / union_h
    width_limited = False
    if union_w * scale > max_w:
        # 动作幅度太大：整段等比缩到能放进帧宽，宁可矮一点也不横裁。
        scale = max_w / union_w
        width_limited = True
    width = max(1, round(union_w * scale))
    height = max(1, round(union_h * scale))
    # 水平落点：并集整体居中（左右留一样宽的透明边）。**不再**把首帧身体中心硬钉到
    # 136——手臂前伸时那会把内容推出画布。身体中心的真实落点由 originX 交给播放器：
    # 播放这条 strip 时把原点设成 originX，人物就与静态图/其他 strip 同一条竖线。
    draw_x = int(round((frame_w - width) / 2))
    draw_x = max(0, min(frame_w - width, draw_x))
    first = measures[0]
    # 成品里首帧身体中心的真实落点 = drawX + (首帧 cx - union left) * scale。
    # 它就是 originX 的分子：换帧时按它设原点，人物不会横向跳。
    body_cx = draw_x + (float(first["cx"]) - left) * scale
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
        "widthLimited": width_limited,
        "bodyCenterX": body_cx,
        "originX": body_cx / frame_w,
    }


# ------------------------------------------------------------------ sheet


def build_sheet(
    frames: list[Path],
    out: Path,
    stats: Path,
    skill: str,
    job: str,
    hit: int,
    frame_w: int = 272,
    color_ref: Path | None = None,
    color_cap: float = 1.25,
) -> dict:
    if not frames:
        raise SystemExit("没有输入帧")
    frames = [p.expanduser().resolve() for p in frames]
    rgba_frames, measures = [], []
    for path in frames:
        rgba = kit.load_frame(path)
        box, comp = main_component(rgba)
        if comp is not None:
            rgba = clean_detached(rgba, comp)
        rgba_frames.append(rgba)
        measures.append(measure(rgba))
    empty = [i for i, m in enumerate(measures) if m.get("empty")]
    if empty:
        raise SystemExit(f"这些帧抠像后是空的：{empty}")

    gains = np.ones(3, dtype=np.float32)
    if color_ref is not None:
        gains = color_gains(rgba_frames, color_ref, color_cap)
        rgba_frames = [apply_gains(f, gains) for f in rgba_frames]

    place = union_placement(measures, frame_w)
    cells, cell_stats = [], []
    for index, rgba in enumerate(rgba_frames):
        crop = Image.fromarray(rgba).crop(
            (place["left"], place["top"], place["right"], place["bottom"])
        )
        scaled = crop.resize((place["width"], place["height"]), Image.Resampling.LANCZOS)
        cell = Image.new("RGBA", (frame_w, FRAME_H), (0, 0, 0, 0))
        cell.alpha_composite(scaled, (place["drawX"], place["drawY"]))
        cell = clean(cell)
        box = cell.getchannel("A").point(lambda v: 255 if v > kit.ALPHA_CUTOFF else 0).getbbox()
        if box is None:
            raise SystemExit("成品帧是空的")
        cells.append(cell)
        cell_stats.append(
            {
                "index": index,
                "source": frames[index].name,
                "bbox": [int(box[0]), int(box[1]), int(box[2]), int(box[3])],
                "h": int(box[3] - box[1]),
                "bottom": int(box[3]),
                "cx": round((box[0] + box[2]) / 2, 1),
                "w": int(box[2] - box[0]),
                "touchRight": bool(box[2] >= frame_w),
                "touchLeft": bool(box[0] <= 0),
                "touchTop": bool(box[1] <= 0),
                "touchBottom": bool(box[3] >= FRAME_H),
            }
        )

    out = out.expanduser().resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (frame_w * len(cells), FRAME_H), (0, 0, 0, 0))
    for index, cell in enumerate(cells):
        sheet.alpha_composite(cell, (index * frame_w, 0))
    sheet.save(out, "WEBP", quality=92, method=6)

    heights = [s["h"] for s in cell_stats]
    bottoms = [s["bottom"] for s in cell_stats]
    widths = [s["w"] for s in cell_stats]
    centers = [s["cx"] for s in cell_stats]
    touches = [
        k
        for s in cell_stats
        for k in ("touchLeft", "touchRight", "touchTop", "touchBottom")
        if s[k]
    ]

    result = {
        "skill": skill,
        "label": SKILLS.get(skill, {}).get("label", skill),
        "file": str(out.relative_to(ROOT)),
        "jobId": job,
        "frames": len(cells),
        "frameWidth": frame_w,
        "frameHeight": FRAME_H,
        "sheet": [sheet.width, sheet.height],
        "frameMs": FRAME_MS,
        "hitFrame": hit,
        "originX": round(float(place["originX"]), 4),
        "originXMirrored": round(1.0 - float(place["originX"]), 4),
        "bodyCenterX": round(float(place["bodyCenterX"]), 2),
        "baseline": {
            "figureHeight": FIGURE_H,
            "bottom": FIGURE_BOTTOM,
            "anchorX": FIGURE_CX,
            "maxFigureWidth": frame_w - 2,
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
            "touchesEdge": sorted(set(touches)),
        },
        "colorMatch": {
            "reference": str(color_ref.relative_to(ROOT)) if color_ref is not None else None,
            "gains": [round(float(v), 4) for v in gains],
        },
        "cells": cell_stats,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    stats = stats.expanduser().resolve()
    stats.parent.mkdir(parents=True, exist_ok=True)
    stats.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(
        f"[sheet] {skill}: {len(cells)} 帧 → {out.name} {sheet.width}×{sheet.height}"
        f" · 帧宽 {frame_w} · 高 {min(heights)}–{max(heights)} · 底边 {min(bottoms)}–{max(bottoms)}"
        f" · 宽 {min(widths)}–{max(widths)} · 缩放 {place['scale']:.4f} · originX {place['originX']:.4f}"
        + ("（宽受限）" if place["widthLimited"] else "")
        + (f" · 贴边 {touches}" if touches else " · 无贴边")
    )
    return result


# ------------------------------------------------------------------ combine


def load_cells(entry: dict) -> list[Image.Image]:
    sheet = Image.open(ROOT / entry["file"]).convert("RGBA")
    fw, fh = entry["frameWidth"], entry["frameHeight"]
    return [sheet.crop((i * fw, 0, (i + 1) * fw, fh)) for i in range(entry["frames"])]


def build_contact(entries: list[dict], path: Path) -> None:
    """3 技能 × 12 帧联络表，1:1 像素 + 底边/锚点参考线，用 read_image 亲自看。"""
    pad, label_h = 10, 22
    row_w = max(e["frameWidth"] * e["frames"] + pad * (e["frames"] - 1) for e in entries)
    rows = len(entries)
    width = pad * 2 + row_w
    height = pad + label_h + rows * (FRAME_H + label_h + pad)
    board = Image.new("RGBA", (width, height), (18, 20, 28, 255))
    draw = ImageDraw.Draw(board)
    f_label = kit.font(13)
    f_small = kit.font(11)
    draw.text(
        (pad, 4),
        "miner attack (left) · 3×12 · green line = bottom 394 · blue line = body anchor x",
        font=f_label,
        fill=(190, 200, 220, 255),
    )
    for row, entry in enumerate(entries):
        cells = load_cells(entry)
        fw = entry["frameWidth"]
        y0 = pad + label_h + row * (FRAME_H + label_h + pad)
        draw.text(
            (pad, y0 - label_h + 3),
            f"{entry['skill']} · {entry['label']} · job {entry['jobId']}"
            f" · {fw}×{entry['frameHeight']} · hit f{entry['hitFrame']}"
            f" · h {entry['measured']['figureHMin']}–{entry['measured']['figureHMax']}"
            f" · bottom {entry['measured']['bottomMin']}–{entry['measured']['bottomMax']}"
            f" · w {entry['measured']['widthMin']}–{entry['measured']['widthMax']}"
            f" · originX {entry['originX']}"
            + ("  · WIDTH-LIMITED" if entry["placement"]["widthLimited"] else ""),
            font=f_small,
            fill=(200, 210, 228, 255),
        )
        body_x = entry.get("bodyCenterX", FIGURE_CX)
        for col, cell in enumerate(cells):
            x = pad + col * (fw + pad)
            board.alpha_composite(cell, (x, y0))
            foot = y0 + FIGURE_BOTTOM
            draw.line((x, foot, x + fw, foot), fill=(90, 220, 140, 120))
            draw.line((x + body_x, y0, x + body_x, y0 + FRAME_H), fill=(90, 140, 220, 80))
            hit = col == entry["hitFrame"]
            draw.text(
                (x + 2, y0 + 2),
                f"f{col:02d}" + (" HIT" if hit else ""),
                font=f_small,
                fill=(255, 210, 120, 255) if hit else (210, 216, 230, 255),
            )
    path = path.expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    board.convert("RGB").save(path, "PNG", optimize=True)
    print(f"[combine] 联络表 → {path} {board.width}×{board.height}")


def build_manifest(entries: list[dict], path: Path, plate: str) -> None:
    order = list(SKILLS)
    entries = sorted(entries, key=lambda e: order.index(e["skill"]))
    animations = []
    for entry in entries:
        animations.append(
            {
                "skill": entry["skill"],
                "label": entry["label"],
                "sequenceJobId": entry["jobId"],
                "file": entry["file"],
                "frames": entry["frames"],
                "frameWidth": entry["frameWidth"],
                "frameHeight": entry["frameHeight"],
                "sheet": entry["sheet"],
                "frameMs": entry["frameMs"],
                "hitFrame": entry["hitFrame"],
                "originX": entry["originX"],
                "originXMirrored": entry.get("originXMirrored"),
                "bodyCenterX": entry["bodyCenterX"],
                "placement": entry["placement"],
                "alphaBbox": {
                    "bottomRange": [entry["measured"]["bottomMin"], entry["measured"]["bottomMax"]],
                    "contentWidthRange": [
                        entry["measured"]["widthMin"],
                        entry["measured"]["widthMax"],
                    ],
                    "figureHeightRange": [
                        entry["measured"]["figureHMin"],
                        entry["measured"]["figureHMax"],
                    ],
                    "centerXRange": [
                        entry["measured"]["centerXMin"],
                        entry["measured"]["centerXMax"],
                    ],
                    "touchesEdge": entry["measured"]["touchesEdge"],
                },
                "note": SKILL_NOTES.get(entry["skill"], ""),
                "colorMatch": entry.get("colorMatch"),
                "cells": entry["cells"],
            }
        )
    data = {
        "character": "矿工·清除单元（miner / clearing unit）",
        "direction": "left（游戏内右向由代码镜像）",
        "frameCount": FRAME_COUNT,
        "frameHeight": FRAME_H,
        "frameMs": FRAME_MS,
        "baseline": {
            "figureHeight": FIGURE_H,
            "bottom": FIGURE_BOTTOM,
            "anchorX": FIGURE_CX,
            "reference": "public/assets/img/character/battle/miner/miner_left.png",
        },
        "firstFramePlate": plate,
        "discardedJobs": [
            {
                "skill": "sweep",
                "sequenceJobId": "smwqzzwl7f2a580",
                "reason": "模型把躯干转向镜头/右侧（源视频中段正面露胸），成品像原地转身；并集宽 708 只能压到 256 高",
            },
            {
                "skill": "quake",
                "sequenceJobId": "smwqzzwlq184974",
                "reason": "起手转背、双臂画成漂浮断块，砸下后整个人趴跪撑地（最低 207 高），读作倒地",
            },
        ],
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "animations": animations,
        "notes": [
            "首帧 = miner_left.png 合成到纯绿 #00FF00（人物占画面高约 62%，四周留绿）。",
            "对齐：12 帧并集 bbox 统一缩放，底边 394；并集整体在帧内居中，帧间相对位移原样保留"
            "（不逐帧居中，否则突刺/横扫会变成原地摆拍）。身体中心因此不在帧中心，靠 originX 定位。",
            "**每条都要按 originX 设 sprite 原点**（身体中心不在帧中心：内容居中后手臂前伸把身体推到右侧）；"
            "镜像成右向时用 originXMirrored = 1 - originX，否则身体会横向跳。",
            "并集宽超过帧宽-2 时整段等比缩小（figureHeightRange 会低于 371），绝不横向裁剪手脚/钻头。",
            "配色：绿幕视频把铁甲染绿，整段统一通道增益对齐 miner_left.png（逐帧对齐会闪）。",
            "hitFrame 由逐帧看联络表判定，0 起。",
        ],
    }
    path = path.expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"[combine] manifest → {path}")


# ------------------------------------------------------------------ main


def main() -> None:
    parser = argparse.ArgumentParser(description="矿工左向攻击序列帧：绿幕首帧 / 横排 WebP / 联络表")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_plate = sub.add_parser("plate")
    p_plate.add_argument("--source", type=Path, required=True)
    p_plate.add_argument("--out", type=Path, required=True)
    p_plate.add_argument("--size", default="900x1200")
    p_plate.add_argument("--height-ratio", type=float, default=0.62)

    p_sheet = sub.add_parser("sheet")
    p_sheet.add_argument("--frames-dir", type=Path, required=True)
    p_sheet.add_argument("--pattern", default="f*.png")
    p_sheet.add_argument("--out", type=Path, required=True)
    p_sheet.add_argument("--stats", type=Path, required=True)
    p_sheet.add_argument("--skill", required=True, choices=sorted(SKILLS))
    p_sheet.add_argument("--job", required=True)
    p_sheet.add_argument("--hit", type=int)
    p_sheet.add_argument("--frame-width", type=int, default=272, help="单帧宽（12×宽 < 4096）")
    p_sheet.add_argument(
        "--color-ref",
        type=Path,
        default=Path("public/assets/img/character/battle/miner/miner_left.png"),
        help="配色对齐的静态图基准（默认 miner_left.png）",
    )
    p_sheet.add_argument("--color-cap", type=float, default=1.25, help="单通道增益上限")

    p_comb = sub.add_parser("combine")
    p_comb.add_argument("--stats", type=Path, nargs="+", required=True)
    p_comb.add_argument("--manifest", type=Path, required=True)
    p_comb.add_argument("--contact", type=Path, required=True)
    p_comb.add_argument("--plate", default=".evidence/character/battle/miner_left_green.png")

    args = parser.parse_args()

    if args.cmd == "plate":
        width, height = (int(v) for v in args.size.lower().split("x"))
        build_plate(args.source, args.out, (width, height), args.height_ratio)
        return

    if args.cmd == "sheet":
        frames = sorted(args.frames_dir.expanduser().glob(args.pattern))
        if len(frames) != FRAME_COUNT:
            raise SystemExit(f"{args.frames_dir} 里是 {len(frames)} 帧，要求 {FRAME_COUNT} 帧")
        hit = args.hit if args.hit is not None else SKILLS[args.skill]["hit"]
        if args.frame_width * FRAME_COUNT >= 4096:
            raise SystemExit("12×frame-width 必须 < 4096（手机纹理上限）")
        build_sheet(
            frames,
            args.out,
            args.stats,
            args.skill,
            args.job,
            hit,
            frame_w=args.frame_width,
            color_ref=args.color_ref.expanduser().resolve() if args.color_ref else None,
            color_cap=args.color_cap,
        )
        return

    entries = [json.loads(p.expanduser().read_text()) for p in args.stats]
    build_manifest(entries, args.manifest, args.plate)
    build_contact(entries, args.contact)


if __name__ == "__main__":
    main()
