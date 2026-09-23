<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import GameResult from '../../components/GameResult.vue'
import { playSfx } from '../../core/audio'
import { useSettingsStore } from '../../stores/settings'
import type { PlayerRef } from '../../core/types'
import {
  applyAction,
  createInitialState,
  currentPlayer,
  isFinished,
  isMismatch,
  getWinner,
  PAIR_OPTIONS,
  type MemoryAction,
  type MemoryState,
  type PairCount,
} from './rules'
import { chooseAiAction } from './ai'

/** 翻错的两张牌在台面上停留多久 —— 要够孩子看清楚，又不至于等得不耐烦 */
const MISMATCH_MS = 1100
/** AI "思考"多久再出手。太快会让孩子觉得没参与感 */
const AI_THINK_MS = 900

const router = useRouter()
const settings = useSettingsStore()

const phase = ref<'setup' | 'playing'>('setup')
const mode = ref<'solo' | 'ai'>('solo')
const pairs = ref<PairCount>(4)
const state = shallowRef<MemoryState | null>(null)

let mismatchTimer: number | undefined
let aiTimer: number | undefined

function clearTimers() {
  clearTimeout(mismatchTimer)
  clearTimeout(aiTimer)
}
onUnmounted(clearTimers)

const aiAvatar = computed(() => (settings.avatar === '🐰' ? '🐻' : '🐰'))
const rows = computed(() => (state.value ? state.value.cards.length / 4 : 2))
const finished = computed(() => (state.value ? isFinished(state.value) : false))
const activeId = computed(() => (state.value ? currentPlayer(state.value) : null))

function start() {
  const players: PlayerRef[] = [{ id: 'child', kind: 'human', avatar: settings.avatar }]
  if (mode.value === 'ai') {
    players.push({ id: 'bear', kind: 'ai', avatar: aiAvatar.value, nameKey: 'ai.player1' })
  }
  state.value = createInitialState({
    players,
    difficulty: settings.difficulty,
    variant: { pairs: pairs.value },
    seed: Date.now(),
  })
  phase.value = 'playing'
  playSfx('tap')
}

function dispatch(action: MemoryAction) {
  const current = state.value
  if (!current) return
  const next = applyAction(current, action)
  if (next === current) return

  if (action.type === 'flip') {
    if (next.faceUp.length === 0) playSfx('success')
    else if (next.faceUp.length === 2 && isMismatch(next)) playSfx('nope')
    else playSfx('flip')
  }
  state.value = next
}

/** 不是自己的回合就点不动 —— 台面上有两张牌时也一样（正在等孩子看清楚） */
function tapCard(cardId: number) {
  const current = state.value
  if (!current) return
  const player = current.players.find((p) => p.id === currentPlayer(current))
  if (player?.kind !== 'human') return
  dispatch({ type: 'flip', cardId })
}

watch(
  state,
  (current) => {
    clearTimers()
    if (!current || isFinished(current)) return

    if (current.faceUp.length === 2) {
      mismatchTimer = window.setTimeout(() => dispatch({ type: 'resolve' }), MISMATCH_MS)
      return
    }

    const player = current.players.find((p) => p.id === currentPlayer(current))
    if (player?.kind !== 'ai') return
    aiTimer = window.setTimeout(() => {
      const action = chooseAiAction(current, player.id, settings.difficulty)
      if (action) dispatch(action)
    }, AI_THINK_MS)
  },
  { immediate: true },
)

function playAgain() {
  start()
}

function goHome() {
  router.push('/')
}
</script>

<template>
  <!-- 开局设置：全部用图形表达，不依赖认字 -->
  <div v-if="phase === 'setup'" class="setup safe-area">
    <div class="choices">
      <button
        class="choice pressable"
        :class="{ active: mode === 'solo' }"
        :aria-label="$t('memory.modeSolo')"
        @click="mode = 'solo'"
      >
        <span class="faces"><span class="face">{{ settings.avatar }}</span></span>
      </button>
      <button
        class="choice pressable"
        :class="{ active: mode === 'ai' }"
        :aria-label="$t('memory.modeAi')"
        @click="mode = 'ai'"
      >
        <span class="faces">
          <span class="face">{{ settings.avatar }}</span>
          <span class="face">{{ aiAvatar }}</span>
        </span>
      </button>
    </div>

    <div class="choices">
      <button
        v-for="option in PAIR_OPTIONS"
        :key="option"
        class="choice pressable"
        :class="{ active: pairs === option }"
        :aria-label="$t(`memory.size${option}`)"
        @click="pairs = option"
      >
        <!-- 用小方块画出牌面大小，一眼看懂是几张牌 -->
        <span class="preview" :style="{ gridTemplateRows: `repeat(${(option * 2) / 4}, 1fr)` }">
          <span v-for="n in option * 2" :key="n" class="tile" />
        </span>
      </button>
    </div>

    <button class="go pressable" @click="start">▶</button>
  </div>

  <!-- 对局 -->
  <div v-else class="game safe-area">
    <header class="hud">
      <button class="back pressable" :aria-label="$t('common.back')" @click="goHome">←</button>

      <div class="players">
        <div
          v-for="player in state?.players ?? []"
          :key="player.id"
          class="player"
          :class="{ active: player.id === activeId }"
        >
          <span class="avatar">{{ player.avatar }}</span>
          <div class="stars">
            <span v-for="n in state?.scores[player.id] ?? 0" :key="n" class="star">⭐</span>
          </div>
        </div>
      </div>
    </header>

    <div class="board-wrap">
      <div
        class="board"
        :style="{ aspectRatio: `12 / ${rows * 4}` }"
      >
        <button
          v-for="card in state?.cards ?? []"
          :key="card.id"
          class="card"
          :class="{
            up: state?.faceUp.includes(card.id) || card.matched,
            matched: card.matched,
          }"
          @click="tapCard(card.id)"
        >
          <span class="inner">
            <span class="side back" />
            <span class="side front">{{ card.symbol }}</span>
          </span>
        </button>
      </div>
    </div>

    <GameResult
      v-if="finished && state"
      :players="state.players"
      :scores="state.scores"
      :winner-id="getWinner(state)"
      :solo="state.players.length === 1"
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

.faces {
  display: flex;
  gap: 4px;
}

.face {
  font-size: clamp(30px, 5vmin, 46px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.preview {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 3px;
  width: clamp(56px, 9vmin, 84px);
  aspect-ratio: 4 / 3;
}

.tile {
  background: var(--accent);
  border-radius: 3px;
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

.back {
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
  gap: clamp(16px, 4vmin, 44px);
  justify-content: center;
}

.player {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 14px;
  border-radius: 18px;
  opacity: 0.4;
  transition: opacity 160ms, transform 160ms, background 160ms;
}

/* 轮到谁必须一眼看出来：放大 + 变亮 + 有底色 */
.player.active {
  background: var(--bg-card);
  opacity: 1;
  transform: scale(1.12);
  box-shadow: var(--shadow);
}

.avatar {
  font-size: clamp(30px, 5vmin, 44px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.stars {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 96px;
}

.star {
  font-size: 13px;
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.board-wrap {
  display: grid;
  flex: 1;
  min-height: 0;
  place-items: center;
  padding: clamp(8px, 2vmin, 20px) 0;
}

.board {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: clamp(8px, 1.8vmin, 18px);
  max-width: 100%;
  max-height: 100%;
  height: 100%;
}

.card {
  perspective: 700px;
  min-width: 0;
  min-height: 0;
}

.inner {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  transition: transform 320ms cubic-bezier(0.3, 1.3, 0.6, 1);
  transform-style: preserve-3d;
}

.card.up .inner {
  transform: rotateY(180deg);
}

.side {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: clamp(10px, 2vmin, 20px);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.back {
  background: linear-gradient(145deg, var(--accent-4), #2f9ed1);
  box-shadow: var(--shadow);
}

.front {
  font-size: clamp(26px, 7vmin, 64px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  background: var(--bg-card);
  box-shadow: var(--shadow);
  transform: rotateY(180deg);
}

.card.matched .inner {
  animation: found 420ms ease-out;
}

.card.matched .front {
  background: #e8fff6;
}

@keyframes found {
  0% {
    transform: rotateY(180deg) scale(1);
  }
  50% {
    transform: rotateY(180deg) scale(1.12);
  }
  100% {
    transform: rotateY(180deg) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .inner {
    transition: none;
  }
  .card.matched .inner {
    animation: none;
  }
}
</style>
