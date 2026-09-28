import {
  KEEP_ALIVE_MS,
  SEATS,
  type ClientMessage,
  type RoomPhase,
  type RoomSnapshot,
  type ServerMessage,
} from '../src/net/protocol'
import type { GameConfig, PlayerRef } from '../src/core/types'
import { rulesFor, type GameRules } from './games'

/**
 * 一个房间 = 一个 Durable Object。
 *
 * ── 服务器权威 ──
 * 客户端只发「我想做这个动作」，**规则在这里跑**（和单机跑的是同一份纯函数），
 * 算完把新状态广播回去。客户端永远不自己推进状态，它只是个显示器。
 * 这样将来补防作弊只要加一层裁剪，不用重写同步逻辑。
 *
 * ── 为什么用 Hibernation API ──
 * `ctx.acceptWebSocket()` 而不是 `ws.accept()`：普通 accept 会让这个对象
 * **在 WebSocket 连着的全程都计费**（哪怕没人操作）。孩子把 app 开着放一边
 * 是常态，那样免费额度会被白白烧掉。用休眠 API 的话，没消息时对象会被卸下来，
 * 不计时长；代价是**内存里的东西会丢，所有状态必须写进 storage**。
 *
 * ── 状态机 ──
 *   waiting → playing ⇄ paused → over
 * `paused` 是「有人掉线」，**局面完整保留**。这不是异常分支，是最常发生的一条路。
 */

export interface Env {
  ROOM: DurableObjectNamespace
  ASSETS: Fetcher
}

interface Seat {
  playerId: string
  avatar: string
  online: boolean
  lastSeen: number
}

interface RoomData {
  code: string
  gameId: string
  variant?: Record<string, unknown>
  seats: Seat[]
  phase: RoomPhase
  state: unknown | null
  rematch: string[]
}

/** 每个 WebSocket 上挂的东西。休眠后内存没了，靠它认出这条连接是谁 */
interface SocketTag {
  playerId: string
}

export class Room implements DurableObject {
  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  /* ── 存档 ─────────────────────────────────────────────
     休眠会把内存清空，所以房间状态只认 storage 里的那一份。
     别加内存缓存 —— 缓存和休眠是天然打架的，省的那点读写不值得。 */
  private async read(): Promise<RoomData | null> {
    return (await this.ctx.storage.get<RoomData>('room')) ?? null
  }
  private async write(room: RoomData): Promise<void> {
    await this.ctx.storage.put('room', room)
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname.endsWith('/connect')) {
      if (req.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected websocket', { status: 426 })
      }
      const pair = new WebSocketPair()
      // 休眠版的 accept：没消息时这个对象会被卸下来，不计时长
      this.ctx.acceptWebSocket(pair[1])
      return new Response(null, { status: 101, webSocket: pair[0] })
    }
    if (url.pathname.endsWith('/peek')) {
      // 建房时用来挑一个没被占的号。房间号只有 1728 种，撞号了要换一个
      const room = await this.read()
      const occupied = !!room && room.seats.length > 0
      return Response.json({ occupied })
    }
    return new Response('not found', { status: 404 })
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let msg: ClientMessage
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw))
    } catch {
      return
    }
    if (msg.t === 'join') return this.onJoin(ws, msg)
    if (msg.t === 'action') return this.onAction(ws, msg.action)
    if (msg.t === 'rematch') return this.onRematch(ws)
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.onGone(ws)
  }
  async webSocketError(ws: WebSocket): Promise<void> {
    await this.onGone(ws)
  }

  /* ── 进门 / 重连 ──────────────────────────────────── */
  private async onJoin(ws: WebSocket, msg: Extract<ClientMessage, { t: 'join' }>) {
    const code = this.ctx.id.name ?? ''
    let room = await this.read()

    if (!room) {
      // 第一个进门的人建房，他说了算玩什么
      const gameId = msg.gameId ?? ''
      if (!rulesFor(gameId)) return send(ws, { t: 'error', code: 'badgame' })
      room = {
        code,
        gameId,
        variant: msg.variant,
        seats: [],
        phase: 'waiting',
        state: null,
        rematch: [],
      }
    }

    let seat = room.seats.find((s) => s.playerId === msg.playerId)
    if (seat) {
      /* 重连：坐回原位，局面还在。**这条不做的话整个功能不可用** ——
         iOS/安卓切后台 WebSocket 立刻断，而孩子一定会锁屏、会跑开。 */
      seat.online = true
      seat.lastSeen = Date.now()
      seat.avatar = msg.avatar || seat.avatar
      /* ⚠️ 顺序要紧：**先给新连接打上身份标记，再去踢旧的**。
         反过来的话，踢旧连接时新连接还没有标记，下面 onGone 里
         「是不是还有同名的活连接」就判不出来，人会被自己刚建立的连接踢下线。 */
      ws.serializeAttachment({ playerId: msg.playerId } satisfies SocketTag)
      // 同一个人开了第二个窗口：把旧的那条踢掉，免得两边都在收广播
      for (const old of this.ctx.getWebSockets()) {
        if (old !== ws && tagOf(old)?.playerId === msg.playerId) {
          try {
            old.close(1000, 'replaced')
          } catch {
            /* 已经断了 */
          }
        }
      }
    } else {
      if (room.seats.length >= SEATS) return send(ws, { t: 'error', code: 'full' })
      seat = { playerId: msg.playerId, avatar: msg.avatar, online: true, lastSeen: Date.now() }
      room.seats.push(seat)
    }

    // 新占座的那条连接也要打标记（重连那条上面已经打过了）
    ws.serializeAttachment({ playerId: msg.playerId } satisfies SocketTag)

    const everyoneHere = room.seats.length === SEATS && room.seats.every((s) => s.online)
    if (everyoneHere && room.phase === 'waiting') {
      room.state = this.newGame(room)
      room.phase = 'playing'
    } else if (everyoneHere && room.phase === 'paused') {
      room.phase = 'playing' // 人回来了，接着打
    }

    await this.write(room)
    await this.ctx.storage.deleteAlarm() // 有人在，别清房间
    this.broadcast(room)
  }

  /* ── 出牌 ────────────────────────────────────────── */
  private async onAction(ws: WebSocket, action: unknown) {
    const room = await this.read()
    if (!room || room.phase !== 'playing') return send(ws, { t: 'error', code: 'illegal' })
    const me = tagOf(ws)?.playerId
    if (!me || !room.seats.some((s) => s.playerId === me)) {
      return send(ws, { t: 'error', code: 'illegal' })
    }
    const rules = rulesFor(room.gameId)
    if (!rules) return send(ws, { t: 'error', code: 'badgame' })

    /* 轮次校验。`currentPlayer` 返回 null 表示这个游戏没有轮次
       （找相同是抢答，谁都能随时动），那就不拦。 */
    const turn = rules.currentPlayer(room.state)
    if (turn !== null && turn !== me) return send(ws, { t: 'error', code: 'illegal' })

    const next = rules.applyAction(room.state, action)
    /* 规则引擎对非法动作的约定是「原样返回」（不抛异常，因为孩子会乱点）。
       所以引用没变 = 这一步没被接受。 */
    if (next === room.state) return send(ws, { t: 'error', code: 'illegal' })

    room.state = next
    if (rules.isFinished(next)) room.phase = 'over'
    await this.write(room)
    this.broadcast(room)
  }

  /* ── 再来一次：两个人都点了才开 ───────────────────
     不设房主特权。只要一方能单独开局，另一方就会在没准备好时被拖进新一局 ——
     对孩子来说这是最容易哭的那种事。 */
  private async onRematch(ws: WebSocket) {
    const room = await this.read()
    if (!room || room.phase !== 'over') return
    const me = tagOf(ws)?.playerId
    if (!me) return
    if (!room.rematch.includes(me)) room.rematch.push(me)

    if (room.seats.every((s) => room.rematch.includes(s.playerId))) {
      room.state = this.newGame(room)
      room.phase = 'playing'
      room.rematch = []
    }
    await this.write(room)
    this.broadcast(room)
  }

  /* ── 掉线 ────────────────────────────────────────── */
  private async onGone(ws: WebSocket) {
    const me = tagOf(ws)?.playerId
    if (!me) return
    /*
     * ⚠️ 这个人可能刚用新连接回来了 —— **旧连接的 close 事件是异步的，
     * 常常比新连接的 join 晚到**。不判断就会把刚接回来的人立刻标成离线，
     * 房间转回 paused，界面永远停在「等一下哦」那三个跳点上。
     *
     * 实测中招（2026-09-28 用户 iPad 实测）：手机在浏览器里关掉再打开没事
     * （系统先干净地关了连接，close 排在 join 前面），
     * 而 iPad 上关掉「添加到主屏幕」的 app 时连接常常还挂着，顺序正好反过来。
     */
    const stillHere = this.ctx
      .getWebSockets()
      .some((o) => o !== ws && tagOf(o)?.playerId === me)
    if (stillHere) return

    const room = await this.read()
    if (!room) return
    const seat = room.seats.find((s) => s.playerId === me)
    if (!seat) return
    seat.online = false
    seat.lastSeen = Date.now()
    // 局面原样留着，等他回来
    if (room.phase === 'playing') room.phase = 'paused'
    await this.write(room)
    // 一直没人回来就把房间清掉，别占着
    await this.ctx.storage.setAlarm(Date.now() + KEEP_ALIVE_MS)
    this.broadcast(room)
  }

  async alarm(): Promise<void> {
    const room = await this.read()
    if (!room) return
    if (room.seats.some((s) => s.online)) return // 还有人在，不清
    await this.ctx.storage.deleteAll()
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.close(1000, 'expired')
      } catch {
        /* 已经断了 */
      }
    }
  }

  /* ── 工具 ────────────────────────────────────────── */
  private newGame(room: RoomData): unknown {
    const rules = rulesFor(room.gameId) as GameRules
    const players: PlayerRef[] = room.seats.map((s) => ({
      id: s.playerId,
      kind: 'human',
      avatar: s.avatar,
    }))
    const config: GameConfig = {
      players,
      difficulty: 'normal', // 两个真人对打，AI 难度用不上
      seed: Date.now(),
      variant: room.variant,
    }
    return rules.createInitialState(config)
  }

  /** 每个人收到的快照不一样（youIndex 不同），所以逐个发，不能广播同一个 blob */
  private broadcast(room: RoomData) {
    for (const ws of this.ctx.getWebSockets()) {
      const me = tagOf(ws)?.playerId
      const youIndex = room.seats.findIndex((s) => s.playerId === me)
      const snap: RoomSnapshot = {
        code: room.code,
        gameId: room.gameId,
        phase: room.phase,
        seats: room.seats.map((s) => ({
          playerId: s.playerId,
          avatar: s.avatar,
          online: s.online,
        })),
        youIndex,
        state: room.state,
        rematch: room.rematch,
      }
      send(ws, { t: 'room', room: snap })
    }
  }
}

function tagOf(ws: WebSocket): SocketTag | null {
  try {
    return (ws.deserializeAttachment() as SocketTag) ?? null
  } catch {
    return null
  }
}

function send(ws: WebSocket, msg: ServerMessage) {
  try {
    ws.send(JSON.stringify(msg))
  } catch {
    /* 连接已经没了 */
  }
}
