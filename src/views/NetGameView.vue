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
  leave: forgetRoom,
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

/**
 * 「不等了」。和上面的 `leave` 只差一件事：**保留「回到刚才的房间」的入口。**
 *
 * 因为这两件事根本不一样：`leave` 是「我不玩了」，而这个是**「我不等了」** ——
 * 这一局还没打完，服务端也还留着（KEEP_ALIVE_MS）。对方十分钟后回来，
 * 两个人从首页那条入口进去就能接着打原来那手牌，不用重新发。
 * （打完一局之后的「回首页」走的是 `leave`，那个必须清掉 ——
 *   回去只会看到一局已经结束的牌，那条入口就是骗人的。）
 *
 * 顺手把时间戳刷新成"现在"：服务端那个 30 分钟的清理闹钟是从**最后一个人断开**
 * 开始算的，而入口的有效期原本从**进房间**那一刻算。一局打久了就会出现
 * 「房间还在、入口已经过期」。重新盖个章，两边的 30 分钟就对齐了。
 */
function stopWaiting() {
  rememberRoom(code.value, gameId.value)
  router.push('/')
}

/** 掉线的是谁（用来显示"等一下哦"时把他的头像变灰） */
const awayFor = computed(() => seats.value.find((s) => !s.online) ?? null)

/**
 * 我是不是房主。**房主 = 第一个还在线的人**，不是写死的 0 号座位。
 *
 * 写死的话，房主在等人页走掉就成了死局 —— 等人页不会转 paused，
 * 所以下面那个「不等了」也救不了，剩下的人只能看着三个点永远按不了开始。
 * 房主回来了位置自动让回去；这个身份只用来决定谁能按 ▶，换来换去没副作用。
 */
const isHost = computed(() => {
  const i = seats.value.findIndex((s) => s.online)
  return i >= 0 && i === youIndex.value
})
/** 在线的有几个。坐满 4 个的话服务端会自动开，不用按 ▶ */
const onlineCount = computed(() => seats.value.filter((s) => s.online).length)
/** 够两个**在线**的人，房主就能开 */
const canStartNow = computed(() => isHost.value && onlineCount.value >= 2)

/** 房间满了（多半是「这局已经开始了」——服务端把掉线的人留在了桌外） */
const roomFull = computed(() => conn.value?.lastError.value === 'full')

/* ── 等太久了：给一个出口 ──────────────────────────────
 * 15 秒不是拍脑袋：**能自动恢复的情况全都在 5 秒内完成** ——
 * 切出去再回来是 visibilitychange 立刻重连，wifi 抖一下的退避上限是 5 秒。
 * 再往后等只剩「她走开了」这一类，那是几分钟到几十分钟，多长的超时都救不了。
 * 所以 15 秒已经把可恢复的情况甩开三倍，等到 30 秒只是让孩子多盯半分钟空屏幕。
 *
 * ⚠️ 按钮只是**出现**，不会自动离开 —— 对方真回来了，遮罩连着它一起消失。
 * 所以早出现的代价很小，晚出现的代价是实打实的干等。
 */
const WAIT_LIMIT_MS = 15_000
const waitedTooLong = ref(false)
let waitTimer: number | null = null
watch(
  phase,
  (p) => {
    if (waitTimer !== null) clearTimeout(waitTimer)
    waitTimer = null
    waitedTooLong.value = false
    if (p !== 'paused') return
    waitTimer = window.setTimeout(() => {
      waitTimer = null
      waitedTooLong.value = true
    }, WAIT_LIMIT_MS)
  },
  { immediate: true },
)
onUnmounted(() => {
  if (waitTimer !== null) clearTimeout(waitTimer)
})
</script>

<template>
  <div class="netgame">
    <!-- 等人：房间号要大，这是要念给对方听的（"小熊、火箭、星星"） -->
    <div v-if="phase === 'waiting'" class="wait safe-area">
      <button class="corner-back pressable" :aria-label="$t('common.back')" @click="leave">←</button>

      <!--
        进不去了（多半是这局已经开始）。不报错、不讲原因，
        只说一句能懂的话 —— 左上角的 ← 就是出口。
      -->
      <template v-if="roomFull">
        <p class="wait-t">{{ $t('net.roomFull') }}</p>
      </template>
      <template v-else>
        <p class="wait-t">{{ $t('net.tellFriend') }}</p>
        <div class="code">
          <span v-for="(ic, i) in codeToIcons(code)" :key="i" class="code-ic">{{ ic }}</span>
        </div>

        <!--
          已经来了谁。**不画空位** —— 4 是上限不是期待，画出来会让人以为
          非得等够 4 个。谁来谁坐，房主说开始。
          掉线的变灰：▶ 只带在线的人上桌，不显示出来的话那个按钮就是骗人的。
        -->
        <div class="who">
          <span
            v-for="s in seats"
            :key="s.playerId"
            class="who-seat"
            :class="s.online ? 'here' : 'gone'"
            >{{ s.avatar }}</span
          >
        </div>
      </template>

      <!-- 房主：够两个在线的人就能开。用和选人页同一个 ▶，不用认字 -->
      <button v-if="canStartNow" class="go pressable" @click="conn?.startNow()">▶</button>
      <!-- 客人：等房主 -->
      <div v-else-if="!roomFull" class="dots"><i /><i /><i /></div>
    </div>

    <!-- 对局：游戏组件自己画。联机的事它不用管 -->
    <component :is="game!.component" v-else />

    <!-- 掉线：盖一层。不报错、不倒计时，只说"等一下哦" -->
    <div v-if="phase === 'paused'" class="away">
      <span class="away-face">{{ awayFor?.avatar ?? '🙂' }}</span>
      <p>{{ $t('net.waitAMoment') }}</p>
      <div class="dots"><i /><i /><i /></div>
      <!--
        等够 15 秒才出现的出口。在这之前故意什么都没有 ——
        对方多半几秒内就回来了，这时候摆个「不等了」只会诱着她按掉一局好好的游戏。
        走的是 `stopWaiting` 不是 `leave`：局面在服务端留着，
        首页的「回到刚才的房间」要保住，对方回来了还能接着打。
      -->
      <button v-if="waitedTooLong" class="quit pressable" @click="stopWaiting">
        {{ $t('net.stopWaiting') }}
      </button>
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
/* 掉线的遮罩：压暗但看得见牌桌，让她知道"游戏还在，只是在等" */
.who-seat.gone {
  opacity: 0.35;
  filter: grayscale(1);
}
.quit {
  margin-top: 8px;
  padding: 12px 28px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink);
  font-size: 20px;
  font-weight: 700;
}
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
