<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import GameResult from '../../components/GameResult.vue'
import UnoCard from './UnoCard.vue'
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
const WIN_CELEBRATE_MS = 1800
/** 对手手牌最多铺开几张，再多就折叠 */
const FAN_MAX = 7

const router = useRouter()
const settings = useSettingsStore()

const phase = ref<'setup' | 'playing'>('setup')
const playerCount = ref(2)
const state = shallowRef<UnoState | null>(null)
const showResult = ref(false)
const busy = ref(false)
const pendingWildId = ref<string | null>(null)
const unoFlash = ref<string | null>(null)
/** 点了出不了的牌，抖一下给反馈 */
const shakingId = ref<string | null>(null)

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

const COLOR_HEX: Record<CardColor, string> = {
  red: '#e63462',
  yellow: '#f9c22e',
  green: '#00b884',
  blue: '#2a9df4',
}

function playable(card: Card): boolean {
  return state.value ? canPlay(state.value, card) : false
}

function handCount(playerId: string): number {
  return state.value?.hands[playerId]?.length ?? 0
}

function fanOf(playerId: string): number {
  return Math.min(FAN_MAX, handCount(playerId))
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
  if (!myTurn.value) return
  // 出不了的牌不是"点了没反应"，而是抖一下 + 轻提示音（铁律：立即反馈）
  if (!playable(card)) {
    playSfx('nope')
    shakingId.value = card.id
    later(() => (shakingId.value = null), 400)
    return
  }
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
      later(() => (busy.value = false), 350)
    }, AI_THINK_MS)
  },
  { immediate: true },
)

function goHome() {
  router.push('/')
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
          <!-- 对手手里有多少牌：铺开的牌背，看得见厚度 -->
          <div class="fan">
            <span v-for="n in fanOf(player.id)" :key="n" class="fan-card">
              <UnoCard back />
            </span>
            <span class="fan-count">{{ handCount(player.id) }}</span>
          </div>
        </div>
      </div>
    </header>

    <div class="table">
      <!-- 摸牌堆：叠起来才看得出是一摞可以抽的牌 -->
      <button
        class="pile pressable"
        :class="{ ready: myTurn }"
        :disabled="!myTurn"
        :aria-label="$t('uno.draw')"
        @click="drawCard"
      >
        <span class="pile-layer l3"><UnoCard back /></span>
        <span class="pile-layer l2"><UnoCard back /></span>
        <span class="pile-layer l1"><UnoCard back /></span>
        <span v-if="myTurn" class="pile-hint">+</span>
      </button>

      <!-- 弃牌堆：外面一圈当前颜色，万能牌改色后这里跟着变 -->
      <div
        class="discard"
        :style="{ background: COLOR_HEX[state?.activeColor ?? 'red'] }"
      >
        <div class="discard-card">
          <UnoCard v-if="top" :card="top" />
        </div>
      </div>
    </div>

    <footer class="hand-bar" :class="{ mine: myTurn, uno: unoFlash === 'child' }">
      <div class="hand">
        <button
          v-for="card in myHand"
          :key="card.id"
          class="hand-slot pressable"
          :class="{
            playable: playable(card) && settings.assistHighlight,
            resting: !playable(card) && settings.assistHighlight,
            shaking: shakingId === card.id,
          }"
          @click="tapCard(card)"
        >
          <UnoCard :card="card" />
        </button>
      </div>
    </footer>

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
  align-items: flex-start;
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
  gap: clamp(16px, 5vmin, 60px);
  justify-content: center;
}

.seat {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-radius: 20px;
  opacity: 0.45;
  transition: all 180ms;
}

.seat.active {
  background: var(--bg-card);
  opacity: 1;
  transform: scale(1.06);
  box-shadow: var(--shadow);
}

.seat.uno {
  background: var(--accent);
  opacity: 1;
}

.seat-avatar {
  font-size: clamp(28px, 4.6vmin, 44px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

/* 对手手牌：铺开的小牌背 + 一个数字，一眼看出还剩多少 */
.fan {
  display: flex;
  align-items: center;
}

.fan-card {
  display: block;
  width: clamp(18px, 2.6vmin, 26px);
  aspect-ratio: 2 / 3;
  container-type: inline-size;
}

.fan-card + .fan-card {
  margin-left: -46%;
}

.fan-count {
  margin-left: 10px;
  font-size: clamp(19px, 2.9vmin, 28px);
  font-weight: 900;
  color: var(--ink);
}

.table {
  display: flex;
  flex: 1;
  gap: clamp(20px, 6vmin, 70px);
  align-items: center;
  justify-content: center;
  min-height: 0;
}

/* 摸牌堆做成一摞：三层错开，看得出厚度 */
.pile {
  position: relative;
  width: clamp(80px, 16vmin, 150px);
  aspect-ratio: 2 / 3;
  opacity: 0.6;
  transition: opacity 200ms, transform 200ms;
}

.pile.ready {
  opacity: 1;
  animation: pile-breathe 1.6s ease-in-out infinite;
}

.pile-layer {
  position: absolute;
  inset: 0;
  container-type: inline-size;
}

.pile-layer.l3 {
  transform: translate(7%, 7%) rotate(5deg);
}

.pile-layer.l2 {
  transform: translate(3.5%, 3.5%) rotate(2.5deg);
}

/* 轮到你时牌堆上冒一个大加号，说明"可以从这里拿一张" */
.pile-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 44%;
  aspect-ratio: 1;
  font-size: clamp(26px, 5vmin, 48px);
  font-weight: 900;
  color: var(--ink);
  background: #fffdf7;
  border-radius: 50%;
  box-shadow: var(--shadow);
  transform: translate(-50%, -50%);
}

/* 弃牌堆外面一圈就是当前颜色 */
.discard {
  padding: clamp(10px, 2vmin, 20px);
  /* 外面再包一圈白，否则当前颜色和牌本身同色时这一圈等于看不见 */
  border: 4px solid #fffdf7;
  border-radius: clamp(16px, 3vmin, 30px);
  box-shadow: var(--shadow-lg);
  transition: background 260ms;
}

.discard-card {
  width: clamp(88px, 18vmin, 168px);
  aspect-ratio: 2 / 3;
  container-type: inline-size;
}

.hand-bar {
  padding: clamp(8px, 1.6vmin, 16px) 0;
  border-radius: var(--radius);
  transition: background 200ms;
}

.hand-bar.mine {
  background: rgba(0, 184, 132, 0.16);
}

.hand-bar.uno {
  background: rgba(249, 194, 46, 0.4);
}

.hand {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(6px, 1.4vmin, 14px);
  justify-content: center;
}

.hand-slot {
  width: clamp(62px, 11.5vmin, 112px);
  aspect-ratio: 2 / 3;
  container-type: inline-size;
  transition: transform 160ms, filter 160ms;
}

/*
 * 不能出的牌【保留颜色】，只是不抬起来、稍微压暗。
 * 第一版用灰度滤镜抹掉了颜色，结果出万能牌要选颜色时根本看不出自己手里有什么色 ——
 * 颜色是这个游戏最核心的信息，任何时候都不能抹掉。
 */
.hand-slot.playable {
  transform: translateY(-14px);
  filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.95));
}

/* 不抬起来就是唯一的区别 —— 绝不压暗、绝不去色 */
.hand-slot.resting {
  opacity: 0.94;
}

.hand-slot.shaking {
  animation: card-shake 380ms ease-in-out;
}

@keyframes card-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-7px) rotate(-3deg); }
  75% { transform: translateX(7px) rotate(3deg); }
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

@keyframes pile-breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
}

@media (prefers-reduced-motion: reduce) {
  .hand-slot,
  .discard,
  .pile {
    transition: none;
  }
  .pile.ready {
    animation: none;
  }
}
</style>
