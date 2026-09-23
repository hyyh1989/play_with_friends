import { nextInt, rollSuboptimal } from '../../core/rng'
import { SUBOPTIMAL_RATE, type Difficulty } from '../../core/types'
import {
  dominantColor,
  getLegalActions,
  type Card,
  type UnoAction,
  type UnoState,
} from './rules'

/**
 * UNO 的 AI。
 *
 * 和翻牌配对一样，难度靠**故意选次优解的概率**调，不靠算得更深（见 core/types.ts）。
 * 功能牌越多，AI 的"次优"越容易被孩子察觉成"它也会犯错"，这正是我们要的。
 *
 * 它的正常判断只有三条朴素规则，不需要更聪明：
 * - 能出普通牌就先出，万能牌留到没牌可出时再用
 * - 手里同色牌多的颜色优先留着，所以万能牌指定颜色就选手里最多的那种
 * - 下家快出完了（≤2 张），优先甩功能牌拦一下
 */

type PlayAction = Extract<UnoAction, { type: 'play' }>

export function chooseAiAction(
  state: UnoState,
  playerId: string,
  difficulty: Difficulty,
): UnoAction | null {
  const legal = getLegalActions(state, playerId)
  if (legal.length === 0) return null

  const plays = legal.filter((a): a is PlayAction => a.type === 'play')
  if (plays.length === 0) return { type: 'draw' }

  const [giveUpBest, rng] = rollSuboptimal(state.rng, SUBOPTIMAL_RATE[difficulty])
  if (giveUpBest) {
    const [index] = nextInt(rng, 0, plays.length - 1)
    return plays[index]
  }

  return bestPlay(state, playerId) ?? plays[0]
}

/** 按启发式选出的最优出牌。导出是为了能直接测"简单档偏离最优的次数更多"。 */
export function bestPlay(state: UnoState, playerId: string): PlayAction | null {
  const plays = getLegalActions(state, playerId).filter(
    (a): a is PlayAction => a.type === 'play',
  )
  if (plays.length === 0) return null

  const hand = state.hands[playerId] ?? []
  const nextCount = nextPlayerCardCount(state)
  const best = plays.reduce((a, b) =>
    score(cardOf(state, playerId, b), nextCount) >= score(cardOf(state, playerId, a), nextCount)
      ? b
      : a,
  )

  const card = cardOf(state, playerId, best)
  const isWild = card?.kind === 'wild' || card?.kind === 'wild4'
  return isWild ? { ...best, chosenColor: dominantColor(hand, state.activeColor) } : best
}

function cardOf(state: UnoState, playerId: string, action: PlayAction): Card | undefined {
  return state.hands[playerId]?.find((c) => c.id === action.cardId)
}

function nextPlayerCardCount(state: UnoState): number {
  const count = state.players.length
  const index = (state.currentIndex + state.direction + count) % count
  const next = state.players[index]
  return state.hands[next.id]?.length ?? 99
}

function score(card: Card | undefined, nextCount: number): number {
  if (!card) return -1
  const blocking = nextCount <= 2 ? 6 : 0
  switch (card.kind) {
    // 万能牌是最后的退路，能出别的就别浪费
    case 'wild':
      return 0.5
    case 'wild4':
      return 0.4 + blocking
    case 'draw2':
      return 4 + blocking
    case 'skip':
    case 'reverse':
      return 3 + blocking
    default:
      // 数字大的先出，手里剩小牌更容易接上
      return 1 + (card.value ?? 0) / 20
  }
}
