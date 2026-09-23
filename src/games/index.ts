import { registerGame } from '../core/game-registry'
import type { GameMeta } from '../core/types'
import { memoryGame } from './memory'
import { snakesGame } from './snakes'

/**
 * 真正能玩的游戏在这里登记。
 *
 * 每做完一个游戏就：① registerGame(...) ② 从下面的 UPCOMING 里删掉对应那条
 */
export function registerAllGames(): void {
  registerGame(memoryGame)
  registerGame(snakesGame)
  // registerGame(unoGame)      // 阶段 3
}

/** 还没做的游戏。首页会显示成暗的卡片，让孩子知道"还有别的在路上"。 */
export const UPCOMING: GameMeta[] = [
  {
    id: 'uno',
    nameKey: 'games.uno.name',
    icon: '🃏',
    minPlayers: 2,
    maxPlayers: 4,
    estimatedMinutes: 8,
    supportsSolo: false,
  },
]
