#!/usr/bin/env python3
"""把改名演出的 screencast 帧拼成 GIF（只读 .evidence/，不产物入库）。

用法：python3 tools/name-rename-gif.py [帧目录]
帧目录默认 .evidence/docs/screenshots/2026-11-27-name-rename/frames，
按 report.json 里的 triggerAt 取窗口 [trigger-300ms, trigger+1300ms]，
裁成「对话面板左上角名字 + 上下文」的横条，再拼 GIF（按真实帧间隔）。
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DIR = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / '.evidence/docs/screenshots/2026-11-27-name-rename/frames'
REPORT = DIR / 'report.json'
OUT = DIR.parent / 'name-rename.gif'

# 名字所在横条（390×844 竖屏；裁切范围按实机截图标定，见 2026-11-27 取证）
CROP = (0, 682, 214, 714)


def main() -> None:
    report = json.loads(REPORT.read_text())
    trigger = report['triggerAt']
    frames = [f for f in report['frames'] if trigger - 300 <= f['at'] <= trigger + 1400]
    if not frames:
        raise SystemExit('窗口里没有帧')

    images = []
    durations = []
    for i, frame in enumerate(frames):
        with Image.open(frame['file']) as im:
            crop = im.convert('RGB').crop(CROP)
            # 放大 2 倍并标注时间（相对触发），一眼能看出节奏
            crop = crop.resize((crop.width * 2, crop.height * 2), Image.NEAREST)
            draw = ImageDraw.Draw(crop)
            draw.text((4, 2), f"+{frame['at'] - trigger}ms", fill=(255, 120, 120))
            images.append(crop)
        if i + 1 < len(frames):
            durations.append(max(30, min(200, frames[i + 1]['at'] - frame['at'])))
        else:
            durations.append(400)

    images[0].save(
        OUT,
        save_all=True,
        append_images=images[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )
    print(f'OK: {OUT} ({len(images)} 帧, {OUT.stat().st_size / 1024:.0f} KB)')


if __name__ == '__main__':
    main()
