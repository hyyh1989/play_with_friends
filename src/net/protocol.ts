/**
 * 联机协议 —— 客户端和服务端**共用这一份**。
 *
 * 改这里要同时想清楚两边：Worker 里的 Durable Object 和浏览器里的 room-client
 * 都 import 它，所以消息格式不会对不上。
 *
 * 设计基调：**服务器权威**。客户端只发「我想做这个动作」，
 * 规则跑在服务端（和单机跑的是同一份纯函数），服务端算完把新状态广播回来。
 * 客户端永远不自己推进游戏状态 —— 它只是个显示器。
 */

/** 房间号用的图案。挑的规矩：一眼分得出、5 岁叫得出名字、iOS 和安卓都有 */
export const CODE_ICONS = [
  '🐻',
  '🐰',
  '🐱',
  '🦊',
  '🐼',
  '🐯',
  '🚗',
  '🚀',
  '⭐',
  '🌙',
  '🍎',
  '⚽',
] as const

/** 房间号是几个图案 */
export const CODE_LEN = 3

/**
 * 房间号用图案不用数字，因为 5 岁读不出 "A7K2" 也打不进去。
 * 12 个图案取 3 个 = 1728 种，家用足够；重号了建房时会自动换一个。
 *
 * ⚠️ 存成字符串时用【下标】不用 emoji 本身 —— emoji 在 URL 和不同系统里
 * 会被编码成各种样子，下标 "0-7-8" 到哪儿都一样。
 */
export type RoomCode = string /* 形如 "0-7-8" */

export function codeToIcons(code: RoomCode): string[] {
  return code.split('-').map((i) => CODE_ICONS[Number(i)] ?? '❓')
}

export function iconsToCode(idx: number[]): RoomCode {
  return idx.join('-')
}

/** 房间号合法吗（服务端也要校验，别信客户端传上来的东西） */
export function isValidCode(code: string): boolean {
  const parts = code.split('-')
  if (parts.length !== CODE_LEN) return false
  return parts.every((p) => /^\d+$/.test(p) && Number(p) < CODE_ICONS.length)
}

/**
 * 房间的四个状态。
 *
 * waiting → playing ⇄ paused → over
 *
 * paused 是「有人掉线」：**局面完整保留**，等他回来。
 * 这不是异常分支，是**最常发生的一条路** —— 孩子会锁屏、会被叫去吃饭、会跑开。
 */
export type RoomPhase = 'waiting' | 'playing' | 'paused' | 'over'

export interface SeatInfo {
  playerId: string
  avatar: string
  /** 现在连着没有。掉线的人头像变灰，不报错、不写"连接中断" */
  online: boolean
}

/** 服务端广播的房间快照。游戏状态很小，直接全量发，不做增量 —— 增量的复杂度不值得 */
export interface RoomSnapshot {
  code: RoomCode
  gameId: string
  /** 这个房间打算几个人玩 */
  size: number
  phase: RoomPhase
  seats: SeatInfo[]
  /** 收到这条消息的人是第几号座位 */
  youIndex: number
  /** 游戏状态。waiting 时为 null */
  state: unknown | null
  /** 谁点了「再来一次」。两个人都点了才开下一局 */
  rematch: string[]
}

/** 客户端 → 服务端 */
export type ClientMessage =
  /**
   * 进门：带上自己的身份。**重连也走这条** —— 服务端靠 playerId 认人、坐回原位，
   * 所以掉线回来不用重新扫码，手牌还在。
   *
   * gameId / variant 只有【第一个进门的人】说了算，后面的人带了也会被忽略：
   * 房间玩什么由建房的人定。
   */
  | {
      t: 'join'
      playerId: string
      avatar: string
      gameId?: string
      variant?: Record<string, unknown>
      /** 打算几个人玩。和 gameId 一样，只有【第一个进门的人】说了算 */
      size?: number
    }
  /** 我要做这个动作。服务端会自己校验合不合法，客户端的校验只是为了少发废包 */
  | { t: 'action'; action: unknown }
  /** 再来一次 */
  | { t: 'rematch' }
  /**
   * 「就这些人，开始吧」—— 人没齐也先开。
   * 只有第一个进门的人（房主）能按，而且至少要有两个人。
   */
  | { t: 'startNow' }

/** 服务端 → 客户端 */
export type ServerMessage =
  | { t: 'room'; room: RoomSnapshot }
  | { t: 'error'; code: ErrorCode }

export type ErrorCode =
  /** 房间人满了 */
  | 'full'
  /** 这个动作不合法（不是你的回合，或者规则不允许） */
  | 'illegal'
  /** 房间号不对 */
  | 'badcode'
  /** 这个游戏服务端不认识 */
  | 'badgame'

/** 掉线之后局面保留多久。到点房间自己清掉 */
export const KEEP_ALIVE_MS = 10 * 60 * 1000

/** 一个房间最多几个人 */
export const MAX_SEATS = 4
/**
 * 房间默认几个座位。
 *
 * ⚠️ 默认满座（4）是有意的：**和真人玩时「几个人」这个选择没有意义** ——
 * 建房的人选了也不作数（人家来不来由不得你），加入的人选了更不作数
 * （房间已经定好了）。所以干脆谁来谁坐，**由房主决定什么时候开始**。
 * 用户实测后提的（2026-09-28），而且算下来点击更少：
 * 原来「选人数 → ▶ → 开房」三下，现在「开房 → 开始」两下。
 */
export const DEFAULT_SEATS = MAX_SEATS

/**
 * 这个房间打算几个人玩。**由建房的人定，存在房间里** ——
 * 以前是全局常量 `SEATS = 2`，那等于假设所有房间都是两个人。
 *
 * ⚠️ 对电脑来说「几个」是一个**选择**，立刻就能满足；
 * 对真人来说「几个」是一个**承诺**，要靠别人兑现 —— 第三个人可能永远不来。
 * 所以等人页必须有「就这些人，开始吧」这条兜底，别让房间卡死在等人上。
 */
export function clampSeats(n: unknown): number {
  const v = Math.round(Number(n))
  if (!Number.isFinite(v)) return DEFAULT_SEATS
  return Math.min(MAX_SEATS, Math.max(2, v))
}
