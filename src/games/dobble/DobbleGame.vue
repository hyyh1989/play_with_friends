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
import DobbleHint from './DobbleHint.vue'
import GameHelp from '../../components/GameHelp.vue'

/** 对上了以后，先把那个图案亮出来给孩子看清，再换下一局 */
const ROUND_FLASH_MS = 1200
/**
 * 选中之后有多久可以去点公共牌。
 *
 * 铁律 4 说"不做倒计时压力"，所以这里**不出数字、不出声**，
 * 只有一圈安静收缩的绿环，时间到了就悄悄取消。3.5 秒是给 5 岁的手留的余量。
 */
const PICK_WINDOW_MS = 3500
/** 公共牌被点错之后短暂不可点，让"乱按"讨不到便宜 */
const MISS_LOCK_MS = 600

const router = useRouter()
const settings = useSettingsStore()

const phase = ref<'setup' | 'playing'>('setup')
const mode = ref<'ai' | 'duo'>('ai')
const order = ref<DobbleOrder>(3)
const state = shallowRef<DobbleState | null>(null)
const showResult = ref(false)
/** 对上了正在展示的那一下；展示期间谁都不能点 */
const flash = ref<{ symbol: number; playerId: string } | null>(null)
/** 公共牌刚被点错，短暂冻结 */
const centerLocked = ref(false)
/** 刚点了公共牌却谁都没选 —— 用来提示"先点自己那张" */
const hintPickFirst = ref(false)
/** 右上角 ? 打开的示意 */
const showHelp = ref(false)

let timers: number[] = []
function later(fn: () => void, ms: number) {
  timers.push(window.setTimeout(fn, ms))
}
/**
 * AI 的闹钟和"选中限时"各自单独存一个，而不是丢进 timers。
 * 这两个都需要"重新定一次就把上一个撤掉"，混在一起会同时挂好几个。
 */
let aiTimer: number | null = null
let pickTimers: Record<string, number> = {}
function clearAiTimer() {
  if (aiTimer !== null) clearTimeout(aiTimer)
  aiTimer = null
}
function clearPickTimer(playerId: string) {
  if (pickTimers[playerId] !== undefined) clearTimeout(pickTimers[playerId])
  delete pickTimers[playerId]
}
function clearTimers() {
  timers.forEach(clearTimeout)
  timers = []
  clearAiTimer()
  Object.keys(pickTimers).forEach(clearPickTimer)
  pickTimers = {}
}
onUnmounted(clearTimers)

const aiAvatar = AI_AVATARS[0]
const friendAvatar = computed(() => AVATARS.find((a) => a !== settings.avatar) ?? AVATARS[1])

/** 对面那个人的整半边要转 180°，因为他坐在桌子对面 */
const seats = computed(() => {
  const players = state.value?.players ?? []
  return [
    { player: players[1], flipped: mode.value === 'duo' },
    { player: players[0], flipped: false },
  ].filter((s) => s.player)
})

const cardOf = (playerId: string) => state.value?.cards[playerId] ?? []
const scoreOf = (playerId: string) => state.value?.scores[playerId] ?? 0
const pickOf = (playerId: string) => state.value?.picks[playerId] ?? null

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
  centerLocked.value = false
  hintPickFirst.value = false
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

  const next = applyAction(current, action)
  if (next === current) return
  const result = next.feedback

  if (result?.kind === 'hit') {
    // 对上了：先把答案亮出来，亮完再换牌
    playSfx('success')
    flash.value = { symbol: result.symbol, playerId: result.playerId! }
    clearAiTimer()
    Object.keys(pickTimers).forEach(clearPickTimer)
    later(() => {
      flash.value = null
      state.value = next
    }, ROUND_FLASH_MS)
    return
  }

  state.value = next

  if (result?.kind === 'pick') {
    playSfx('tap')
    // 选中有时限：到点了安静地取消，不出声、不报错
    const who = result.playerId!
    clearPickTimer(who)
    pickTimers[who] = window.setTimeout(() => {
      delete pickTimers[who]
      dispatch({ type: 'clear', playerId: who })
    }, PICK_WINDOW_MS)
    return
  }

  if (result?.kind === 'miss') {
    playSfx('nope')
    centerLocked.value = true
    later(() => (centerLocked.value = false), MISS_LOCK_MS)
    return
  }

  if (result?.kind === 'needPick') {
    // 还没选就来点公共牌：抖一下公共牌，同时把自己那张牌整个亮一圈，指出方向
    playSfx('nope')
    hintPickFirst.value = true
    later(() => (hintPickFirst.value = false), 1100)
  }
}

/** 点自己（或对面那个人）的牌 = 选中 */
function tapOwn(playerId: string, symbol: number) {
  const player = state.value?.players.find((p) => p.id === playerId)
  // 电脑那张牌不给人点 —— 不然孩子替对手按了
  if (player?.kind !== 'human') return
  dispatch({ type: 'pick', playerId, symbol })
}

/**
 * 点中间的公共牌 = 确认。
 *
 * 不用判断是谁按的 —— 规则按"这一下对上了谁选中的那个"来认领。
 * 公共牌是两个人共用的，屏幕本来也分不清手指是谁的。
 */
function tapCenter(symbol: number) {
  if (centerLocked.value) return
  dispatch({ type: 'confirm', symbol })
}

function scheduleAi() {
  clearAiTimer()
  const current = state.value
  if (!current || isFinished(current) || flash.value) return
  const ai = current.players.find((p) => p.kind === 'ai')
  if (!ai) return

  aiTimer = window.setTimeout(() => {
    aiTimer = null
    const now = state.value
    if (!now || now !== current || flash.value || isFinished(now)) return
    const action = chooseAiAction(now, ai.id, settings.difficulty)
    if (action) dispatch(action)
  }, aiDelay(current, ai.id, settings.difficulty))
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
 * 图案摆在牌上的位置 + 每个能点多大的范围。
 *
 * 两条要求会打架：
 *   ① 位置要抖动 —— 整整齐齐排一圈的话，孩子会靠"第几个位置"去比对，而不是真的在看图案
 *   ② 可点范围要尽量大（铁律 2），但**绝不能互相压住**
 *
 * ⚠️ 压住过一次，而且很难发现：可点区是绝对定位的方块，重叠的地方归**后画的那个**。
 * 孩子瞄准一个图案、点在它边上，事件被邻居接走 → 判成点错 → 只是灰一下。
 * 从她的角度就是"我明明点对了，它抖一下就没反应了"（2026-09-24 用户实测反馈）。
 *
 * 所以可点范围不写死尺寸，而是**按这张牌的实际布局算**：
 * 每个图案的可点直径 = 它到最近邻居的距离。这样重叠在数学上就不可能发生。
 */
interface Spot {
  x: number
  y: number
  hit: number
}

function jitter(card: number[], slot: number, salt: number): number {
  let h =
    card.reduce((acc, s) => acc * 31 + s, 7) * 374761393 + slot * 668265263 + salt * 2246822519
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

/** 一张牌的完整布局。坐标和尺寸都是"占牌直径的几分之几" */
function layoutOf(card: number[]): Spot[] {
  const n = card.length
  /*
   * 5 个以上就往中间放一个，剩下的排一圈。
   * 全排一圈的话 6 个挨得太近，要么可点范围被压小，要么只能把圈撑大 ——
   * 撑大之后"对上了"的绿圈会戳到牌外面去（实测超出 17px）。
   */
  const hasCenter = n >= 5
  const ringCount = hasCenter ? n - 1 : n
  const baseRadius = 0.3
  const share = (Math.PI * 2) / ringCount

  const spots = card.map((_, slot) => {
    if (hasCenter && slot === 0) return { x: 0, y: 0, hit: 0 }
    const ringIndex = hasCenter ? slot - 1 : slot
    // 抖动只在自己那一格角度里晃，所以两个邻居最多把间距压掉一个固定比例
    const angle = ringIndex * share + (jitter(card, slot, 1) - 0.5) * share * 0.24
    const radius = baseRadius + jitter(card, slot, 2) * 0.03
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, hit: 0 }
  })

  spots.forEach((spot, i) => {
    // 到最近邻居的距离 = 可点直径的上限；0.42 是不越过牌边的上限
    let nearest = 0.42
    spots.forEach((other, j) => {
      if (i !== j) nearest = Math.min(nearest, Math.hypot(spot.x - other.x, spot.y - other.y))
    })
    spot.hit = nearest
  })

  return spots
}

function slotStyle(card: number[], slot: number) {
  const spot = layoutOf(card)[slot]
  return {
    left: `${50 + spot.x * 100}%`,
    top: `${50 + spot.y * 100}%`,
    '--hit': `${spot.hit * 100}cqw`,
    '--spin': `${(jitter(card, slot, 4) - 0.5) * 44}deg`,
    '--scale': String(0.85 + jitter(card, slot, 3) * 0.32),
  }
}
</script>

<template>
  <div v-if="phase === 'setup'" class="setup safe-area">
    <button class="corner-back pressable" :aria-label="$t('common.back')" @click="goHome">←</button>

    <!-- 规则示意：自己牌上点一个 → 公共牌上点同一个。不用文字 -->
    <DobbleHint />

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

    <!-- 每张牌几个图案。点点的个数就是图案数，不认字也看得出哪个更难 -->
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
    <GameHelp v-model:open="showHelp" voice="dobble.goal">
      <DobbleHint />
    </GameHelp>

    <template v-for="(seat, index) in seats" :key="seat.player!.id">
      <!-- 上面那半边 → 中间公共牌 → 下面那半边 -->
      <div class="seat" :class="{ flipped: seat.flipped }">
        <div class="card-area">
          <div class="card" :class="{ 'hint-me': hintPickFirst && seat.player!.kind === 'human' }">
            <button
              v-for="(symbol, slot) in cardOf(seat.player!.id)"
              :key="symbol"
              class="pip pressable"
              :class="{
                picked: pickOf(seat.player!.id)?.symbol === symbol,
                hit: flash?.symbol === symbol,
              }"
              :style="slotStyle(cardOf(seat.player!.id), slot)"
              :disabled="!!flash"
              :aria-label="String(symbol)"
              @click="tapOwn(seat.player!.id, symbol)"
            >
              <span class="pip-inner">
                <span class="pip-face">{{ symbolOf(symbol) }}</span>
                <!-- 选中的限时：一圈绿环慢慢收拢到图案上，不出数字不出声 -->
                <span
                  v-if="pickOf(seat.player!.id)?.symbol === symbol && !flash"
                  class="pick-ring"
                  aria-hidden="true"
                />
              </span>
            </button>
          </div>
        </div>
      </div>

      <!-- 公共牌夹在两个座位之间；比分放它两边，用掉横屏空出来的地方 -->
      <div v-if="index === 0" class="middle">
        <div
          v-for="p in state?.players ?? []"
          :key="`s${p.id}`"
          class="score"
          :class="{ flipped: mode === 'duo' && p.id !== 'child' }"
        >
          <span class="score-face">{{ p.avatar }}</span>
          <span class="pips">
            <i v-for="k in TARGET_SCORE" :key="k" :class="{ on: k <= scoreOf(p.id) }" />
          </span>
        </div>

        <div class="center-area">
          <div class="card is-center" :class="{ shaking: centerLocked || hintPickFirst }">
            <button
              v-for="(symbol, slot) in state?.center ?? []"
              :key="symbol"
              class="pip pressable"
              :class="{ hit: flash?.symbol === symbol }"
              :style="slotStyle(state?.center ?? [], slot)"
              :disabled="!!flash || centerLocked"
              :aria-label="String(symbol)"
              @click="tapCenter(symbol)"
            >
              <span class="pip-inner">
                <span class="pip-face">{{ symbolOf(symbol) }}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </template>

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
  transform: translate(-50%, -50%) rotate(calc(var(--k, 0) * 1turn / var(--n))) translateY(-150%);
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

/* ── 对局：上面一张 / 中间公共牌 / 下面一张 ── */
.game {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
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

.seat {
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.seat.flipped {
  transform: rotate(180deg);
}

/*
 * 中间这一条：公共牌居中，两个人的比分分列两边 ——
 * 横屏时左右本来是空的，正好用掉，公共牌也就不用跟上下两张抢高度。
 */
.middle {
  display: flex;
  flex: 0 0 auto;
  /*
   * 34% 不是凑出来的：公共牌要大到让上面的可点区 ≥ 80px（铁律 2），
   * 最难那档（每张 6 个图案）还要让"中心那个"和"一圈那些"不互相压住。
   * 算下来三张牌差不多一样大，视觉上也刚好。
   */
  height: 34%;
  align-items: center;
  justify-content: center;
  gap: clamp(10px, 3vmin, 40px);
}

.card-area {
  display: grid;
  flex: 1;
  min-height: 0;
  place-items: center;
  width: 100%;
  height: 100%;
  container-type: size;
}

.center-area {
  display: grid;
  place-items: center;
  height: 100%;
  aspect-ratio: 1;
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

/* 公共牌画一圈虚线边，一眼看出"这张是大家的" */
.card.is-center {
  border: 3px dashed rgba(61, 44, 30, 0.22);
  background: #fffdf6;
}

/* 还没选就去点公共牌时，把自己那张牌整个亮一圈，指出"先点这边" */
.card.hint-me {
  animation: hint-glow 1.1s ease-in-out;
}

@keyframes hint-glow {
  0%,
  100% {
    box-shadow: var(--shadow-lg);
  }
  30%,
  70% {
    box-shadow:
      0 0 0 8px rgba(6, 214, 160, 0.45),
      var(--shadow-lg);
  }
}

.card.shaking {
  animation: card-shake 380ms ease-in-out;
}

@keyframes card-shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-8px) rotate(-1.2deg);
  }
  75% {
    transform: translateX(8px) rotate(1.2deg);
  }
}

/*
 * 「能点多大」和「看起来多大」是两件事，必须分开：
 *   .pip       —— 透明的可点圆盘，尺寸由 layoutOf 按邻居间距算出来，保证互不重叠。
 *                 它可以戳出牌边一点，反正看不见。**不缩放**，一缩放就又可能压住邻居。
 *   .pip-inner —— 看得见的那一圈（图案 + 选中/对上的绿圈），只有图案那么大，
 *                 缩放、旋转、高亮都作用在它身上，所以绿圈永远在牌里面。
 *
 * ⚠️ 可点区用 border-radius 做成圆的不是为了好看 —— 浏览器的命中判定会遵守圆角，
 * 方的可点区在斜对角会互相压住，点在图案边上会被邻居接走（用户实测中招过）。
 */
.pip {
  position: absolute;
  display: grid;
  place-items: center;
  width: var(--hit);
  height: var(--hit);
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.pip-inner {
  position: relative;
  display: grid;
  place-items: center;
  padding: 2.4cqw;
  border-radius: 50%;
  transform: rotate(var(--spin)) scale(var(--scale));
  transition:
    transform 160ms,
    background 160ms,
    box-shadow 160ms;
}

.pip-face {
  font-size: 18cqw;
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

/* 选中了：绿圈 + 转正，告诉她"我知道你选的是这个" */
.pip.picked .pip-inner {
  background: rgba(6, 214, 160, 0.22);
  transform: rotate(0deg) scale(calc(var(--scale) * 1.06));
  box-shadow: 0 0 0 4px var(--accent-2);
}

/* 对上了：两张牌上的那个一起放大亮起来，让她看清"原来是同一个" */
.pip.hit .pip-inner {
  background: var(--accent-2);
  transform: rotate(0deg) scale(calc(var(--scale) * 1.14));
  box-shadow: 0 0 0 5px rgba(6, 214, 160, 0.35);
}

/*
 * 限时环：一圈绿环从外面慢慢收拢到图案上，收到贴着图案时这次选中就过期了。
 * 不出数字、不出声（铁律 4：不做倒计时压力）。
 *
 * 第一版做成"圆环沿着圈慢慢擦掉"（stroke-dashoffset），看起来像个转圈的加载中，
 * 而且压在图案上 —— 用户实测说"很突兀、和图案重叠了"。收缩读起来是"时间在收拢"，
 * 而且终点正好落在选中那圈绿边上，收完就跟它合成一个。
 */
.pick-ring {
  position: absolute;
  inset: 0;
  border: 3px solid var(--accent-2);
  border-radius: 50%;
  pointer-events: none;
  animation: ring-close 3500ms linear forwards;
}

@keyframes ring-close {
  from {
    scale: 1.45;
    opacity: 0.4;
  }
  to {
    scale: 1;
    opacity: 1;
  }
}

/* ── 比分 ── */
.score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.score.flipped {
  transform: rotate(180deg);
}

.score-face {
  font-size: clamp(22px, 3.4vmin, 34px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.pips {
  display: flex;
  flex-direction: column;
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
  .card.shaking,
  .card.hint-me {
    animation: none;
  }
}
</style>
