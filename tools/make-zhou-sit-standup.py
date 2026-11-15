#!/usr/bin/env python3
"""把「游戏素材大师」生成的坐地/起身素材裁成游戏用帧。

输入（image / sequence job 的产物，纯绿底）：
    ~/.dsh/game-material-master/image-jobs/<id>/out/img-XX.png      坐地朝右候选
    ~/.dsh/game-material-master/sequence-jobs/<id>/frames/f*.png    起身视频抽帧
输出：
    public/assets/img/character/ch01/zhou_sit_right.png      160×400（坐姿，高 160 / 底边 394 / 中心 80）
    public/assets/img/character/ch01/zhou_stand_up.webp      8 帧横排 1280×400（每帧 160×400）
    .evidence/docs/screenshots/sitting/review-sheet.png      坐姿 + 起身逐帧并排验收图

三条铁律（踩过的坑）：
1. 绿幕不能用 RGB 距离键，要用 `greenness = g - max(r, b)`：背光半边带绿幕反光，
   距离键会把半个身子判成半透明。
2. 生成图常常自带一块「地面投影」——投影是**暗绿**（greenness 约 60~110），
   绿度键会把它留成半透明脏块。必须单独判掉（见 `shadow_removed`）。
3. 每帧高度按目标曲线单调归一化，不做逐帧各自适应，否则人物「越站越矮」。

用法：
    python3 tools/make-zhou-sit-standup.py --sit <img-00.png>
    python3 tools/make-zhou-sit-standup.py --standup <seq-dir>/frames
    python3 tools/make-zhou-sit-standup.py --sheet   # 只重出验收图
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "img" / "character" / "ch01"
REVIEW_DIR = ROOT / ".evidence" / "docs" / "screenshots" / "sitting"

FRAME_W, FRAME_H = 160, 400
# Q 版站立帧的基准：底边 394、水平中心 80、站立高 371。
BASELINE_BOTTOM = 394
BASELINE_CX = 80
STAND_TARGET_H = 371
# 坐地姿态的显示高度（画布像素；缩放下限见 keys/编排）。
SIT_TARGET_H = 160
# 起身帧目标高度：坐 160 → 站 228。
# 228 = 站立帧 371 × PLAYER_SCALE(0.6138)，也就是「起身最后一帧在屏幕上和站立精灵一样高」，
# 整段按 displayScale=1.0 播放（和坐姿图同一套画布/缩放），不许再乘 0.6138。
STANDUP_START_H = 160
STANDUP_END_H = 228
STANDUP_FRAMES = 8
# 从 24 帧抽帧里挑 8 帧：坐定 → 手撑地 → 收腿 → 深蹲 → 起身 → 半蹲 → 站直 → 站定。
STANDUP_PICKS = [0, 6, 10, 16, 17, 19, 21, 23]

# 绿度键阈值（相对实测背景绿度自适应，见 `key_green`）：
# 背景绿度 bg_gr ≈ 140、地面投影 ≈ 99、角色本体 < 25。
# 低于 FULL 一律不透明，高于 `bg_gr - 50` 一律透明，中间线性过渡（描边抗锯齿）。
GREEN_FULL = 45.0
GREEN_ZERO_GAP = 50.0
# 地面投影：暗绿。`greenness` 高于 SHADOW_GREEN 且整体很暗，就是投影而不是角色。
SHADOW_GREEN = 50.0
SHADOW_MAX_CHANNEL = 140.0
ALPHA_CUTOFF = 40


def load_rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)


def load_frame(path: Path) -> np.ndarray:
    """读一帧 RGBA。

    序列帧工具的 `keyed/` 产物**已经抠好**（背景 alpha=0、RGB 全 0），
    再跑一遍绿度键会把整块透明背景判成不透明黑底，所以只对还带绿底的图抠像。
    """
    image = Image.open(path).convert("RGBA")
    rgba = np.asarray(image).copy()
    if int(rgba[..., 3].min()) < 8:
        return rgba
    return key_green(np.asarray(image.convert("RGB"), dtype=np.float32))


def key_green(rgb: np.ndarray) -> np.ndarray:
    """绿幕软键 + 投影剔除 + 绿色溢出抑制。返回 uint8 RGBA。"""
    rgb = rgb.copy()
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    greenness = g - np.maximum(r, b)
    # 背景绿度按四角实测：生成图的「纯绿」经常是 (25,165,13) 这种暗绿，
    # 写死 190 会让整张背景都算成半透明，bbox 直接等于整幅画布。
    corners = np.concatenate(
        [
            greenness[:8, :8].ravel(),
            greenness[:8, -8:].ravel(),
            greenness[-8:, :8].ravel(),
            greenness[-8:, -8:].ravel(),
        ]
    )
    bg_green = float(np.median(corners))
    zero = max(GREEN_FULL + 10.0, bg_green - GREEN_ZERO_GAP)
    alpha = np.clip((zero - greenness) / (zero - GREEN_FULL) * 255.0, 0, 255)
    # 比背景还绿的一律清掉（噪点），避免投影边缘被算进角色包围盒。
    alpha[greenness >= zero] = 0.0

    # 地面投影：暗绿块。角色本体（藏青裤 / 黑描边 / 白鞋）的绿度都 < 45 或亮度很高，
    # 不会命中这条；命中的只是「背景绿被压暗」的那块。
    channel_max = rgb.max(axis=-1)
    shadow = (greenness > SHADOW_GREEN) & (channel_max < SHADOW_MAX_CHANNEL)
    alpha[shadow] = 0.0

    spill = np.clip(greenness, 0, None)
    rgb[..., 1] = np.clip(g - spill * 0.9, 0, 255)
    return np.dstack([rgb, alpha]).astype(np.uint8)


def alpha_mask(rgba: np.ndarray, cutoff: int = ALPHA_CUTOFF) -> np.ndarray:
    return rgba[..., 3] > cutoff


def content_bbox(rgba: np.ndarray) -> tuple[int, int, int, int] | None:
    """角色包围盒；画面最外圈一律作废（绿幕边缘总有压不干净的噪点）。"""
    mask = alpha_mask(rgba)
    mask[:2, :] = False
    mask[-2:, :] = False
    mask[:, :2] = False
    mask[:, -2:] = False
    ys, xs = np.where(mask)
    if len(ys) < 500:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def fit_frame(
    rgba: np.ndarray,
    target_h: int,
    canvas: tuple[int, int] = (FRAME_W, FRAME_H),
    bottom: int = BASELINE_BOTTOM,
    cx: int = BASELINE_CX,
) -> tuple[Image.Image, dict[str, int]]:
    """按目标高度等比缩放并落到统一基准（底边 / 水平中心）。不横向裁切，超出就整体缩。"""
    box = content_bbox(rgba)
    if box is None:
        raise RuntimeError("整帧都是透明的：抠像参数或源图不对")
    crop = Image.fromarray(rgba).crop(box)
    scale = target_h / crop.height
    width = max(1, round(crop.width * scale))
    height = max(1, round(crop.height * scale))
    if width > canvas[0] - 4:
        # 宁可矮一点也不能横向裁掉半个身子。
        ratio = (canvas[0] - 4) / width
        width = canvas[0] - 4
        height = max(1, round(height * ratio))
    resized = crop.resize((width, height), Image.LANCZOS)
    # 缩到 160 宽以后，发丝尖/鞋尖这种细结构会掉到 alpha 阈值以下：
    # 必须按**缩放后**的可见包围盒重新居中，否则人物会整体偏右几像素。
    tight = resized.getchannel("A").point(lambda v: 255 if v > ALPHA_CUTOFF else 0).getbbox()
    if tight is not None and (tight[2] - tight[0], tight[3] - tight[1]) != (width, height):
        resized = resized.crop(tight)
        width, height = resized.size
    out = Image.new("RGBA", canvas, (0, 0, 0, 0))
    x = min(max(0, round(cx - width / 2)), canvas[0] - width)
    y = bottom - height
    out.alpha_composite(resized, (x, y))
    bbox = out.getchannel("A").point(lambda v: 255 if v > ALPHA_CUTOFF else 0).getbbox()
    assert bbox is not None
    return out, {
        "w": bbox[2] - bbox[0],
        "h": bbox[3] - bbox[1],
        "bottom": bbox[3],
        "cx": round((bbox[0] + bbox[2]) / 2),
        "left": bbox[0],
        "right": canvas[0] - bbox[2],
    }


def measure(path: Path, frame_w: int | None = None, index: int = 0) -> dict[str, int | bool]:
    image = Image.open(path).convert("RGBA")
    if frame_w is not None:
        image = image.crop((index * frame_w, 0, (index + 1) * frame_w, image.height))
    return measure_image(image)


def measure_image(image: Image.Image) -> dict[str, int | bool]:
    bbox = image.getchannel("A").point(lambda v: 255 if v > ALPHA_CUTOFF else 0).getbbox()
    if bbox is None:
        return {"empty": True, "w": 0, "h": 0, "bottom": 0, "cx": 0, "clipped": True}
    return {
        "empty": False,
        "w": bbox[2] - bbox[0],
        "h": bbox[3] - bbox[1],
        "bottom": bbox[3],
        "cx": round((bbox[0] + bbox[2]) / 2),
        "clipped": bbox[0] <= 0 or bbox[1] <= 0 or bbox[2] >= image.width or bbox[3] >= image.height,
    }


def build_sit(source: Path, target_h: int = SIT_TARGET_H) -> dict[str, int]:
    frame, info = fit_frame(key_green(load_rgb(source)), target_h)
    OUT.mkdir(parents=True, exist_ok=True)
    frame.save(OUT / "zhou_sit_right.png", optimize=True)
    return info


def _pava(values: list[float]) -> list[float]:
    """保序回归（pool adjacent violators）：把高度序列压成不下降的最小改动曲线。"""
    pool: list[list[float]] = []
    for value in values:
        pool.append([value, 1])
        while len(pool) > 1 and pool[-2][0] / pool[-2][1] > pool[-1][0] / pool[-1][1]:
            total, count = pool.pop()
            pool[-1][0] += total
            pool[-1][1] += count
    out: list[float] = []
    for total, count in pool:
        out.extend([total / count] * count)
    return out


def standup_targets(natural: list[int]) -> list[float]:
    """把「视频里人物的自然高度」变成严格递增的目标高度。

    为什么要保序回归而不是逐帧硬拉：起身时上半身前倾下压，人物轮廓高度**本来就会
    先降一点再升**（这是真实动作，不是 bug）。直接按 160→228 线性拉会把下蹲那几帧
    放大 30%（头会像气球），所以先取「最接近自然高度的单调曲线」，只做 ≤3% 的微调，
    再整体映射到「首帧 = 坐姿 160、末帧 = 站立屏显 228」。
    """
    iso = _pava([float(v) for v in natural])
    eps = iso[-1] * 0.004
    for i in range(1, len(iso)):
        iso[i] = max(iso[i], iso[i - 1] + eps)
    span = iso[-1] - iso[0]
    scale = (STANDUP_END_H - STANDUP_START_H) / (span or 1.0)
    return [STANDUP_START_H + (value - iso[0]) * scale for value in iso]


def frame_profile(rgba: np.ndarray) -> dict[str, float]:
    """量出一帧的包围盒、躯干水平重心和头部宽度（缩放/对位用）。"""
    mask = alpha_mask(rgba)
    ys, xs = np.where(mask)
    if len(ys) < 500:
        raise RuntimeError("起身帧是空的：抠像失败")
    top, bottom = int(ys.min()), int(ys.max())
    height = bottom - top + 1
    torso = mask.copy()
    torso[: top + int(height * 0.45), :] = False
    torso[top + int(height * 0.75) :, :] = False
    tys, txs = np.where(torso)
    head_width = max(
        _longest_run(mask[y]) for y in range(top, top + max(1, int(height * 0.22)))
    )
    return {
        "height": height,
        "bbox_cx": (xs.min() + xs.max()) / 2,
        "torso_cx": float(txs.mean()) if len(txs) else float((xs.min() + xs.max()) / 2),
        "head_width": float(head_width),
    }


def _longest_run(row: np.ndarray) -> int:
    best = current = 0
    for value in row:
        current = current + 1 if value else 0
        best = max(best, current)
    return best


def palette_gain(rgba: np.ndarray, reference: Image.Image) -> np.ndarray:
    """逐通道白点校正：修正视频抽帧常见的偏色（白校服发紫/发青）。

    只按 p97 白点拉回，黑描边保持纯黑（做两端拉伸会把黑线拉成脏色）。
    """
    ref = np.asarray(reference.convert("RGBA"))
    ref_px = ref[..., :3].astype(np.float32)[ref[..., 3] > 40]
    ref_high = np.percentile(ref_px, 97, axis=0)
    mask = alpha_mask(rgba)
    high = np.percentile(rgba[..., :3].astype(np.float32)[mask], 97, axis=0)
    gain = np.clip(ref_high / np.maximum(high, 1.0), 0.85, 1.25)
    return gain


def apply_gain(rgba: np.ndarray, gain: np.ndarray) -> np.ndarray:
    out = rgba.copy()
    rgb = out[..., :3].astype(np.float32) * gain
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return out


def place_at(rgba: np.ndarray, height: int, anchor_cx: float, anchor_value: float) -> Image.Image:
    """按目标高度放缩，并把 `anchor_value`（原图 x 坐标）落到 `anchor_cx`，底边 394。"""
    box = content_bbox(rgba)
    if box is None:
        raise RuntimeError("整帧都是透明的")
    crop = Image.fromarray(rgba).crop(box)
    scale = height / crop.height
    width = max(1, round(crop.width * scale))
    resized = crop.resize((width, height), Image.LANCZOS)
    tight = resized.getchannel("A").point(lambda v: 255 if v > ALPHA_CUTOFF else 0).getbbox()
    if tight is not None:
        left_cut = tight[0]
        resized = resized.crop(tight)
        width, height = resized.size
    else:
        left_cut = 0
    out = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
    # 原图坐标 → 画布坐标：先减包围盒左边界，再乘缩放，再减缩放后的裁边。
    x = round(anchor_cx - (anchor_value - box[0]) * scale + left_cut)
    x = min(max(0, x), FRAME_W - width)
    out.alpha_composite(resized, (x, BASELINE_BOTTOM - height))
    return out


def build_standup(frames_dir: Path, picks: list[int]) -> list[dict[str, int]]:
    """起身序列：抽指定帧 → 抠像 → 白点校正 → 单调高度归一化 → 8×160 横排 sheet。"""
    if len(picks) != STANDUP_FRAMES:
        raise ValueError(f"picks 必须是 {STANDUP_FRAMES} 帧")
    files = sorted(frames_dir.glob("*.png"))
    if len(files) <= max(picks):
        raise RuntimeError(f"{frames_dir} 只有 {len(files)} 帧，取不到第 {max(picks)} 帧")
    sit_ref = Image.open(OUT / "zhou_sit_right.png")
    keyed = [load_frame(files[index]) for index in picks]
    profiles = [frame_profile(frame) for frame in keyed]
    natural = [round(p["height"] * SIT_TARGET_H / profiles[0]["height"]) for p in profiles]
    targets = standup_targets(natural)

    # 水平对位：用「包围盒中心 + 躯干重心的中点」当锚点，整段共用同一个画布 x。
    # 只用包围盒中心会让腿收回时身体横向游走；只用躯干会在下蹲时把人拽回中间。
    def anchor_of(p: dict[str, float]) -> float:
        return 0.5 * (p["bbox_cx"] + p["torso_cx"])

    scale0 = targets[0] / profiles[0]["height"]
    anchor_canvas = BASELINE_CX + (anchor_of(profiles[0]) - profiles[0]["bbox_cx"]) * scale0

    sheet = Image.new("RGBA", (FRAME_W * STANDUP_FRAMES, FRAME_H), (0, 0, 0, 0))
    infos: list[dict[str, int]] = []
    for index, frame in enumerate(keyed):
        frame = apply_gain(frame, palette_gain(frame, sit_ref))
        placed = place_at(frame, round(targets[index]), anchor_canvas, anchor_of(profiles[index]))
        sheet.alpha_composite(placed, (index * FRAME_W, 0))
        info = dict(measure_image(placed))
        info["target"] = round(targets[index])
        info["natural"] = natural[index]
        info["head"] = round(profiles[index]["head_width"] * targets[index] / profiles[index]["height"])
        infos.append(info)

    OUT.mkdir(parents=True, exist_ok=True)
    sheet.save(OUT / "zhou_stand_up.webp", "WEBP", quality=92, method=6)
    (ROOT / "assets-src" / "character" / "ch01" / "standup-manifest.json").write_text(
        json.dumps(
            {
                "key": "img.char.ch01.zhou_stand_up",
                "file": "public/assets/img/character/ch01/zhou_stand_up.webp",
                "frameCount": STANDUP_FRAMES,
                "frameWidth": FRAME_W,
                "frameHeight": FRAME_H,
                "frameMs": 65,
                "displayScale": 1.0,
                "sourceJob": "smw5oze5w18c42f",
                "sourcePicks": picks,
                "baseline": {"bottom": BASELINE_BOTTOM, "cx": BASELINE_CX},
                "heights": [info["h"] for info in infos],
                "headWidths": [info["head"] for info in infos],
                "naturals": natural,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return infos


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in (
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/System/Library/Fonts/Supplemental/Songti.ttc",
    ):
        if Path(candidate).exists():
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
    return ImageFont.load_default()


def build_review() -> None:
    """验收图：坐姿 + 起身 8 帧并排，同一显示比例、逐帧标序号与实测数字。"""
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    sit = Image.open(OUT / "zhou_sit_right.png").convert("RGBA")
    sheet_path = OUT / "zhou_stand_up.webp"
    sheet = Image.open(sheet_path).convert("RGBA") if sheet_path.exists() else None

    # 只截人物会出现的那一段画布（y 110~400），13 张格子按同一比例铺开。
    view = (0, 110, FRAME_W, FRAME_H)
    zoom = 2.0
    cell_w = round((view[2] - view[0]) * zoom)
    cell_h = round((view[3] - view[1]) * zoom)
    label_h = 52
    cols, pad = 3, 18
    entries: list[tuple[str, Image.Image, dict[str, int | bool]]] = [
        ("坐地朝右 · 静帧", sit, measure(OUT / "zhou_sit_right.png"))
    ]
    if sheet is not None:
        for index in range(STANDUP_FRAMES):
            frame = sheet.crop((index * FRAME_W, 0, (index + 1) * FRAME_W, FRAME_H))
            entries.append((f"起身 f{index}", frame, measure(sheet_path, FRAME_W, index)))

    rows = (len(entries) + cols - 1) // cols
    header_h = 62
    width = pad + cols * (cell_w + pad)
    height = header_h + pad + rows * (cell_h + label_h + pad)
    board = Image.new("RGBA", (width, height), (22, 24, 30, 255))
    draw = ImageDraw.Draw(board)
    title_font = font(15)
    label = font(13)
    draw.text(
        (pad, 12),
        "周全 · 坐地朝右 + 起身序列（t28）",
        font=font(20),
        fill=(248, 248, 252, 255),
    )
    draw.text(
        (pad, 38),
        "单帧 160×400 · 8 帧 1280×400 · 65ms/帧 · displayScale 1.0 · 底边 394 基准（绿线）",
        font=label,
        fill=(150, 205, 255, 255),
    )

    for order, (name, image, info) in enumerate(entries):
        col = order % cols
        row = order // cols
        x = pad + col * (cell_w + pad)
        y = header_h + pad + row * (cell_h + label_h + pad)
        draw.text((x, y), name, font=title_font, fill=(244, 244, 248, 255))
        draw.text(
            (x, y + 19),
            f"h={info['h']}  bottom={info['bottom']}  cx={info['cx']}",
            font=label,
            fill=(140, 205, 255, 255),
        )
        top = y + label_h
        # 棋盘格底（看透明边界）
        checker = Image.new("RGBA", (cell_w, cell_h), (56, 60, 72, 255))
        cd = ImageDraw.Draw(checker)
        for cy in range(0, cell_h, 16):
            for cx in range(0, cell_w, 16):
                if (cx // 16 + cy // 16) % 2 == 0:
                    cd.rectangle((cx, cy, cx + 15, cy + 15), fill=(68, 74, 88, 255))
        crop = image.crop(view).resize((cell_w, cell_h), Image.LANCZOS)
        checker.alpha_composite(crop)
        board.alpha_composite(checker, (x, top))
        # 地面基准线（底边 394）：虚线，别和人物鞋底混成一条实线
        floor = top + round((BASELINE_BOTTOM - view[1]) * zoom)
        for dash in range(0, cell_w, 10):
            draw.line((x + dash, floor, x + min(dash + 5, cell_w), floor), fill=(120, 220, 150, 190))

    board.convert("RGB").save(REVIEW_DIR / "review-sheet.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sit", type=Path, help="坐地朝右源图（纯绿底）")
    parser.add_argument("--standup", type=Path, help="起身视频抽帧目录")
    parser.add_argument("--sheet", action="store_true", help="只重出验收图")
    parser.add_argument("--height", type=int, default=SIT_TARGET_H, help="坐姿目标高度")
    args = parser.parse_args()

    if args.sit:
        print("坐姿:", json.dumps(build_sit(args.sit, args.height), ensure_ascii=False))
    if args.standup:
        infos = build_standup(args.standup, STANDUP_PICKS)
        print("起身:", json.dumps(infos, ensure_ascii=False))
    if args.sheet or args.sit or args.standup:
        build_review()
        print("验收图:", REVIEW_DIR / "review-sheet.png")


if __name__ == "__main__":
    main()
