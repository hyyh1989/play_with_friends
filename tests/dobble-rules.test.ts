import { describe, expect, it } from 'vitest'
import {
  applyAction,
  buildDeck,
  createInitialState,
  currentTarget,
  getLegalActions,
  getWinner,
  isFinished,
  sharedSymbol,
  TARGET_SCORE,
  type DobbleOrder,
  type DobbleState,
} from '../src/games/dobble/rules'
import { chooseAiAction } from '../src/games/dobble/ai'
import { SYMBOLS } from '../src/games/dobble/symbols'
import type { Difficulty, GameConfig, PlayerRef } from '../src/core/types'

const child: PlayerRef = { id: 'child', kind: 'human', avatar: '🐻' }
const robot: PlayerRef = { id: 'ai1', kind: 'ai', avatar: '🤖', nameKey: 'ai.player1' }

function setup(order: DobbleOrder = 3, players = [child, robot], seed = 7): DobbleState {
  const config: GameConfig = { players, difficulty: 'easy', seed, variant: { order } }
  return createInitialState(config)
}

/** 这副牌里有没有哪两张共享的图案不是恰好一个 */
function badPairs(deck: number[][]): number {
  let bad = 0
  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      const shared = deck[i].filter((s) => deck[j].includes(s))
      if (shared.length !== 1) bad++
    }
  }
  return bad
}

describe('找相同 · 牌组的数学', () => {
  const orders: DobbleOrder[] = [2, 3, 5]

  it.each(orders)('阶数 %i：任意两张牌恰好共享一个图案', (order) => {
    expect(badPairs(buildDeck(order))).toBe(0)
  })

  it.each(orders)('阶数 %i：牌数和每张的图案数都对得上', (order) => {
    const deck = buildDeck(order)
    expect(deck).toHaveLength(order * order + order + 1)
    for (const card of deck) {
      expect(card).toHaveLength(order + 1)
      // 一张牌里不能有重复图案
      expect(new Set(card).size).toBe(order + 1)
    }
    // 用到的图案总数 = 牌数
    const all = new Set(deck.flat())
    expect(all.size).toBe(order * order + order + 1)
  })

  it('图案素材够最难那档用（31 个）', () => {
    const need = new Set(buildDeck(5).flat()).size
    expect(SYMBOLS.length).toBeGreaterThanOrEqual(need)
    // 而且不能有重复的图案，否则同一张牌上会出现两个一样的
    expect(new Set(SYMBOLS).size).toBe(SYMBOLS.length)
  })

  it('阶数必须是质数 —— 4 阶会坏掉（这条测试是用来记住原因的）', () => {
    // mod 4 不是域（2×2≡0），直线退化 → 会出现共享两个图案的牌对，
    // 孩子点了"对的"却被判错。所以 DobbleOrder 只允许 2/3/5。
    expect(badPairs(buildDeck(4))).toBeGreaterThan(0)
  })

  it('sharedSymbol 找的就是那一个', () => {
    const deck = buildDeck(3)
    const s = sharedSymbol(deck[0], deck[5])
    expect(deck[0]).toContain(s)
    expect(deck[5]).toContain(s)
  })
})

describe('找相同 · 一局怎么走', () => {
  it('开局两个人各一张牌，且恰好共享一个图案', () => {
    const state = setup()
    const a = state.cards.child
    const b = state.cards.ai1
    expect(a).toHaveLength(4)
    expect(b).toHaveLength(4)
    expect(a.filter((s) => b.includes(s))).toHaveLength(1)
    expect(currentTarget(state)).toBe(sharedSymbol(a, b))
  })

  it('没有"轮到谁"，两个人随时都能点', () => {
    const state = setup()
    expect(getLegalActions(state, 'child')).toHaveLength(4)
    expect(getLegalActions(state, 'ai1')).toHaveLength(4)
  })

  it('点对了加一分，并且换两张新牌', () => {
    const state = setup()
    const before = state.cards.child
    const next = applyAction(state, { type: 'tap', playerId: 'child', symbol: currentTarget(state) })
    expect(next.scores.child).toBe(1)
    expect(next.scores.ai1).toBe(0)
    expect(next.lastTap).toEqual({ playerId: 'child', symbol: currentTarget(state), correct: true })
    expect(next.cards.child).not.toEqual(before)
    // 新的一局同样恰好共享一个
    expect(next.cards.child.filter((s) => next.cards.ai1.includes(s))).toHaveLength(1)
  })

  it('点错了不扣分、不换牌 —— 只是这一下没用', () => {
    const state = setup()
    const wrong = state.cards.child.find((s) => s !== currentTarget(state))!
    const next = applyAction(state, { type: 'tap', playerId: 'child', symbol: wrong })
    expect(next.scores.child).toBe(0)
    expect(next.lastTap?.correct).toBe(false)
    expect(next.cards.child).toEqual(state.cards.child)
    expect(next.round).toBe(state.round)
  })

  it('点自己牌上没有的图案，没反应', () => {
    const state = setup()
    const notOnCard = [...Array(31).keys()].find((s) => !state.cards.child.includes(s))!
    expect(applyAction(state, { type: 'tap', playerId: 'child', symbol: notOnCard })).toBe(state)
    expect(applyAction(state, { type: 'tap', playerId: '不存在的人', symbol: 0 })).toBe(state)
  })

  it('先到 5 分就赢，赢了之后牌面不再变', () => {
    let state = setup()
    for (let i = 0; i < TARGET_SCORE; i++) {
      expect(isFinished(state)).toBe(false)
      state = applyAction(state, {
        type: 'tap',
        playerId: 'child',
        symbol: currentTarget(state),
      })
    }
    expect(state.scores.child).toBe(TARGET_SCORE)
    expect(getWinner(state)).toBe('child')
    expect(isFinished(state)).toBe(true)
    // 赢了停在这一局，让孩子看清是哪个图案
    const frozen = state.cards.child
    expect(applyAction(state, { type: 'tap', playerId: 'ai1', symbol: currentTarget(state) })).toBe(
      state,
    )
    expect(state.cards.child).toEqual(frozen)
    expect(getLegalActions(state, 'child')).toEqual([])
  })

  it('牌发完了会重新洗，一直玩得下去', () => {
    // 2 阶只有 7 张牌，每局发 2 张 → 第 4 局就得重洗
    let state = setup(2)
    for (let i = 0; i < 20; i++) {
      const target = currentTarget(state)
      expect(target).toBeGreaterThanOrEqual(0)
      expect(state.cards.child).toHaveLength(3)
      expect(state.cards.child).not.toEqual(state.cards.ai1)
      state = applyAction(state, { type: 'tap', playerId: 'child', symbol: target })
      if (isFinished(state)) state = setup(2, [child, robot], 100 + i)
    }
  })

  it('applyAction 不修改传进去的状态', () => {
    const state = setup()
    const snapshot = JSON.stringify(state)
    applyAction(state, { type: 'tap', playerId: 'child', symbol: currentTarget(state) })
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})

describe('找相同 AI', () => {
  it('认真档基本都能找到正确答案', () => {
    let right = 0
    for (let seed = 1; seed <= 20; seed++) {
      const state = setup(3, [child, robot], seed)
      const action = chooseAiAction(state, 'ai1', 'serious')!
      if (action.symbol === currentTarget(state)) right++
    }
    expect(right).toBeGreaterThan(16)
  })

  it('简单档经常点错 —— 孩子才抢得到', () => {
    let wrong = 0
    for (let seed = 1; seed <= 20; seed++) {
      const state = setup(3, [child, robot], seed)
      const action = chooseAiAction(state, 'ai1', 'easy')!
      if (action.symbol !== currentTarget(state)) wrong++
    }
    expect(wrong).toBeGreaterThan(5)
  })

  it('点错以后不会永远卡在同一个错答案上', () => {
    /*
     * 曾经的真 bug：点错时 rng 不推进 → 下一次"要不要故意犯错"的掷骰读到一样的值、
     * 挑中一样的那个错图案 → AI 永远卡在那儿，一分也拿不到。
     * 所以这里直接验机制：① 点错也要推进随机源 ② 卡住的局面能自己走出来。
     */
    const start = setup(3, [child, robot], 3)
    const wrong = start.cards.ai1.find((s) => s !== currentTarget(start))!
    const afterMiss = applyAction(start, { type: 'tap', playerId: 'ai1', symbol: wrong })
    expect(afterMiss.rng).not.toEqual(start.rng)

    // 找一个"AI 一上来就会点错"的局面，再看它几次之内能走出来
    let state = [1, 2, 3, 4, 5, 6, 7, 8]
      .map((seed) => setup(3, [child, robot], seed))
      .find((s) => chooseAiAction(s, 'ai1', 'easy')!.symbol !== currentTarget(s))!
    expect(state).toBeDefined()

    const tapped = new Set<number>()
    for (let i = 0; i < 12 && state.scores.ai1 === 0; i++) {
      const action = chooseAiAction(state, 'ai1', 'easy')!
      tapped.add(action.symbol)
      state = applyAction(state, action)
    }
    expect(state.scores.ai1).toBe(1)
    // 它确实换过答案，而不是一直点同一个
    expect(tapped.size).toBeGreaterThan(1)
  })

  it('简单档最终也能得分，只是慢 —— 不然对手等于不存在', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let state = setup(3, [child, robot], seed)
      let taps = 0
      while (!isFinished(state) && taps < 300) {
        const action = chooseAiAction(state, 'ai1', 'easy')!
        state = applyAction(state, action)
        taps++
      }
      expect(getWinner(state)).toBe('ai1')
    }
  })

  it('永远只点自己牌上有的图案', () => {
    const difficulties: Difficulty[] = ['easy', 'normal', 'serious']
    for (const difficulty of difficulties) {
      for (let seed = 1; seed <= 10; seed++) {
        const state = setup(5, [child, robot], seed)
        const action = chooseAiAction(state, 'ai1', difficulty)!
        expect(state.cards.ai1).toContain(action.symbol)
        // 点了就一定是个能被接受的动作
        expect(applyAction(state, action)).not.toBe(state)
      }
    }
  })
})
