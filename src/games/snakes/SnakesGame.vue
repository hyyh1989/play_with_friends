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

/** 骰子翻滚多久 */
const DICE_MS = 900
/** 棋子每走一格用多久，要跟得上数数的语速 */
const STEP_MS = 200
/** 落格后原地转一圈的时间 */
const LAND_MS = 420
/** 爬梯子/滑滑梯前的停顿，让孩子意识到"发生了别的事" */
const SPECIAL_PAUSE_MS = 450
const SPECIAL_MS = 700
const AI_THINK_MS = 800
/** 有人到终点后先在棋盘上庆祝多久再弹结算页 —— 太快会让人没看清谁赢了 */
const WIN_CELEBRATE_MS = 2400

const router = useRouter()
const settings = useSettingsStore()

const phase = ref<'setup' | 'playing'>('setup')
const playerCount = ref(2)
const state = shallowRef<SnakesState | null>(null)

const displayPos = ref<Record<string, number>>({})
const rolling = ref(false)
const diceFace = ref(1)
const diceSpin = ref({ x: 0, y: 0 })
const animating = ref(false)
const landingId = ref<string | null>(null)
const celebrating = ref(false)
const showResult = ref(false)

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
const activePlayer = computed(
  () => state.value?.players.find((p) => p.id === activeId.value) ?? null,
)
const myTurn = computed(
  () => activePlayer.value?.kind === 'human' && !animating.value && !finished.value,
)
const winnerId = computed(() => (state.value ? getWinner(state.value) : null))

const cells = computed(() =>
  Array.from({ length: BOARD_SIZE }, (_, i) => {
    const square = i + 1
    return { square, ...cellPosition(square), ladder: LADDERS[square], slide: SLIDES[square] }
  }),
)

const center = (square: number) => {
  const { row, col } = cellPosition(square)
  return { x: col + 0.5, y: row + 0.5 }
}

/**
 * 每行走到头要折回上一行，这是蛇形棋盘最容易让人看不懂的地方。
 * 在折返处画一个向上的箭头，明确告诉你"从这里拐上去"。
 *
 * （原本画过一条贯穿 50 格的折线，实测像一团方框，反而更乱，已去掉。
 * 让路径可读靠的是格子深浅交替 + 这几个折返箭头。）
 */
const turnArrows = computed(() =>
  [COLS, COLS * 2, COLS * 3, COLS * 4].map((square) => {
    const a = center(square)
    const b = center(square + 1)
    return { x: a.x, y1: a.y - 0.18, y2: b.y + 0.18 }
  }),
)

/** 梯子画成真的梯子：两根边梁 + 若干横档 */
const ladders = computed(() =>
  Object.entries(LADDERS).map(([from, to]) => {
    const a = center(Number(from))
    const b = center(to)
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    const nx = (-dy / len) * 0.17
    const ny = (dx / len) * 0.17
    const rungCount = Math.max(2, Math.round(len / 0.5))
    const rungs = Array.from({ length: rungCount + 1 }, (_, i) => {
      const t = i / rungCount
      const cx = a.x + dx * t
      const cy = a.y + dy * t
      return { x1: cx - nx, y1: cy - ny, x2: cx + nx, y2: cy + ny }
    })
    return {
      rails: [
        { x1: a.x - nx, y1: a.y - ny, x2: b.x - nx, y2: b.y - ny },
        { x1: a.x + nx, y1: a.y + ny, x2: b.x + nx, y2: b.y + ny },
      ],
      rungs,
    }
  }),
)

/** 滑梯画成一条弯的宽带子，和梯子的直线一眼就能区分开 */
const slides = computed(() =>
  Object.entries(SLIDES).map(([from, to]) => {
    const a = center(Number(from))
    const b = center(to)
    const mx = (a.x + b.x) / 2
    const my = (a.y + b.y) / 2
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    const bend = 0.9
    return {
      d: `M ${a.x} ${a.y} Q ${mx + (-dy / len) * bend} ${my + (dx / len) * bend} ${b.x} ${b.y}`,
      end: b,
    }
  }),
)

function pieceStyle(playerId: string) {
  const square = displayPos.value[playerId] ?? 1
  const { row, col } = cellPosition(square)
  const sharing = Object.entries(displayPos.value)
    .filter(([, s]) => s === square)
    .map(([id]) => id)
  const index = Math.max(0, sharing.indexOf(playerId))
  const count = sharing.length

  /*
   * 同格多个棋子要排得下。开局四个人全挤在 1 号格，这是最坏情况也是第一眼看到的画面。
   * 一个横着排会溢出格子（实测三个 63px 的棋子挤在 81px 的格子里），所以三个以上
   * 改成 2×2 的小阵列并缩小。
   */
  let nudgeX = 0
  let nudgeY = 0
  let crowd = 1
  if (count === 2) {
    nudgeX = (index - 0.5) * 46
    crowd = 0.74
  } else if (count > 2) {
    nudgeX = (index % 2 === 0 ? -1 : 1) * 26
    nudgeY = (index < 2 ? -1 : 1) * 24
    crowd = 0.58
  }

  return {
    left: `${(col / COLS) * 100}%`,
    top: `${(row / ROWS) * 100}%`,
    width: `${100 / COLS}%`,
    height: `${100 / ROWS}%`,
    '--nudge-x': `${nudgeX}%`,
    '--nudge-y': `${nudgeY}%`,
    '--crowd': String(crowd),
  }
}

function start() {
  const others = AVATARS.filter((a) => a !== settings.avatar)
  const players: PlayerRef[] = [{ id: 'child', kind: 'human', avatar: settings.avatar }]
  for (let i = 1; i < playerCount.value; i++) {
    players.push({ id: `ai${i}`, kind: 'ai', avatar: others[i - 1], nameKey: `ai.player${i}` })
  }
  const next = createInitialState({ players, difficulty: settings.difficulty, seed: Date.now() })
  clearTimers()
  animating.value = false
  celebrating.value = false
  showResult.value = false
  landingId.value = null
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

function handleRoll() {
  if (!myTurn.value) return
  dispatch({ type: 'roll' })
}

/** 骰子停在哪一面 —— 和 CSS 里六个面的摆放对应 */
const FACE_ROTATION: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: 180 },
}

function landPiece(playerId: string) {
  landingId.value = playerId
  later(() => (landingId.value = null), LAND_MS)
}

function runMoveAnimation(move: NonNullable<SnakesState['lastMove']>) {
  animating.value = true
  rolling.value = true
  playSfx('flip')

  // 多转几圈再停到目标面，看起来像真的骰子在翻
  const target = FACE_ROTATION[move.roll]
  diceSpin.value = { x: target.x + 360 * 3, y: target.y + 360 * 2 }
  diceFace.value = move.roll

  later(() => {
    rolling.value = false

    const steps = move.landed - move.from
    for (let i = 1; i <= steps; i++) {
      later(() => {
        displayPos.value = { ...displayPos.value, [move.playerId]: move.from + i }
        playSfx('tap', 1 + i * 0.06)
      }, STEP_MS * i)
    }

    const afterSteps = STEP_MS * steps + 120
    later(() => landPiece(move.playerId), afterSteps)

    if (move.kind === 'plain') {
      later(finishMove, afterSteps + LAND_MS)
      return
    }

    later(() => {
      displayPos.value = { ...displayPos.value, [move.playerId]: move.final }
      playSfx(move.kind === 'ladder' ? 'success' : 'nope')
      later(() => landPiece(move.playerId), SPECIAL_MS - LAND_MS)
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

    // 到终点了先在棋盘上庆祝一会儿，让人看清是谁赢的，再弹结算页
    if (isFinished(current)) {
      celebrating.value = true
      playSfx('celebrate')
      later(() => {
        celebrating.value = false
        showResult.value = true
      }, WIN_CELEBRATE_MS)
      return
    }

    const player = current.players.find((p) => p.id === currentPlayer(current))
    if (player?.kind !== 'ai') return
    later(() => {
      const action = chooseAiAction(current, player.id, settings.difficulty)
      if (action) dispatch(action)
    }, AI_THINK_MS)
  },
  { immediate: true },
)

function goHome() {
  router.push('/')
}

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}
/** 骰子六个面在立方体上的摆放，和 FACE_ROTATION 对应 */
const FACES = [
  { value: 1, transform: 'translateZ(var(--half))' },
  { value: 6, transform: 'rotateY(180deg) translateZ(var(--half))' },
  { value: 2, transform: 'rotateY(90deg) translateZ(var(--half))' },
  { value: 5, transform: 'rotateY(-90deg) translateZ(var(--half))' },
  { value: 3, transform: 'rotateX(90deg) translateZ(var(--half))' },
  { value: 4, transform: 'rotateX(-90deg) translateZ(var(--half))' },
]
</script>

<template>
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
          <span v-for="n in count" :key="n" class="mode-avatar">{{
            n === 1 ? settings.avatar : AVATARS.filter((a) => a !== settings.avatar)[n - 2]
          }}</span>
        </span>
      </button>
    </div>
    <button class="go pressable" @click="start">▶</button>
  </div>

  <div v-else class="game safe-area">
    <div class="board-wrap">
      <button class="exit-btn pressable" :aria-label="$t('common.back')" @click="goHome">←</button>

      <div class="board">
        <div
          v-for="cell in cells"
          :key="cell.square"
          class="cell"
          :class="{
            odd: cell.square % 2 === 1,
            ladder: cell.ladder,
            slide: cell.slide,
            goal: cell.square === BOARD_SIZE,
            home: cell.square === 1,
          }"
          :style="{
            left: `${(cell.col / COLS) * 100}%`,
            top: `${(cell.row / ROWS) * 100}%`,
            width: `${100 / COLS}%`,
            height: `${100 / ROWS}%`,
          }"
        >
          <span class="num">{{ cell.square }}</span>
          <span v-if="cell.square === 1" class="mark">🏠</span>
          <span v-else-if="cell.square === BOARD_SIZE" class="mark">🏁</span>
        </div>

        <svg class="overlay" :viewBox="`0 0 ${COLS} ${ROWS}`">
          <!-- 折返箭头：走到行尾从这里拐上去 -->
          <g v-for="(a, i) in turnArrows" :key="`T${i}`" class="turn">
            <line :x1="a.x" :y1="a.y1" :x2="a.x" :y2="a.y2" />
            <polyline :points="`${a.x - 0.16},${a.y2 + 0.2} ${a.x},${a.y2} ${a.x + 0.16},${a.y2 + 0.2}`" />
          </g>

          <!-- 梯子：两根边梁加横档 -->
          <g v-for="(l, i) in ladders" :key="`L${i}`" class="ladder-g">
            <line v-for="(r, j) in l.rails" :key="`r${j}`" class="rail" v-bind="r" />
            <line v-for="(r, j) in l.rungs" :key="`g${j}`" class="rung" v-bind="r" />
          </g>

          <!-- 滑梯：弯的宽带子 -->
          <g v-for="(s, i) in slides" :key="`S${i}`">
            <path class="slide-band" :d="s.d" />
            <circle class="slide-end" :cx="s.end.x" :cy="s.end.y" r="0.22" />
          </g>
        </svg>

        <div
          v-for="player in state?.players ?? []"
          :key="player.id"
          class="piece"
          :class="{
            active: player.id === activeId,
            landing: player.id === landingId,
            winner: celebrating && player.id === winnerId,
          }"
          :style="pieceStyle(player.id)"
        >
          <span class="piece-avatar">{{ player.avatar }}</span>
          <span v-if="celebrating && player.id === winnerId" class="burst">🎉</span>
        </div>
      </div>
    </div>

    <!-- 右侧：轮次和骰子。骰子有自己的一块空间可以蹦 -->
    <aside class="side">
      <div class="roster">
        <div
          v-for="player in state?.players ?? []"
          :key="player.id"
          class="seat"
          :class="{ active: player.id === activeId, won: player.id === winnerId }"
        >
          <span class="seat-avatar">{{ player.avatar }}</span>
          <span v-if="player.id === activeId && !finished" class="pointer">◀</span>
        </div>
      </div>

      <div class="dice-stage">
        <button
          class="dice"
          :class="{ ready: myTurn, rolling }"
          :disabled="!myTurn"
          :aria-label="$t('snakes.roll')"
          :style="{ '--rx': `${diceSpin.x}deg`, '--ry': `${diceSpin.y}deg` }"
          @click="handleRoll"
        >
          <span class="cube">
            <span
              v-for="face in FACES"
              :key="face.value"
              class="face"
              :style="{ transform: face.transform }"
            >
              <span v-for="i in 9" :key="i" class="pip-slot">
                <span v-if="PIPS[face.value].includes(i - 1)" class="pip" />
              </span>
            </span>
          </span>
        </button>
      </div>
    </aside>

    <GameResult
      v-if="showResult && state"
      :players="state.players"
      :winner-id="winnerId"
      :solo="false"
      @again="start"
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

/* 横屏：棋盘在左，轮次和骰子在右 */
.game {
  display: flex;
  gap: clamp(8px, 1.6vmin, 20px);
  height: 100%;
}

.board-wrap {
  position: relative;
  display: grid;
  flex: 1;
  min-width: 0;
  place-items: center;
}

.exit-btn {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  font-size: 24px;
  background: var(--bg-card);
  border-radius: 50%;
  box-shadow: var(--shadow);
}

.board {
  position: relative;
  width: 100%;
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: 10 / 5;
  /* 天空到草地，给棋盘一点场景感，不再是一张白纸 */
  background: linear-gradient(170deg, #cdeffd 0%, #e8f8d8 45%, #d6f0b8 100%);
  border-radius: clamp(10px, 2vmin, 20px);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.cell {
  position: absolute;
  display: grid;
  place-items: center;
  padding: 3px;
}

/*
 * 相邻格子深浅交替 —— 这是"这是一条路"最直接的视觉线索，两种颜色要拉开差距，
 * 太接近就会像一张白纸（第一版就是这个毛病）。
 * 格子之间留出较大间隙，底下的天空/草地背景才露得出来，棋盘才像个场景。
 */
.cell::before {
  content: '';
  position: absolute;
  inset: 7%;
  background: #fffdf4;
  border-radius: 24%;
  box-shadow: 0 2px 0 rgba(61, 44, 30, 0.1);
}

.cell.odd::before {
  background: #ffe9b8;
}

.cell.ladder::before {
  background: #8ef0cf;
}

.cell.slide::before {
  background: #ffd0a0;
}

.cell.home::before,
.cell.goal::before {
  background: #ffc93c;
}

.num {
  position: absolute;
  top: 4px;
  left: 7px;
  font-size: clamp(8px, 1.25vmin, 13px);
  font-weight: 700;
  color: var(--ink-soft);
  opacity: 0.55;
}

.mark {
  position: relative;
  font-size: clamp(16px, 3vmin, 30px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.turn line,
.turn polyline {
  fill: none;
  stroke: rgba(61, 44, 30, 0.42);
  stroke-width: 0.075;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.rail {
  stroke: #b06a2c;
  stroke-width: 0.11;
  stroke-linecap: round;
}

.rung {
  stroke: #d98b45;
  stroke-width: 0.085;
  stroke-linecap: round;
}

.slide-band {
  fill: none;
  stroke: #ff9f1c;
  stroke-width: 0.3;
  stroke-linecap: round;
  opacity: 0.85;
}

.slide-end {
  fill: #ff7b00;
}

.piece {
  position: absolute;
  display: grid;
  place-items: center;
  pointer-events: none;
  /* 棋子大小跟着格子走，不跟着屏幕走 —— 否则格子大时动物缩在中间一小团 */
  container-type: size;
  transform: translate(var(--nudge-x, 0), var(--nudge-y, 0)) scale(var(--crowd, 1));
  transition: left 190ms ease-out, top 190ms ease-out;
}

.piece-avatar {
  font-size: clamp(22px, 4.4vmin, 46px);
  font-size: 68cqmin;
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  filter: drop-shadow(0 2px 3px rgba(61, 44, 30, 0.4));
}

.piece.active .piece-avatar {
  animation: hop 800ms ease-in-out infinite;
}

/* 落格后原地转一圈，标记"我停在这儿了" */
.piece.landing .piece-avatar {
  animation: land 420ms ease-out;
}

.piece.winner .piece-avatar {
  animation: champion 700ms ease-in-out infinite;
}

.burst {
  position: absolute;
  font-size: clamp(30px, 6vmin, 60px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  animation: burst 900ms ease-out infinite;
}

.side {
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 2vmin, 18px);
  width: clamp(110px, 17vw, 190px);
  padding: 4px 0;
}

.roster {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: clamp(4px, 1vmin, 10px);
  justify-content: center;
}

.seat {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 6px 10px;
  background: transparent;
  border-radius: 999px;
  opacity: 0.38;
  transition: all 220ms ease-out;
}

/* 轮到谁：整块卡片亮起来 + 一个箭头指着 —— 位置固定，不会被棋盘淹没 */
.seat.active {
  background: var(--bg-card);
  opacity: 1;
  transform: translateX(-6px) scale(1.06);
  box-shadow: var(--shadow);
}

.seat.won {
  background: var(--accent);
  opacity: 1;
}

.seat-avatar {
  font-size: clamp(26px, 4.6vmin, 44px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.pointer {
  font-size: clamp(12px, 2vmin, 18px);
  color: var(--accent-2);
  animation: nudge 900ms ease-in-out infinite;
}

/* 给骰子一块自己的地方，能上下蹦、能转 */
.dice-stage {
  display: grid;
  place-items: center;
  height: clamp(120px, 24vh, 200px);
  background: rgba(255, 255, 255, 0.55);
  border-radius: var(--radius);
  box-shadow: inset 0 2px 8px rgba(61, 44, 30, 0.08);
  perspective: 600px;
}

.dice {
  --size: clamp(64px, 11vmin, 100px);
  --half: calc(var(--size) / 2);
  width: var(--size);
  height: var(--size);
  transform-style: preserve-3d;
  opacity: 0.45;
  transition: opacity 200ms;
}

.dice.ready {
  opacity: 1;
  animation: bob 1.5s ease-in-out infinite;
}

.cube {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  transform: rotateX(var(--rx, 0)) rotateY(var(--ry, 0));
  transform-style: preserve-3d;
  transition: transform 900ms cubic-bezier(0.2, 0.7, 0.3, 1);
}

.face {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 9%;
  padding: 13%;
  background: #fffdf7;
  border: 1px solid rgba(61, 44, 30, 0.15);
  border-radius: 16%;
  backface-visibility: visible;
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

/* 竖屏：棋盘在上，轮次和骰子横过来放在下面 */
@media (orientation: portrait) {
  .game {
    flex-direction: column;
  }
  .side {
    flex-direction: row;
    align-items: center;
    width: auto;
  }
  .roster {
    flex-direction: row;
    justify-content: center;
  }
  .seat {
    flex-direction: column;
  }
  .pointer {
    transform: rotate(90deg);
  }
  .dice-stage {
    height: auto;
    padding: 8px 0;
  }
}

@keyframes hop {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-7px);
  }
}

@keyframes land {
  0% {
    transform: rotate(0) scale(1);
  }
  55% {
    transform: rotate(200deg) scale(1.25);
  }
  100% {
    transform: rotate(360deg) scale(1);
  }
}

@keyframes champion {
  0%,
  100% {
    transform: translateY(0) scale(1.1);
  }
  50% {
    transform: translateY(-12px) scale(1.25);
  }
}

@keyframes burst {
  0% {
    transform: scale(0.5);
    opacity: 0.9;
  }
  100% {
    transform: scale(2.1);
    opacity: 0;
  }
}

@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

@keyframes nudge {
  0%,
  100% {
    transform: translateX(0);
  }
  50% {
    transform: translateX(-5px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dice.ready,
  .piece.active .piece-avatar,
  .piece.landing .piece-avatar,
  .piece.winner .piece-avatar,
  .burst,
  .pointer {
    animation: none;
  }
  .cube,
  .piece {
    transition: none;
  }
}
</style>
