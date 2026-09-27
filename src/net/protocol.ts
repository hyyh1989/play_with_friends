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
    }
  /** 我要做这个动作。服务端会自己校验合不合法，客户端的校验只是为了少发废包 */
  | { t: 'action'; action: unknown }
  /** 再来一次 */
  | { t: 'rematch' }

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

/** 先只做两个人。座位数写成常量是为了以后加人时有个明确的地方改 */
export const SEATS = 2
