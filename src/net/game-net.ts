import { inject, type InjectionKey, type Ref, type ShallowRef } from 'vue'
import type { RoomPhase, SeatInfo } from './protocol'

/**
 * 联机上下文 —— 游戏组件靠它知道「我现在是在联机，还是一个人玩」。
 *
 * 用 provide/inject 而不是 props：
 *   · 不用改 `GameModule` 接口，四个游戏的登记一行都不动
 *   · **不支持联机的游戏什么都不用做** —— 注不到就是 null，照常本机玩
 *
 * 游戏组件里的写法固定是这两句：
 *   const net = useGameNet()
 *   const meId = computed(() => net?.meId ?? 'child')
 * 然后所有原来写死 'child' 的地方换成 meId。
 */
export interface GameNet {
  /** 我是谁。本机玩时游戏自己用 'child'，联机时是这台设备的身份 */
  meId: string
  /** 服务端发来的游戏状态。**这是唯一的真相来源**，客户端不自己推进 */
  state: ShallowRef<unknown | null>
  phase: Ref<RoomPhase>
  seats: Ref<SeatInfo[]>
  /** 我坐第几号位 */
  youIndex: Ref<number>
  connected: Ref<boolean>
  /** 把动作发给服务端。**不要在本地先应用** —— 等服务端广播回来 */
  act(action: unknown): void
  rematch(): void
  /**
   * 我主动离开这个房间（不是掉线）。
   * 会把「刚才在哪个房间」的记录清掉 —— 主动走 = 不打算回去了，
   * 首页就不该再给「回到刚才的房间」的入口。
   */
  leave(): void
}

export const GAME_NET: InjectionKey<GameNet | null> = Symbol('game-net')

/** 没在联机就返回 null。游戏组件据此走本机那套 */
export function useGameNet(): GameNet | null {
  return inject(GAME_NET, null)
}
