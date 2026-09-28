import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import { KEEP_ALIVE_MS } from './protocol'
import type { ClientMessage, RoomSnapshot, ServerMessage, ErrorCode } from './protocol'

/**
 * 客户端的联机层。
 *
 * 它**只做三件事**：把动作发上去、把服务端的快照收下来、断了自己接回去。
 * **它不碰任何游戏规则**，也不认识任何具体游戏 —— 所以四个游戏共用这一份，
 * 以后加卡牌游戏也不用动它。
 *
 * ── 重连是这里最重要的部分 ──
 * iOS 和安卓都一样：app 一切到后台，WebSocket 立刻断。而孩子一定会锁屏、
 * 会被叫去吃饭、会跑开 —— 所以**断线不是异常，是最常走的那条路**。
 * 两条保障：
 *   1. 身份存在本机（playerId），重连时服务端靠它认人、坐回原位，手牌还在
 *   2. 一切回前台就立刻重连（visibilitychange），不等退避计时器慢慢爬
 */

const PLAYER_KEY = 'pwf.playerId'

/**
 * 这台设备的身份。**存在本机，一辈子不变** —— 重连、换局、关掉 app 再打开，
 * 服务端都靠它认出「还是这个人」。丢了就等于换了个人，会被当新玩家。
 */
export function myPlayerId(): string {
  try {
    const saved = localStorage.getItem(PLAYER_KEY)
    if (saved) return saved
    const id = 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
    localStorage.setItem(PLAYER_KEY, id)
    return id
  } catch {
    // 隐私模式之类的场景下存不了，退回一次性身份（刷新就换人，但至少能玩）
    return 'p_' + Math.random().toString(36).slice(2, 12)
  }
}

export interface RoomConnection {
  /** 服务端发来的最新房间快照。null = 还没连上 */
  room: ShallowRef<RoomSnapshot | null>
  /** 现在连着没有。界面用它显示「正在重连」 */
  connected: Ref<boolean>
  /** 最近一次错误 */
  lastError: Ref<ErrorCode | null>
  send(msg: ClientMessage): void
  act(action: unknown): void
  rematch(): void
  close(): void
}

export interface ConnectOptions {
  code: string
  gameId: string
  avatar: string
  variant?: Record<string, unknown>
}

export function connectRoom(opts: ConnectOptions): RoomConnection {
  const room = shallowRef<RoomSnapshot | null>(null)
  const connected = ref(false)
  const lastError = ref<ErrorCode | null>(null)

  const playerId = myPlayerId()
  let ws: WebSocket | null = null
  let closed = false
  let retry = 0
  let timer: number | null = null

  function url(): string {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${location.host}/api/room/${encodeURIComponent(opts.code)}/connect`
  }

  function open() {
    if (closed) return
    clearTimer()
    try {
      ws = new WebSocket(url())
    } catch {
      return scheduleRetry()
    }

    ws.onopen = () => {
      connected.value = true
      retry = 0
      send({
        t: 'join',
        playerId,
        avatar: opts.avatar,
        gameId: opts.gameId,
        variant: opts.variant,
      })
    }

    ws.onmessage = (ev) => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(String(ev.data))
      } catch {
        return
      }
      if (msg.t === 'room') {
        room.value = msg.room
        lastError.value = null
      } else if (msg.t === 'error') {
        lastError.value = msg.code
      }
    }

    ws.onclose = (ev) => {
      connected.value = false
      ws = null
      /*
       * 服务端说「你被同一个身份的新连接顶替了」—— **别再抢回来**。
       * 抢回来的话两个窗口会无限互踢：A 连上踢掉 B、B 自动重连踢掉 A、…
       * 实测每秒一个来回，日志刷屏，界面也跟着反复重画（2026-09-28 本地复现）。
       * 同一台设备开两个窗口就会这样，因为 localStorage 是整个站点共用的，
       * 两个窗口拿到的是同一个身份。
       */
      if (ev.reason === 'replaced') {
        closed = true
        return
      }
      scheduleRetry()
    }
    ws.onerror = () => {
      /* onclose 一定会跟着来，在那儿统一处理 */
    }
  }

  /* 退避重连：0.5 → 1 → 2 → 4 → 最多 5 秒。
     别退避得太狠 —— 家里网络断一下就回来了，等十几秒用户会以为坏了。 */
  function scheduleRetry() {
    if (closed || timer !== null) return
    const wait = Math.min(500 * Math.pow(2, retry++), 5000)
    timer = window.setTimeout(() => {
      timer = null
      open()
    }, wait)
  }
  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  /**
   * ⚠️ 这个监听是整个重连的关键。
   * iOS/安卓把 app 切到后台会立刻断开 WebSocket，而退避计时器在后台也不走 ——
   * 光靠它的话，回到前台还要干等好几秒。一回前台就立刻试一次。
   */
  function onVisible() {
    if (document.hidden || closed) return
    if (!connected.value) {
      retry = 0
      clearTimer()
      open()
    }
  }
  document.addEventListener('visibilitychange', onVisible)

  function send(msg: ClientMessage) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  open()

  return {
    room,
    connected,
    lastError,
    send,
    act: (action: unknown) => send({ t: 'action', action }),
    rematch: () => send({ t: 'rematch' }),
    close() {
      closed = true
      clearTimer()
      document.removeEventListener('visibilitychange', onVisible)
      try {
        ws?.close()
      } catch {
        /* 已经断了 */
      }
      ws = null
      connected.value = false
    },
  }
}

/** 找服务端要一个没被占的房间号 */
export async function createRoomCode(): Promise<string> {
  const res = await fetch('/api/new')
  if (!res.ok) throw new Error('开房失败')
  const { code } = (await res.json()) as { code: string }
  return code
}

/* ── 记住刚才在哪个房间 ──────────────────────────────────
   浏览器重开会自己回到原来那一页，但**「添加到主屏幕」的 app 每次都从头开**
   （start_url），于是 iPad 一关一开就忘了自己在哪个房间（用户实测中招）。
   存一下，首页给一条回去的路。

   有效期和服务端保留局面的时间一致（10 分钟）—— 过了那个点房间已经被清掉了，
   再给「回去」的入口就是骗人。 */
const LAST_ROOM_KEY = 'pwf.lastRoom'

export function rememberRoom(code: string, gameId: string): void {
  try {
    localStorage.setItem(LAST_ROOM_KEY, JSON.stringify({ code, gameId, at: Date.now() }))
  } catch {
    /* 存不了就算了，只是少一条捷径 */
  }
}

export function forgetRoom(): void {
  try {
    localStorage.removeItem(LAST_ROOM_KEY)
  } catch {
    /* 同上 */
  }
}

export function recentRoom(): { code: string; gameId: string } | null {
  try {
    const raw = localStorage.getItem(LAST_ROOM_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { code: string; gameId: string; at: number }
    if (!v?.code || Date.now() - (v.at || 0) > KEEP_ALIVE_MS) return null
    return { code: v.code, gameId: v.gameId || 'uno' }
  } catch {
    return null
  }
}
