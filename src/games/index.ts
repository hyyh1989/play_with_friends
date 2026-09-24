import { registerGame } from '../core/game-registry'
import type { GameMeta } from '../core/types'
import { memoryGame } from './memory'
import { connect4Game } from './connect4'
import { unoGame } from './uno'

/**
 * 真正能玩的游戏在这里登记。
 *
 * 每做完一个游戏就：① registerGame(...) ② 从下面的 UPCOMING 里删掉对应那条
 */
export function registerAllGames(): void {
  registerGame(memoryGame)
  registerGame(connect4Game)
  registerGame(unoGame)
  /*
   * 蛇梯棋暂时下架（2026-09-24）：零选择 = 零参与感，用户实测后决定替换。
   * 代码留着没删，将来若做成"大富翁式棋盘 + 每格触发小游戏"还能复用棋盘和动画。
   *   registerGame(snakesGame)
   */
}

/** 还没做的游戏。首页会显示成暗的卡片，让孩子知道"还有别的在路上"。 */
export const UPCOMING: GameMeta[] = []
