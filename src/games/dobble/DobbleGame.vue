<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import GameResult from '../../components/GameResult.vue'
import { playSfx } from '../../core/audio'
import { AI_AVATARS, AVATARS, useSettingsStore } from '../../stores/settings'
import type { PlayerRef } from '../../core/types'
import {
  applyAction,
  createInitialState,
  getWinner,
  isFinished,
  TARGET_SCORE,
  type DobbleAction,
  type DobbleOrder,
  type DobbleState,
} from './rules'
import { aiDelay, chooseAiAction } from './ai'
import { symbolOf } from './symbols'

/** 点对了以后，先把那个图案亮出来给孩子看清，再换下一局 */
const ROUND_FLASH_MS = 1100
/** 点错了冻结多久。太长会让人以为坏了，太短等于可以乱按 */
const WRONG_LOCK_MS = 700

const router = useRouter()
const settings = useSettingsStore()

const phase = ref<'setup' | 'playing'>('setup')
const mode = ref<'ai' | 'duo'>('ai')
const order = ref<DobbleOrder>(3)
const state = shallowRef<DobbleState | null>(null)
const showResult = ref(false)
/** 正在亮的那个答案；亮着的时候谁都不能点 */
const flash = ref<{ symbol: number; playerId: string } | null>(null)
/** 刚点错、正被冻结的人 */
const locked = ref<Record<string, boolean>>({})

let timers: number[] = []
function later(fn: () => void, ms: number) {
  timers.push(window.setTimeout(fn, ms))
}
/**
 * AI 的闹钟单独拿出来存一个，而不是丢进 timers 里。
 * 因为"该给 AI 定闹钟了"会从两个地方触发（换了新牌 / 它点错后解冻），
 * 不去重的话它会同时挂两个闹钟，一轮里连点两下。
 */
let aiTimer: number | null = null
function clearAiTimer() {
  if (aiTimer !== null) clearTimeout(aiTimer)
  aiTimer = null
}
function clearTimers() {
  timers.forEach(clearTimeout)
  timers = []
  clearAiTimer()
}
onUnmounted(clearTimers)

const aiAvatar = AI_AVATARS[0]
const friendAvatar = computed(() => AVATARS.find((a) => a !== settings.avatar) ?? AVATARS[1])

/** 上面那个座位的人。两个人玩时他的牌要转 180°，因为他坐在对面 */
const seats = computed(() => {
  const players = state.value?.players ?? []
  return [
    { player: players[1], flipped: mode.value === 'duo' },
    { player: players[0], flipped: false },
  ].filter((s) => s.player)
})

function cardOf(playerId: string): number[] {
  return state.value?.cards[playerId] ?? []
}

function scoreOf(playerId: string): number {
  return state.value?.scores[playerId] ?? 0
}

function start() {
  const players: PlayerRef[] = [{ id: 'child', kind: 'human', avatar: settings.avatar }]
  players.push(
    mode.value === 'ai'
      ? { id: 'ai1', kind: 'ai', avatar: aiAvatar, nameKey: 'ai.player1' }
      : { id: 'friend', kind: 'human', avatar: friendAvatar.value },
  )
  clearTimers()
  showResult.value = false
  flash.value = null
  locked.value = {}
  state.value = createInitialState({
    players,
    difficulty: settings.difficulty,
    seed: Date.now(),
    variant: { order: order.value },
  })
  phase.value = 'playing'
  playSfx('tap')
}

function dispatch(action: DobbleAction) {
  const current = state.value
  if (!current || flash.value || isFinished(current)) return
  if (locked.value[action.playerId]) return

  const next = applyAction(current, action)
  if (next === current) return

  if (!next.lastTap?.correct) {
    // 点错了：抖一下 + 冻结一会儿，不扣分、不换牌
    playSfx('nope')
    state.value = next
    locked.value = { ...locked.value, [action.playerId]: true }
    later(() => {
      locked.value = { ...locked.value, [action.playerId]: false }
      scheduleAi()
    }, WRONG_LOCK_MS)
    return
  }

  // 点对了：先把答案亮出来，亮完再换牌
  playSfx('success')
  flash.value = { symbol: action.symbol, playerId: action.playerId }
  later(() => {
    flash.value = null
    locked.value = {}
    state.value = next
  }, ROUND_FLASH_MS)
}

function tapSymbol(playerId: string, symbol: number) {
  const player = state.value?.players.find((p) => p.id === playerId)
  // AI 那半边不给人点 —— 不然孩子替对手按了
  if (player?.kind !== 'human') return
  dispatch({ type: 'tap', playerId, symbol })
}

/** 给 AI 定一个"想一会儿"的闹钟。它总能找到答案，慢才是它的难度 */
function scheduleAi() {
  clearAiTimer()
  const current = state.value
  if (!current || isFinished(current) || flash.value) return
  const ai = current.players.find((p) => p.kind === 'ai')
  if (!ai || locked.value[ai.id]) return

  aiTimer = window.setTimeout(() => {
    aiTimer = null
    const now = state.value
    if (!now || now !== current || flash.value || isFinished(now)) return
    const action = chooseAiAction(now, ai.id, settings.difficulty)
    if (action) dispatch(action)
  }, aiDelay(current, settings.difficulty))
}

watch(state, (current) => {
  if (!current) return
  if (isFinished(current)) {
    playSfx('celebrate')
    later(() => (showResult.value = true), 1200)
    return
  }
  scheduleAi()
})

function goHome() {
  router.push('/')
}

/**
 * 图案摆在牌上的位置。
 *
 * 不能整整齐齐排一圈 —— 那样孩子会靠"第几个位置"去比对，而不是真的在看图案。
 * 所以角度、半径、大小、旋转都按【这张牌 + 第几个图案】算一个固定的抖动：
 * 同一张牌每次出现长得一模一样（可预期），不同的牌则各不相同。
 */
function jitter(card: number[], slot: number, salt: number): number {
  let h = card.reduce((acc, s) => acc * 31 + s, 7) * 374761393 + slot * 668265263 + salt * 2246822519
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function slotStyle(card: number[], slot: number) {
  const n = card.length
  // 5 个以上就中间放一个，否则一圈太挤
  const ringCount = n >= 5 ? n - 1 : n
  const onRing = n < 5 || slot > 0
  const ringIndex = n >= 5 ? slot - 1 : slot

  const angle = onRing
    ? (ringIndex / ringCount) * Math.PI * 2 + (jitter(card, slot, 1) - 0.5) * 0.5
    : 0
  const radius = onRing ? 0.31 + (jitter(card, slot, 2) - 0.5) * 0.06 : 0
  const scale = 0.85 + jitter(card, slot, 3) * 0.32
  const spin = (jitter(card, slot, 4) - 0.5) * 44

  return {
    left: `${50 + Math.cos(angle) * radius * 100}%`,
    top: `${50 + Math.sin(angle) * radius * 100}%`,
    '--spin': `${spin}deg`,
    '--scale': String(scale),
  }
}
</script>

<template>
  <div v-if="phase === 'setup'" class="setup safe-area">
    <button class="corner-back pressable" :aria-label="$t('common.back')" @click="goHome">←</button>

    <!-- 规则示意：两张牌，圈出同一个图案。不用文字 -->
    <div class="how">
      <span class="how-card">
        <span class="how-pip">🐻</span><span class="how-pip target">⭐</span
        ><span class="how-pip">🚗</span>
      </span>
      <span class="how-eq">=</span>
      <span class="how-card">
        <span class="how-pip">🍎</span><span class="how-pip target">⭐</span
        ><span class="how-pip">⚽</span>
      </span>
    </div>

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

    <!-- 每张牌几个图案。方块随图案数长大，不认字也看得出哪个更难 -->
    <div class="sizes">
      <button
        v-for="opt in [2, 3, 5] as DobbleOrder[]"
        :key="opt"
        class="size pressable"
        :class="{ active: order === opt }"
        :aria-label="$t('dobble.symbols', { n: opt + 1 })"
        @click="order = opt"
      >
        <span class="size-dots" :style="{ '--n': opt + 1 }">
          <i v-for="k in opt + 1" :key="k" />
        </span>
      </button>
    </div>

    <button class="go pressable" @click="start">▶</button>
  </div>

  <div v-else class="game safe-area">
    <button class="exit-btn pressable" :aria-label="$t('common.back')" @click="goHome">←</button>

    <div
      v-for="seat in seats"
      :key="seat.player!.id"
      class="seat"
      :class="{ flipped: seat.flipped, locked: locked[seat.player!.id] }"
    >
      <div class="card-area">
        <div class="card">
          <button
            v-for="(symbol, slot) in cardOf(seat.player!.id)"
            :key="symbol"
            class="pip pressable"
            :class="{
              hit: flash?.symbol === symbol,
              missed:
                state?.lastTap?.playerId === seat.player!.id &&
                state?.lastTap?.symbol === symbol &&
                !state?.lastTap?.correct,
            }"
            :style="slotStyle(cardOf(seat.player!.id), slot)"
            :disabled="!!flash || locked[seat.player!.id]"
            :aria-label="String(symbol)"
            @click="tapSymbol(seat.player!.id, symbol)"
          >
            <span class="pip-face">{{ symbolOf(symbol) }}</span>
          </button>
        </div>
      </div>

      <!-- 比分：几个点点，亮一个就是得一分 -->
      <div class="score">
        <span class="score-face">{{ seat.player!.avatar }}</span>
        <span class="pips">
          <i v-for="k in TARGET_SCORE" :key="k" :class="{ on: k <= scoreOf(seat.player!.id) }" />
        </span>
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
  gap: clamp(14px, 3vmin, 32px);
  height: 100%;
}

/* ── 规则示意：两张小牌 + 中间一个等号，同一个图案被圈出来 ── */
.how {
  display: flex;
  align-items: center;
  gap: clamp(8px, 2vmin, 18px);
}

.how-card {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: clamp(8px, 1.6vmin, 14px) clamp(10px, 2vmin, 18px);
  background: var(--bg-card);
  border-radius: 999px;
  box-shadow: var(--shadow);
}

.how-pip {
  font-size: clamp(20px, 3.4vmin, 34px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  opacity: 0.45;
}

.how-pip.target {
  padding: 3px;
  opacity: 1;
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--accent-2);
  animation: how-beat 1.6s ease-in-out infinite;
}

@keyframes how-beat {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.18);
  }
}

.how-eq {
  font-size: clamp(18px, 3vmin, 30px);
  font-weight: 800;
  color: var(--ink-soft);
}

/* ── 每张牌几个图案 ── */
.sizes {
  display: flex;
  gap: clamp(10px, 2vmin, 20px);
}

.size {
  display: grid;
  place-items: center;
  width: clamp(64px, 11vmin, 96px);
  height: clamp(64px, 11vmin, 96px);
  background: var(--bg-card);
  border-radius: 20px;
  box-shadow: var(--shadow);
}

.size.active {
  box-shadow:
    0 0 0 4px var(--accent-2),
    var(--shadow);
}

/* 点点排成一圈，个数就是每张牌的图案数 —— 不认字也看得出哪个更满 */
.size-dots {
  position: relative;
  display: block;
  width: 62%;
  height: 62%;
}

.size-dots i {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 22%;
  height: 22%;
  background: var(--accent-3);
  border-radius: 50%;
  transform: translate(-50%, -50%)
    rotate(calc(var(--k, 0) * 1turn / var(--n))) translateY(-150%);
}

.size-dots i:nth-child(1) {
  --k: 0;
}
.size-dots i:nth-child(2) {
  --k: 1;
}
.size-dots i:nth-child(3) {
  --k: 2;
}
.size-dots i:nth-child(4) {
  --k: 3;
}
.size-dots i:nth-child(5) {
  --k: 4;
}
.size-dots i:nth-child(6) {
  --k: 5;
}

/* ── 对局 ── */
.game {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: clamp(4px, 1vmin, 12px);
}

.exit-btn {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 5;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  font-size: 24px;
  background: var(--bg-card);
  border-radius: 50%;
  box-shadow: var(--shadow);
}

/*
 * 一人一半。对面那个人的半边整个转 180° —— 连比分一起转，
 * 这样两个人看到的布局完全一样（牌在自己这边，比分在牌外侧）。
 */
.seat {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  align-items: center;
  justify-content: center;
  gap: clamp(4px, 1vmin, 10px);
}

.seat.flipped {
  transform: rotate(180deg);
}

.seat.locked .card {
  animation: card-shake 380ms ease-in-out;
}

@keyframes card-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-9px) rotate(-1.5deg);
  }
  75% {
    transform: translateX(9px) rotate(1.5deg);
  }
}

.card-area {
  display: grid;
  flex: 1;
  min-height: 0;
  place-items: center;
  width: 100%;
  container-type: size;
}

/*
 * 圆牌：同时被宽和高卡住，取小的那个（和四子棋同一个坑，见 CLAUDE.md）。
 */
.card {
  position: relative;
  width: min(100cqw, 100cqh);
  aspect-ratio: 1;
  background: var(--bg-card);
  border-radius: 50%;
  box-shadow: var(--shadow-lg);
  container-type: inline-size;
}

/*
 * 图案本身。可点范围比看到的大一圈（铁律 2），所以 padding 给得比较足。
 * ⚠️ 这里是绝对定位元素，**百分比 padding 会按整张牌算**，所以用 cqw
 * （四子棋踩过：padding:7% 被按包含块算成 48px，棋子塌成一个点）。
 */
.pip {
  position: absolute;
  display: grid;
  place-items: center;
  min-width: 78px;
  min-height: 78px;
  padding: 3cqw;
  border-radius: 50%;
  transform: translate(-50%, -50%) rotate(var(--spin)) scale(var(--scale));
  transition:
    transform 160ms,
    background 160ms;
}

.pip-face {
  font-size: 19cqw;
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

/* 点对了：绿圈亮起来并转正，让孩子看清是哪个 */
.pip.hit {
  background: var(--accent-2);
  transform: translate(-50%, -50%) rotate(0deg) scale(calc(var(--scale) * 1.25));
  box-shadow: 0 0 0 6px rgba(6, 214, 160, 0.35);
}

/* 点错了：灰一下就好，不做失败叙事（铁律 4） */
.pip.missed {
  opacity: 0.35;
}

/* ── 比分 ── */
.score {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 12px;
}

.score-face {
  font-size: clamp(22px, 3.4vmin, 34px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.pips {
  display: flex;
  gap: 6px;
}

.pips i {
  width: clamp(10px, 1.6vmin, 16px);
  height: clamp(10px, 1.6vmin, 16px);
  background: rgba(61, 44, 30, 0.16);
  border-radius: 50%;
  transition: all 220ms;
}

.pips i.on {
  background: var(--accent-2);
  transform: scale(1.25);
}

@media (prefers-reduced-motion: reduce) {
  .how-pip.target,
  .seat.locked .card {
    animation: none;
  }
}
</style>
