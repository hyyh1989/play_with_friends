import { nextInt, rollSuboptimal } from '../../core/rng'
import { SUBOPTIMAL_RATE, type Difficulty } from '../../core/types'
import { getLegalActions, type MemoryAction, type MemoryState } from './rules'

/**
 * AI 对手。
 *
 * 两层降智，都是为了让孩子能赢：
 * 1. 记忆窗口：AI 只记得最近翻开过的 N 张牌，更早的就"忘了"。这是记忆棋里
 *    最自然的一种笨 —— 它的行为看起来像个真的会忘事的玩伴，而不是故意让牌。
 * 2. 次优概率：即使记得，也有一定概率不用（见 core/types.ts 的 SUBOPTIMAL_RATE）。
 */

export const MEMORY_WINDOW: Record<Difficulty, number> = {
  easy: 3,
  normal: 8,
  serious: 24,
}

type FlipAction = Extract<MemoryAction, { type: 'flip' }>

export function chooseAiAction(
  state: MemoryState,
  playerId: string,
  difficulty: Difficulty,
): MemoryAction | null {
  const legal = getLegalActions(state, playerId)
  if (legal.length === 0) return null
  if (legal[0].type === 'resolve') return legal[0]

  const flips = legal as FlipAction[]
  const remembered = recall(state, MEMORY_WINDOW[difficulty])
  const best = findKnownMatch(state, flips, remembered)

  const [giveUpBest, rng] = rollSuboptimal(state.rng, SUBOPTIMAL_RATE[difficulty])
  if (!best || giveUpBest) return randomFlip(flips, rng)
  return best
}

/** AI 记得的牌：最近 N 次翻牌记录里还没被收走的，加上此刻摊在桌上的 */
function recall(state: MemoryState, window: number): Map<number, string> {
  const remembered = new Map<number, string>()
  for (const entry of state.revealHistory.slice(-window)) {
    if (!state.cards[entry.id].matched) remembered.set(entry.id, entry.symbol)
  }
  for (const id of state.faceUp) remembered.set(id, state.cards[id].symbol)
  return remembered
}

function findKnownMatch(
  state: MemoryState,
  flips: FlipAction[],
  remembered: Map<number, string>,
): FlipAction | null {
  const canFlip = (id: number) => flips.some((f) => f.cardId === id)

  // 已经翻开一张：找它的另一半
  if (state.faceUp.length === 1) {
    const openId = state.faceUp[0]
    const target = state.cards[openId].symbol
    for (const [id, symbol] of remembered) {
      if (id !== openId && symbol === target && canFlip(id)) return { type: 'flip', cardId: id }
    }
    return null
  }

  // 还没翻：看记忆里有没有凑得成的一对
  const bySymbol = new Map<string, number[]>()
  for (const [id, symbol] of remembered) {
    bySymbol.set(symbol, [...(bySymbol.get(symbol) ?? []), id])
  }
  for (const ids of bySymbol.values()) {
    const flippable = ids.filter(canFlip)
    if (flippable.length >= 2) return { type: 'flip', cardId: flippable[0] }
  }
  return null
}

function randomFlip(flips: FlipAction[], rng: number): FlipAction {
  const [index] = nextInt(rng, 0, flips.length - 1)
  return flips[index]
}
