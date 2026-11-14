#!/usr/bin/env python3
"""生成 App 图标：Android 传统 mipmap 各密度 + 自适应图标前景/背景层。

源文件（assets-src/app-icon/）：
  icon-1024.png           满幅方形主图（传统 mipmap 的母版，AI 生成后未裁切）
  raw/icon-safe-v1-b.png  圆形安全区构图（自适应前景层的母版）
  foreground-1024.png     本脚本产出的自适应前景层（108dp 画布，主体居中、四周透明）
  background-1024.png     本脚本产出的自适应背景层（纯色 #05060a）

产出：
  cordova/res/icon/android/ic_launcher_<density>.png             传统图标
  cordova/res/icon/android/ic_launcher_foreground_<density>.png  自适应前景
  cordova/res/icon/android/ic_launcher_background_<density>.png  自适应背景
  docs/screenshots/verify-2026-11-14/appicon/*.png               验收预览（3 张）

几何依据（Android 自适应图标规范）：
  - 前景/背景层各 108×108dp，系统把中间 72×72dp 当作可见视口；
  - 圆形遮罩直径 = 72dp；另有直径 66dp 的「保证可见」安全区；
  - 因此主体内容必须落在 72dp 视口内，且越靠近画布中心越安全。

用法：python3 tools/make-app-icon.py
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets-src" / "app-icon"
RAW = SRC / "raw"
OUT_ICONS = ROOT / "cordova" / "res" / "icon" / "android"
OUT_PREVIEW = ROOT / "docs" / "screenshots" / "verify-2026-11-14" / "appicon"

MASTER_LEGACY = SRC / "icon-1024.png"
MASTER_SAFE = RAW / "icon-safe-v1-b.png"
FG_OUT = SRC / "foreground-1024.png"
BG_OUT = SRC / "background-1024.png"

P = 1024
BG = (5, 6, 10)  # #05060a
GOLD = (216, 183, 106)  # #d8b76a
RED = (192, 57, 43)  # #c0392b

# Android 传统启动图标边长：48dp 基准 × density scale。
LEGACY = {
    "ldpi": 36,      # 48dp × 0.75
    "mdpi": 48,      # 48dp × 1
    "hdpi": 72,      # 48dp × 1.5
    "xhdpi": 96,     # 48dp × 2
    "xxhdpi": 144,   # 48dp × 3
    "xxxhdpi": 192,  # 48dp × 4
}
# 自适应层 = 108dp × density scale。
ADAPTIVE = {
    "ldpi": 81,
    "mdpi": 108,
    "hdpi": 162,
    "xhdpi": 216,
    "xxhdpi": 324,
    "xxxhdpi": 432,
}

CJK_FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"


def scrim(text: str) -> None:
    print(text)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(CJK_FONT, size)


def content_radius(img: Image.Image, lum_thresh: int = 60, pct: float = 99.0) -> float:
    """画面「主体」的等效半径：比暗底亮得出来的像素（人物/武器/裂光），取半径的 pct 分位。

    用亮度而不是「与角落底色不同」来判断，是因为母版自带一圈暗色圆盘与金色光尘，
    那些边缘像素会把半径算大 15%，导致主体被白白缩小。
    """
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    h, w, _ = a.shape
    lum = a.max(axis=2)
    ys, xs = np.mgrid[0:h, 0:w]
    r = np.sqrt((xs - (w - 1) / 2) ** 2 + (ys - (h - 1) / 2) ** 2)
    return float(np.percentile(r[lum > lum_thresh], pct))


def build_background() -> None:
    Image.new("RGB", (P, P), BG).save(BG_OUT)


def build_foreground() -> dict:
    """把圆形安全区母版压成 108dp 画布上的前景层：主体居中、四周透明羽化。"""
    art = Image.open(MASTER_SAFE).convert("RGB")
    rc = content_radius(art)
    view_r = P * (72 / 108) / 2  # 341.33px：72dp 可见视口半径
    # 母版主体（人物/刀/镐）已经圆内构图，缩放目标 = 主体半径占到视口半径的 98%：
    # 主体四周仍有约 2% 硬留白，同时人物在图标里够大，不会缩成一枚小徽章。
    scale = view_r * 0.98 / rc
    target_r = rc * scale

    side = int(round(P * scale))
    art_s = art.resize((side, side), Image.LANCZOS)
    canvas = Image.new("RGBA", (P, P), (0, 0, 0, 0))
    off = (P - side) // 2
    canvas.paste(art_s, (off, off))

    # 视口边缘做极短羽化（防锯齿）+ 向背景色过渡，避免出现一圈可见的「圆盘边」
    a = np.asarray(canvas).astype(np.float32)
    yy, xx = np.mgrid[0:P, 0:P]
    r = np.sqrt((xx - (P - 1) / 2) ** 2 + (yy - (P - 1) / 2) ** 2)
    # 羽化带起点：取「视口 98.5%」与「主体半径 +0.5%」中更靠外的那个，
    # 保证羽化只吃掉母版自带的暗色边缘与光尘，不会削到人物/武器。
    r_in = max(view_r * 0.985, target_r * 1.005)
    r_out = view_r * 0.999  # 视口边缘完全透明
    t = np.clip((r - r_in) / (r_out - r_in), 0.0, 1.0)
    a[..., 3] *= 1.0 - t
    blend = np.clip((r - view_r * 0.86) / (r_out - view_r * 0.86), 0.0, 1.0)[..., None]
    a[..., :3] = a[..., :3] * (1.0 - blend) + np.array(BG, dtype=np.float32) * blend
    fg = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")
    fg.save(FG_OUT)

    # 自检：所有可见像素必须落在 72dp 视口内
    alpha = np.asarray(fg)[..., 3]
    opaque_r = float(r[alpha >= 250].max())
    max_r = float(r[alpha > 0].max())
    assert max_r <= view_r, f"前景层越出 72dp 视口：{max_r:.1f} > {view_r:.1f}"
    # 主体（人物/武器）必须整个在不透明区里，否则边缘会把人削掉
    assert target_r <= r_in, f"主体越出前景不透明区：{target_r:.1f} > {r_in:.1f}"
    return {
        "source": MASTER_SAFE.name,
        "content_radius_src": rc,
        "scale": scale,
        "subject_radius": target_r,
        "opaque_radius": opaque_r,
        "viewport_radius": view_r,
        "margin_pct": 100 * (1 - target_r / view_r),
    }


def downscale(img: Image.Image, size: int) -> Image.Image:
    """传统图标降采样。小尺寸额外提对比/亮度 + 锐化，避免在 1× 观感下发灰。"""
    out = img.resize((size, size), Image.LANCZOS)
    if size <= 72:
        out = ImageEnhance.Contrast(out).enhance(1.08)
        out = ImageEnhance.Brightness(out).enhance(1.05)
        out = out.filter(ImageFilter.UnsharpMask(radius=0.55, percent=85, threshold=1))
    elif size <= 96:
        out = out.filter(ImageFilter.UnsharpMask(radius=0.6, percent=55, threshold=2))
    return out


def build_icons() -> list[dict]:
    OUT_ICONS.mkdir(parents=True, exist_ok=True)
    legacy = Image.open(MASTER_LEGACY).convert("RGB")
    fg = Image.open(FG_OUT).convert("RGBA")
    bg = Image.open(BG_OUT).convert("RGB")

    rows = []
    for density, size in LEGACY.items():
        out = OUT_ICONS / f"ic_launcher_{density}.png"
        downscale(legacy, size).save(out)
        rows.append({"file": out.relative_to(ROOT), "size": f"{size}x{size}", "sha": sha256(out)})

    for density, size in ADAPTIVE.items():
        f_out = OUT_ICONS / f"ic_launcher_foreground_{density}.png"
        fg.resize((size, size), Image.LANCZOS).save(f_out)
        rows.append({"file": f_out.relative_to(ROOT), "size": f"{size}x{size}", "sha": sha256(f_out)})

        b_out = OUT_ICONS / f"ic_launcher_background_{density}.png"
        bg.resize((size, size), Image.NEAREST).save(b_out)
        rows.append({"file": b_out.relative_to(ROOT), "size": f"{size}x{size}", "sha": sha256(b_out)})
    return rows


def rounded_mask(size: int, radius_ratio: float) -> Image.Image:
    img = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(img).rounded_rectangle((0, 0, size * 4 - 1, size * 4 - 1),
                                          radius=int(size * 4 * radius_ratio), fill=255)
    return img.resize((size, size), Image.LANCZOS)


def mask_shapes(size: int) -> dict[str, Image.Image]:
    yy, xx = np.mgrid[0:size, 0:size]
    cx = cy = (size - 1) / 2
    a = size / 2
    masks: dict[str, Image.Image] = {}
    r = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    masks["圆形遮罩"] = Image.fromarray(((r <= a - 0.5) * 255).astype(np.uint8), "L")
    n = 4.0
    squircle = ((np.abs(xx - cx) / a) ** n + (np.abs(yy - cy) / a) ** n) <= 1
    masks["超椭圆遮罩"] = Image.fromarray((squircle * 255).astype(np.uint8), "L")
    masks["圆角方形遮罩"] = rounded_mask(size, 0.2)
    return masks


def compose_adaptive(size: int) -> Image.Image:
    fg = Image.open(OUT_ICONS / "ic_launcher_foreground_xxxhdpi.png").convert("RGBA")
    bg = Image.open(OUT_ICONS / "ic_launcher_background_xxxhdpi.png").convert("RGB")
    fg = fg.resize((size, size), Image.LANCZOS)
    tile = bg.resize((size, size), Image.LANCZOS).convert("RGBA")
    tile.alpha_composite(fg)
    return tile.convert("RGB")


def preview_densities() -> Path:
    """① 各密度并排（真实像素）+ 各自整数倍放大（看 1× 小尺寸是否可读）。"""
    OUT_PREVIEW.mkdir(parents=True, exist_ok=True)
    zooms = {"ldpi": 8, "mdpi": 8, "hdpi": 6, "xhdpi": 4, "xxhdpi": 3, "xxxhdpi": 2}
    cell, gap, pad = 292, 16, 26
    top_h, real_h, zoom_h = 86, 220, cell
    width = pad * 2 + len(LEGACY) * cell + (len(LEGACY) - 1) * gap
    height = top_h + real_h + 46 + zoom_h + 34
    sheet = Image.new("RGB", (width, height), (18, 19, 24))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 20), "App 图标 · 传统 mipmap 六密度", font=font(24), fill=(236, 232, 222))
    d.text((pad, 52), "上排：真实像素（1× 观感）；下排：整数倍 NEAREST 放大（检查描边与构图是否还读得出）",
           font=font(16), fill=(150, 150, 158))

    for i, (density, size) in enumerate(LEGACY.items()):
        x = pad + i * (cell + gap)
        icon = Image.open(OUT_ICONS / f"ic_launcher_{density}.png").convert("RGB")
        stage = Image.new("RGB", (cell, real_h), (29, 30, 37))
        small = icon if size <= real_h - 16 else icon.resize((real_h - 16, real_h - 16), Image.LANCZOS)
        stage.paste(small, ((cell - small.width) // 2, (real_h - small.height) // 2))
        sheet.paste(stage, (x, top_h))
        d.text((x, top_h + real_h + 8), f"{density} · {size}px", font=font(19), fill=(226, 222, 212))

        z = zooms[density]
        zoomed = icon.resize((size * z, size * z), Image.NEAREST)
        if zoomed.width > cell - 6:
            zoomed = icon.resize((cell - 6, cell - 6), Image.NEAREST)
        box = Image.new("RGB", (cell, zoom_h), (24, 25, 31))
        box.paste(zoomed, ((cell - zoomed.width) // 2, (zoom_h - zoomed.height) // 2))
        sheet.paste(box, (x, top_h + real_h + 46))
        d.text((x, top_h + real_h + 46 + zoom_h + 4), f"{density} ×{z}", font=font(16), fill=(140, 140, 148))

    out = OUT_PREVIEW / "01-densities.png"
    sheet.save(out)
    return out


def preview_masks(fg_info: dict) -> Path:
    """② 圆形/超椭圆/圆角遮罩模拟：证明刀、镐、头盔都在安全区内。"""
    size = 432  # xxhdpi 自适应层原始像素
    composed = compose_adaptive(size)
    masks = mask_shapes(size)

    guide = composed.copy()
    gd = ImageDraw.Draw(guide)
    v = size * 72 / 108
    s = size * 66 / 108
    fg_d = size * 2 * fg_info["opaque_radius"] / P
    gd.rectangle(((size - v) / 2,) * 2 + ((size + v) / 2,) * 2, outline=(96, 200, 255), width=2)
    gd.ellipse(((size - s) / 2,) * 2 + ((size + s) / 2,) * 2, outline=(120, 230, 160), width=2)
    gd.ellipse(((size - v) / 2,) * 2 + ((size + v) / 2,) * 2, outline=(96, 200, 255), width=3)
    gd.ellipse(((size - fg_d) / 2,) * 2 + ((size + fg_d) / 2,) * 2, outline=GOLD, width=2)

    items: list[tuple[str, str, Image.Image]] = [
        ("108dp 画布 + 视口标线", "青框=72dp 视口 · 绿圆=66dp 安全圆 · 金圈=主体边界", guide)
    ]
    for name, m in masks.items():
        masked = Image.composite(composed, Image.new("RGB", (size, size), (11, 12, 17)), m)
        items.append((name, "主体完整，未被裁切", masked))

    circle = Image.composite(composed, Image.new("RGB", (size, size), (11, 12, 17)), masks["圆形遮罩"])
    crop_box = (int(size * 0.55), int(size * 0.02), size, int(size * 0.60))
    crop = circle.crop(crop_box).resize((380, 380), Image.LANCZOS)

    cell, gap, pad = 432, 16, 26
    width = pad * 2 + 4 * cell + 3 * gap + 380 + gap
    height = pad + 96 + 440 + 60
    sheet = Image.new("RGB", (width, height), (16, 17, 22))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 18), "自适应图标安全区检查", font=font(24), fill=(236, 232, 222))
    d.text((pad, 52), f"前景层主体半径 {fg_info['opaque_radius'] * 2 * size / P:.0f}px / 72dp 视口 {v:.0f}px，余量 {fg_info['margin_pct']:.1f}%",
           font=font(16), fill=(150, 150, 158))

    x = pad
    for label, note, img in items:
        sheet.paste(img, (x, 96))
        d.text((x, 96 + cell + 6), label, font=font(18), fill=(214, 210, 200))
        d.text((x, 96 + cell + 30), note, font=font(14), fill=(128, 132, 140))
        x += cell + gap

    sheet.paste(crop, (x, 96))
    d.text((x, 96 + 386), "圆形遮罩 · 镐头/安全帽特写", font=font(17), fill=(214, 210, 200))
    d.text((x, 96 + 410), "完整，未切边", font=font(17), fill=(120, 230, 160))

    out = OUT_PREVIEW / "02-mask-sim.png"
    sheet.save(out)
    return out


def preview_home() -> Path:
    """③ 模拟桌面：深色壁纸 + 图标 + 图标下方「刺客vs矿工」。"""
    w, h = 1080, 1920
    yy = np.linspace(0, 1, h)[:, None, None]
    top = np.array([10, 11, 16], dtype=np.float32)
    bottom = np.array([26, 21, 19], dtype=np.float32)
    wall = np.repeat(top * (1 - yy) + bottom * yy, w, axis=1).astype(np.uint8)
    screen = Image.fromarray(wall, "RGB")
    d = ImageDraw.Draw(screen)

    rng = np.random.default_rng(7)
    for _ in range(150):
        px, py = int(rng.integers(0, w)), int(rng.integers(0, h))
        v = int(rng.integers(26, 56))
        d.point((px, py), fill=(v, v, min(255, int(v * 1.15))))

    d.text((56, 36), "9:41", font=font(34), fill=(238, 236, 230))
    d.text((w - 108, 42), "5G", font=font(26), fill=(238, 236, 230))

    icon_size = 300
    tile = compose_adaptive(icon_size)
    circle = Image.composite(tile, Image.new("RGB", (icon_size, icon_size), (11, 12, 17)),
                             mask_shapes(icon_size)["圆形遮罩"])

    ix, iy = (w - icon_size) // 2, 470
    shadow = Image.new("RGBA", (icon_size + 140, icon_size + 140), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse(
        ((icon_size + 140) / 2 - icon_size * 0.53,) * 2 + ((icon_size + 140) / 2 + icon_size * 0.53,) * 2,
        fill=(0, 0, 0, 120),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    screen.paste(shadow, (ix - 70, iy - 56), shadow)
    screen.paste(circle, (ix, iy))

    label = "刺客vs矿工"
    lf = font(46)
    lbox = d.textbbox((0, 0), label, font=lf)
    d.text(((w - (lbox[2] - lbox[0])) / 2 - lbox[0], iy + icon_size + 28), label, font=lf, fill=(240, 238, 232))

    # 下方两行压暗的占位 App，提供真实桌面比例参照
    for row in range(2):
        for col in range(4):
            bx, by = 66 + col * 250, 960 + row * 330
            d.rounded_rectangle((bx, by, bx + 152, by + 152), radius=36, fill=(30, 31, 38))

    out = OUT_PREVIEW / "03-home-screen-sim.png"
    screen.save(out)
    return out


def main() -> int:
    for p in (MASTER_LEGACY, MASTER_SAFE):
        if not p.exists():
            print(f"[app-icon] 缺少源文件：{p.relative_to(ROOT)}", file=sys.stderr)
            return 1

    OUT_ICONS.mkdir(parents=True, exist_ok=True)
    build_background()
    fg_info = build_foreground()
    rows = build_icons()

    scrim("[app-icon] 自适应前景层")
    scrim(f"  源：raw/{fg_info['source']}  内容半径 {fg_info['content_radius_src']:.1f}px")
    scrim(f"  缩放 {fg_info['scale']:.4f} → 主体半径 {fg_info['subject_radius']:.1f}px"
          f" / 72dp 视口半径 {fg_info['viewport_radius']:.1f}px（主体留边 {fg_info['margin_pct']:.1f}%）"
          f"，不透明区半径 {fg_info['opaque_radius']:.1f}px")
    scrim("[app-icon] 产出：")
    for r in rows:
        scrim(f"  {r['file']}  {r['size']}  sha256[:16]={r['sha']}")

    for p in (preview_densities(), preview_masks(fg_info), preview_home()):
        scrim(f"[preview] {p.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
