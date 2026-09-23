<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import GameResult from '../../components/GameResult.vue'
import UnoCard from './UnoCard.vue'
import PointingHand from '../../components/PointingHand.vue'
import { playSfx, speak } from '../../core/audio'
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
import { allMastered, MASTERY, nextHint, recordSuccess, type Hint } from './coach'

const AI_THINK_MS = 900
const WIN_CELEBRATE_MS = 1800
/** 一张牌飞过去要多久 */
const FLY_MS = 420
/** 轮到孩子之后等多久还没动作，就轻轻指一下 */
const IDLE_MS = 5000

const router = useRouter()
const settings = useSettingsStore()

/*
 * ask = 问"要我教你吗"；setup = 选人数；playing = 对局。
 * 已经全部学会、或家长关掉教学的话，直接从 setup 开始，不再问。
 */
const phase = ref<'ask' | 'setup' | 'playing'>('setup')
const coachOn = ref(false)
const hint = shallowRef<Hint | null>(null)
const handRefs = new Map<string, HTMLElement>()
const swatchesEl = ref<HTMLElement | null>(null)
let turnStartedAt = 0
let coachTimer: number | undefined
let lastVoice = ''
const playerCount = ref(2)
const state = shallowRef<UnoState | null>(null)
const showResult = ref(false)
const busy = ref(false)
const pendingWildId = ref<string | null>(null)
const unoFlash = ref<string | null>(null)
/** 点了出不了的牌，抖一下给反馈 */
const shakingId = ref<string | null>(null)

/*
 * 飞牌动画。牌从哪来到哪去，孩子才看得懂"谁出了牌""我抽了一张"。
 * 做法：拿两端元素的实际位置，在最上层放一张牌从 A 补间到 B。
 * 牌桌上的牌其实已经更新了，飞过去的那张正好落在同一张牌上，所以看起来是连贯的。
 */
const pileEl = ref<HTMLElement | null>(null)
const discardEl = ref<HTMLElement | null>(null)
const handEl = ref<HTMLElement | null>(null)
const seatEls = new Map<string, HTMLElement>()
function setSeatRef(id: string, el: unknown) {
  if (el instanceof HTMLElement) seatEls.set(id, el)
  else seatEls.delete(id)
}

const flying = shallowRef<{ card?: Card; back?: boolean } | null>(null)
const flyStyle = ref<Record<string, string>>({})
/** 飞牌用自己的定时器：clearTimers 每次状态变化都会跑，会把它一起清掉 */
let flyTimer: number | undefined

function anchorOf(playerId: string): HTMLElement | null {
  return playerId === 'child' ? handEl.value : (seatEls.get(playerId) ?? null)
}

function flyCard(from: HTMLElement | null, to: HTMLElement | null, payload: { card?: Card; back?: boolean }) {
  if (!from || !to) return
  const a = from.getBoundingClientRect()
  const b = to.getBoundingClientRect()
  const width = Math.max(56, Math.min(b.width || 90, 110))
  const place = (r: DOMRect) => ({
    left: `${r.left + r.width / 2 - width / 2}px`,
    top: `${r.top + r.height / 2 - (width * 1.5) / 2}px`,
    width: `${width}px`,
  })
  flying.value = payload
  flyStyle.value = { ...place(a), transition: 'none' }
  // 必须等两帧：元素这一帧才刚创建，同一帧里改 transition 浏览器不会触发过渡
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flyStyle.value = {
        ...place(b),
        transition: `left ${FLY_MS}ms ease-in-out, top ${FLY_MS}ms ease-in-out`,
      }
    })
  })
  clearTimeout(flyTimer)
  flyTimer = window.setTimeout(() => (flying.value = null), FLY_MS + 80)
}

let timers: number[] = []
function later(fn: () => void, ms: number) {
  timers.push(window.setTimeout(fn, ms))
}
function clearTimers() {
  timers.forEach(clearTimeout)
  timers = []
}

onUnmounted(() => clearTimeout(flyTimer))
onUnmounted(clearTimers)
onUnmounted(() => clearInterval(coachTimer))

onMounted(() => {
  const needsTeaching = settings.tutorialEnabled && !allMastered(settings.coachProgress)
  if (needsTeaching) {
    phase.value = 'ask'
    void speak('uno.ask')
  }
})

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
  turnStartedAt = Date.now()
  clearInterval(coachTimer)
  if (coachOn.value) coachTimer = window.setInterval(evaluateHint, 500)
  playSfx('tap')
}

/** 开场选择：跟我学 / 直接玩 */
function startWithCoach() {
  coachOn.value = true
  playerCount.value = 2 // 教学时固定两人，少一个要做的决定
  start()
}

function skipCoach() {
  coachOn.value = false
  phase.value = 'setup'
  playSfx('tap')
}

/** 记下每张手牌对应的 DOM 元素，手指要靠它定位 */
function setHandRef(cardId: string, el: unknown) {
  if (el instanceof HTMLElement) handRefs.set(cardId, el)
  else handRefs.delete(cardId)
}

/** 现在该不该指、指哪里。每 500ms 跑一次，也在每次状态变化后跑 */
function evaluateHint() {
  if (!coachOn.value || !state.value || finished.value || !myTurn.value) {
    setHint(null)
    return
  }
  // 万能牌的选色弹层单独提示
  if (pendingWildId.value) {
    setHint({
      id: 'wildColor',
      target: { kind: 'colors' },
      voice: 'uno.wildColor',
      first: (settings.coachProgress.wildColor ?? 0) === 0,
    })
    return
  }
  setHint(nextHint(state.value, settings.coachProgress, Date.now() - turnStartedAt, IDLE_MS))
}

/** 同一条提示只念一次，别反复念到烦 */
function setHint(next: Hint | null) {
  if (next && next.voice !== lastVoice) {
    void speak(next.voice)
    lastVoice = next.voice
    // 纯告知类的提示没有对应动作，讲过就算数，否则会一直重复讲
    if (next.id === 'opponentCount') {
      settings.coachProgress = {
        ...settings.coachProgress,
        opponentCount: (settings.coachProgress.opponentCount ?? 0) + MASTERY,
      }
    }
  }
  if (!next) lastVoice = ''
  hint.value = next
}

/** 提示指向的那个 DOM 元素 */
const hintTarget = computed<HTMLElement | null>(() => {
  const h = hint.value
  if (!h) return null
  if (h.target.kind === 'pile') return pileEl.value
  if (h.target.kind === 'colors') return swatchesEl.value
  if (h.target.kind === 'opponent') {
    const first = state.value?.players.find((p) => p.id !== 'child')
    return first ? seatEls.get(first.id) ?? null : null
  }
  return handRefs.get(h.target.cardId) ?? null
})

function dispatch(action: UnoAction) {
  const current = state.value
  if (!current) return
  const next = applyAction(current, action)
  if (next === current) {
    playSfx('nope')
    return
  }
  // 孩子自己做对了一次，对应规则的熟练度 +1（做够几次提示就撤掉）
  if (coachOn.value && currentPlayer(current) === 'child') {
    const played =
      action.type === 'play'
        ? (current.hands.child ?? []).find((c) => c.id === action.cardId) ?? null
        : null
    settings.coachProgress = recordSuccess(settings.coachProgress, current, played)
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
      if (atUno[0] === 'child') void speak('uno.uno')
      later(() => (unoFlash.value = null), 1400)
    } else if (atUno.length === 0) {
      unoFlash.value = null
    }

    const event = current.lastEvent
    if (event?.type === 'play') {
      playSfx('flip')
      flyCard(anchorOf(event.playerId), discardEl.value, { card: event.card })
    }
    if (event?.type === 'draw') {
      playSfx('tap')
      const drawn = event.playerId === 'child' ? current.hands.child?.at(-1) : undefined
      flyCard(pileEl.value, anchorOf(event.playerId), drawn ? { card: drawn } : { back: true })
    }

    if (isFinished(current)) {
      playSfx('celebrate')
      // 说清楚"为什么结束了"—— 孩子出完最后一张牌时并不知道那就是赢
      if (getWinner(current) === 'child') void speak('uno.win')
      later(() => (showResult.value = true), WIN_CELEBRATE_MS)
      return
    }

    const player = current.players.find((p) => p.id === currentPlayer(current))
    if (player?.kind !== 'ai') {
      busy.value = false
      turnStartedAt = Date.now()
      evaluateHint()
      return
    }
    setHint(null)
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
  <!--
    问"要我教你吗"。不用文字问，用两张看得见的卡片：
    左边=一只手指着牌（跟我学），右边=牌桌和播放键（直接玩）。
    5 岁孩子理解不了"学习"这个抽象词，但看得懂这两张图。
  -->
  <div v-if="phase === 'ask'" class="setup safe-area">
    <button class="corner-back pressable" :aria-label="$t('common.back')" @click="goHome">←</button>
    <div class="choices">
      <button class="choice ask-choice pressable" :aria-label="$t('uno.teachMe')" @click="startWithCoach">
        <span class="ask-art">
          <span class="ask-card"><UnoCard :card="{ id: 'demo', kind: 'number', color: 'red', value: 5 }" /></span>
          <span class="ask-hand">👆</span>
        </span>
      </button>
      <button class="choice ask-choice pressable" :aria-label="$t('uno.justPlay')" @click="skipCoach">
        <span class="ask-art">
          <span class="ask-card dim"><UnoCard back /></span>
          <span class="ask-play">▶</span>
        </span>
      </button>
    </div>
  </div>

  <div v-else-if="phase === 'setup'" class="setup safe-area">
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
          <!-- 对手手牌：一个牌堆加一个数字就够了，铺开一排牌多了会很乱 -->
          <div class="opp-hand" :ref="(el) => setSeatRef(player.id, el as HTMLElement)">
            <span class="opp-card"><UnoCard back /></span>
            <span class="opp-count">{{ handCount(player.id) }}</span>
          </div>
        </div>
      </div>
    </header>

    <div class="table">
      <!-- 摸牌堆：叠起来才看得出是一摞可以抽的牌 -->
      <button
        ref="pileEl"
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
        <div ref="discardEl" class="discard-card">
          <UnoCard v-if="top" :card="top" />
        </div>
      </div>
    </div>

    <footer ref="handEl" class="hand-bar" :class="{ mine: myTurn, uno: unoFlash === 'child' }">
      <div class="hand">
        <button
          v-for="card in myHand"
          :key="card.id"
          :ref="(el) => setHandRef(card.id, el)"
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

    <div v-if="flying" class="flying" :style="flyStyle">
      <UnoCard :card="flying.card" :back="flying.back" />
    </div>

    <div v-if="pendingWildId" class="color-picker" @click.self="pendingWildId = null">
      <div ref="swatchesEl" class="swatches">
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

    <!-- 教学的手指：指着该点的东西，第一次教某条规则时把周围压暗 -->
    <PointingHand :target="hintTarget" :spotlight="hint?.first" />

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

/* 开场那两张"跟我学 / 直接玩"的图 */
.ask-choice {
  padding: clamp(16px, 3vmin, 30px);
}

.ask-art {
  position: relative;
  display: block;
  width: clamp(80px, 15vmin, 140px);
}

.ask-card {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  container-type: inline-size;
}

.ask-card.dim {
  opacity: 0.75;
}

.ask-hand {
  position: absolute;
  right: -14%;
  bottom: -10%;
  font-size: clamp(34px, 6vmin, 56px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  animation: poke-demo 1.2s ease-in-out infinite;
}

.ask-play {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 58%;
  aspect-ratio: 1;
  font-size: clamp(22px, 4vmin, 38px);
  color: #fff;
  background: var(--accent-2);
  border-radius: 50%;
  box-shadow: var(--shadow);
  transform: translate(-50%, -50%);
}

@keyframes poke-demo {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-5px, -12px);
  }
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

/* 对手手牌：一个牌堆 + 一个数字 */
.opp-hand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.opp-card {
  display: block;
  width: clamp(30px, 4.6vmin, 46px);
  aspect-ratio: 2 / 3;
  container-type: inline-size;
}

.opp-count {
  font-size: clamp(22px, 3.4vmin, 34px);
  font-weight: 900;
  color: var(--ink);
}

/* 飞行中的牌，压在所有东西上面 */
.flying {
  position: fixed;
  z-index: 20;
  aspect-ratio: 2 / 3;
  container-type: inline-size;
  pointer-events: none;
  filter: drop-shadow(0 6px 10px rgba(61, 44, 30, 0.35));
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
