<script setup lang="ts">
import { computed, onUnmounted, provide, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getGame } from '../core/game-registry'
import { useSettingsStore } from '../stores/settings'
import { codeToIcons } from '../net/protocol'
import {
  connectRoom,
  forgetRoom,
  myPlayerId,
  rememberRoom,
  type RoomConnection,
} from '../net/room-client'
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
/** 建房时带上的人数。加入别人的房间时这个值没用（房间已经定好了） */
const wantSize = computed(() => Number(route.query.n) || undefined)
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
  /* 记一下在哪个房间：主屏幕启动的 app 每次都从头开，不记的话一关一开就找不回来了 */
  rememberRoom(code.value, gameId.value)
  conn.value?.close()
  conn.value = connectRoom({
    code: code.value,
    gameId: gameId.value,
    avatar: settings.avatar,
    variant: gameId.value === 'uno' ? { level: settings.unoLevel } : undefined,
    size: wantSize.value,
  })
}
watch(code, start, { immediate: true })
onUnmounted(() => conn.value?.close())

/*
 * 服务端的快照是唯一真相：原样搬进上下文。
 *
 * ⚠️ 唯一的加工是**内容没变就不重新赋值**。服务端在很多时机都会广播
 * （有人进来、有人掉线、有人回来），这些时候游戏状态其实一个字没改；
 * 但 shallowRef 认的是对象引用，重新赋值会把游戏的 watch 叫醒一遍，
 * 于是最后那张牌被反复"打"出来（用户实测：重连时必播一次，来回重连会循环）。
 */
let lastStateJson = ''
watch(
  () => conn.value?.room.value,
  (room) => {
    if (!room) return
    const json = JSON.stringify(room.state ?? null)
    if (json !== lastStateJson) {
      lastStateJson = json
      state.value = room.state
    }
    /* 房间信息每次都更新 —— 掉线/回来要立刻反映到界面上 */
    phase.value = room.phase
    seats.value = room.seats
    youIndex.value = room.youIndex
  },
)
watch(
  () => conn.value?.connected.value,
  (v) => (connected.value = !!v),
)

/** 自己走掉：这是有意退出，别再给「回到刚才的房间」的入口 */
function leave() {
  forgetRoom()
  router.push('/')
}

/** 掉线的是谁（用来显示"等一下哦"时把他的头像变灰） */
const awayFor = computed(() => seats.value.find((s) => !s.online) ?? null)

/** 这个房间打算几个人 */
const size = computed(() => conn.value?.room.value?.size ?? 2)
/** 还差几个人 */
const missing = computed(() => Math.max(0, size.value - seats.value.length))
/** 我是不是房主（第一个进门的那个）。只有房主能提前开局 */
const isHost = computed(() => youIndex.value === 0)
/** 人没齐但已经够两个人了，房主可以先开 */
const canStartNow = computed(() => isHost.value && seats.value.length >= 2 && missing.value > 0)
</script>

<template>
  <div class="netgame">
    <!-- 等人：房间号要大，这是要念给对方听的（"小熊、火箭、星星"） -->
    <div v-if="phase === 'waiting'" class="wait safe-area">
      <button class="corner-back pressable" :aria-label="$t('common.back')" @click="leave">←</button>
      <p class="wait-t">{{ $t('net.tellFriend') }}</p>
      <div class="code">
        <span v-for="(ic, i) in codeToIcons(code)" :key="i" class="code-ic">{{ ic }}</span>
      </div>

      <!-- 已经来了谁 + 还差几个。空位画成虚线圈，不认字也数得出来 -->
      <div class="who">
        <span v-for="s in seats" :key="s.playerId" class="who-seat here">{{ s.avatar }}</span>
        <span v-for="n in missing" :key="'e' + n" class="who-seat empty" />
      </div>

      <div v-if="missing > 0" class="dots"><i /><i /><i /></div>

      <!-- 第三个人可能永远不来。房主随时能说「就这些人」 -->
      <button v-if="canStartNow" class="start-now pressable" @click="conn?.startNow()">
        {{ $t('net.startNow') }}
      </button>
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
/* 谁来了 / 还差谁 */
.who {
  display: flex;
  gap: clamp(8px, 2vmin, 16px);
}
.who-seat {
  display: grid;
  place-items: center;
  width: clamp(48px, 11vmin, 76px);
  height: clamp(48px, 11vmin, 76px);
  font-size: clamp(28px, 7vmin, 46px);
  line-height: 1;
  border-radius: 50%;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}
.who-seat.here {
  background: var(--bg-card);
  box-shadow: var(--shadow);
}
/* 空位画虚线圈：还差几个一眼数得出来，不用认字 */
.who-seat.empty {
  border: 3px dashed rgba(61, 44, 30, 0.25);
}
.start-now {
  padding: clamp(10px, 2vmin, 15px) clamp(18px, 4vmin, 30px);
  font-size: clamp(14px, 2.2vmin, 19px);
  font-weight: 700;
  color: #fff;
  background: var(--accent-2);
  border-radius: 999px;
  box-shadow: var(--shadow);
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
