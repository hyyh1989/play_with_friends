<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import GameResult from '../../components/GameResult.vue'
import { playSfx } from '../../core/audio'
import { useSettingsStore, AVATARS } from '../../stores/settings'
import type { PlayerRef } from '../../core/types'
import {
  applyAction,
  BOARD_SIZE,
  cellPosition,
  COLS,
  createInitialState,
  currentPlayer,
  getWinner,
  isFinished,
  LADDERS,
  ROWS,
  SLIDES,
  type SnakesAction,
  type SnakesState,
} from './rules'
import { chooseAiAction } from './ai'

/** 骰子转多久。太短看不清，太长孩子会去点别的 */
const DICE_MS = 700
/** 棋子每走一格用多久。这个节奏要跟得上数数的语速 */
const STEP_MS = 190
/** 爬梯子/滑滑梯前的停顿，让孩子意识到"发生了别的事" */
const SPECIAL_PAUSE_MS = 420
const SPECIAL_MS = 620
/** AI 掷骰子前的思考时间，否则它会快得像是没轮到孩子 */
const AI_THINK_MS = 800

const router = useRouter()
const settings = useSettingsStore()

const phase = ref<'setup' | 'playing'>('setup')
const playerCount = ref(2)
const state = shallowRef<SnakesState | null>(null)

/** 棋子在界面上的位置。和 state.positions 分开：规则一步到位，界面要一格一格走 */
const displayPos = ref<Record<string, number>>({})
const rolling = ref(false)
const diceFace = ref(1)
const animating = ref(false)

let timers: number[] = []
function later(fn: () => void, ms: number) {
  timers.push(window.setTimeout(fn, ms))
}
function clearTimers() {
  timers.forEach(clearTimeout)
  timers = []
}
onUnmounted(clearTimers)

const finished = computed(() => (state.value ? isFinished(state.value) : false))
const activeId = computed(() => (state.value ? currentPlayer(state.value) : null))
const activePlayer = computed(() =>
  state.value?.players.find((p) => p.id === activeId.value) ?? null,
)
const myTurn = computed(() => activePlayer.value?.kind === 'human' && !animating.value && !finished.value)

const cells = computed(() =>
  Array.from({ length: BOARD_SIZE }, (_, i) => {
    const square = i + 1
    return { square, ...cellPosition(square), ladder: LADDERS[square], slide: SLIDES[square] }
  }),
)

/** 梯子和滑梯画成线：孩子要在踩中之前就看见它们的存在 */
const links = computed(() => {
  const line = (from: number, to: number, kind: 'ladder' | 'slide') => {
    const a = cellPosition(from)
    const b = cellPosition(to)
    return { kind, x1: a.col + 0.5, y1: a.row + 0.5, x2: b.col + 0.5, y2: b.row + 0.5 }
  }
  return [
    ...Object.entries(LADDERS).map(([f, t]) => line(Number(f), t, 'ladder')),
    ...Object.entries(SLIDES).map(([f, t]) => line(Number(f), t, 'slide')),
  ]
})

/** 同一格上有多个棋子时错开一点，否则会完全叠住 */
function pieceStyle(playerId: string) {
  const square = displayPos.value[playerId] ?? 1
  const { row, col } = cellPosition(square)
  const sharing = Object.entries(displayPos.value)
    .filter(([, s]) => s === square)
    .map(([id]) => id)
  const index = Math.max(0, sharing.indexOf(playerId))
  const spread = sharing.length > 1 ? 14 : 0
  const offset = (index - (sharing.length - 1) / 2) * spread
  return {
    left: `${(col / COLS) * 100}%`,
    top: `${(row / ROWS) * 100}%`,
    width: `${100 / COLS}%`,
    height: `${100 / ROWS}%`,
    transform: `translateX(${offset}%)`,
  }
}

function start() {
  const others = AVATARS.filter((a) => a !== settings.avatar)
  const players: PlayerRef[] = [{ id: 'child', kind: 'human', avatar: settings.avatar }]
  for (let i = 1; i < playerCount.value; i++) {
    players.push({
      id: `ai${i}`,
      kind: 'ai',
      avatar: others[i - 1],
      nameKey: `ai.player${i}`,
    })
  }
  const next = createInitialState({ players, difficulty: settings.difficulty, seed: Date.now() })
  state.value = next
  displayPos.value = { ...next.positions }
  phase.value = 'playing'
  playSfx('tap')
}

function dispatch(action: SnakesAction) {
  const current = state.value
  if (!current) return
  const next = applyAction(current, action)
  if (next !== current) state.value = next
}

/** 掷骰子：骰子转 → 一格一格走（每格一声）→ 梯子/滑梯 → 换人 */
function handleRoll() {
  if (!myTurn.value) return
  dispatch({ type: 'roll' })
}

function runMoveAnimation(move: NonNullable<SnakesState['lastMove']>) {
  animating.value = true
  rolling.value = true

  // 骰子翻滚
  const spin = window.setInterval(() => {
    diceFace.value = 1 + Math.floor(Math.random() * 6)
  }, 80)
  timers.push(spin as unknown as number)
  playSfx('flip')

  later(() => {
    clearInterval(spin)
    rolling.value = false
    diceFace.value = move.roll

    // 一格一格走，每格一声，音调逐格升高 —— 顺带就是在数数
    const steps = move.landed - move.from
    for (let i = 1; i <= steps; i++) {
      later(() => {
        displayPos.value = { ...displayPos.value, [move.playerId]: move.from + i }
        playSfx('tap', 1 + i * 0.06)
      }, STEP_MS * i)
    }

    const afterSteps = STEP_MS * steps + 150
    if (move.kind === 'plain') {
      later(finishMove, afterSteps)
      return
    }

    // 爬梯子 / 滑滑梯：先停一下让孩子注意到，再移动
    later(() => {
      displayPos.value = { ...displayPos.value, [move.playerId]: move.final }
      playSfx(move.kind === 'ladder' ? 'success' : 'nope')
    }, afterSteps + SPECIAL_PAUSE_MS)
    later(finishMove, afterSteps + SPECIAL_PAUSE_MS + SPECIAL_MS)
  }, DICE_MS)
}

function finishMove() {
  animating.value = false
  dispatch({ type: 'endTurn' })
}

watch(
  state,
  (current) => {
    if (!current) return

    if (current.lastMove) {
      runMoveAnimation(current.lastMove)
      return
    }

    clearTimers()
    if (isFinished(current)) return

    const player = current.players.find((p) => p.id === currentPlayer(current))
    if (player?.kind !== 'ai') return
    later(() => {
      const action = chooseAiAction(current, player.id, settings.difficulty)
      if (action) dispatch(action)
    }, AI_THINK_MS)
  },
  { immediate: true },
)

function playAgain() {
  clearTimers()
  animating.value = false
  start()
}

function goHome() {
  router.push('/')
}

/** 骰子点数的九宫格排布 */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}
</script>

<template>
  <!-- 开局：选几个人一起玩 -->
  <div v-if="phase === 'setup'" class="setup safe-area">
    <div class="choices">
      <button
        v-for="count in [2, 3, 4]"
        :key="count"
        class="choice pressable"
        :class="{ active: playerCount === count }"
        :aria-label="$t(`snakes.players${count}`)"
        @click="playerCount = count"
      >
        <span class="mode-avatars">
          <span
            v-for="n in count"
            :key="n"
            class="mode-avatar"
          >{{ n === 1 ? settings.avatar : AVATARS.filter((a) => a !== settings.avatar)[n - 2] }}</span>
        </span>
      </button>
    </div>
    <button class="go pressable" @click="start">▶</button>
  </div>

  <!-- 对局 -->
  <div v-else class="game safe-area">
    <header class="hud">
      <button class="exit-btn pressable" :aria-label="$t('common.back')" @click="goHome">←</button>
      <div class="players">
        <div
          v-for="player in state?.players ?? []"
          :key="player.id"
          class="player"
          :class="{ active: player.id === activeId }"
        >
          <span class="avatar">{{ player.avatar }}</span>
        </div>
      </div>
    </header>

    <div class="board-wrap">
      <div class="board">
        <div
          v-for="cell in cells"
          :key="cell.square"
          class="cell"
          :class="{
            ladder: cell.ladder,
            slide: cell.slide,
            goal: cell.square === BOARD_SIZE,
          }"
          :style="{
            left: `${(cell.col / COLS) * 100}%`,
            top: `${(cell.row / ROWS) * 100}%`,
            width: `${100 / COLS}%`,
            height: `${100 / ROWS}%`,
          }"
        >
          <span class="num">{{ cell.square }}</span>
          <span v-if="cell.ladder" class="mark">🪜</span>
          <span v-else-if="cell.slide" class="mark">🛝</span>
          <span v-else-if="cell.square === BOARD_SIZE" class="mark">🏁</span>
        </div>

        <!-- 梯子和滑梯连线：让"为什么突然移动"在发生之前就能看见 -->
        <svg class="links" :viewBox="`0 0 ${COLS} ${ROWS}`" preserveAspectRatio="none">
          <line
            v-for="(link, i) in links"
            :key="i"
            :class="link.kind"
            :x1="link.x1"
            :y1="link.y1"
            :x2="link.x2"
            :y2="link.y2"
          />
        </svg>

        <div
          v-for="player in state?.players ?? []"
          :key="player.id"
          class="piece"
          :class="{ active: player.id === activeId }"
          :style="pieceStyle(player.id)"
        >
          <span class="piece-avatar">{{ player.avatar }}</span>
        </div>
      </div>
    </div>

    <footer class="dice-bar">
      <button
        class="dice pressable"
        :class="{ ready: myTurn, rolling }"
        :disabled="!myTurn"
        :aria-label="$t('snakes.roll')"
        @click="handleRoll"
      >
        <span class="pips">
          <span v-for="i in 9" :key="i" class="pip-slot">
            <span v-if="PIPS[diceFace].includes(i - 1)" class="pip" />
          </span>
        </span>
      </button>
      <!-- 轮到 AI 时把它的头像放在骰子旁边，孩子知道在等谁 -->
      <span v-if="!myTurn && !finished" class="waiting">{{ activePlayer?.avatar }}</span>
    </footer>

    <!-- 不传 scores：棋盘格号不是分数 -->
    <GameResult
      v-if="finished && state"
      :players="state.players"
      :winner-id="getWinner(state)"
      :solo="false"
      @again="playAgain"
      @home="goHome"
    />
  </div>
</template>

<style scoped>
.setup {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(16px, 4vmin, 40px);
  height: 100%;
}

.choices {
  display: flex;
  gap: clamp(12px, 3vmin, 28px);
}

.choice {
  display: grid;
  place-items: center;
  min-width: var(--tap-min);
  min-height: var(--tap-min);
  padding: clamp(12px, 2.4vmin, 22px);
  background: var(--bg-card);
  border: 4px solid transparent;
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.choice.active {
  border-color: var(--accent-2);
}

.mode-avatars {
  display: flex;
  gap: 6px;
}

.mode-avatar {
  font-size: clamp(24px, 4vmin, 38px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.go {
  display: grid;
  place-items: center;
  width: clamp(88px, 14vmin, 120px);
  height: clamp(88px, 14vmin, 120px);
  font-size: clamp(36px, 6vmin, 52px);
  color: #fff;
  background: var(--accent-2);
  border-radius: 50%;
  box-shadow: var(--shadow-lg);
}

.game {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.hud {
  display: flex;
  align-items: center;
  gap: 16px;
}

.exit-btn {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  font-size: 26px;
  background: var(--bg-card);
  border-radius: 50%;
  box-shadow: var(--shadow);
}

.players {
  display: flex;
  flex: 1;
  gap: clamp(10px, 3vmin, 32px);
  justify-content: center;
}

.player {
  padding: 6px 12px;
  border-radius: 18px;
  opacity: 0.35;
  transition: opacity 160ms, transform 160ms, background 160ms;
}

.player.active {
  background: var(--bg-card);
  opacity: 1;
  transform: scale(1.15);
  box-shadow: var(--shadow);
}

.avatar {
  font-size: clamp(26px, 4.4vmin, 40px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.board-wrap {
  display: grid;
  flex: 1;
  min-height: 0;
  place-items: center;
  padding: clamp(6px, 1.5vmin, 16px) 0;
}

.board {
  position: relative;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: 10 / 5;
  background: var(--bg-card);
  border-radius: clamp(10px, 2vmin, 20px);
  box-shadow: var(--shadow);
}

.cell {
  position: absolute;
  display: grid;
  place-items: center;
  border: 1px solid rgba(61, 44, 30, 0.08);
  border-radius: 6px;
}

.cell.ladder {
  background: rgba(6, 214, 160, 0.16);
}

.cell.slide {
  background: rgba(255, 159, 28, 0.18);
}

.cell.goal {
  background: rgba(255, 209, 102, 0.5);
}

.num {
  position: absolute;
  top: 2px;
  left: 5px;
  font-size: clamp(8px, 1.3vmin, 13px);
  color: var(--ink-soft);
  opacity: 0.6;
}

.mark {
  font-size: clamp(14px, 2.6vmin, 26px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.links {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.links line {
  stroke-width: 0.09;
  stroke-linecap: round;
  opacity: 0.55;
}

.links .ladder {
  stroke: var(--accent-2);
}

.links .slide {
  stroke: #ff9f1c;
  stroke-dasharray: 0.25 0.2;
}

.piece {
  position: absolute;
  display: grid;
  place-items: center;
  pointer-events: none;
  transition: left 180ms ease-out, top 180ms ease-out;
}

.piece-avatar {
  font-size: clamp(16px, 3.2vmin, 34px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  filter: drop-shadow(0 2px 2px rgba(61, 44, 30, 0.35));
}

.piece.active .piece-avatar {
  animation: hop 800ms ease-in-out infinite;
}

.dice-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding-top: clamp(4px, 1vmin, 12px);
}

.dice {
  display: grid;
  place-items: center;
  width: clamp(72px, 11vmin, 104px);
  height: clamp(72px, 11vmin, 104px);
  background: var(--bg-card);
  border: 4px solid transparent;
  border-radius: 22px;
  box-shadow: var(--shadow-lg);
  opacity: 0.5;
}

/* 轮到孩子时骰子会呼吸，这是"该你了"的第三个信号（另两个是头像放大和棋子跳动） */
.dice.ready {
  border-color: var(--accent-2);
  opacity: 1;
  animation: breathe 1.4s ease-in-out infinite;
}

.dice.rolling {
  animation: shake 180ms linear infinite;
}

.pips {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12%;
  width: 62%;
  aspect-ratio: 1;
}

.pip-slot {
  display: grid;
  place-items: center;
}

.pip {
  width: 100%;
  aspect-ratio: 1;
  background: var(--ink);
  border-radius: 50%;
}

.waiting {
  font-size: clamp(26px, 4.4vmin, 40px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  animation: hop 800ms ease-in-out infinite;
}

@keyframes hop {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.07);
  }
}

@keyframes shake {
  0% {
    transform: rotate(-6deg);
  }
  50% {
    transform: rotate(6deg);
  }
  100% {
    transform: rotate(-6deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dice.ready,
  .dice.rolling,
  .piece.active .piece-avatar,
  .waiting {
    animation: none;
  }
  .piece {
    transition: none;
  }
}
</style>
