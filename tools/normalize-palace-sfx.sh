#!/usr/bin/env bash
# 把 sfx 模块产出的 take 处理成游戏内音效：
#   截到设定时长 → 统一响度（-16 LUFS / TP -1.5）→ mp3 24kHz
#   注：不要用 silenceremove——大殿环境音本来就在 -45dB 以下，会把整段削成空文件。
# 用法：tools/normalize-palace-sfx.sh
set -euo pipefail

SRC="$HOME/.dsh/game-material-master/sfx-jobs"
DST="public/assets/audio/sfx"
mkdir -p "$DST"

# 目标名|take 路径|时长(秒)
ITEMS=(
  "palace_hall_ambience|fmvvk8zxzcf6c72/takes/kmvvkawuofe9ada.mp3|8.0"
  "palace_step_stone|fmvvk8zye7865b2/takes/kmvvkawyd4f4c47.mp3|0.55"
  "palace_kneel_thud|fmvvk9k19b3432c/takes/kmvvkbh2c66fec4.mp3|1.00"
  "palace_crack_metal|fmvvk9k1h7c7400/takes/kmvvkbgxm95fdc6.mp3|1.40"
  "palace_servo_whir|fmvvka4pxc06e84/takes/kmvvkbyo7d59ce3.mp3|1.50"
  "palace_stamp_hit|fmvvka4q45111cf/takes/kmvvkbyga95aa5d.mp3|0.80"
  "palace_led_power|fmvvkf75ab054b2/takes/kmvvkholk95c417.mp3|0.80"
  "palace_rumble_hall|fmvvkf75j49b31a/takes/kmvvkhviv5e44ab.mp3|2.50"
  "palace_whoosh_heavy|fmvvkfsrq18a6e6/takes/kmvvki95nf12df7.mp3|1.60"
  "palace_heartbeat|fmvvkfsry06233d/takes/kmvvkibav3deca9.mp3|3.00"
  "palace_knock_head|fmvvkgdsv4cb8db/takes/kmvvkiylx98ea57.mp3|1.20"
  "palace_cloth_rustle|fmvvkgdt5fb68bd/takes/kmvvkiya836b09e.mp3|0.70"
  "palace_blade_spin|fmvvkgyfse6a6ee/takes/kmvvkjh1xafe6a4.mp3|1.50"
  "palace_gasp|fmvvkgyg01f3633/takes/kmvvkjgh58bfaad.mp3|0.90"
)

for item in "${ITEMS[@]}"; do
  IFS='|' read -r name rel dur <<< "$item"
  in="$SRC/$rel"
  out="$DST/$name.mp3"
  if [[ ! -f "$in" ]]; then
    echo "MISS $in"
    continue
  fi
  ffmpeg -hide_banner -loglevel error -y -i "$in" \
    -af "atrim=0:${dur},asetpts=N/SR/TB,loudnorm=I=-16:TP=-1.5:LRA=11" \
    -ar 24000 -ac 1 -b:a 96k "$out"
  size=$(stat -f%z "$out")
  actual=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out")
  printf '%-24s %5.2fs %6d B\n' "$name" "$actual" "$size"
done
