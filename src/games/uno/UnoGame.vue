<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import GameResult from '../../components/GameResult.vue'
import { playSfx } from '../../core/audio'
import { useSettingsStore, AVATARS } from '../../stores/settings'
import type { PlayerRef } from '../../core/types'
import {
  applyAction,
  canPlay,
  COLORS,
  createInitialState,
  currentPlayer,
  getWinner,
  isFinished,
  playersAtUno,
  topCard,
  type Card,
  type CardColor,
  type UnoAction,
  type UnoState,
} from './rules'
import { chooseAiAction } from './ai'

const AI_THINK_MS = 900
const EVENT_MS = 700
/** 有人打完最后一张牌后，先让台面停一下再弹结算 */
const WIN_CELEBRATE_MS = 1800

const router = useRouter()
const settings = useSettingsStore()

const phase = ref<'setup' | 'playing'>('setup')
const playerCount = ref(2)
const state = shallowRef<UnoState | null>(null)
const showResult = ref(false)
const busy = ref(false)
/** 选颜色的弹层：孩子点了万能牌之后才出现 */
const pendingWildId = ref<string | null>(null)
const unoFlash = ref<string | null>(null)

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
  () => activePlayer.value?.kind === 'human' && !busy.value && !finished.value,
)
const myHand = computed(() => state.value?.hands.child ?? [])
const top = computed(() => (state.value ? topCard(state.value) : null))
const others = computed(() => state.value?.players.filter((p) => p.id !== 'child') ?? [])

/** 新手辅助：可以出的牌高亮放大，不能出的灰掉且点不动（家长端可关） */
function playable(card: Card): boolean {
  return state.value ? canPlay(state.value, card) : false
}

function start() {
  const pool = AVATARS.filter((a) => a !== settings.avatar)
  const players: PlayerRef[] = [{ id: 'child', kind: 'human', avatar: settings.avatar }]
  for (let i = 1; i < playerCount.value; i++) {
    players.push({ id: `ai${i}`, kind: 'ai', avatar: pool[i - 1], nameKey: `ai.player${i}` })
  }
  clearTimers()
  busy.value = false
  showResult.value = false
  pendingWildId.value = null
  state.value = createInitialState({
    players,
    difficulty: settings.difficulty,
    variant: { level: settings.unoLevel },
    seed: Date.now(),
  })
  phase.value = 'playing'
  playSfx('tap')
}

function dispatch(action: UnoAction) {
  const current = state.value
  if (!current) return
  const next = applyAction(current, action)
  if (next === current) {
    playSfx('nope')
    return
  }
  state.value = next
}

function tapCard(card: Card) {
  if (!myTurn.value || !playable(card)) return
  if (card.kind === 'wild' || card.kind === 'wild4') {
    pendingWildId.value = card.id
    playSfx('flip')
    return
  }
  dispatch({ type: 'play', cardId: card.id })
}

function chooseColor(color: CardColor) {
  const cardId = pendingWildId.value
  pendingWildId.value = null
  if (cardId) dispatch({ type: 'play', cardId, chosenColor: color })
}

function drawCard() {
  if (!myTurn.value) return
  dispatch({ type: 'draw' })
}

watch(
  state,
  (current) => {
    if (!current) return
    clearTimers()

    // 剩一张牌自动喊 UNO —— 孩子不需要做任何操作，也不会因为忘记被罚
    const atUno = playersAtUno(current)
    if (atUno.length > 0 && unoFlash.value !== atUno[0]) {
      unoFlash.value = atUno[0]
      playSfx('success')
      later(() => (unoFlash.value = null), 1400)
    } else if (atUno.length === 0) {
      unoFlash.value = null
    }

    if (current.lastEvent?.type === 'play') playSfx('flip')
    if (current.lastEvent?.type === 'draw') playSfx('tap')

    if (isFinished(current)) {
      playSfx('celebrate')
      later(() => (showResult.value = true), WIN_CELEBRATE_MS)
      return
    }

    const player = current.players.find((p) => p.id === currentPlayer(current))
    if (player?.kind !== 'ai') {
      busy.value = false
      return
    }
    busy.value = true
    later(() => {
      const action = chooseAiAction(current, player.id, settings.difficulty)
      if (action) dispatch(action)
      later(() => (busy.value = false), EVENT_MS / 2)
    }, AI_THINK_MS)
  },
  { immediate: true },
)

function goHome() {
  router.push('/')
}

const COLOR_HEX: Record<CardColor, string> = {
  red: '#ef476f',
  yellow: '#ffc93c',
  green: '#06d6a0',
  blue: '#4cc9f0',
}

/** 牌面上画什么：数字牌画数字，功能牌画图形 */
function faceOf(card: Card): string {
  switch (card.kind) {
    case 'number':
      return String(card.value)
    case 'skip':
      return '⊘'
    case 'reverse':
      return '⇄'
    case 'draw2':
      return '+2'
    case 'wild4':
      return '+4'
    default:
      return '★'
  }
}
</script>

<template>
  <div v-if="phase === 'setup'" class="setup safe-area">
    <button class="corner-back pressable" :aria-label="$t('common.back')" @click="goHome">←</button>
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
    <header class="hud">
      <button class="exit-btn pressable" :aria-label="$t('common.back')" @click="goHome">←</button>
      <div class="opponents">
        <div
          v-for="player in others"
          :key="player.id"
          class="seat"
          :class="{ active: player.id === activeId, uno: unoFlash === player.id }"
        >
          <span class="seat-avatar">{{ player.avatar }}</span>
          <!-- 对手剩几张牌用小牌背表示，不用数字 -->
          <span class="counts">
            <span v-for="n in state?.hands[player.id]?.length ?? 0" :key="n" class="mini" />
          </span>
        </div>
      </div>
    </header>

    <div class="table">
      <!-- 当前颜色：万能牌改色之后，台面顶牌的颜色就不作数了 -->
      <div class="color-orb" :style="{ background: COLOR_HEX[state?.activeColor ?? 'red'] }" />

      <div v-if="top" class="card top" :style="{ '--c': COLOR_HEX[top.color ?? state!.activeColor] }">
        <span class="face">{{ faceOf(top) }}</span>
      </div>

      <button
        class="draw-pile pressable"
        :class="{ ready: myTurn }"
        :disabled="!myTurn"
        :aria-label="$t('uno.draw')"
        @click="drawCard"
      >
        <span class="pile-back" />
      </button>
    </div>

    <footer class="hand-bar" :class="{ mine: myTurn, uno: unoFlash === 'child' }">
      <div class="hand">
        <button
          v-for="card in myHand"
          :key="card.id"
          class="card hand-card pressable"
          :class="{
            playable: playable(card) && settings.assistHighlight,
            dimmed: !playable(card) && settings.assistHighlight,
          }"
          :style="{ '--c': card.color ? COLOR_HEX[card.color] : '#3d2c1e' }"
          :disabled="settings.assistHighlight && !playable(card)"
          @click="tapCard(card)"
        >
          <span class="face">{{ faceOf(card) }}</span>
          <span v-if="!card.color" class="rainbow" />
        </button>
      </div>
    </footer>

    <!-- 万能牌：先选颜色 -->
    <div v-if="pendingWildId" class="color-picker" @click.self="pendingWildId = null">
      <div class="swatches">
        <button
          v-for="color in COLORS"
          :key="color"
          class="swatch pressable"
          :style="{ background: COLOR_HEX[color] }"
          :aria-label="color"
          @click="chooseColor(color)"
        />
      </div>
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
  width: 52px;
  height: 52px;
  font-size: 24px;
  background: var(--bg-card);
  border-radius: 50%;
  box-shadow: var(--shadow);
}

.opponents {
  display: flex;
  flex: 1;
  gap: clamp(12px, 4vmin, 44px);
  justify-content: center;
}

.seat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 18px;
  opacity: 0.4;
  transition: all 180ms;
}

.seat.active {
  background: var(--bg-card);
  opacity: 1;
  transform: scale(1.1);
  box-shadow: var(--shadow);
}

.seat.uno {
  background: var(--accent);
  opacity: 1;
}

.seat-avatar {
  font-size: clamp(26px, 4.4vmin, 40px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

/* 对手手牌数量用小牌背表示，不用数字 */
.counts {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  justify-content: center;
  max-width: 90px;
}

.mini {
  width: 7px;
  height: 11px;
  background: var(--accent-4);
  border-radius: 2px;
}

.table {
  display: flex;
  flex: 1;
  gap: clamp(14px, 4vmin, 48px);
  align-items: center;
  justify-content: center;
  min-height: 0;
}

/* 当前颜色单独用一个色球表示：万能牌改色后，顶牌颜色就不作数了 */
.color-orb {
  width: clamp(44px, 8vmin, 78px);
  height: clamp(44px, 8vmin, 78px);
  border-radius: 50%;
  box-shadow: var(--shadow);
  transition: background 260ms;
}

.card {
  position: relative;
  display: grid;
  place-items: center;
  aspect-ratio: 2 / 3;
  background: var(--c, var(--ink));
  border: 4px solid #fffdf7;
  border-radius: clamp(8px, 1.6vmin, 16px);
  box-shadow: var(--shadow);
}

.card .face {
  font-size: clamp(24px, 5.6vmin, 58px);
  font-weight: 900;
  color: #fff;
  text-shadow: 0 2px 3px rgba(0, 0, 0, 0.28);
}

.top {
  width: clamp(92px, 19vmin, 175px);
}

.rainbow {
  position: absolute;
  inset: 12%;
  background: conic-gradient(#ef476f, #ffc93c, #06d6a0, #4cc9f0, #ef476f);
  border-radius: 50%;
  opacity: 0.55;
}

.draw-pile {
  width: clamp(82px, 17vmin, 155px);
  aspect-ratio: 2 / 3;
  opacity: 0.55;
}

.draw-pile.ready {
  opacity: 1;
}

.pile-back {
  display: block;
  width: 100%;
  height: 100%;
  background: linear-gradient(145deg, var(--accent-4), #2f9ed1);
  border: 4px solid #fffdf7;
  border-radius: clamp(8px, 1.6vmin, 16px);
  box-shadow: var(--shadow);
}

.hand-bar {
  padding: clamp(6px, 1.4vmin, 14px) 0;
  border-radius: var(--radius);
  transition: background 200ms;
}

/* 轮到孩子时整条手牌区亮起来 */
.hand-bar.mine {
  background: rgba(6, 214, 160, 0.14);
}

.hand-bar.uno {
  background: rgba(255, 201, 60, 0.35);
}

.hand {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(6px, 1.4vmin, 14px);
  justify-content: center;
}

.hand-card {
  width: clamp(62px, 11.5vmin, 112px);
  transition: transform 160ms, filter 160ms;
}

/* 新手辅助：能出的牌抬起来放大，不能出的灰掉且点不动 */
.hand-card.playable {
  transform: translateY(-10px) scale(1.06);
}

.hand-card.dimmed {
  filter: grayscale(0.85) brightness(0.9);
  opacity: 0.55;
}

.color-picker {
  position: fixed;
  inset: 0;
  z-index: 8;
  display: grid;
  place-items: center;
  background: rgba(61, 44, 30, 0.45);
}

.swatches {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: clamp(14px, 3vmin, 28px);
  padding: clamp(18px, 3vmin, 32px);
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}

.swatch {
  width: clamp(80px, 14vmin, 130px);
  height: clamp(80px, 14vmin, 130px);
  border-radius: 24px;
  box-shadow: var(--shadow);
}

@media (prefers-reduced-motion: reduce) {
  .hand-card,
  .color-orb {
    transition: none;
  }
}
</style>
