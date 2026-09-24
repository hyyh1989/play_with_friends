#!/usr/bin/env bash
# 生成语音文件（macOS 内置 TTS，不联网、不花钱）。
#
#   ./scripts/gen-voice.sh              # 全部语言
#   ./scripts/gen-voice.sh zh-CN        # 只生成某一种
#
# 产物进 public/audio/voice/<locale>/，直接提交进仓库 —— 运行时不做 TTS，
# 因为要零延迟、离线可用、音色可控（见 docs/DESIGN.md 4.4）。
#
# 缺哪个语言的文件，界面会静默跳过（不会崩），所以可以只做一部分。
#
# 换音色：VOICE_ZH=Flo ./scripts/gen-voice.sh zh-CN
# 这台机器上装了哪些嗓音用 `say -v '?'` 看；列出来不代表能用 ——
# 没下载的嗓音会生成 0 秒的空文件，脚本会检查并跳过。
set -euo pipefail
cd "$(dirname "$0")/.."

VOICE_ZH="${VOICE_ZH:-Tingting}"
VOICE_EN="${VOICE_EN:-Samantha}"
VOICE_KO="${VOICE_KO:-Yuna}"

check_voice() {
  local v="$1"
  say -v "$v" -o /tmp/_probe.aiff "This is a probe sentence long enough to measure" 2>/dev/null || return 1
  local ok
  ok=$(afinfo /tmp/_probe.aiff | awk '/estimated duration/{print ($3 > 0.5) ? 1 : 0}')
  [ "${ok:-0}" -eq 1 ]
}

gen() {
  local voice="$1" out="$2" key="$3" text="$4"
  [ -n "$text" ] || return 0
  say -v "$voice" -o "/tmp/_v.aiff" "$text"
  # 单声道 22.05kHz：语音够用，文件比原始小四倍
  afconvert -f WAVE -d LEI16@22050 -c 1 "/tmp/_v.aiff" "$out/$key.wav"
  printf '  %-18s %6s  %s\n' "$key" "$(du -h "$out/$key.wav" | cut -f1)" "$text"
}

# key|中文|English|한국어
#
# ⚠️ 英文和韩文是 AI 写的，**没有母语者校对过** —— 尤其是"对 5 岁孩子说话"的语气。
# 觉得别扭就改这里的文本重跑，不用动代码。
LINES='
game.memory|翻牌配对|Memory Match|카드 짝 맞추기
game.snakes|蛇梯棋|Snakes and Ladders|뱀과 사다리
game.uno|优诺牌|Uno|우노
c4.goal|连成四个就赢啦。横的、竖的、斜的，都算。|Line up four and you win. Across, up and down, or slanted — they all count.|네 개를 나란히 놓으면 이겨. 가로, 세로, 대각선 다 괜찮아.
uno.ask|要我教你玩吗？|Shall I show you how to play?|내가 방법을 알려 줄까?
uno.yourTurn|轮到你啦。|It is your turn.|이제 네 차례야.
uno.intro.goal|我们轮流出牌，看谁先把手里的牌出完。出掉的牌，就放在中间这里。|We take turns playing cards. Whoever runs out first wins. The cards you play go here in the middle.|우리는 번갈아 가면서 카드를 내. 먼저 다 낸 사람이 이겨. 낸 카드는 여기 가운데에 놓여.
uno.placed|你出的牌放到这里了。接下来就要跟着它出。|Your card is here now. The next card has to match this one.|네 카드가 여기 놓였어. 이제 이 카드에 맞춰서 내면 돼.
uno.colorChanged|看，现在最上面是这张牌了，所以能出的颜色也变了。|Look, this card is on top now, so the colour you can play has changed too.|봐, 이제 이 카드가 맨 위야. 그래서 낼 수 있는 색도 바뀌었어.
uno.match.red|这张也是红色的，和中间的一样，点它就可以出。|This one is red too, just like the middle card. Tap it to play it.|이 카드도 빨간색이야. 가운데 카드랑 같아. 눌러서 내 보자.
uno.match.yellow|这张也是黄色的，和中间的一样，点它就可以出。|This one is yellow too, just like the middle card. Tap it to play it.|이 카드도 노란색이야. 가운데 카드랑 같아. 눌러서 내 보자.
uno.match.green|这张也是绿色的，和中间的一样，点它就可以出。|This one is green too, just like the middle card. Tap it to play it.|이 카드도 초록색이야. 가운데 카드랑 같아. 눌러서 내 보자.
uno.match.blue|这张也是蓝色的，和中间的一样，点它就可以出。|This one is blue too, just like the middle card. Tap it to play it.|이 카드도 파란색이야. 가운데 카드랑 같아. 눌러서 내 보자.
uno.matchNumber|看，数字一样，颜色不一样也可以出。出了之后，颜色就变成这张的颜色啦。|Look, the number is the same. You can play it even if the colour is different. After that, the colour changes to this card.|봐, 숫자가 같지? 색이 달라도 낼 수 있어. 내고 나면 색이 이 카드 색으로 바뀌어.
uno.mustDraw|都出不了？那就从这里摸一张。|Nothing you can play? Then take one card from here.|낼 카드가 없어? 그럼 여기서 한 장 가져와.
uno.wild|这是万能牌。你随时可以出这张牌，出牌之后，由你来指定它变成什么颜色。|This is a wild card. You can play it at any time, and then you choose what colour it becomes.|이건 만능 카드야. 언제든지 낼 수 있고, 무슨 색이 될지 네가 정해.
uno.wild4|这是万能加四。你随时可以出这张牌，出牌之后由你指定颜色，而且下一个人要摸四张牌，并且不能出牌。|This is a wild draw four. You can play it any time and choose the colour, and the next player takes four cards and cannot play.|이건 만능 플러스 포야. 언제든지 낼 수 있고 색도 네가 정해. 그리고 다음 사람은 네 장 가져가고 카드를 못 내.
uno.skip|这是轮空牌。下一个人不能出牌了，他少了一次出牌的机会。|This is a skip card. The next player cannot play. They lose their turn.|이건 건너뛰기 카드야. 다음 사람은 카드를 못 내. 한 번 쉬는 거야.
uno.reverse|出牌的顺序换方向了，现在反着轮。|The order has turned around. Now we go the other way.|순서가 반대로 바뀌었어. 이제 거꾸로 돌아가.
uno.reverse2|顺序换了方向。只有两个人的时候，对手就轮空，所以可以再出一张。|The order turns around. With only two players, the other one is skipped, so you can play again.|순서가 바뀌었어. 두 명일 때는 상대가 건너뛰니까 한 번 더 낼 수 있어.
uno.draw2|下一个人要摸两张牌，而且这一轮不能出牌。|The next player takes two cards, and cannot play this turn.|다음 사람은 두 장 가져가고, 이번에는 카드를 못 내.
uno.tryThis|点这张试试看。|Try tapping this one.|이걸 한번 눌러 볼까?
uno.wellDone|真棒！|Well done!|잘했어!
uno.win|牌都出完啦，你赢了！|All your cards are gone. You win!|카드를 다 냈어. 네가 이겼어!
uno.opponentCount|这里能看到，对手还剩几张牌。|Here you can see how many cards your friend has left.|여기서 친구한테 카드가 몇 장 남았는지 볼 수 있어.
uno.opponentDrew|它也没有能出的牌，也摸了一张。你看，它的牌变多了。|It could not play anything either, so it took a card. Look, it has more cards now.|쟤도 낼 카드가 없어서 한 장 가져갔어. 봐, 카드가 늘었지?
'

run_locale() {
  local locale="$1" voice="$2" col="$3"
  echo
  echo "── $locale （嗓音 $voice）──"
  if ! check_voice "$voice"; then
    echo "  ⚠️  嗓音 $voice 没有实际发声（多半是没下载）。"
    echo "     去「系统设置 → 辅助功能 → 朗读内容 → 系统嗓音」下载，或换一个。"
    echo "     跳过 $locale —— 缺语音文件界面会静默跳过，不影响游戏。"
    return 0
  fi
  local out="public/audio/voice/$locale"
  mkdir -p "$out"
  local key zh en ko text
  while IFS='|' read -r key zh en ko; do
    [ -n "$key" ] || continue
    case "$col" in
      zh) text="$zh" ;;
      en) text="$en" ;;
      ko) text="$ko" ;;
    esac
    gen "$voice" "$out" "$key" "$text"
  done <<< "$LINES"
  echo "  → $(ls "$out" | wc -l | tr -d ' ') 个文件，$(du -sh "$out" | cut -f1)"
}

case "${1:-all}" in
  zh-CN) run_locale "zh-CN" "$VOICE_ZH" zh ;;
  en)    run_locale "en"    "$VOICE_EN" en ;;
  ko)    run_locale "ko"    "$VOICE_KO" ko ;;
  all)
    run_locale "zh-CN" "$VOICE_ZH" zh
    run_locale "en"    "$VOICE_EN" en
    run_locale "ko"    "$VOICE_KO" ko
    ;;
  *) echo "用法：$0 [zh-CN|en|ko|all]"; exit 1 ;;
esac
