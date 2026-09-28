<script setup lang="ts">
import { computed, onUnmounted, provide, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getGame } from '../core/game-registry'
import { useSettingsStore } from '../stores/settings'
import { codeToIcons } from '../net/protocol'
import { connectRoom, myPlayerId, type RoomConnection } from '../net/room-client'
import { GAME_NET, type GameNet } from '../net/game-net'

/**
 * 联机对局的外壳。
 *
 * 它负责**游戏本身不知道的那些事**：房间连上没有、人到齐没有、谁掉线了。
 * 游戏组件只管画牌桌 —— 它通过 GAME_NET 拿到状态和「我是谁」，
 * 其余和一个人玩时一模一样。
 *
 * 四个阶段各自显示什么：
 *   waiting  等人 —— 大大地显示房间号图案，这是要念给对方听的
 *   playing  就是游戏本身
 *   paused   有人掉线 —— 盖一层，对方头像变灰 + 「等一下哦」
 *            ⚠️ 不做倒计时、不写「连接中断」：5 岁会以为是自己弄坏了
 *   over     交给游戏自己的结算页（它的「再来一次」已经接到 net.rematch）
 */
const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()

const code = computed(() => String(route.params.code || ''))
const gameId = computed(() => String(route.query.g || 'uno'))
const game = computed(() => getGame(gameId.value))

const conn = shallowRef<RoomConnection | null>(null)
const state = shallowRef<unknown | null>(null)
const phase = ref<'waiting' | 'playing' | 'paused' | 'over'>('waiting')
const seats = ref<GameNet['seats']['value']>([])
const youIndex = ref(-1)
const connected = ref(false)

/* 提供给游戏组件的上下文。**先 provide 再连接** —— 组件挂载时就得拿到它，
   不然它会以为自己是本机模式。 */
const net: GameNet = {
  meId: myPlayerId(),
  state,
  phase,
  seats,
  youIndex,
  connected,
  act: (a) => conn.value?.act(a),
  rematch: () => conn.value?.rematch(),
}
provide(GAME_NET, net)

function start() {
  if (!code.value || !game.value) return
  conn.value?.close()
  conn.value = connectRoom({
    code: code.value,
    gameId: gameId.value,
    avatar: settings.avatar,
    variant: gameId.value === 'uno' ? { level: settings.unoLevel } : undefined,
  })
}
watch(code, start, { immediate: true })
onUnmounted(() => conn.value?.close())

/* 服务端的快照是唯一真相：原样搬进上下文，不做任何加工 */
watch(
  () => conn.value?.room.value,
  (room) => {
    if (!room) return
    state.value = room.state
    phase.value = room.phase
    seats.value = room.seats
    youIndex.value = room.youIndex
  },
)
watch(
  () => conn.value?.connected.value,
  (v) => (connected.value = !!v),
)

/** 掉线的是谁（用来显示"等一下哦"时把他的头像变灰） */
const awayFor = computed(() => seats.value.find((s) => !s.online) ?? null)
</script>

<template>
  <div class="netgame">
    <!-- 等人：房间号要大，这是要念给对方听的（"小熊、火箭、星星"） -->
    <div v-if="phase === 'waiting'" class="wait safe-area">
      <button class="corner-back pressable" :aria-label="$t('common.back')" @click="router.push('/')">
        ←
      </button>
      <p class="wait-t">{{ $t('net.tellFriend') }}</p>
      <div class="code">
        <span v-for="(ic, i) in codeToIcons(code)" :key="i" class="code-ic">{{ ic }}</span>
      </div>
      <div class="dots"><i /><i /><i /></div>
    </div>

    <!-- 对局：游戏组件自己画。联机的事它不用管 -->
    <component :is="game!.component" v-else />

    <!-- 掉线：盖一层。不报错、不倒计时，只说"等一下哦" -->
    <div v-if="phase === 'paused'" class="away">
      <span class="away-face">{{ awayFor?.avatar ?? '🙂' }}</span>
      <p>{{ $t('net.waitAMoment') }}</p>
      <div class="dots"><i /><i /><i /></div>
    </div>
  </div>
</template>

<style scoped>
.netgame {
  height: 100%;
}
.wait {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(16px, 4vmin, 34px);
  height: 100%;
  position: relative;
}
.wait-t {
  font-size: clamp(15px, 2.4vmin, 20px);
  color: var(--ink-soft);
}
.code {
  display: flex;
  gap: clamp(10px, 3vmin, 26px);
}
.code-ic {
  font-size: clamp(56px, 16vmin, 130px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}
/* 掉线的遮罩：压暗但看得见牌桌，让她知道"游戏还在，只是在等" */
.away {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 12px;
  background: rgba(61, 44, 30, 0.6);
  color: #fff;
}
.away-face {
  font-size: clamp(60px, 18vmin, 140px);
  line-height: 1;
  /* 变灰 —— 一眼看出"这个人不在"，但不带任何负面意味 */
  filter: grayscale(1);
  opacity: 0.75;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}
.away p {
  font-size: clamp(18px, 3vmin, 26px);
  font-weight: 700;
}
.dots {
  display: flex;
  gap: 8px;
}
.dots i {
  width: 10px;
  height: 10px;
  background: currentColor;
  border-radius: 50%;
  opacity: 0.3;
  animation: wait-bob 1.2s ease-in-out infinite;
}
.dots i:nth-child(2) {
  animation-delay: 0.15s;
}
.dots i:nth-child(3) {
  animation-delay: 0.3s;
}
.wait .dots i {
  background: var(--ink-soft);
}
@keyframes wait-bob {
  0%,
  60%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-5px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .dots i {
    animation: none;
  }
}
</style>
