#!/usr/bin/env python3
"""御厨·幻影 三技能「左向」攻击序列帧：首帧绿幕画布 / 12 帧并集归一 / WebP / manifest / 联络表。

三段动画各自一个 sequence job（菜刀横扫 / 热油泼洒 / 灶台震地），本脚本只做本地 Pillow 计算：

1) `first-frame`：把游戏用透明静态图 `cook_left.png`（224×400，人物高 371 / 底边 394 / 中心 112）
   按 3:4 拉成 1080×1440 的纯绿 `#00FF00` 画布当 sequence 首帧。人物只占画布高约 54%，
   四周留大量绿幕——动作再大也不容易顶到画幅边缘（`.dsh/skills/avm-8dir-sprite/SKILL.md` §7-20）。

2) `sheet`：sequence 抽出来的 12 张 810×1080 帧 → 224×400 横排 WebP。
   对齐铁律（SKILL §4.5）：**12 帧并集 bbox 一次性等比缩放**到人物高 371（逐帧各缩会越打越瘦），
   底边统一 394、首帧身体中心对齐 112；横向位移/前倾保留（同一个 draw_x，绝不逐帧居中）。
   并集宽 > 224 时**整体缩小**到放得下（宁可矮，不能裁刀/手/脚，也不横向压扁）。

3) `manifest`：三条的部分结果 + 联络表 → `assets-src/character/battle/cook-attack-manifest.json`。

抠像复用 `tools/make-zhou-sit-standup.py` 的绿度软键（按四角实测背景绿度、剔投影、压绿溢），
不另写第二套——别用 RGB 距离，白厨师服背光半边会被判成半透明。
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

# 游戏基准：与 cook_left.png / cook_down.png 的 alpha bbox 完全一致
# 帧 400×400、每条 10 帧：10×400 = 4000 < 4096（真机纹理上限）。
# 320 宽装不下「菜刀横扫」的并集（371 高时需要 399 宽），会被压到 294 高；
# 400 宽正好装下，三条都能落在 371。
FRAME_W, FRAME_H = 400, 400
FRAMES = 10
FIGURE_H = 371
FIGURE_BOTTOM = 394
FIGURE_CX = 112          # cook_left.png 的 bbox 中心
COOK_FEET_CX = 102       # cook_left.png 脚底 40 行的横向重心（站立时的落点）
FRAME_MARGIN = 1         # 内容左右各留 1px：不留边就会「贴边」，看起来像被裁
MAX_FIGURE_W = FRAME_W - 2 * FRAME_MARGIN

# 首帧绿幕画布（3:4，与 sequence 输出 810×1080 同比例）
CANVAS_W, CANVAS_H = 1080, 1440
GREEN = (0, 255, 0)
CANVAS_FIGURE_H = 780
CANVAS_FEET_Y = 1160

STATIC = ROOT / "public/assets/img/character/ch01/kitchen/cook/cook_left.png"
OUT_DIR = ROOT / "public/assets/img/character/battle"
ASSET_DIR = ROOT / "assets-src/character/battle"

SKILLS = {
    "sweep": {"label": "菜刀横扫", "cx": 560, "hitFrame": 5, "file": "cook_attack_sweep.webp"},
    "oil": {"label": "热油泼洒", "cx": 620, "hitFrame": 5, "file": "cook_attack_oil.webp"},
    "quake": {"label": "灶台震地", "cx": 540, "hitFrame": 5, "file": "cook_attack_quake.webp"},
}


def _load_kit():
    path = ROOT / "tools" / "make-zhou-sit-standup.py"
    spec = importlib.util.spec_from_file_location("zhou_sit_standup", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


kit = _load_kit()


# --------------------------------------------------------------- 首帧绿幕


def build_first_frame(skill: str, out: Path) -> dict[str, object]:
    """透明静态图 → 3:4 纯绿画布（人物原地放大，四周留绿）。"""
    source = Image.open(STATIC).convert("RGBA")
    box = source.getchannel("A").getbbox()
    if box is None:
        raise SystemExit("cook_left.png 是空图")
    crop = source.crop(box)
    width = max(1, round(crop.width * CANVAS_FIGURE_H / crop.height))
    figure = crop.resize((width, CANVAS_FIGURE_H), Image.Resampling.LANCZOS)
    cx = int(SKILLS[skill]["cx"])
    x = cx - width // 2
    y = CANVAS_FEET_Y - CANVAS_FIGURE_H
    canvas = Image.new("RGB", (CANVAS_W, CANVAS_H), GREEN)
    canvas.paste(figure, (x, y), figure)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out, "PNG", optimize=True)
    # 绿幕必须绝对纯净：远离人物的像素一律是 (0,255,0)
    arr = np.asarray(canvas)
    assert tuple(arr[0, 0]) == GREEN, "画布左上角不是纯绿"
    info = {
        "skill": skill,
        "file": str(out),
        "canvas": [CANVAS_W, CANVAS_H],
        "green": "#00FF00",
        "figureBox": [x, y, x + width, y + CANVAS_FIGURE_H],
        "figureH": CANVAS_FIGURE_H,
        "feetY": CANVAS_FEET_Y,
        "figureW": width,
        "scaleFromStatic": round(CANVAS_FIGURE_H / (box[3] - box[1]), 4),
        "sourceBox": list(box),
    }
    print(f"[first-frame] {skill} → {out.name} " + json.dumps(info, ensure_ascii=False))
    return info


# --------------------------------------------------------------- 序列帧


def load_frame(path: Path) -> np.ndarray:
    """原始抽帧（810×1080，整张不透明）→ 绿度软键 RGBA。"""
    return kit.load_frame(path)


def components(rgba: np.ndarray, scale: int = 4) -> list[dict[str, object]]:
    """连通块清单（面积 + bbox），跑在 1/scale 的粗掩膜上——只用来判「这块和人物有没有关系」。

    两点实测教训：
    - 全分辨率逐块 floodfill 太慢（几百个 1px 噪点 = 几百次全图扫描）；
    - PIL 的 `ImageDraw.floodfill` 对「第二次 fromarray 出来的图」会静默不生效
      （第一块填进去了，后面全 0），所以这里自己写 BFS，别再用 floodfill。
    """
    mask = rgba[..., 3] > kit.ALPHA_CUTOFF
    mask[:2, :] = False
    mask[-2:, :] = False
    mask[:, :2] = False
    mask[:, -2:] = False
    small = Image.fromarray((mask * 255).astype(np.uint8), "L").resize(
        (max(1, mask.shape[1] // scale), max(1, mask.shape[0] // scale)), Image.BOX
    )
    coarse = np.asarray(small) > 110
    height, width = coarse.shape
    label = np.zeros((height, width), dtype=np.int32)
    found: list[dict[str, object]] = []
    for sy, sx in np.argwhere(coarse):
        sy, sx = int(sy), int(sx)
        if label[sy, sx] != 0:
            continue
        current = len(found) + 1
        stack = [(sy, sx)]
        label[sy, sx] = current
        count = 0
        min_x, max_x, min_y, max_y = width, 0, height, 0
        while stack:
            y, x = stack.pop()
            count += 1
            min_x, max_x = min(min_x, x), max(max_x, x)
            min_y, max_y = min(min_y, y), max(max_y, y)
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < height and 0 <= nx < width and coarse[ny, nx] and label[ny, nx] == 0:
                    label[ny, nx] = current
                    stack.append((ny, nx))
        found.append(
            {
                "area": count,
                "bbox": [
                    min_x * scale,
                    min_y * scale,
                    (max_x + 1) * scale,
                    (max_y + 1) * scale,
                ],
            }
        )
    return found


def _touches(a: list[int], b: list[int], gap: int) -> bool:
    """两个 bbox 外扩 gap 后是否相交（用于把油花/刀身这类「贴着人物飞出去」的块串起来）。"""
    return not (
        a[2] + gap < b[0] or b[2] + gap < a[0] or a[3] + gap < b[1] or b[3] + gap < a[1]
    )


def keep_components(comps: list[dict[str, object]], frame_w: int) -> tuple[list[int], list[int]]:
    """留下人物本体 + 贴着它的块（飞出的油花 / 手里的刀），丢掉孤立碎点与外圈噪点。

    判据（两道）：
    1. 面积 ≥ max(24, 最大块面积 × 0.3%)——粗掩膜上的噪点直接清掉；
    2. 与最大块「链式相连」：bbox 外扩 10% 画幅宽后接得上（油花是一条链，角落孤立亮条接不上）。
    """
    if not comps:
        return [], []
    main = max(range(len(comps)), key=lambda i: int(comps[i]["area"]))
    min_area = max(24, int(int(comps[main]["area"]) * 0.003))
    gap = max(12, int(frame_w * 0.10))
    keep = {main}
    changed = True
    while changed:
        changed = False
        for index, comp in enumerate(comps):
            if index in keep or int(comp["area"]) < min_area:
                continue
            if any(_touches(comp["bbox"], comps[k]["bbox"], gap) for k in keep):
                keep.add(index)
                changed = True
    return sorted(keep), [i for i in range(len(comps)) if i not in keep]


def robust_bbox(rgba: np.ndarray) -> tuple[int, int, int, int] | None:
    """内容包围盒：3×3 开运算定框（只用来定框，不改 alpha），并作废画面最外圈。

    坑（SKILL §4.4）：绿幕边缘的压缩噪点 alpha 残留会让 `alpha > 8` 得到整张画布，
    缩放后帧宽超框、draw_x 变负 → 横向切掉半身。
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
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def measure(rgba: np.ndarray) -> dict[str, object]:
    box = robust_bbox(rgba)
    if box is None:
        return {"empty": True}
    left, top, right, bottom = box
    return {
        "bbox": [left, top, right, bottom],
        "w": int(right - left),
        "h": int(bottom - top),
        "cx": (left + right) / 2,
        "bottom": int(bottom),
    }


def decontaminate(rgba: np.ndarray, core_alpha: int = 200, rounds: int = 8) -> np.ndarray:
    """边缘去污染（matte decontamination）：半透明像素的 RGB 换成最近的不透明色。

    实测（本次）：视频里快速挥动的手/菜刀会留下**黄绿色运动残影**，绿度键把它们判成
    半透明但保留了本身偏绿/偏黄的 RGB——合成到深色背景上就是一圈发脏的墨绿/土黄晕。
    把半透明像素的颜色换成紧邻的不透明像素颜色后，同样的 alpha 看上去就是干净的软边。
    """
    rgb = rgba[..., :3].astype(np.float32)
    alpha = rgba[..., 3].astype(np.float32)
    core = alpha >= core_alpha
    if not core.any():
        return rgba
    known = core.copy()
    known_rgb = rgb.copy()
    unknown = (alpha > 0) & ~core
    for _ in range(rounds):
        if not unknown.any():
            break
        acc = np.zeros_like(rgb)
        count = np.zeros(alpha.shape, dtype=np.float32)
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            shifted_known = np.roll(np.roll(known, dy, 0), dx, 1)
            shifted_rgb = np.roll(np.roll(known_rgb, dy, 0), dx, 1)
            acc += shifted_rgb * shifted_known[..., None]
            count += shifted_known
        fill = unknown & (count > 0)
        if not fill.any():
            break
        rgb[fill] = acc[fill] / count[fill][:, None]
        known_rgb[fill] = rgb[fill]
        known |= fill
        unknown &= ~fill
    out = rgba.copy()
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return out


def prepare(rgba: np.ndarray) -> tuple[np.ndarray, dict[str, object], dict[str, object]]:
    """一帧：清掉与人物无关的碎块 → 定 bbox。

    不把「只认脚底连通块」那套搬过来：菜刀横扫/泼油里刀身与油花**本来就该飞出去**，
    按脚底连通块一清就把刀和油花吃掉了（突刺那版是反过来的需求）。

    坑（本次实测）：MiniMax 的绿幕里散着几十上百个 alpha 40~80 的孤立噪点，有的正好
    落在画面边缘。`robust_bbox` 的 3×3 开运算挡不住 2~3px 的簇，结果并集 bbox 被撑到
    「几乎整幅画」——人物被压到 267px 高（该 371）。所以这里按粗连通块**只保留与人物
    链式相连的区域**，框外一律清零。
    """
    comps = components(rgba)
    keep, drop = keep_components(comps, rgba.shape[1])
    out = rgba.copy()
    if keep:
        bounds = [min(int(comps[i]["bbox"][0]) for i in keep),
                  min(int(comps[i]["bbox"][1]) for i in keep),
                  max(int(comps[i]["bbox"][2]) for i in keep),
                  max(int(comps[i]["bbox"][3]) for i in keep)]
        mask = np.zeros(out.shape[:2], dtype=bool)
        for i in keep:
            box = comps[i]["bbox"]
            mask[max(0, box[1] - 4):box[3] + 4, max(0, box[0] - 4):box[2] + 4] = True
        out[..., 3][~mask] = 0
    dropped_area = sum(int(comps[i]["area"]) for i in drop)
    out = decontaminate(out)
    stat = measure(out)
    if not stat.get("empty"):
        # 脚底横向重心：站立/跺脚时最稳的落点参照（bbox 中心会被手里的刀带偏）。
        alpha = out[..., 3] > 60
        bottom = int(stat["bbox"][3])
        low = alpha[max(0, bottom - 40):bottom]
        xs = np.where(low.any(axis=0))[0]
        stat["feetCx"] = round(float(xs.mean()), 1) if len(xs) else float(stat["cx"])
    return out, stat, {"dropped": len(drop), "droppedArea": dropped_area}


def clean(frame: Image.Image) -> Image.Image:
    data = np.asarray(frame).copy()
    data[data[..., 3] < 16] = 0
    return Image.fromarray(data)


def place_sheet(
    frames: list[Path], frame_w: int = FRAME_W, frame_h: int = FRAME_H
) -> tuple[list[Image.Image], dict[str, object], list[dict[str, object]]]:
    """12 帧 → 并集归一 → 320×400 画布（一次缩放 + 一个 draw_x/draw_y，位移保留）。

    缩放：并集 bbox 等比缩放到人物高 371；装不进 320 时才整体缩小（绝不横裁/压扁）。
    落点：底边 394；水平方向让**首帧脚底重心**落在 102（= cook_left.png 的脚底重心），
    也就是 originX = B/320 —— 站立→出招不跳脚，左右镜像时也不会横移。
    """
    rgba_frames, measures, dropped = [], [], []
    for path in frames:
        rgba, stat, drop = prepare(load_frame(path))
        if stat.get("empty"):
            raise SystemExit(f"{path.name}: 抠像后找不到角色")
        rgba_frames.append(rgba)
        measures.append(stat)
        if drop["dropped"]:
            dropped.append({"frame": path.name, **drop})

    left = min(int(m["bbox"][0]) for m in measures)
    top = min(int(m["bbox"][1]) for m in measures)
    right = max(int(m["bbox"][2]) for m in measures)
    bottom = max(int(m["bbox"][3]) for m in measures)
    union_w, union_h = right - left, bottom - top

    # 缩放：目标「人物高 371」，用**首帧**（站定姿势，等于 cook_left 的姿势）的 bbox 高当人物高，
    # 而不是并集高——菜刀举过头顶 / 油花飞得比头高时，用并集高会把整个人缩小 7~8%。
    # 代价是这些「比头还高」的特效得挤进画幅：底边 394 → 内容最多 394 高、400 宽，超了就整体缩。
    body_h = int(measures[0]["h"])
    scale = FIGURE_H / body_h
    limit = "figure"
    if union_h * scale > FIGURE_BOTTOM - 1:      # 顶到画幅上沿（留 1px）
        scale = (FIGURE_BOTTOM - 1) / union_h
        limit = "height"
    if union_w * scale > MAX_FIGURE_W:            # 顶到画幅左右沿
        scale = MAX_FIGURE_W / union_w
        limit = "width"
    width_limited = limit == "width"
    width = max(1, round(union_w * scale))
    height = max(1, round(union_h * scale))
    draw_y = FIGURE_BOTTOM - height

    # 水平落点：锚点 = 首帧脚底重心，理想值 102（与 cook_left 同一条线），
    # 被画幅逼住时取「能放下并集的最近位置」。
    anchor_ref = float(measures[0].get("feetCx", measures[0]["cx"]))
    offset = (anchor_ref - left) * scale          # 锚点距并集左缘的距离
    # 能留 1px 就留 1px（避免看起来像被裁）；宽度顶满时（sweep 399/400）只留一侧。
    margin = FRAME_MARGIN
    lo = margin + offset
    hi = frame_w - margin - width + offset
    anchor = float(min(max(COOK_FEET_CX, lo), max(lo, hi)))
    draw_x = int(round(anchor - offset))
    draw_x = max(0, min(frame_w - width, draw_x))

    cells, stats = [], []
    for rgba in rgba_frames:
        crop = Image.fromarray(rgba).crop((left, top, right, bottom))
        scaled = crop.resize((width, height), Image.Resampling.LANCZOS)
        cell = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
        cell.alpha_composite(scaled, (draw_x, draw_y))
        cell = clean(cell)
        box = cell.getchannel("A").point(lambda v: 255 if v > kit.ALPHA_CUTOFF else 0).getbbox()
        if box is None:
            raise SystemExit("成品帧是空的")
        cells.append(cell)
        stats.append(
            {
                "index": len(stats),
                "source": frames[len(stats)].name,
                "bbox": [int(box[0]), int(box[1]), int(box[2]), int(box[3])],
                "h": int(box[3] - box[1]),
                "w": int(box[2] - box[0]),
                "bottom": int(box[3]),
                "cx": round((box[0] + box[2]) / 2, 1),
                "feetCx": round(
                    (float(measures[len(stats)].get("feetCx", measures[len(stats)]["cx"])) - left)
                    * scale
                    + draw_x,
                    1,
                ),
                "touchLeft": bool(box[0] <= 0),
                "touchRight": bool(box[2] >= frame_w),
                "touchTop": bool(box[1] <= 0),
                "touchBottom": bool(box[3] >= frame_h),
            }
        )
    placement = {
        "unionBox": [left, top, right, bottom],
        "unionW": union_w,
        "unionH": union_h,
        "scale": round(scale, 5),
        "scaledW": width,
        "scaledH": height,
        "drawX": draw_x,
        "drawY": draw_y,
        "anchorX": round(float(anchor), 1),
        "originX": round(float(anchor) / frame_w, 5),
        "widthLimited": width_limited,
        "scaleLimit": limit,
        "bodyHeight": round(body_h * scale, 1),
        "removedNoise": dropped,
    }
    return cells, placement, stats


def build_sheet(skill: str, frames_dir: Path, job: str, out: Path) -> dict[str, object]:
    meta = SKILLS[skill]
    # 只认 f00…f09：sequence 抽帧目录里可能还留着上一轮 12 帧的 f10/f11。
    expected = {f"f{i:02d}.png" for i in range(FRAMES)}
    frames = sorted(p for p in frames_dir.glob("f*.png") if p.name in expected)
    if len(frames) != FRAMES:
        raise SystemExit(f"{skill}: 期望 {FRAMES} 帧，实际 {len(frames)}")
    cells, placement, stats = place_sheet(frames)

    out.parent.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (FRAME_W * len(cells), FRAME_H), (0, 0, 0, 0))
    for index, cell in enumerate(cells):
        sheet.alpha_composite(cell, (index * FRAME_W, 0))
    sheet.save(out, "WEBP", quality=92, method=6)

    heights = [int(s["h"]) for s in stats]
    bottoms = [int(s["bottom"]) for s in stats]
    centers = [float(s["cx"]) for s in stats]
    widths = [int(s["w"]) for s in stats]
    result = {
        "skill": skill,
        "label": meta["label"],
        "jobId": job,
        "file": str(out.relative_to(ROOT)),
        "frames": len(cells),
        "frameCount": len(cells),
        "frameWidth": FRAME_W,
        "frameHeight": FRAME_H,
        "frameMs": 55,
        "hitFrame": meta["hitFrame"],
        "originX": placement["originX"],
        "anchorX": placement["anchorX"],
        "sheet": [sheet.width, sheet.height],
        "baseline": {
            "figureHeight": FIGURE_H,
            "bottom": FIGURE_BOTTOM,
            "feetCenterX": COOK_FEET_CX,
            "sourceCenterX": FIGURE_CX,
            "maxFigureWidth": MAX_FIGURE_W,
        },
        "placement": placement,
        "measured": {
            "bodyHeight": placement["bodyHeight"],
            "figureHMin": min(heights),
            "figureHMax": max(heights),
            "bottomMin": min(bottoms),
            "bottomMax": max(bottoms),
            "widthMin": min(widths),
            "widthMax": max(widths),
            "centerXMin": round(min(centers), 1),
            "centerXMax": round(max(centers), 1),
            "centerXDrift": round(max(centers) - min(centers), 1),
            "feetCxMin": round(min(float(s["feetCx"]) for s in stats), 1),
            "feetCxMax": round(max(float(s["feetCx"]) for s in stats), 1),
            "touchEdges": sorted(
                {
                    edge
                    for s in stats
                    for edge in ("touchLeft", "touchRight", "touchTop", "touchBottom")
                    if s[edge]
                }
            ),
        },
        "cells": stats,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "sourceFrames": [str(p) for p in frames],
    }
    fragment = Path("/tmp") / f"cook-attack-{skill}.json"
    fragment.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")

    print(
        f"[sheet] {skill} {len(cells)}f → {out.name} {sheet.width}×{sheet.height}"
        f" · 高 {min(heights)}–{max(heights)} · 底边 {min(bottoms)}–{max(bottoms)}"
        f" · 宽 {min(widths)}–{max(widths)} · 中心 {min(centers):.0f}–{max(centers):.0f}"
        f" · 身体 {placement['bodyHeight']} · originX {placement['originX']} · 缩放 {placement['scale']}"
        f" [{placement['scaleLimit']}]"
        f" (union {placement['unionW']}×{placement['unionH']})"
        + ("（宽受限：身高被压）" if placement["widthLimited"] else "")
        + (f" · 贴边 {result['measured']['touchEdges']}" if result["measured"]["touchEdges"] else ""),
        flush=True,
    )
    return result


# --------------------------------------------------------------- 联络表 / manifest


def write_contact(parts: list[dict[str, object]], out: Path, zoom: int = 1) -> None:
    """3 条 × 12 帧联络表：每条一行，标 f00…f11 + 脚底基准线 + originX 锚线。"""
    pad, label_h, gap = 10, 18, 14
    cell_w, cell_h = FRAME_W * zoom, FRAME_H * zoom
    cols = max(len(part["cells"]) for part in parts)
    width = pad * 2 + cell_w * cols
    row_h = label_h + cell_h + gap
    height = pad * 2 + row_h * len(parts) + 30
    board = Image.new("RGBA", (width, height), (18, 20, 28, 255))
    draw = ImageDraw.Draw(board)
    font = kit.font(12)
    small = kit.font(10)
    draw.text(
        (pad, 4),
        f"御厨·幻影 · 左向攻击 3×{cols}f · {FRAME_W}×{FRAME_H} · 底边 394（绿线）/ originX 锚线（蓝线）/ ★=hitFrame",
        font=font,
        fill=(200, 208, 224, 255),
    )
    for row, part in enumerate(parts):
        sheet = Image.open(ROOT / part["file"]).convert("RGBA")
        m = part["measured"]
        y0 = pad + 30 + row * row_h
        draw.text(
            (pad, y0),
            f"{part['skill']} / {part['label']} · {part['jobId']} · 高 {m['figureHMin']}–{m['figureHMax']}"
            f" · 底边 {m['bottomMin']}–{m['bottomMax']} · 脚底x {m['feetCxMin']}–{m['feetCxMax']}"
            f" · originX {part.get('originX')} · hit f{part['hitFrame']:02d}",
            font=font,
            fill=(170, 210, 180, 255),
        )
        anchor = round(float(part.get("anchorX", FIGURE_CX)) * zoom)
        for index in range(len(part["cells"])):
            cell = sheet.crop((index * FRAME_W, 0, (index + 1) * FRAME_W, FRAME_H))
            if zoom != 1:
                cell = cell.resize((cell_w, cell_h), Image.LANCZOS)
            x = pad + index * cell_w
            y = y0 + label_h
            board.alpha_composite(cell, (x, y))
            foot = y + round(FIGURE_BOTTOM * zoom)
            draw.line((x, foot, x + cell_w, foot), fill=(90, 220, 140, 130))
            draw.line(
                (x + anchor, y, x + anchor, y + cell_h),
                fill=(90, 140, 220, 90),
            )
            mark = "★" if index == part["hitFrame"] else ""
            draw.text(
                (x + 2, y - label_h + 3),
                f"f{index:02d}{mark} h={part['cells'][index]['h']}",
                font=small,
                fill=(240, 210, 120, 255) if mark else (200, 206, 220, 255),
            )
    out.parent.mkdir(parents=True, exist_ok=True)
    board.convert("RGB").save(out, "PNG", optimize=True)
    print(f"[contact] → {out} {board.width}×{board.height}")


def build_manifest(parts: list[dict[str, object]], contact: Path, out: Path) -> None:
    payload = {
        "character": "御厨·幻影（cook）",
        "facing": "left（游戏内右向由代码镜像；镜像时按 originX 翻转，脚底/身体位置不变）",
        "canvas": {
            "frameCount": FRAMES,
            "frameWidth": FRAME_W,
            "frameHeight": FRAME_H,
            "frameMs": 55,
            "sheetWidth": FRAME_W * FRAMES,
        },
        "baseline": {
            "source": "public/assets/img/character/ch01/kitchen/cook/cook_left.png",
            "figureHeight": FIGURE_H,
            "bottom": FIGURE_BOTTOM,
            "sourceCenterX": FIGURE_CX,
            "feetCenterX": COOK_FEET_CX,
        },
        "scaling": {
            "rule": "人物高（首帧站定姿势的 alpha bbox 高）→ 371；刀举过头/油花高过头时，"
            "内容整体挤进 400×400（底边 394、左右各 1px），实在装不下才整体缩小",
            "firstFrame": {
                "source": str(STATIC.relative_to(ROOT)),
                "note": "三条动画共用同一张 cook_left.png 合成到纯绿 #00FF00 的 3:4 画布"
                "（1080×1440，人物高 780 / 脚底 1160），由 `first-frame` 子命令生成，不进仓库",
                "generator": "python3 tools/make-cook-attack.py first-frame --skill <sweep|oil|quake> --out <png>",
            },
        },
        "contact": str(contact.relative_to(ROOT)),
        "animations": [
            {
                key: part[key]
                for key in (
                    "skill",
                    "label",
                    "jobId",
                    "file",
                    "frames",
                    "frameCount",
                    "frameWidth",
                    "frameHeight",
                    "frameMs",
                    "hitFrame",
                    "originX",
                    "anchorX",
                    "sheet",
                    "placement",
                    "measured",
                    "cells",
                    "generatedAt",
                )
                if key in part
            }
            for part in parts
        ],
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"[manifest] → {out.relative_to(ROOT)}")


def main() -> None:
    parser = argparse.ArgumentParser(description="御厨三技能攻击序列帧：首帧 / 合图 / manifest")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_first = sub.add_parser("first-frame", help="透明静态图 → 3:4 纯绿首帧画布")
    p_first.add_argument("--skill", required=True, choices=sorted(SKILLS))
    p_first.add_argument("--out", type=Path, required=True)

    p_sheet = sub.add_parser("sheet", help="12 帧 → 224×400 横排 WebP")
    p_sheet.add_argument("--skill", required=True, choices=sorted(SKILLS))
    p_sheet.add_argument("--frames-dir", type=Path, required=True)
    p_sheet.add_argument("--job", required=True)
    p_sheet.add_argument("--out", type=Path, required=True)

    p_manifest = sub.add_parser("manifest", help="合并三条结果 + 联络表")
    p_manifest.add_argument("--contact", type=Path, required=True)
    p_manifest.add_argument("--out", type=Path, required=True)

    args = parser.parse_args()

    if args.cmd == "first-frame":
        build_first_frame(args.skill, args.out.expanduser().resolve())
        return

    if args.cmd == "sheet":
        build_sheet(
            args.skill,
            args.frames_dir.expanduser().resolve(),
            args.job,
            args.out.expanduser().resolve(),
        )
        return

    parts = []
    for skill in SKILLS:
        fragment = Path("/tmp") / f"cook-attack-{skill}.json"
        if not fragment.exists():
            raise SystemExit(f"缺少 {skill} 的合成结果：先跑 sheet --skill {skill}")
        parts.append(json.loads(fragment.read_text()))
    contact = args.contact.expanduser().resolve()
    write_contact(parts, contact)
    build_manifest(parts, contact, args.out.expanduser().resolve())


if __name__ == "__main__":
    main()
