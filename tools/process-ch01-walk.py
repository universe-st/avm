#!/usr/bin/env python3
"""把 sprite 模块生成的行走帧拼成 4 方向 sheet。

输入：assets-src/character/ch01/walk/<front|back|left|right>/f00..f07.png（768×768 绿幕）
输出：
    public/assets/img/character/ch01/zhou_walk_down.png   512×96（8 帧 × 64）
    public/assets/img/character/ch01/zhou_walk_up.png
    public/assets/img/character/ch01/zhou_walk_left.png
    public/assets/img/character/ch01/zhou_walk_right.png
    assets-src/character/ch01/zhou_walk_preview.png

帧不做逐帧 bbox 裁切，保持角色在画面里的相对位置/脚步位移；只去绿、缩放到 64×96。
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets-src" / "character" / "ch01" / "walk"
OUT = ROOT / "public" / "assets" / "img" / "character" / "ch01"
PREVIEW = ROOT / "assets-src" / "character" / "ch01" / "zhou_walk_preview.png"
FRAME_W, FRAME_H = 64, 96
DIRECTIONS = {
    "down": "front",
    "up": "back",
    "left": "left",
    "right": "right",
}


def chroma_key(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            dominance = g - max(r, b)
            if g > 90 and dominance > 22:
                alpha = max(0, min(255, int(255 * (1 - dominance / 110))))
                if dominance > 70:
                    alpha = 0
                despilled = min(g, max(r, b) + 12)
                pixels[x, y] = (r, despilled, b, min(a, alpha))
    return image


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    preview = Image.new("RGBA", (4 * (FRAME_W * 8 + 18) + 10, 120), (18, 20, 28, 255))
    for row, (facing, source_dir) in enumerate(DIRECTIONS.items()):
        files = sorted((SRC / source_dir).glob("f*.png"))
        if not files:
            print(f"[ch01-walk] 缺少 {source_dir} 帧，跳过")
            continue
        frames: list[Image.Image] = []
        for path in files:
            frame = chroma_key(Image.open(path))
            frames.append(frame.resize((FRAME_W, FRAME_H), Image.Resampling.LANCZOS))

        # 统一按 8 帧的并集 bbox 缩放，保证走路时身高/体型与静态图一致，
        # 不会因为视频里人物占画面比例变小而「越走越瘦」。
        boxes = [
            frame.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
            for frame in frames
        ]
        valid = [box for box in boxes if box is not None]
        if not valid:
            print(f"[ch01-walk] {source_dir} 没有有效帧，跳过")
            continue
        left = min(box[0] for box in valid)
        top = min(box[1] for box in valid)
        right = max(box[2] for box in valid)
        bottom = max(box[3] for box in valid)
        crop_w = max(1, right - left)
        crop_h = max(1, bottom - top)
        scale = FRAME_H / crop_h
        target_w = max(1, round(crop_w * scale))

        # 用静态图的头/躯干覆盖行走帧上半身，避免视频抽帧把人物拉瘦；
        # 下半身保留真实脚步动作。
        static_path = OUT / f"zhou_{facing}.png"
        static_sprite = Image.open(static_path).convert("RGBA") if static_path.exists() else None
        torso_cut = 54

        sheet = Image.new("RGBA", (FRAME_W * len(files), FRAME_H), (0, 0, 0, 0))
        for index, frame in enumerate(frames):
            cropped = frame.crop((left, top, right, bottom))
            scaled = cropped.resize((target_w, FRAME_H), Image.Resampling.LANCZOS)
            if scaled.width > FRAME_W:
                x_offset = (scaled.width - FRAME_W) // 2
                scaled = scaled.crop((x_offset, 0, x_offset + FRAME_W, FRAME_H))
            frame_out = Image.new("RGBA", (FRAME_W, FRAME_H), (0, 0, 0, 0))
            frame_out.alpha_composite(scaled, ((FRAME_W - scaled.width) // 2, 0))
            if static_sprite is not None:
                frame_out.paste(static_sprite.crop((0, 0, FRAME_W, torso_cut)), (0, 0))
            x = index * FRAME_W
            sheet.alpha_composite(frame_out, (x, 0))
        target = OUT / f"zhou_walk_{facing}.png"
        sheet.save(target, optimize=True)
        print(f"[ch01-walk] {target.relative_to(ROOT)} {sheet.size} {target.stat().st_size} bytes")
        # 预览：每个方向取 3 帧
        for index in (0, len(files) // 2, len(files) - 1):
            frame = sheet.crop((index * FRAME_W, 0, (index + 1) * FRAME_W, FRAME_H))
            x = 10 + row * (FRAME_W * 8 + 18) + (index // max(1, len(files) // 2)) * 70
            preview.alpha_composite(frame, (x, 12))
    preview.save(PREVIEW, optimize=True)
    print(f"[ch01-walk] {PREVIEW.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
