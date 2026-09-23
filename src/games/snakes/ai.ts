import type { Difficulty } from '../../core/types'
import { getLegalActions, type SnakesAction, type SnakesState } from './rules'

/**
 * 蛇梯棋的 AI。
 *
 * 它只做一件事：轮到它就掷骰子。**这个游戏里没有任何选择**，所以也没有
 * 聪明和笨的区别 —— 难度设置对本游戏无效，SUBOPTIMAL_RATE 在这里用不上。
 *
 * 这不是偷懒，是这个游戏之所以适合 5 岁孩子的原因：输赢纯靠运气，
 * 孩子和大人、和 AI 的胜率完全一样，不存在"玩得不好"。
 */
export function chooseAiAction(
  state: SnakesState,
  playerId: string,
  _difficulty: Difficulty,
): SnakesAction | null {
  return getLegalActions(state, playerId)[0] ?? null
}
