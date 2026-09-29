/**
 * 服务端认识的游戏。
 *
 * ⚠️ **只能 import `rules.ts`，绝不能 import `games/<名字>/index.ts`** ——
 * 后者会把 .vue 组件一起拖进来，Worker 里没有浏览器也没有 Vue，打包直接失败。
 * 这也是为什么规则引擎当初被要求写成纯函数、和 UI 完全分开（铁律 3）：
 * **服务端和单机跑的是同一份代码，一行不用重写。**
 *
 * 加新游戏就在下面多一行 —— 网络层不用动。
 */
import type { GameConfig } from '../src/core/types'

import * as connect4 from '../src/games/connect4/rules'
import * as memory from '../src/games/memory/rules'
import * as dobble from '../src/games/dobble/rules'
import * as uno from '../src/games/uno/rules'

/**
 * 服务端需要的最小接口 —— `GameModule` 去掉 meta / AI / 组件之后剩下的部分。
 */
export interface GameRules<S = unknown, A = unknown> {
  createInitialState(config: GameConfig): S
  applyAction(state: S, action: A): S
  getLegalActions(state: S, playerId: string): A[]
  currentPlayer(state: S): string | null
  isFinished(state: S): boolean
  getWinner(state: S): string | null
  /**
   * 发给某一个玩家的那一份局面 —— **把他不该看见的东西去掉**（2026-09-29 补的）。
   *
   * 没有隐藏信息的游戏不用实现（四子棋、找相同都是明的，棋盘和图案人人看得见）。
   * 实现了的话 `broadcast()` 就会按收件人各裁一份，而不是所有人收到同一坨。
   *
   * ⚠️ **翻牌配对以后要联机的话必须补上** —— `cards[].symbol` 是整个牌面布局，
   * 而"记住牌在哪"就是那个游戏本身，能读到 state 等于过目不忘，比 UNO 还该管。
   */
  redactFor?(state: S, playerId: string): S
}

export const SERVER_GAMES: Record<string, GameRules<any, any>> = {
  connect4,
  memory,
  dobble,
  uno,
}

export function rulesFor(gameId: string): GameRules<any, any> | null {
  return SERVER_GAMES[gameId] ?? null
}
