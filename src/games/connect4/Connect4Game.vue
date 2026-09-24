<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import GameResult from '../../components/GameResult.vue'
import { playSfx } from '../../core/audio'
import { AI_AVATARS, AVATARS, useSettingsStore } from '../../stores/settings'
import type { PlayerRef } from '../../core/types'
import {
  applyAction,
  canDrop,
  COLS,
  createInitialState,
  currentPlayer,
  getWinner,
  isFinished,
  landingRow,
  ROWS,
  type Connect4Action,
  type Connect4State,
} from './rules'
import { chooseAiAction } from './ai'

const AI_THINK_MS = 800
/** 棋子从上方掉下来用多久 */
const DROP_MS = 380
/** 分出胜负后先让四连亮一会儿再弹结算 */
const WIN_CELEBRATE_MS = 2000

const router = useRouter()
const settings = useSettingsStore()

const phase = ref<'setup' | 'playing'>('setup')
const mode = ref<'ai' | 'duo'>('ai')
const state = shallowRef<Connect4State | null>(null)
const showResult = ref(false)
const dropping = ref<number | null>(null)
const handoffTo = ref<string | null>(null)

let timers: number[] = []
function later(fn: () => void, ms: number) {
  timers.push(window.setTimeout(fn, ms))
}
function clearTimers() {
  timers.forEach(clearTimeout)
  timers = []
}
onUnmounted(clearTimers)

const aiAvatar = AI_AVATARS[0]
const friendAvatar = computed(() => AVATARS.find((a) => a !== settings.avatar) ?? AVATARS[1])
const finished = computed(() => (state.value ? isFinished(state.value) : false))
const activeId = computed(() => (state.value ? currentPlayer(state.value) : null))
const activePlayer = computed(
  () => state.value?.players.find((p) => p.id === activeId.value) ?? null,
)
const myTurn = computed(
  () => activePlayer.value?.kind === 'human' && !finished.value && dropping.value === null,
)

/** 每个玩家一种颜色：连成一线要能一眼看出来，光靠头像太小 */
const COLORS = ['#e63462', '#f9c22e'] as const
function colorOf(playerId: string | null): string {
  const index = state.value?.players.findIndex((p) => p.id === playerId) ?? -1
  return index >= 0 ? COLORS[index % COLORS.length] : 'transparent'
}
function avatarOf(playerId: string | null): string {
  return state.value?.players.find((p) => p.id === playerId)?.avatar ?? ''
}

const cells = computed(() => {
  const board = state.value?.board ?? []
  return Array.from({ length: ROWS * COLS }, (_, i) => ({
    index: i,
    row: Math.floor(i / COLS),
    col: i % COLS,
    owner: board[i] ?? null,
    winning: state.value?.winningCells.includes(i) ?? false,
  }))
})

/** 悬在某一列上方的预览棋子，告诉孩子"点这里会掉到哪" */
const hoverCol = ref<number | null>(null)

function start() {
  const players: PlayerRef[] = [{ id: 'child', kind: 'human', avatar: settings.avatar }]
  players.push(
    mode.value === 'ai'
      ? { id: 'ai1', kind: 'ai', avatar: aiAvatar, nameKey: 'ai.player1' }
      : { id: 'friend', kind: 'human', avatar: friendAvatar.value },
  )
  clearTimers()
  showResult.value = false
  dropping.value = null
  handoffTo.value = null
  hoverCol.value = null
  state.value = createInitialState({ players, difficulty: settings.difficulty, seed: Date.now() })
  phase.value = 'playing'
  playSfx('tap')
}

function dispatch(action: Connect4Action) {
  const current = state.value
  if (!current) return
  const next = applyAction(current, action)
  if (next === current) {
    playSfx('nope')
    return
  }
  // 先播掉落动画，落定了再更新棋盘
  dropping.value = action.col
  playSfx('flip')
  later(() => {
    dropping.value = null
    state.value = next
  }, DROP_MS)
}

function tapColumn(col: number) {
  if (!myTurn.value || !state.value) return
  if (!canDrop(state.value, col)) {
    playSfx('nope')
    return
  }
  dispatch({ type: 'drop', col })
}

watch(
  state,
  (current, previous) => {
    clearTimers()
    if (!current) return

    if (current.lastDrop) playSfx('success')

    if (isFinished(current)) {
      playSfx('celebrate')
      later(() => (showResult.value = true), WIN_CELEBRATE_MS)
      return
    }

    // 换人了就把新玩家亮一下（两个人轮流时这是唯一的交接信号）
    const now = currentPlayer(current)
    if (previous && now && now !== currentPlayer(previous)) {
      handoffTo.value = now
      later(() => (handoffTo.value = null), 900)
    }

    const player = current.players.find((p) => p.id === now)
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

/** 掉落动画：从棋盘上方落到目标行 */
function dropStyle(col: number) {
  if (dropping.value !== col || !state.value) return {}
  const row = landingRow(state.value, col)
  return {
    '--drop-row': String(row),
    '--drop-col': String(col),
  }
}
</script>

<template>
  <div v-if="phase === 'setup'" class="setup safe-area">
    <button class="corner-back pressable" :aria-label="$t('common.back')" @click="goHome">←</button>
    <div class="choices">
      <button
        class="choice pressable"
        :class="{ active: mode === 'ai' }"
        :aria-label="$t('memory.modeAi')"
        @click="mode = 'ai'"
      >
        <span class="mode-avatars">
          <span class="mode-avatar">{{ settings.avatar }}</span>
          <span class="vs">VS</span>
          <span class="mode-avatar">{{ aiAvatar }}</span>
        </span>
      </button>
      <button
        class="choice pressable"
        :class="{ active: mode === 'duo' }"
        :aria-label="$t('memory.modeDuo')"
        @click="mode = 'duo'"
      >
        <span class="mode-avatars">
          <span class="mode-avatar">{{ settings.avatar }}</span>
          <span class="vs">VS</span>
          <span class="mode-avatar">{{ friendAvatar }}</span>
        </span>
      </button>
    </div>
    <button class="go pressable" @click="start">▶</button>
  </div>

  <div v-else class="game safe-area">
    <header class="hud">
      <button class="exit-btn pressable" :aria-label="$t('common.back')" @click="goHome">←</button>
      <div class="players">
        <template v-for="(player, index) in state?.players ?? []" :key="player.id">
          <span v-if="index > 0" class="vs">VS</span>
          <div class="player" :class="{ active: player.id === activeId }">
            <span class="chip" :style="{ background: colorOf(player.id) }">
              <span class="chip-face">{{ player.avatar }}</span>
            </span>
          </div>
        </template>
      </div>
    </header>

    <div class="board-wrap">
      <div class="board">
        <!-- 整列都是点击区：孩子不用瞄准某一格 -->
        <button
          v-for="col in COLS"
          :key="`c${col}`"
          class="column"
          :class="{ full: state ? !canDrop(state, col - 1) : false }"
          :style="{ left: `${((col - 1) / COLS) * 100}%`, width: `${100 / COLS}%` }"
          :disabled="!myTurn"
          :aria-label="`${col}`"
          @click="tapColumn(col - 1)"
          @pointerenter="hoverCol = col - 1"
          @pointerleave="hoverCol = null"
        />

        <!-- 棋盘的洞 -->
        <div
          v-for="cell in cells"
          :key="cell.index"
          class="hole"
          :class="{ winning: cell.winning }"
          :style="{
            left: `${(cell.col / COLS) * 100}%`,
            top: `${(cell.row / ROWS) * 100}%`,
            width: `${100 / COLS}%`,
            height: `${100 / ROWS}%`,
          }"
        >
          <span v-if="cell.owner" class="chip" :style="{ background: colorOf(cell.owner) }">
            <span class="chip-face">{{ avatarOf(cell.owner) }}</span>
          </span>
        </div>

        <!-- 正在掉落的那一枚 -->
        <div
          v-if="dropping !== null"
          class="falling"
          :style="{
            ...dropStyle(dropping),
            left: `${(dropping / COLS) * 100}%`,
            width: `${100 / COLS}%`,
            height: `${100 / ROWS}%`,
          }"
        >
          <span class="chip" :style="{ background: colorOf(activeId) }">
            <span class="chip-face">{{ avatarOf(activeId) }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 轮到谁：把当前玩家的棋子悬在棋盘上方 -->
    <footer class="ready-bar">
      <span v-if="myTurn" class="chip floating" :style="{ background: colorOf(activeId) }">
        <span class="chip-face">{{ avatarOf(activeId) }}</span>
      </span>
    </footer>

    <div v-if="handoffTo" class="handoff">
      <span class="handoff-avatar">{{ avatarOf(handoffTo) }}</span>
    </div>

    <GameResult
      v-if="showResult && state"
      :players="state.players"
      :winner-id="getWinner(state)"
      :solo="false"
      @again="start"
      @home="goHome"
    />
  </div>
</template>

<style scoped>
.setup {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(16px, 4vmin, 40px);
  height: 100%;
}

.corner-back {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  font-size: 26px;
  background: var(--bg-card);
  border-radius: 50%;
  box-shadow: var(--shadow);
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
  align-items: center;
}

.mode-avatar {
  font-size: clamp(24px, 4vmin, 38px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.vs {
  align-self: center;
  padding: 3px 9px;
  font-size: clamp(11px, 1.6vmin, 15px);
  font-weight: 900;
  font-style: italic;
  color: #fff;
  background: var(--accent-3);
  border-radius: 999px;
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
  width: 52px;
  height: 52px;
  font-size: 24px;
  background: var(--bg-card);
  border-radius: 50%;
  box-shadow: var(--shadow);
}

.players {
  display: flex;
  flex: 1;
  gap: clamp(12px, 4vmin, 44px);
  align-items: center;
  justify-content: center;
}

.player {
  padding: 6px 12px;
  border-radius: 20px;
  opacity: 0.4;
  transition: all 180ms;
}

.player.active {
  background: var(--bg-card);
  opacity: 1;
  transform: scale(1.12);
  box-shadow: var(--shadow);
}

/* 棋子：彩色圆片 + 头像。颜色负责"一眼看出连成一线"，头像负责"这是谁" */
.chip {
  display: grid;
  place-items: center;
  border-radius: 50%;
  box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.18);
  /* 自己当容器，头像按棋子大小缩放（不管棋子是在棋盘里还是在 HUD 里） */
  container-type: inline-size;
}

.player .chip {
  width: clamp(38px, 6vmin, 56px);
  height: clamp(38px, 6vmin, 56px);
}

.chip-face {
  font-size: 58cqw;
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.board-wrap {
  display: grid;
  flex: 1;
  min-height: 0;
  place-items: center;
  padding: clamp(6px, 1.4vmin, 14px) 0;
}

.board {
  position: relative;
  /*
   * 尺寸由【高度】驱动：写 width:100% 的话 aspect-ratio 会算出比屏幕还高的棋盘，
   * max-height 拦不住（前面几个棋盘踩过同一个坑）。
   */
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  aspect-ratio: 7 / 6;
  background: linear-gradient(170deg, #4cc9f0, #2a9df4);
  border-radius: clamp(12px, 2.4vmin, 24px);
  box-shadow: var(--shadow-lg);
}

/* 整列都可点，不用瞄准格子 */
.column {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 3;
  border-radius: clamp(10px, 2vmin, 20px);
  transition: background 140ms;
}

.column:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.18);
}

.column.full {
  cursor: default;
}

/*
 * ⚠️ 这里不能用 padding 百分比留空隙。
 *
 * 绝对定位元素的百分比内边距是按【包含块】算的，不是按自己 —— 原来写 padding:7%，
 * 在 685px 宽的棋盘里算出 48px，把 98px 的格子吃得只剩 2px，棋子小成一个点
 * （用户反馈"落子后棋子完全看不见"）。
 * 改成给棋子本身 inset：inset 的百分比才是按这个格子算的。
 */
.hole {
  position: absolute;
  container-type: inline-size;
}

.hole::before {
  content: '';
  position: absolute;
  inset: 8%;
  background: var(--bg);
  border-radius: 50%;
  box-shadow: inset 0 3px 5px rgba(0, 0, 0, 0.2);
}

.hole .chip {
  position: absolute;
  inset: 8%;
}

/* 连成的那四个：亮起来并跳动 */
.hole.winning .chip {
  animation: pop-win 700ms ease-in-out infinite;
  box-shadow: 0 0 0 4px #fffdf7, inset 0 -3px 0 rgba(0, 0, 0, 0.18);
}

.falling {
  position: absolute;
  z-index: 2;
  animation: fall 380ms cubic-bezier(0.45, 0.05, 0.55, 1) forwards;
}

.falling .chip {
  position: absolute;
  inset: 8%;
}

.ready-bar {
  display: grid;
  place-items: center;
  height: clamp(54px, 9vmin, 84px);
}

.floating {
  width: clamp(44px, 7vmin, 66px);
  height: clamp(44px, 7vmin, 66px);
  animation: bob 1.5s ease-in-out infinite;
}

.handoff {
  position: fixed;
  inset: 0;
  z-index: 15;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.handoff-avatar {
  font-size: clamp(70px, 16vmin, 150px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  filter: drop-shadow(0 6px 12px rgba(61, 44, 30, 0.4));
  animation: handoff-pop 900ms ease-out;
}

@keyframes fall {
  from {
    transform: translateY(calc(-100% * (var(--drop-row, 0) + 1)));
  }
  to {
    transform: translateY(calc(100% * var(--drop-row, 0)));
  }
}

@keyframes pop-win {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.12);
  }
}

@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

@keyframes handoff-pop {
  0% {
    transform: scale(0.4);
    opacity: 0;
  }
  30% {
    transform: scale(1.1);
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .falling,
  .floating,
  .hole.winning .chip,
  .handoff-avatar {
    animation: none;
  }
}
</style>
