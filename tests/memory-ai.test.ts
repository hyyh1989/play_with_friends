import { describe, expect, it } from 'vitest'
import { applyAction, createInitialState, type MemoryState } from '../src/games/memory/rules'
import { chooseAiAction } from '../src/games/memory/ai'
import type { GameConfig, Difficulty, PlayerRef } from '../src/core/types'

const child: PlayerRef = { id: 'child', kind: 'human', avatar: '🐻' }
const bear: PlayerRef = { id: 'bear', kind: 'ai', avatar: '🐰', nameKey: 'ai.player1' }

function setup(seed = 42, pairs = 6): MemoryState {
  const config: GameConfig = {
    players: [child, bear],
    difficulty: 'easy',
    variant: { pairs },
    seed,
  }
  return createInitialState(config)
}

function partnerOf(state: MemoryState, cardId: number): number {
  const symbol = state.cards[cardId].symbol
  return state.cards.find((c) => c.id !== cardId && c.symbol === symbol)!.id
}

/** 让 AI 成为当前玩家，并把一张牌翻开在台面上 */
function aiToMoveWithOneUp(state: MemoryState, cardId: number): MemoryState {
  return {
    ...state,
    currentIndex: 1,
    faceUp: [cardId],
    revealHistory: [{ id: cardId, symbol: state.cards[cardId].symbol }],
  }
}

describe('翻牌配对 AI', () => {
  it('轮不到它的时候不出手', () => {
    expect(chooseAiAction(setup(), 'bear', 'normal')).toBeNull()
  })

  it('台面上翻错两张时，它只会 resolve', () => {
    const state = setup()
    const first = 0
    const wrong = state.cards.find((c) => c.symbol !== state.cards[first].symbol)!.id
    const flipped = applyAction(
      applyAction({ ...state, currentIndex: 1 }, { type: 'flip', cardId: first }),
      { type: 'flip', cardId: wrong },
    )
    expect(chooseAiAction(flipped, 'bear', 'serious')).toEqual({ type: 'resolve' })
  })

  it('认真档：记得刚看过的那一半，就会去配对', () => {
    const state = setup()
    const open = 0
    const answer = partnerOf(state, open)

    // 让 AI 见过答案，再把 open 翻在台面上
    const withMemory: MemoryState = {
      ...aiToMoveWithOneUp(state, open),
      revealHistory: [
        { id: answer, symbol: state.cards[answer].symbol },
        { id: open, symbol: state.cards[open].symbol },
      ],
    }

    expect(chooseAiAction(withMemory, 'bear', 'serious')).toEqual({
      type: 'flip',
      cardId: answer,
    })
  })

  it('简单档记忆窗口只有 3 张，看得太久以前的就忘了', () => {
    const state = setup()
    const open = 0
    const answer = partnerOf(state, open)

    // 答案排在记录最前面，后面又压了 4 条无关记录 —— 超出简单档的窗口
    const noise = state.cards
      .filter((c) => c.id !== open && c.id !== answer)
      .slice(0, 4)
      .map((c) => ({ id: c.id, symbol: c.symbol }))

    const forgetful: MemoryState = {
      ...aiToMoveWithOneUp(state, open),
      revealHistory: [
        { id: answer, symbol: state.cards[answer].symbol },
        ...noise,
        { id: open, symbol: state.cards[open].symbol },
      ],
    }

    // 窗口足够大就记得
    expect(chooseAiAction(forgetful, 'bear', 'serious')).toEqual({ type: 'flip', cardId: answer })
    // 窗口小就忘了，只能乱翻（有可能瞎猫碰上死耗子，所以多试几个 seed）
    const guesses = [0, 1, 2, 3, 4].map((offset) =>
      chooseAiAction({ ...forgetful, rng: forgetful.rng + offset }, 'bear', 'easy'),
    )
    expect(guesses.some((g) => g && g.type === 'flip' && g.cardId !== answer)).toBe(true)
  })

  it('永远不会去翻已经收走的牌或台面上那张', () => {
    const difficulties: Difficulty[] = ['easy', 'normal', 'serious']
    for (const difficulty of difficulties) {
      let state: MemoryState = { ...setup(9), currentIndex: 1 }
      // 先收走一对
      const first = 0
      const second = partnerOf(state, first)
      state = applyAction(applyAction(state, { type: 'flip', cardId: first }), {
        type: 'flip',
        cardId: second,
      })

      for (let i = 0; i < 40; i++) {
        const action = chooseAiAction(state, 'bear', difficulty)
        if (!action || action.type === 'resolve') break
        expect(state.cards[action.cardId].matched).toBe(false)
        expect(state.faceUp).not.toContain(action.cardId)
        state = applyAction(state, action)
      }
    }
  })

  it('简单档整体上比认真档笨（用同一副牌跑完整局比较）', () => {
    const score = (difficulty: Difficulty, seed: number) => {
      let state: MemoryState = { ...setup(seed), currentIndex: 1 }
      // 只让 AI 一个人翻，看它翻完需要多少次
      state = { ...state, players: [bear], currentIndex: 0, scores: { bear: 0 } }
      let steps = 0
      while (!state.cards.every((c) => c.matched) && steps < 400) {
        const action = chooseAiAction(state, 'bear', difficulty)
        if (!action) break
        state = applyAction(state, action)
        steps++
      }
      return steps
    }

    const seeds = [1, 2, 3, 4, 5, 6, 7, 8]
    const easy = seeds.reduce((sum, s) => sum + score('easy', s), 0)
    const serious = seeds.reduce((sum, s) => sum + score('serious', s), 0)
    expect(easy).toBeGreaterThan(serious)
  })
})
