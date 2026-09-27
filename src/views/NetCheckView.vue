<script setup lang="ts">
import { computed, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { codeToIcons } from '../net/protocol'
import { connectRoom, createRoomCode, myPlayerId, type RoomConnection } from '../net/room-client'
import { COLS, ROWS, at, getLegalActions, type Connect4State } from '../games/connect4/rules'

/**
 * 联机自检页 —— **不是给孩子玩的，是给我们验证链路的。**
 *
 * 它故意长得很丑、全是文字：这一步要验证的是「两台设备能不能连上同一个房间、
 * 轮次对不对、掉线能不能坐回原位」，**不是**游戏好不好玩。
 * 把界面做漂亮会掩盖问题 —— 现在要的是把状态原样摊开。
 *
 * 用的是四子棋的规则（回合制、零隐藏信息、已经有 20 多条单测守着），
 * 但**不用它的界面**，棋盘直接打成文字。
 *
 * 首页不链接这里，走 #/net 进。验证完接真游戏时，这个页面留着当排查工具。
 */
const route = useRoute()
const router = useRouter()

/* ⚠️ 必须用 shallowRef。`ref()` 会把对象里嵌套的 ref **深度解包** ——
   那样 conn.value.connected 就变成了裸 boolean，而它是要跟着变的 Ref。 */
const conn = shallowRef<RoomConnection | null>(null)
const busy = ref(false)
const err = ref('')

const code = computed(() => String(route.params.code || ''))
const room = computed(() => conn.value?.room.value ?? null)
const state = computed(() => (room.value?.state as Connect4State | null) ?? null)

/** 轮到我没有 —— 服务端也会校验，这里只是为了少发废包 */
const myTurn = computed(() => {
  const r = room.value
  const s = state.value
  if (!r || !s || r.phase !== 'playing') return false
  const me = r.seats[r.youIndex]?.playerId
  return !!me && s.players[s.currentIndex]?.id === me
})

function start() {
  if (!code.value) return
  conn.value?.close()
  conn.value = connectRoom({
    code: code.value,
    gameId: 'connect4',
    avatar: '🐻',
  })
}

watch(code, start, { immediate: true })
onUnmounted(() => conn.value?.close())

async function openRoom() {
  busy.value = true
  err.value = ''
  try {
    const c = await createRoomCode()
    router.push('/net/' + c)
  } catch (e) {
    err.value = String(e)
  } finally {
    busy.value = false
  }
}

/** 随便走一步合法的 —— 这一步只验证同步，不验证下得好不好 */
function step() {
  const r = room.value
  const s = state.value
  if (!r || !s) return
  const me = r.seats[r.youIndex]?.playerId
  if (!me) return
  const legal = getLegalActions(s, me)
  if (legal.length) conn.value?.act(legal[Math.floor(Math.random() * legal.length)])
}

/** 棋盘打成文字：. 空 / A 一号位 / B 二号位 */
const board = computed(() => {
  const s = state.value
  if (!s) return ''
  const rows: string[] = []
  for (let r = 0; r < ROWS; r++) {
    let line = ''
    for (let c = 0; c < COLS; c++) {
      const who = s.board[at(r, c)]
      line += who === null ? '. ' : (s.players.findIndex((p) => p.id === who) === 0 ? 'A ' : 'B ')
    }
    rows.push(line)
  }
  return rows.join('\n')
})
</script>

<template>
  <div class="net">
    <h1>联机自检</h1>
    <p class="me">我的身份：<code>{{ myPlayerId() }}</code></p>

    <div v-if="!code" class="box">
      <button class="btn" :disabled="busy" @click="openRoom">开一个房间</button>
      <p v-if="err" class="err">{{ err }}</p>
      <p class="hint">开好之后把地址栏整串发给另一台设备，或者让它打开同一个 #/net/房间号</p>
    </div>

    <template v-else>
      <p class="code">房间号 <b>{{ codeToIcons(code).join(' ') }}</b> <small>({{ code }})</small></p>
      <p class="line">
        连接：<b :class="conn?.connected.value ? 'ok' : 'no'">
          {{ conn?.connected.value ? '连着' : '断了（会自己重连）' }}</b>
        <span v-if="conn?.lastError.value" class="err">　上次报错：{{ conn.lastError.value }}</span>
      </p>

      <template v-if="room">
        <p class="line">房间状态：<b>{{ room.phase }}</b>　我是第 {{ room.youIndex + 1 }} 号位</p>
        <p class="line">
          座位：
          <span v-for="(s, i) in room.seats" :key="s.playerId" class="seat">
            {{ i + 1 }}号 {{ s.avatar }}
            <b :class="s.online ? 'ok' : 'no'">{{ s.online ? '在' : '掉线' }}</b>
          </span>
          <span v-if="!room.seats.length">（还没人）</span>
        </p>

        <template v-if="state">
          <p class="line">
            轮到：<b>{{ state.players[state.currentIndex]?.avatar }}
              {{ myTurn ? '（是我）' : '（不是我）' }}</b>
          </p>
          <pre class="board">{{ board }}</pre>
          <button class="btn" :disabled="!myTurn" @click="step">
            {{ myTurn ? '随便走一步' : '等对方' }}
          </button>
          <button class="btn ghost" @click="conn?.act({ type: 'drop', col: 99 })">
            故意发个非法动作（应该被挡）
          </button>
        </template>

        <button v-if="room.phase === 'over'" class="btn" @click="conn?.rematch()">
          再来一次（{{ room.rematch.length }}/{{ room.seats.length }} 人点了）
        </button>
      </template>
      <p v-else class="hint">正在连…</p>
    </template>

    <button class="btn ghost" @click="router.push('/')">回首页</button>
  </div>
</template>

<style scoped>
.net {
  padding: 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 14px;
  line-height: 1.7;
}
h1 {
  font-size: 18px;
  margin: 0 0 12px;
}
.me,
.hint {
  color: var(--ink-soft);
  font-size: 12px;
}
.code b {
  font-size: 22px;
}
.line {
  margin: 4px 0;
}
.seat {
  margin-right: 12px;
}
.ok {
  color: #06d6a0;
}
.no {
  color: #ef476f;
}
.err {
  color: #ef476f;
}
.board {
  background: var(--bg-card);
  padding: 10px;
  border-radius: 8px;
  letter-spacing: 2px;
  font-size: 16px;
  display: inline-block;
}
.box {
  margin: 16px 0;
}
.btn {
  display: block;
  margin: 10px 0;
  padding: 12px 18px;
  font-weight: 700;
  color: #fff;
  background: var(--accent-2);
  border-radius: 10px;
}
.btn.ghost {
  color: var(--ink);
  background: var(--bg-card);
}
.btn:disabled {
  opacity: 0.4;
}
</style>
