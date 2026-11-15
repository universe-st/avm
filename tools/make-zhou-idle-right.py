#!/usr/bin/env python3
"""把「游戏素材大师」生成的「侧面站立 idle」裁成游戏用帧（t39）。

背景：寝室「战后醒来」演出的收尾是坐地 → 起身序列（末帧正侧面）→ 站立 idle。
站立 idle 一直是 Q 版 `q/zhou_q_right.png`（3/4 朝镜头），直接切会闪一下姿势，
场景只好做 110ms 的 alpha 交叉淡入伪装「转身」。本脚本产出的
`zhou_idle_right.png` 是**正侧面朝右**的站立静帧，接在起身末帧后面不用转身。

输入（image job 的产物，纯绿底）：
    ~/.dsh/game-material-master/image-jobs/<id>/out/img-XX.png
输出：
    public/assets/img/character/ch01/zhou_idle_right.png   160×400（高 371 / 底边 394 / 中心 80）
    .evidence/docs/screenshots/sitting/idle-right-preview.png        390×844 深底：1:1 原图 + 实机尺寸放大
    .evidence/docs/screenshots/sitting/idle-vs-standup8.png          与起身末帧并排 + 差值表

复用的铁律（与 `make-zhou-sit-standup.py` 同一套，别另写一份）：
1. 绿幕用 `greenness = g - max(r, b)`，背景绿度按四角实测自适应（生成图的「纯绿」常是
   暗绿 (25,165,13)，写死 190 会把整张判成半透明）；
2. 生成图自带的暗绿地面投影要单独剔掉，不能当人物保留；
3. 缩到 160 宽以后发丝尖/鞋尖会掉到 alpha 阈值以下 → 用**缩放后**的可见 bbox 重新居中。
以上三条都在 `make-zhou-sit-standup.py` 里实现好了，这里 importlib 直接复用。

用法：
    python3 tools/make-zhou-idle-right.py --src <img-00.png>
    python3 tools/make-zhou-idle-right.py --sheet        # 只重出验收图
"""

from __future__ import annotations

import argparse
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "img" / "character" / "ch01"
SHOT_DIR = ROOT / ".evidence" / "docs" / "screenshots" / "sitting"
STANDUP_SHEET = OUT / "zhou_stand_up.webp"
Q_RIGHT = ROOT / "public" / "assets" / "img" / "character" / "ch01" / "q" / "zhou_q_right.png"
IDLE = OUT / "zhou_idle_right.png"

FRAME_W, FRAME_H = 160, 400
BASELINE_BOTTOM = 394
BASELINE_CX = 80
STAND_TARGET_H = 371
# 起身末帧（画布高 400 / 人物高 228）归一化到站立帧的 371 高，脚底不动。
STANDUP_END_H = 228


def _load_sibling():
    """把 `make-zhou-sit-standup.py` 当模块加载（文件名带连字符，只能走 importlib）。"""
    path = ROOT / "tools" / "make-zhou-sit-standup.py"
    spec = importlib.util.spec_from_file_location("zhou_sit_standup", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


kit = _load_sibling()


# ---------------------------------------------------------------- 量测


def _longest_run(row: np.ndarray) -> int:
    best = current = 0
    for value in row:
        current = current + 1 if value else 0
        if current > best:
            best = current
    return best


def profile(image: Image.Image) -> dict[str, float]:
    """人物轮廓的几何量：包围盒 / 头宽 / 肩线 / 脚底接触面宽度。

    「肩线」= 头部以下、宽度第一次明显超过颈部的位置：颈在 30%~50% 高度最细，
    肩一出现宽度就跳上去。同一套算法同时量起身末帧和新 idle，差值才有意义。
    """
    rgba = np.asarray(image.convert("RGBA"))
    mask = rgba[..., 3] > kit.ALPHA_CUTOFF
    mask[:2, :] = False
    mask[-2:, :] = False
    mask[:, :2] = False
    mask[:, -2:] = False
    ys, xs = np.where(mask)
    if len(ys) < 500:
        raise RuntimeError("整帧都是透明的：抠像参数或源图不对")
    top, bottom = int(ys.min()), int(ys.max()) + 1
    height = bottom - top
    widths = mask.sum(axis=1)
    head_rows = range(top, top + max(1, int(height * 0.22)))
    head_w = max(_longest_run(mask[y]) for y in head_rows)
    neck_band = widths[top + int(height * 0.30) : top + int(height * 0.50)]
    neck = int(neck_band.min()) if len(neck_band) else 0
    shoulder = None
    for y in range(top + int(height * 0.30), top + int(height * 0.60)):
        if widths[y] >= max(neck * 1.25, neck + 8):
            shoulder = y
            break
    # 脚底：最后一排不透明像素的水平跨度（后脚比前脚矮时也能量到接触面）
    foot_row = mask[bottom - 1]
    foot_px = int(foot_row.sum())
    return {
        "w": int(xs.max() - xs.min() + 1),
        "h": int(height),
        "top": top,
        "bottom": bottom,
        "cx": round((float(xs.min()) + float(xs.max()) + 1) / 2, 1),
        "head_w": int(head_w),
        "head_ratio": round(head_w / height, 3),
        "neck_w": neck,
        "shoulder": int(shoulder) if shoulder is not None else -1,
        "shoulder_ratio": round((shoulder - top) / height, 3) if shoulder is not None else -1,
        "foot_px": foot_px,
    }


def standup_end_frame() -> Image.Image:
    sheet = Image.open(STANDUP_SHEET).convert("RGBA")
    frames = sheet.width // FRAME_W
    return sheet.crop(((frames - 1) * FRAME_W, 0, frames * FRAME_W, sheet.height))


def standup_end_normalized() -> Image.Image:
    """起身末帧按「同底边、同高 371」放大，用于和新 idle 逐像素并排。"""
    frame = standup_end_frame()
    box = frame.getchannel("A").point(lambda v: 255 if v > kit.ALPHA_CUTOFF else 0).getbbox()
    assert box is not None
    crop = frame.crop(box)
    scale = STAND_TARGET_H / crop.height
    size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
    scaled = crop.resize(size, Image.LANCZOS)
    out = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    x = BASELINE_CX - size[0] // 2
    out.alpha_composite(scaled, (x, BASELINE_BOTTOM - size[1]))
    return out


# ---------------------------------------------------------------- 合成


def build_idle(source: Path, height: int = STAND_TARGET_H) -> dict[str, object]:
    rgba = kit.key_green(kit.load_rgb(source))
    frame, info = kit.fit_frame(
        rgba,
        height,
        canvas=(FRAME_W, FRAME_H),
        bottom=BASELINE_BOTTOM,
        cx=BASELINE_CX,
    )
    # 残绿清理：绿度软键在 alpha ≤10 的边上会留下 (0,255,0) 这种纯绿 RGB。
    # 这些像素肉眼是透明的，但放大/抠图工具里会显出绿边；alpha 都不到 16，直接清成空。
    data = np.asarray(frame).copy()
    data[data[..., 3] < 16] = 0
    frame = Image.fromarray(data)
    OUT.mkdir(parents=True, exist_ok=True)
    frame.save(IDLE, optimize=True)
    return {
        "file": str(IDLE.relative_to(ROOT)),
        "fit": info,
        "profile": profile(frame),
    }


def write_manifest(source_job: str, source_index: int) -> dict[str, object]:
    """把实测数字写进 manifest，给 `test/ch01-idle-right.test.ts` 当基线。

    和 `standup-manifest.json` 同一套做法：图片可以重生成，但基线数字不能被悄悄改掉。
    """
    idle = Image.open(IDLE).convert("RGBA")
    stand = standup_end_normalized()
    a, b = profile(stand), profile(idle)
    mask_a = np.asarray(stand)[..., 3] > kit.ALPHA_CUTOFF
    mask_b = np.asarray(idle)[..., 3] > kit.ALPHA_CUTOFF
    inter = int((mask_a & mask_b).sum())
    union = int((mask_a | mask_b).sum())
    manifest = {
        "key": "img.char.ch01.zhou_idle_right",
        "file": str(IDLE.relative_to(ROOT)),
        "generator": "tools/make-zhou-idle-right.py",
        "sourceJob": source_job,
        "sourceIndex": source_index,
        "canvas": {"width": FRAME_W, "height": FRAME_H},
        "displayScale": 0.6138,
        "idle": b,
        "standupEndFrame": a,
        "diff": {
            "height": b["h"] - a["h"],
            "headWidth": b["head_w"] - a["head_w"],
            "shoulderY": b["shoulder"] - a["shoulder"],
            "topY": b["top"] - a["top"],
            "bottomY": b["bottom"] - a["bottom"],
            "centerX": round(b["cx"] - a["cx"], 1),
        },
        "silhouetteIou": round(inter / union, 3) if union else 0.0,
    }
    (ROOT / "assets-src" / "character" / "ch01" / "idle-right-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )
    return manifest


# ---------------------------------------------------------------- 验收图


def _checker(width: int, height: int, dark: tuple[int, int, int] = (56, 60, 72)) -> Image.Image:
    tile = Image.new("RGBA", (width, height), dark + (255,))
    draw = ImageDraw.Draw(tile)
    step = 16
    light = tuple(min(255, c + 12) for c in dark)
    for cy in range(0, height, step):
        for cx in range(0, width, step):
            if (cx // step + cy // step) % 2 == 0:
                draw.rectangle((cx, cy, cx + step - 1, cy + step - 1), fill=light + (255,))
    return tile


def _paste_checker(board: Image.Image, image: Image.Image, xy: tuple[int, int], zoom: float = 1.0) -> None:
    width = max(1, round(image.width * zoom))
    height = max(1, round(image.height * zoom))
    scaled = image.resize((width, height), Image.LANCZOS)
    board.alpha_composite(_checker(width, height), xy)
    board.alpha_composite(scaled, xy)


def build_preview() -> None:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    idle = Image.open(IDLE).convert("RGBA")
    stats = profile(idle)
    board = Image.new("RGBA", (390, 844), (18, 20, 28, 255))
    draw = ImageDraw.Draw(board)
    f_title = kit.font(17)
    f_label = kit.font(12)
    f_small = kit.font(11)

    draw.text((16, 14), "侧面站立 idle（朝右）· t39", font=f_title, fill=(240, 242, 250, 255))
    draw.text(
        (16, 38),
        f"160×400 · 高 {stats['h']} · 底边 {stats['bottom']} · 中心 {int(round(stats['cx']))}",
        font=f_label,
        fill=(150, 200, 255, 255),
    )

    # 左：1:1 原图（160×400）
    draw.text((12, 62), "1:1 原图 160×400", font=f_label, fill=(200, 206, 220, 255))
    _paste_checker(board, idle, (12, 80))
    # 底边基准线（394）
    draw.line((12, 80 + BASELINE_BOTTOM, 12 + FRAME_W, 80 + BASELINE_BOTTOM), fill=(120, 220, 150, 200))

    # 右：实机尺寸放大 1.6×（in-game 0.6138 × 1.6 ≈ 0.982，整张画布 393 高）
    zoom = 1.6
    scale = round(0.6138 * zoom, 4)
    right_x = 200
    draw.text((right_x, 62), f"实机尺寸 ×{zoom:g}", font=f_label, fill=(200, 206, 220, 255))
    _paste_checker(board, idle, (right_x, 80), zoom=scale)
    draw.text(
        (right_x, 80 + round(FRAME_H * scale) + 6),
        f"屏显高 {round(stats['h'] * 0.6138)}px · 画布满高 {round(FRAME_H * scale)}px",
        font=f_small,
        fill=(140, 150, 170, 255),
    )

    # 下：与起身末帧同尺寸并排（同底边 394、同高 371）
    stand = standup_end_normalized()
    stats_stand = profile(stand)
    zoom2 = 0.7
    y = 524
    draw.text((12, y - 22), "起身末帧 → 新 idle（同底边、同高 371）", font=f_label, fill=(200, 206, 220, 255))
    _paste_checker(board, stand, (12, y), zoom=zoom2)
    _paste_checker(board, idle, (132, y), zoom=zoom2)
    foot_y = y + round(BASELINE_BOTTOM * zoom2)
    draw.line((12, foot_y, 244, foot_y), fill=(120, 220, 150, 190))
    draw.text((12, y + round(FRAME_H * zoom2) + 2), "起身末帧", font=f_small, fill=(160, 168, 186, 255))
    draw.text((132, y + round(FRAME_H * zoom2) + 2), "新 idle", font=f_small, fill=(160, 168, 186, 255))

    rows = [
        ("高", f"{stats_stand['h']}", f"{stats['h']}"),
        ("头宽", f"{stats_stand['head_w']}", f"{stats['head_w']}"),
        ("肩高", f"{stats_stand['shoulder']}", f"{stats['shoulder']}"),
        ("脚底", f"{stats_stand['bottom']}", f"{stats['bottom']}"),
        ("中心", f"{stats_stand['cx']:.0f}", f"{stats['cx']:.0f}"),
    ]
    draw.text((252, y), "末帧 / idle", font=f_small, fill=(140, 150, 170, 255))
    for index, (name, a, b) in enumerate(rows):
        draw.text((252, y + 16 + index * 15), f"{name}  {a} / {b}", font=f_small, fill=(198, 206, 222, 255))

    board.convert("RGB").save(SHOT_DIR / "idle-right-preview.png", optimize=True)


def build_compare() -> dict[str, object]:
    SHOT_DIR.mkdir(parents=True, exist_ok=True)
    idle = Image.open(IDLE).convert("RGBA")
    stand = standup_end_normalized()
    a, b = profile(stand), profile(idle)
    diff = {
        "height": b["h"] - a["h"],
        "head_w": b["head_w"] - a["head_w"],
        "shoulder_y": b["shoulder"] - a["shoulder"],
        "top_y": b["top"] - a["top"],
        "bottom_y": b["bottom"] - a["bottom"],
        "cx": round(b["cx"] - a["cx"], 1),
    }

    pad = 14
    label_h = 20
    zoom = 2
    cell_w, cell_h = FRAME_W * zoom, FRAME_H * zoom
    width = pad + (cell_w + pad) * 2 + 190
    height = pad * 2 + label_h + cell_h + 44
    board = Image.new("RGBA", (width, height), (18, 20, 28, 255))
    draw = ImageDraw.Draw(board)
    f_title = kit.font(15)
    f_label = kit.font(12)
    f_small = kit.font(11)

    draw.text((pad, pad), "起身末帧（归一到 371 高）", font=f_label, fill=(205, 212, 228, 255))
    draw.text((pad + cell_w + pad, pad), "新 idle（zhou_idle_right）", font=f_label, fill=(205, 212, 228, 255))
    top = pad + label_h
    for column, image in enumerate((stand, idle)):
        x = pad + column * (cell_w + pad)
        _paste_checker(board, image, (x, top), zoom=zoom)
    # 三条基准线：头/肩/脚底（按末帧的位置画满两块面板，新 idle 落到同一条线上才算接得住）
    panels_right = pad * 2 + cell_w * 2
    for name, y_value, color in (
        ("头", a["top"], (120, 210, 255, 170)),
        ("肩", a["shoulder"], (255, 200, 110, 170)),
        ("脚底", a["bottom"], (120, 220, 150, 190)),
    ):
        y = top + y_value * zoom
        draw.line((pad, y, panels_right, y), fill=color, width=1)
        draw.rectangle((panels_right - 46, y - 13, panels_right - 1, y - 1), fill=(18, 20, 28, 225))
        draw.text((panels_right - 43, y - 13), f"{name} {y_value}", font=f_small, fill=color)

    text_x = panels_right + 16
    draw.text((text_x, top), "差值（idle - 末帧）", font=f_label, fill=(205, 212, 228, 255))
    rows = [
        ("高", a["h"], b["h"], diff["height"]),
        ("头宽", a["head_w"], b["head_w"], diff["head_w"]),
        ("肩高 y", a["shoulder"], b["shoulder"], diff["shoulder_y"]),
        ("头顶 y", a["top"], b["top"], diff["top_y"]),
        ("脚底 y", a["bottom"], b["bottom"], diff["bottom_y"]),
    ]
    for index, (name, va, vb, vd) in enumerate(rows):
        color = (140, 225, 160, 255) if abs(vd) <= 3 else (250, 160, 150, 255)
        text_y = top + 24 + index * 18
        draw.text((text_x, text_y), f"{name}: {va} / {vb}", font=f_small, fill=(196, 204, 220, 255))
        draw.text((text_x + 122, text_y), f"{vd:+d}", font=f_small, fill=color)

    # 轮廓重叠率：两张 alpha 掩膜的 IoU，量化「剪影差多少」
    mask_a = np.asarray(stand)[..., 3] > kit.ALPHA_CUTOFF
    mask_b = np.asarray(idle)[..., 3] > kit.ALPHA_CUTOFF
    inter = int((mask_a & mask_b).sum())
    union = int((mask_a | mask_b).sum())
    iou = round(inter / union, 3) if union else 0.0
    draw.text((text_x, top + 24 + len(rows) * 18 + 10), f"剪影 IoU {iou:.3f}", font=f_small, fill=(196, 204, 220, 255))
    draw.text((text_x, top + 24 + len(rows) * 18 + 26), f"差 {union - inter}px / 并 {union}px", font=f_small, fill=(150, 158, 178, 255))

    note = "绿线按末帧的头顶 / 肩线 / 脚底画满整幅，新 idle 落在 3px 内 = 接帧不跳"
    draw.text((pad, height - 30), note, font=f_small, fill=(150, 158, 178, 255))
    board.convert("RGB").save(SHOT_DIR / "idle-vs-standup8.png", optimize=True)
    return {"standup": a, "idle": b, "diff": diff, "iou": iou}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--src", type=Path, help="生成的绿幕源图（1024×1536）")
    parser.add_argument("--sheet", action="store_true", help="只重出验收图 / manifest")
    parser.add_argument("--height", type=int, default=STAND_TARGET_H)
    parser.add_argument("--job", default="imw5uxk0386893c", help="image job id（写进 manifest）")
    parser.add_argument("--index", type=int, default=0, help="取 job 里的第几张（写进 manifest）")
    args = parser.parse_args()

    if args.src:
        print("idle:", json.dumps(build_idle(args.src, args.height), ensure_ascii=False))
    if args.sheet or args.src:
        build_preview()
        print("对比:", json.dumps(build_compare(), ensure_ascii=False))
        print("manifest:", json.dumps(write_manifest(args.job, args.index), ensure_ascii=False))
        print("验收图:", SHOT_DIR / "idle-right-preview.png", SHOT_DIR / "idle-vs-standup8.png")


if __name__ == "__main__":
    main()
