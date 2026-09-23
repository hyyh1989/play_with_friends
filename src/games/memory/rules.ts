import { createRng, nextFloat, shuffle, type RngState } from '../../core/rng'
import type { GameConfig, PlayerRef } from '../../core/types'

/**
 * 翻牌配对的规则引擎。
 *
 * 纯函数：applyAction 不改入参、不碰 DOM、不用 Math.random。
 * 非法动作一律原样返回 state，而不是抛异常 —— 界面上孩子会乱点，
 * "点了没反应"比"崩一个错误"好得多。
 *
 * 时间不在这里：翻错的两张牌要停留一会儿再盖回去，那是界面的事，
 * 规则只提供 resolve 这个动作。
 */

/** 颜色区分度高、形状不易混淆 */
export const SYMBOLS = [
  '🍓',
  '🍌',
  '🍇',
  '🍊',
  '🐸',
  '🐬',
  '🦋',
  '🐘',
  '🌻',
  '🚗',
  '⭐',
  '🍉',
] as const

export const PAIR_OPTIONS = [4, 6, 8] as const
export type PairCount = (typeof PAIR_OPTIONS)[number]

export const COLUMNS = 4

export interface MemoryCard {
  id: number
  symbol: string
  matched: boolean
}

export interface MemoryState {
  cards: MemoryCard[]
  cols: number
  /** 当前翻开的牌（0、1 或 2 张） */
  faceUp: number[]
  players: PlayerRef[]
  currentIndex: number
  scores: Record<string, number>
  /** 翻了多少次（单人模式显示步数，但不做成压力） */
  moves: number
  /** 所有被翻开过的牌。AI 的"记忆"就是只看这份记录的最后 N 条 */
  revealHistory: Array<{ id: number; symbol: string }>
  rng: RngState
}

export type MemoryAction = { type: 'flip'; cardId: number } | { type: 'resolve' }

export function createInitialState(config: GameConfig): MemoryState {
  const pairs = (config.variant?.pairs as PairCount) ?? 6
  let rng = createRng(config.seed)

  const [pool, afterPool] = shuffle(SYMBOLS, rng)
  rng = afterPool
  const chosen = pool.slice(0, pairs)

  const [deck, afterDeck] = shuffle([...chosen, ...chosen], rng)
  rng = afterDeck

  return {
    cards: deck.map((symbol, id) => ({ id, symbol, matched: false })),
    cols: COLUMNS,
    faceUp: [],
    players: config.players,
    currentIndex: 0,
    scores: Object.fromEntries(config.players.map((p) => [p.id, 0])),
    moves: 0,
    revealHistory: [],
    rng,
  }
}

export function currentPlayer(state: MemoryState): string | null {
  return state.players[state.currentIndex]?.id ?? null
}

export function isFinished(state: MemoryState): boolean {
  return state.cards.every((card) => card.matched)
}

export function getWinner(state: MemoryState): string | null {
  if (!isFinished(state)) return null
  // 单人模式：翻完就是赢了。这里没有"失败"这个状态
  if (state.players.length === 1) return state.players[0].id

  const ranked = [...state.players].sort(
    (a, b) => (state.scores[b.id] ?? 0) - (state.scores[a.id] ?? 0),
  )
  const top = state.scores[ranked[0].id] ?? 0
  const tied = ranked.filter((p) => (state.scores[p.id] ?? 0) === top)
  return tied.length > 1 ? null : ranked[0].id
}

/** 翻开的两张是不是一对（只有在 faceUp 恰好 2 张时有意义） */
export function isMismatch(state: MemoryState): boolean {
  if (state.faceUp.length !== 2) return false
  const [a, b] = state.faceUp.map((id) => state.cards[id])
  return a.symbol !== b.symbol
}

export function getLegalActions(state: MemoryState, playerId: string): MemoryAction[] {
  if (currentPlayer(state) !== playerId || isFinished(state)) return []
  if (state.faceUp.length >= 2) return [{ type: 'resolve' }]
  return state.cards
    .filter((card) => !card.matched && !state.faceUp.includes(card.id))
    .map((card) => ({ type: 'flip', cardId: card.id }))
}

export function applyAction(state: MemoryState, action: MemoryAction): MemoryState {
  if (action.type === 'resolve') return resolve(state)
  return flip(state, action.cardId)
}

function flip(state: MemoryState, cardId: number): MemoryState {
  const card = state.cards[cardId]
  const illegal =
    !card || card.matched || state.faceUp.includes(cardId) || state.faceUp.length >= 2
  if (illegal) return state

  const faceUp = [...state.faceUp, cardId]
  const [, rng] = nextFloat(state.rng)
  const next: MemoryState = {
    ...state,
    faceUp,
    rng,
    revealHistory: [...state.revealHistory, { id: cardId, symbol: card.symbol }],
  }

  if (faceUp.length < 2) return next

  const [first, second] = faceUp.map((id) => state.cards[id])
  const moves = state.moves + 1

  if (first.symbol !== second.symbol) return { ...next, moves }

  // 配对成功：收走两张牌，本人继续翻（答对有奖励，不换人）
  const player = currentPlayer(state)
  return {
    ...next,
    moves,
    faceUp: [],
    cards: state.cards.map((c) =>
      c.id === first.id || c.id === second.id ? { ...c, matched: true } : c,
    ),
    scores: player ? { ...state.scores, [player]: (state.scores[player] ?? 0) + 1 } : state.scores,
  }
}

function resolve(state: MemoryState): MemoryState {
  if (state.faceUp.length < 2) return state
  return {
    ...state,
    faceUp: [],
    currentIndex: (state.currentIndex + 1) % state.players.length,
  }
}
