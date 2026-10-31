#!/usr/bin/env python3
"""从「游戏素材大师」sprite 项目的行走视频重新抽 20 帧，生成游戏用行走 sheet。

**不再做帧间插值**：8 帧之所以「鬼畜」，是因为原来按 4.5 秒等分抽 8 帧，
每帧间隔 0.65s，而步态周期只有 ~1.2s —— 相位每帧跳半个周期，左右腿对不上。
这里改成：在视频里找**一个真正闭合的步态周期**，均匀抽 20 帧，循环就顺了。

输入：`~/.dsh/game-material-master/projects/pmvnrpn64691ee5/videos/<dir>.mp4`
      （1408×1408 / 24fps / ~5.2s，每个方向一段）
输出：`public/assets/img/character/ch01/q/zhou_q_walk_<suffix>.webp`（3200×400，20 帧）
      `assets-src/character/ch01/q/walk20-preview.png`

抠像分两种（按四角背景色自动判断）：
- 绿幕：按与背景色的距离做软 alpha（参数按项目 keyed 帧反推），并压制绿色溢出；
- 纯白底（back 视频后半段绿幕掉了）：从角落 flood fill 圈出背景，
  角色内部的白衣服是不连通区域，不会被抠穿。

用法：`python3 tools/make-ch01-q-walk20.py`
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "assets" / "img" / "character" / "ch01" / "q"
PREVIEW = ROOT / "assets-src" / "character" / "ch01" / "q" / "walk20-preview.png"
DEFAULT_PROJECT = Path.home() / ".dsh" / "game-material-master" / "projects" / "pmvnrpn64691ee5"

FRAME_W, FRAME_H = 160, 400
FRAME_COUNT = 20
WORK_SIZE = 768
THUMB = (64, 160)
ALPHA_CUTOFF = 60
# 绿幕边上常有压缩噪点，bbox 前先无视画面最外圈这几个像素。
EDGE_IGNORE = 4
LAG_RANGE = range(22, 35)
# 绿度键阈值：greenness 低于 LOW 完全不透明，高于 HIGH 完全透明。
GREEN_LOW = 70.0
GREEN_HIGH = 190.0

DIRECTIONS = {
    "front": "down",
    "back": "up",
    "left": "left",
    "right": "right",
    "downLeft": "down_left",
    "downRight": "down_right",
    "upLeft": "up_left",
    "upRight": "up_right",
}


def load_rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)


def key_out(rgb: np.ndarray) -> np.ndarray:
    """把一帧抠成 RGBA。绿幕按「绿度」抠、其它纯色（白底）走 flood fill。

    绿幕不能用 RGB 距离：视频里角色背光的那半边会带着绿幕反光，
    与 #00FF00 的欧氏距离很小，距离键会把半个身子判成半透明（实机就是「角色少一半」）。
    `greenness = g - max(r, b)` 只看「绿了多少」，不受亮度影响，
    角色暗部照样只有 -80 ~ +60，而背景稳定在 210 以上。
    """
    rgb = rgb.copy()
    corners = np.concatenate(
        [
            rgb[:6, :6].reshape(-1, 3),
            rgb[:6, -6:].reshape(-1, 3),
            rgb[-6:, :6].reshape(-1, 3),
            rgb[-6:, -6:].reshape(-1, 3),
        ]
    )
    bg = np.median(corners, axis=0)
    is_green = bool(bg[1] - max(bg[0], bg[2]) > 40)

    if is_green:
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        greenness = g - np.maximum(r, b)
        alpha = np.clip((GREEN_HIGH - greenness) / (GREEN_HIGH - GREEN_LOW) * 255.0, 0, 255)
        spill = np.clip(g - np.maximum(r, b), 0, None)
        rgb[..., 1] = np.clip(g - spill * 0.9, 0, 255)
        return np.dstack([rgb, alpha]).astype(np.uint8)

    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=-1))
    # 非绿幕：从角落 flood fill（PIL 的 C 实现，比 numpy BFS 快得多）。
    tmp = Image.fromarray(rgb.astype(np.uint8)).copy()
    ImageDraw.floodfill(tmp, (1, 1), (255, 0, 255), thresh=26)
    filled = np.asarray(tmp).astype(int)
    bgmask = (filled[..., 0] > 250) & (filled[..., 1] < 6) & (filled[..., 2] > 250)
    alpha = np.where(bgmask, 0.0, 255.0)
    fringe = (~bgmask) & (dist < 34)
    alpha[fringe] = np.clip((dist[fringe] - 26.0) / 8.0 * 255.0, 0, 255)
    return np.dstack([rgb, alpha]).astype(np.uint8)


def content_bbox(rgba: np.ndarray) -> tuple[int, int, int, int] | None:
    """角色主体的矩形。画面最外圈一律作废——绿幕边缘总有压不干净的噪点。"""
    alpha = rgba[..., 3].copy()
    edge = EDGE_IGNORE
    alpha[:edge, :] = 0
    alpha[-edge:, :] = 0
    alpha[:, :edge] = 0
    alpha[:, -edge:] = 0
    ys, xs = np.where(alpha > ALPHA_CUTOFF)
    if len(ys) < 100:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def is_clipped(rgba: np.ndarray, margin: int = 2) -> bool:
    """角色是否被画面边缘切掉了：左右边走里出现明显不透明像素就说明人已经走出画面。

    left/right 这两段视频里人物是**真的往画面外走**的，越往后越靠边；
    拿那些帧做行走图，实机上就是「角色少一半」。
    """
    alpha = rgba[..., 3]
    return bool(
        (alpha[:, :margin] > ALPHA_CUTOFF).any()
        or (alpha[:, -margin:] > ALPHA_CUTOFF).any()
    )


def thumb_of(rgba: np.ndarray) -> np.ndarray | None:
    """按角色 bbox 归一化成统一尺寸的灰度小图，用于比较步态相位（消除位移影响）。"""
    box = content_bbox(rgba)
    if box is None:
        return None
    crop = Image.fromarray(rgba).crop(box)
    return np.asarray(crop.resize(THUMB, Image.LANCZOS).convert("L"), dtype=np.float32)


def find_cycle(
    thumbs: list[np.ndarray | None],
    usable: list[bool],
) -> tuple[int, int, float]:
    """找一个首尾最像、且**全窗口都完整**的步态周期：返回 (起点 s, 周期帧数 L, 闭合误差)。"""
    best: tuple[float, int, int] | None = None
    for lag in LAG_RANGE:
        for start in range(0, len(thumbs) - lag):
            if not all(usable[start : start + lag + 1]):
                continue
            a, b = thumbs[start], thumbs[start + lag]
            if a is None or b is None:
                continue
            score = float(np.abs(a - b).mean())
            if best is None or score < best[0]:
                best = (score, start, lag)
    if best is None:
        # 整段都有被切边的帧：退化为全区间搜索（至少还能出图）。
        print("[walk20] 警告：找不到完整窗口，退回全区间")
        for lag in LAG_RANGE:
            for start in range(0, len(thumbs) - lag):
                a, b = thumbs[start], thumbs[start + lag]
                if a is None or b is None:
                    continue
                score = float(np.abs(a - b).mean())
                if best is None or score < best[0]:
                    best = (score, start, lag)
    if best is None:
        return 0, max(1, len(thumbs) // 3), float("nan")
    return best[1], best[2], best[0]


def extract_video_frames(video: Path, workdir: Path) -> list[Path]:
    out = workdir / "src"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(video),
            "-vf",
            f"scale={WORK_SIZE}:{WORK_SIZE}",
            str(out / "f%03d.png"),
        ],
        check=True,
    )
    return sorted(out.glob("f*.png"))


def static_target(suffix: str) -> tuple[int, int, int]:
    """静态图的角色高度 / 底边 / 水平中心，用作行走帧的对齐基准。"""
    static = Image.open(OUT / f"zhou_q_{suffix}.png").convert("RGBA")
    box = static.getchannel("A").point(lambda v: 255 if v > ALPHA_CUTOFF else 0).getbbox()
    if box is None:
        raise RuntimeError(f"静态图 zhou_q_{suffix}.png 全透明")
    return box[3] - box[1], box[3], (box[0] + box[2]) // 2


def build_direction(project: Path, source_dir: str, suffix: str, tmp_root: Path) -> tuple[int, int, float]:
    video = project / "videos" / f"{source_dir}.mp4"
    if not video.exists():
        raise FileNotFoundError(video)

    frames = extract_video_frames(video, tmp_root / source_dir)
    rgba_frames = [key_out(load_rgb(path)) for path in frames]
    thumbs = [thumb_of(frame) for frame in rgba_frames]
    usable = [thumb is not None and not is_clipped(frame)
              for thumb, frame in zip(thumbs, rgba_frames)]

    start, lag, closes = find_cycle(thumbs, usable)
    indices = [start + round(i * lag / FRAME_COUNT) for i in range(FRAME_COUNT)]
    indices = [min(index, len(rgba_frames) - 1) for index in indices]

    chosen = [rgba_frames[index] for index in indices]
    boxes = [box for box in (content_bbox(frame) for frame in chosen) if box is not None]
    if not boxes:
        raise RuntimeError(f"{source_dir}: 20 帧里都没有可辨识的角色")
    left = min(b[0] for b in boxes)
    top = min(b[1] for b in boxes)
    right = max(b[2] for b in boxes)
    bottom = max(b[3] for b in boxes)

    target_h, target_bottom, target_cx = static_target(suffix)
    crop_w = max(1, right - left)
    crop_h = max(1, bottom - top)
    scale = target_h / crop_h
    target_w = max(1, round(crop_w * scale))
    if target_w > FRAME_W:
        # 不该发生；真发生就把整帧等比缩到框内，绝不能横向裁掉半个身子。
        ratio = FRAME_W / target_w
        target_w = FRAME_W
        target_h = round(target_h * ratio)
    draw_x = min(max(0, round(target_cx - target_w / 2)), FRAME_W - target_w)
    draw_y = target_bottom - target_h

    sheet = Image.new("RGBA", (FRAME_W * FRAME_COUNT, FRAME_H), (0, 0, 0, 0))
    for slot, frame in enumerate(chosen):
        cropped = Image.fromarray(frame).crop((left, top, right, bottom))
        scaled = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)
        cell = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
        cell.alpha_composite(scaled, (draw_x, draw_y))
        sheet.alpha_composite(cell, (slot * FRAME_W, 0))

    target = OUT / f"zhou_q_walk_{suffix}.webp"
    sheet.save(target, "WEBP", quality=92, method=6)
    legacy = OUT / f"zhou_q_walk_{suffix}.png"
    if legacy.exists():
        legacy.unlink()
    print(
        f"[walk20] {suffix:10s} 周期 {lag} 帧 / 闭合 {closes:.2f}（起点 {start}）"
        f" 帧宽 {target_w}px @x{draw_x} → {target.name} {target.stat().st_size // 1024}KB"
    )
    return start, lag, closes


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", type=Path, default=DEFAULT_PROJECT)
    args = parser.parse_args()
    project = args.project.expanduser()
    if not (project / "videos").exists():
        raise SystemExit(f"找不到 sprite 项目视频目录：{project / 'videos'}")

    OUT.mkdir(parents=True, exist_ok=True)
    preview_cells: list[Image.Image] = []
    report: dict[str, tuple[int, int, float]] = {}

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for source_dir, suffix in DIRECTIONS.items():
            report[suffix] = build_direction(project, source_dir, suffix, root)
            sheet = Image.open(OUT / f"zhou_q_walk_{suffix}.webp").convert("RGBA")
            preview_cells.extend(
                sheet.crop((i * FRAME_W, 0, (i + 1) * FRAME_W, FRAME_H))
                for i in (0, FRAME_COUNT // 4, FRAME_COUNT // 2, (FRAME_COUNT * 3) // 4)
            )

    if preview_cells:
        preview = Image.new("RGBA", (FRAME_W * len(preview_cells), FRAME_H), (18, 20, 28, 255))
        for index, cell in enumerate(preview_cells):
            preview.alpha_composite(cell, (index * FRAME_W, 0))
        preview.save(PREVIEW, optimize=True)
        print(f"[walk20] {PREVIEW.relative_to(ROOT)} {preview.size[0]}×{preview.size[1]}")

    print("[walk20] 周期汇总（帧数 / 闭合误差 / 起点）：")
    for suffix, (start, lag, closes) in report.items():
        print(f"  {suffix:10s} L={lag:2d}  closes={closes:5.2f}  s={start}")


if __name__ == "__main__":
    main()
