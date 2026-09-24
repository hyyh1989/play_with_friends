import { nextInt, rollSuboptimal } from '../../core/rng'
import { SUBOPTIMAL_RATE, type Difficulty } from '../../core/types'
import {
  applyAction,
  canDrop,
  COLS,
  getLegalActions,
  type Connect4Action,
  type Connect4State,
} from './rules'

/**
 * 四子棋的 AI。
 *
 * 只有三条朴素规则，不做搜索：
 *   1. 这一步能赢就赢
 *   2. 对手下一步能赢就堵
 *   3. 否则往中间放（中间的格子能连成更多条线）
 *
 * 难度照例靠"故意选次优解的概率"调（见 core/types.ts）。这个游戏有真正的技巧，
 * 所以降智在这里特别重要 —— 孩子要能赢。
 */
export function chooseAiAction(
  state: Connect4State,
  playerId: string,
  difficulty: Difficulty,
): Connect4Action | null {
  const legal = getLegalActions(state, playerId)
  if (legal.length === 0) return null

  const [beDumb, rng] = rollSuboptimal(state.rng, SUBOPTIMAL_RATE[difficulty])
  if (beDumb) {
    const [index] = nextInt(rng, 0, legal.length - 1)
    return legal[index]
  }

  return bestDrop(state, playerId) ?? legal[0]
}

/** 按启发式选出的最好一手。导出是为了能直接测"简单档偏离最优更多" */
export function bestDrop(state: Connect4State, playerId: string): Connect4Action | null {
  const legal = getLegalActions(state, playerId)
  if (legal.length === 0) return null

  // 1. 自己能赢
  for (const action of legal) {
    if (applyAction(state, action).winner === playerId) return action
  }

  // 2. 堵对手：把回合临时换成对手，看他丢这一列会不会赢
  const rivalIndex = state.players.findIndex((p) => p.id !== playerId)
  if (rivalIndex >= 0) {
    const rival = state.players[rivalIndex].id
    const asRival = { ...state, currentIndex: rivalIndex }
    for (const action of legal) {
      if (applyAction(asRival, action).winner === rival) return action
    }
  }

  // 3. 越靠中间越好
  const center = (COLS - 1) / 2
  return legal.reduce((a, b) =>
    Math.abs(b.col - center) < Math.abs(a.col - center) ? b : a,
  )
}

/** 界面用：这一列还能不能点 */
export function columnPlayable(state: Connect4State, col: number): boolean {
  return canDrop(state, col)
}
