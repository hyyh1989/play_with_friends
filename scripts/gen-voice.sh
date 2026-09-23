#!/usr/bin/env bash
# 生成中文语音文件（macOS 内置 TTS，不联网、不花钱）。
#
#   ./scripts/gen-voice.sh
#
# 产物进 public/audio/voice/zh-CN/，直接提交进仓库 —— 运行时不做 TTS，
# 因为要零延迟、离线可用、音色可控（见 docs/DESIGN.md 4.4）。
#
# 换音色：VOICE=Flo ./scripts/gen-voice.sh
# 这台 Mac 上默认只装了 Tingting，其他中文嗓音要先在
# 「系统设置 → 辅助功能 → 朗读内容 → 系统嗓音」里下载。
set -euo pipefail
cd "$(dirname "$0")/.."

VOICE="${VOICE:-Tingting}"
OUT="public/audio/voice/zh-CN"
mkdir -p "$OUT"

# 探测句要足够长：太短的话时长不足一秒，会被下面的判断误杀
say -v "$VOICE" -o /tmp/_probe.aiff "这是一句用来测试发声是否正常的话" 2>/dev/null
DUR=$(afinfo /tmp/_probe.aiff | awk '/estimated duration/{print ($3 > 0.5) ? 1 : 0}')
if [ "${DUR:-0}" -ne 1 ]; then
  echo "⚠️  嗓音 $VOICE 没有实际发声（可能没下载）。先去系统设置里下载，或换一个。"
  exit 1
fi

gen() {
  local key="$1" text="$2"
  say -v "$VOICE" -o "/tmp/_v.aiff" "$text"
  # 单声道 22.05kHz：语音够用，文件比原始小四倍
  afconvert -f WAVE -d LEI16@22050 -c 1 "/tmp/_v.aiff" "$OUT/$key.wav"
  printf '  %-22s %6s  %s\n' "$key.wav" "$(du -h "$OUT/$key.wav" | cut -f1)" "$text"
}

echo "嗓音：$VOICE"
echo "首页："
gen "game.memory"   "翻牌配对"
gen "game.snakes"   "蛇梯棋"
gen "game.uno"      "优诺牌"

echo "教学 · 开场："
gen "uno.ask"       "要我教你玩吗？"
gen "uno.yourTurn"  "轮到你啦。"

echo "教学 · 出牌规则："
gen "uno.match.red"    "这张也是红色的，和中间的一样，点它就可以出。"
gen "uno.match.yellow" "这张也是黄色的，和中间的一样，点它就可以出。"
gen "uno.match.green"  "这张也是绿色的，和中间的一样，点它就可以出。"
gen "uno.match.blue"   "这张也是蓝色的，和中间的一样，点它就可以出。"
gen "uno.matchNumber"  "看，数字一样，颜色不一样也可以出哦。"

echo "教学 · 摸牌："
gen "uno.mustDraw"     "都出不了？那就从这里摸一张。"

echo "教学 · 功能牌："
gen "uno.wildColor"    "这张牌可以变成任何颜色。你想要哪个颜色？"
gen "uno.skip"         "出了这张，下一个人就轮空啦。"
gen "uno.reverse"      "方向反过来了。"
gen "uno.draw2"        "下一个人要摸两张牌。"

echo "教学 · 鼓励："
gen "uno.tryThis"      "点这张试试看。"
gen "uno.wellDone"     "真棒！"
gen "uno.uno"          "只剩一张啦，优诺！"

echo
echo "共 $(ls "$OUT" | wc -l | tr -d ' ') 个文件，$(du -sh "$OUT" | cut -f1)"
