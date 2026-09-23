import type { GameMeta } from '../core/types'

/**
 * 真正能玩的游戏在这里登记（registerGame）。目前一个都没有——阶段 0 只搭地基。
 *
 * 阶段 1 起，每做完一个游戏就：
 *   1. import 它的模块并 registerGame(...)
 *   2. 从下面的 UPCOMING 里删掉对应那条
 */
export function registerAllGames(): void {
  // registerGame(memoryGame)   // 阶段 1
  // registerGame(snakesGame)   // 阶段 2
  // registerGame(unoGame)      // 阶段 3
}

/** 还没做的游戏。首页会显示成暗的卡片，让孩子知道"还有别的在路上"。 */
export const UPCOMING: GameMeta[] = [
  {
    id: 'memory',
    nameKey: 'games.memory.name',
    icon: '🧩',
    minPlayers: 1,
    maxPlayers: 2,
    estimatedMinutes: 5,
    supportsSolo: true,
  },
  {
    id: 'snakes',
    nameKey: 'games.snakes.name',
    icon: '🎲',
    minPlayers: 2,
    maxPlayers: 4,
    estimatedMinutes: 8,
    supportsSolo: false,
  },
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
