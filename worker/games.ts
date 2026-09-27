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
 *
 * 将来要防作弊时，这里多一个 `redactFor(state, playerId)`，每个游戏各实现一个，
 * 网络层不用动。现在先不做：面对面玩，对手是爸爸，作弊要开发者工具。
 * **但公开发布前必须补上。**
 */
export interface GameRules<S = unknown, A = unknown> {
  createInitialState(config: GameConfig): S
  applyAction(state: S, action: A): S
  getLegalActions(state: S, playerId: string): A[]
  currentPlayer(state: S): string | null
  isFinished(state: S): boolean
  getWinner(state: S): string | null
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
