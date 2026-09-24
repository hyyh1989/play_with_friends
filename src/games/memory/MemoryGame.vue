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
/*
 * solo = 自己玩；ai = 和电脑轮流；duo = 两个人轮流用同一台 iPad。
 *
 * duo 是"面对面一起玩"的最轻形态：不需要联网、房间号、账号，把 iPad 推来推去
 * 就行，和真的桌游一样。翻牌配对不用藏手牌，所以零额外设计。
 */
const mode = ref<'solo' | 'ai' | 'duo'>('solo')
/** 刚换人时把新玩家的头像放大亮一下 —— 两个人轮流时没有 AI 的停顿当信号 */
const handoffTo = ref<string | null>(null)
const pairs = ref<PairCount>(4)
const state = shallowRef<MemoryState | null>(null)

let mismatchTimer: number | undefined
let aiTimer: number | undefined
let handoffTimer: number | undefined

function clearTimers() {
  clearTimeout(mismatchTimer)
  clearTimeout(aiTimer)
}
onUnmounted(() => {
  clearTimers()
  clearTimeout(handoffTimer)
})

const aiAvatar = computed(() => (settings.avatar === '🐰' ? '🐻' : '🐰'))
const rows = computed(() => (state.value ? state.value.cards.length / 4 : 2))
const finished = computed(() => (state.value ? isFinished(state.value) : false))
const activeId = computed(() => (state.value ? currentPlayer(state.value) : null))

function start() {
  const players: PlayerRef[] = [{ id: 'child', kind: 'human', avatar: settings.avatar }]
  if (mode.value === 'ai') {
    players.push({ id: 'bear', kind: 'ai', avatar: aiAvatar.value, nameKey: 'ai.player1' })
  } else if (mode.value === 'duo') {
    players.push({ id: 'friend', kind: 'human', avatar: aiAvatar.value })
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
  (current, previous) => {
    clearTimers()
    if (!current || isFinished(current)) return

    // 换人了就把新玩家亮一下。两个人轮流时这是唯一的交接信号
    const now = currentPlayer(current)
    if (previous && now && now !== currentPlayer(previous) && current.players.length > 1) {
      handoffTo.value = now
      playSfx('tap')
      clearTimeout(handoffTimer)
      handoffTimer = window.setTimeout(() => (handoffTo.value = null), 1100)
    }

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
    <button class="corner-back pressable" :aria-label="$t('common.back')" @click="goHome">←</button>
    <div class="choices">
      <button
        class="choice pressable"
        :class="{ active: mode === 'solo' }"
        :aria-label="$t('memory.modeSolo')"
        @click="mode = 'solo'"
      >
        <span class="mode-avatars">
          <span class="mode-avatar">{{ settings.avatar }}</span>
        </span>
      </button>
      <button
        class="choice pressable"
        :class="{ active: mode === 'ai' }"
        :aria-label="$t('memory.modeAi')"
        @click="mode = 'ai'"
      >
        <span class="mode-avatars">
          <span class="mode-avatar">{{ settings.avatar }}</span>
          <span class="vs">VS</span>
          <span class="mode-avatar robot">{{ aiAvatar }}</span>
          <span class="robot-badge">🤖</span>
        </span>
      </button>
      <!-- 两个人用同一台 iPad 轮流：和上面那个的区别是对面不是机器人 -->
      <button
        class="choice pressable"
        :class="{ active: mode === 'duo' }"
        :aria-label="$t('memory.modeDuo')"
        @click="mode = 'duo'"
      >
        <span class="mode-avatars">
          <span class="mode-avatar">{{ settings.avatar }}</span>
          <span class="vs">VS</span>
          <span class="mode-avatar">{{ aiAvatar }}</span>
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
        <span class="preview">
          <span v-for="n in option * 2" :key="n" class="tile" />
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
        <template v-for="(player, index) in state?.players ?? []" :key="player.id">
          <span v-if="index > 0" class="vs">VS</span>
          <div class="player" :class="{ active: player.id === activeId }">
            <span class="avatar">{{ player.avatar }}</span>
            <div class="stars">
              <span v-for="n in state?.scores[player.id] ?? 0" :key="n" class="star">⭐</span>
            </div>
          </div>
        </template>
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
            <span class="card-side is-back" />
            <span class="card-side is-front">{{ card.symbol }}</span>
          </span>
        </button>
      </div>
    </div>

    <!-- 换人：把新玩家的头像放大亮一下，不挡操作 -->
    <div v-if="handoffTo" class="handoff">
      <span class="handoff-avatar">{{
        state?.players.find((p) => p.id === handoffTo)?.avatar
      }}</span>
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
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(16px, 4vmin, 40px);
  height: 100%;
}

/* 选项页也要能退出去：不然进错游戏就只能靠系统手势 */
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

/* 和电脑玩那一项，给对手头像加个机器人角标，和"两个人玩"区分开 */
.mode-avatars {
  position: relative;
}

.robot-badge {
  position: absolute;
  right: -6px;
  bottom: -8px;
  font-size: clamp(14px, 2.2vmin, 20px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
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
  font-size: clamp(80px, 18vmin, 170px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  filter: drop-shadow(0 6px 12px rgba(61, 44, 30, 0.4));
  animation: handoff-pop 1.1s ease-out;
}

@keyframes handoff-pop {
  0% { transform: scale(0.4); opacity: 0; }
  25% { transform: scale(1.1); opacity: 1; }
  70% { transform: scale(1); opacity: 1; }
  100% { transform: scale(1); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .handoff-avatar { animation: none; }
}

.mode-avatars {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mode-avatar {
  font-size: clamp(30px, 5vmin, 46px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

/* 两个头像之间的 VS：一眼看出这是"你跟它比" */
.vs {
  align-self: center;
  padding: 3px 9px;
  font-size: clamp(12px, 1.8vmin, 16px);
  font-weight: 900;
  font-style: italic;
  color: #fff;
  background: var(--accent-3);
  border-radius: 999px;
}

/*
 * 方块尺寸固定、整块随牌数长高 —— 三个选项必须一眼能分出大中小。
 * 早先把预览框定成同样大小，结果 4/6/8 对牌画出来几乎一模一样，
 * 孩子根本没法靠看来选。
 */
.preview {
  --tile: clamp(10px, 1.8vmin, 18px);
  display: grid;
  grid-template-columns: repeat(4, var(--tile));
  gap: 4px;
}

.tile {
  width: var(--tile);
  height: var(--tile);
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
  /* 让图案能按【卡片】大小缩放，而不是按屏幕 —— 4 对牌时卡片很大，
     跟着屏幕算出来的字号会显得图案缩在中间一小团 */
  container-type: size;
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

/*
 * 正反两面必须严格同尺寸（inset:0），翻牌只是转过来、不改变大小。
 * 注意别再用 .back / .front 这种泛名字 —— scoped 样式只隔离组件之间，
 * 同一个组件里 HUD 的返回按钮曾经也叫 .back，把卡背压成了 56×56 的小圆。
 */
.card-side {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  border-radius: clamp(10px, 2vmin, 20px);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.is-back {
  background: linear-gradient(145deg, var(--accent-4), #2f9ed1);
  box-shadow: var(--shadow);
}

.is-front {
  /* 第一条是不支持容器查询单位时的兜底，第二条支持时生效 */
  font-size: clamp(26px, 7vmin, 64px);
  font-size: 48cqmin;
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  background: var(--bg-card);
  box-shadow: var(--shadow);
  transform: rotateY(180deg);
}

.card.matched .inner {
  animation: found 420ms ease-out;
}

.card.matched .is-front {
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
