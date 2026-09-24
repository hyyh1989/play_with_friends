import { rollSuboptimal } from '../../core/rng'
import { SUBOPTIMAL_RATE, type Difficulty } from '../../core/types'
import {
  aiReactionMs,
  currentTarget,
  getLegalActions,
  type DobbleAction,
  type DobbleState,
} from './rules'

/**
 * 找相同的 AI。
 *
 * 这个游戏没有策略 —— 正确答案只有一个，找不找得到不是"棋力"问题。
 * 所以难度全靠**反应时间**：AI 总能看见答案，但它要"想"一会儿才点。
 * 简单档慢到孩子几乎总能先按到。
 *
 * 另外按铁律 5 保留"会犯错"：有一定概率先点错一个，
 * 点错要吃和人一样的冻结惩罚，孩子就又多了一个机会。
 */
export const REACTION_MS: Record<Difficulty, [number, number]> = {
  easy: [3800, 6500],
  normal: [2400, 3800],
  serious: [1300, 2100],
}

export function chooseAiAction(
  state: DobbleState,
  playerId: string,
  difficulty: Difficulty,
): DobbleAction | null {
  const legal = getLegalActions(state, playerId)
  if (legal.length === 0) return null

  const target = currentTarget(state)
  const [beDumb] = rollSuboptimal(state.rng, SUBOPTIMAL_RATE[difficulty])
  if (beDumb) {
    const wrong = legal.filter((a) => a.symbol !== target)
    if (wrong.length > 0) return wrong[state.round % wrong.length]
  }

  return legal.find((a) => a.symbol === target) ?? legal[0]
}

/** 这一局 AI 要等多久才出手。界面用它设定时器 */
export function aiDelay(state: DobbleState, difficulty: Difficulty): number {
  return aiReactionMs(state, REACTION_MS[difficulty])
}
