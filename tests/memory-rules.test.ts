import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createInitialState,
  currentPlayer,
  getLegalActions,
  getWinner,
  isFinished,
  isMismatch,
  type MemoryState,
} from '../src/games/memory/rules'
import type { GameConfig, PlayerRef } from '../src/core/types'

const child: PlayerRef = { id: 'child', kind: 'human', avatar: '🐻' }
const bear: PlayerRef = { id: 'bear', kind: 'ai', avatar: '🐰', nameKey: 'ai.player1' }

function setup(players: PlayerRef[], pairs = 4, seed = 42): MemoryState {
  const config: GameConfig = { players, difficulty: 'easy', variant: { pairs }, seed }
  return createInitialState(config)
}

/** 找到某张牌的另一半 */
function partnerOf(state: MemoryState, cardId: number): number {
  const symbol = state.cards[cardId].symbol
  return state.cards.find((c) => c.id !== cardId && c.symbol === symbol)!.id
}

/** 找到一张和给定牌不同花色的牌 */
function differentFrom(state: MemoryState, cardId: number): number {
  const symbol = state.cards[cardId].symbol
  return state.cards.find((c) => c.symbol !== symbol)!.id
}

describe('翻牌配对 · 开局', () => {
  it('每张花色正好两张', () => {
    const state = setup([child], 6)
    const counts = new Map<string, number>()
    state.cards.forEach((c) => counts.set(c.symbol, (counts.get(c.symbol) ?? 0) + 1))
    expect(state.cards).toHaveLength(12)
    expect([...counts.values()].every((n) => n === 2)).toBe(true)
  })

  it('三档难度对应 8/12/16 张牌', () => {
    expect(setup([child], 4).cards).toHaveLength(8)
    expect(setup([child], 6).cards).toHaveLength(12)
    expect(setup([child], 8).cards).toHaveLength(16)
  })

  it('同一个 seed 洗出同样的牌面', () => {
    const a = setup([child], 6, 7)
    const b = setup([child], 6, 7)
    const c = setup([child], 6, 8)
    expect(a.cards).toEqual(b.cards)
    expect(a.cards).not.toEqual(c.cards)
  })
})

describe('翻牌配对 · 配对与回合', () => {
  it('翻对了本人继续翻，并且得一分', () => {
    const state = setup([child, bear])
    const first = 0
    const second = partnerOf(state, first)

    const afterFirst = applyAction(state, { type: 'flip', cardId: first })
    const afterSecond = applyAction(afterFirst, { type: 'flip', cardId: second })

    expect(afterSecond.cards[first].matched).toBe(true)
    expect(afterSecond.cards[second].matched).toBe(true)
    expect(afterSecond.scores.child).toBe(1)
    expect(afterSecond.faceUp).toEqual([])
    expect(currentPlayer(afterSecond)).toBe('child')
  })

  it('翻错了要等 resolve 才换人，两张牌先留在台面上', () => {
    const state = setup([child, bear])
    const first = 0
    const wrong = differentFrom(state, first)

    const flipped = applyAction(
      applyAction(state, { type: 'flip', cardId: first }),
      { type: 'flip', cardId: wrong },
    )

    expect(flipped.faceUp).toHaveLength(2)
    expect(isMismatch(flipped)).toBe(true)
    expect(currentPlayer(flipped)).toBe('child')

    const resolved = applyAction(flipped, { type: 'resolve' })
    expect(resolved.faceUp).toEqual([])
    expect(currentPlayer(resolved)).toBe('bear')
    expect(resolved.cards[first].matched).toBe(false)
  })

  it('翻错时唯一的合法动作是 resolve', () => {
    const state = setup([child, bear])
    const first = 0
    const wrong = differentFrom(state, first)
    const flipped = applyAction(
      applyAction(state, { type: 'flip', cardId: first }),
      { type: 'flip', cardId: wrong },
    )
    expect(getLegalActions(flipped, 'child')).toEqual([{ type: 'resolve' }])
  })

  it('不是你的回合就没有合法动作', () => {
    const state = setup([child, bear])
    expect(getLegalActions(state, 'bear')).toEqual([])
    expect(getLegalActions(state, 'child').length).toBeGreaterThan(0)
  })
})

describe('翻牌配对 · 非法操作原样返回，不抛异常', () => {
  it('翻已经收走的牌没有反应', () => {
    const state = setup([child])
    const first = 0
    const matched = applyAction(
      applyAction(state, { type: 'flip', cardId: first }),
      { type: 'flip', cardId: partnerOf(state, first) },
    )
    expect(applyAction(matched, { type: 'flip', cardId: first })).toBe(matched)
  })

  it('重复翻同一张牌没有反应', () => {
    const state = setup([child])
    const once = applyAction(state, { type: 'flip', cardId: 3 })
    expect(applyAction(once, { type: 'flip', cardId: 3 })).toBe(once)
  })

  it('已经翻开两张时再翻第三张没有反应', () => {
    const state = setup([child])
    const two = applyAction(
      applyAction(state, { type: 'flip', cardId: 0 }),
      { type: 'flip', cardId: differentFrom(state, 0) },
    )
    const third = state.cards.find((c) => !two.faceUp.includes(c.id))!.id
    expect(applyAction(two, { type: 'flip', cardId: third })).toBe(two)
  })

  it('台面上不足两张时 resolve 没有反应', () => {
    const state = setup([child])
    expect(applyAction(state, { type: 'resolve' })).toBe(state)
  })

  it('applyAction 不修改传进去的状态', () => {
    const state = setup([child])
    const snapshot = JSON.stringify(state)
    applyAction(state, { type: 'flip', cardId: 0 })
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})

describe('翻牌配对 · 结束与胜负', () => {
  /** 全部配对完 */
  function playAll(start: MemoryState): MemoryState {
    let state = start
    for (const card of start.cards) {
      if (state.cards[card.id].matched) continue
      state = applyAction(state, { type: 'flip', cardId: card.id })
      state = applyAction(state, { type: 'flip', cardId: partnerOf(state, card.id) })
    }
    return state
  }

  it('全部配对后游戏结束', () => {
    const state = playAll(setup([child], 4))
    expect(isFinished(state)).toBe(true)
    expect(getLegalActions(state, 'child')).toEqual([])
  })

  it('单人模式翻完就是赢 —— 没有失败这个状态', () => {
    const state = playAll(setup([child], 4))
    expect(getWinner(state)).toBe('child')
  })

  it('多人模式分高者胜，平局返回 null', () => {
    const state = playAll(setup([child, bear], 4))
    expect(getWinner(state)).toBe('child')

    const tied: MemoryState = { ...state, scores: { child: 2, bear: 2 } }
    expect(getWinner(tied)).toBeNull()
  })

  it('没结束时没有赢家', () => {
    expect(getWinner(setup([child]))).toBeNull()
  })
})
