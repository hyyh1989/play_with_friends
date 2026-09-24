import { describe, expect, it } from 'vitest'
import {
  applyAction,
  buildDeck,
  createInitialState,
  targetFor,
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


describe('找相同 · 两步：先点自己的，再点公共牌', () => {
  it('开局三张牌：中间一张公共的，每人一张', () => {
    const state = setup()
    expect(state.center).toHaveLength(4)
    expect(state.cards.child).toHaveLength(4)
    expect(state.cards.ai1).toHaveLength(4)
    // 每人和公共牌恰好共享一个
    for (const id of ['child', 'ai1']) {
      expect(state.cards[id].filter((s) => state.center.includes(s))).toHaveLength(1)
      expect(targetFor(state, id)).toBe(sharedSymbol(state.cards[id], state.center))
    }
    // 三张牌互不相同
    expect(state.cards.child).not.toEqual(state.cards.ai1)
    expect(state.cards.child).not.toEqual(state.center)
  })

  it('第一步：在自己牌上选中，还不得分', () => {
    const state = setup()
    const target = targetFor(state, 'child')
    const picked = applyAction(state, { type: 'pick', playerId: 'child', symbol: target })
    expect(picked.picks.child?.symbol).toBe(target)
    expect(picked.scores.child).toBe(0)
    expect(picked.feedback).toMatchObject({ playerId: 'child', kind: 'pick' })
  })

  it('第二步：在公共牌上点同一个 → 得分并换牌', () => {
    const state = setup()
    const target = targetFor(state, 'child')
    const before = state.center
    const done = applyAction(
      applyAction(state, { type: 'pick', playerId: 'child', symbol: target }),
      { type: 'confirm', symbol: target },
    )
    expect(done.scores.child).toBe(1)
    expect(done.feedback).toMatchObject({ playerId: 'child', kind: 'hit' })
    expect(done.center).not.toEqual(before)
    // 换了牌，选中也跟着清空
    expect(done.picks.child).toBeNull()
  })

  it('点了自己牌上没有的东西，没反应', () => {
    const state = setup()
    const notMine = [...Array(31).keys()].find((s) => !state.cards.child.includes(s))!
    expect(applyAction(state, { type: 'pick', playerId: 'child', symbol: notMine })).toBe(state)
  })

  it('谁都没选就先点公共牌 → 提示"先点自己那张"，不算错', () => {
    const state = setup()
    const next = applyAction(state, { type: 'confirm', symbol: state.center[0] })
    expect(next.feedback?.kind).toBe('needPick')
    expect(next.scores.child).toBe(0)
    expect(next.picks.child).toBeNull()
  })

  it('选了 A 却在公共牌上点了 B → 不得分、也不清掉选中（不做失败叙事）', () => {
    const state = setup()
    const target = targetFor(state, 'child')
    const picked = applyAction(state, { type: 'pick', playerId: 'child', symbol: target })
    const other = picked.center.find((s) => s !== target)!
    const missed = applyAction(picked, { type: 'confirm', symbol: other })
    expect(missed.feedback?.kind).toBe('miss')
    expect(missed.scores.child).toBe(0)
    // 选中还在，可以直接再点一次
    expect(missed.picks.child?.symbol).toBe(target)
  })

  it('限时到了就取消选中，可以重新选', () => {
    const state = setup()
    const target = targetFor(state, 'child')
    const picked = applyAction(state, { type: 'pick', playerId: 'child', symbol: target })
    const cleared = applyAction(picked, { type: 'clear', playerId: 'child' })
    expect(cleared.picks.child).toBeNull()
    // 取消之后再点公共牌 = 还没选
    expect(applyAction(cleared, { type: 'confirm', symbol: target }).feedback?.kind).toBe('needPick')
  })

  it('公共牌上这一下算谁的，看它对上了谁选的那个', () => {
    // 屏幕分不清手指是谁的，所以规则按"匹配谁的选中"来认领
    let state = setup()
    state = applyAction(state, {
      type: 'pick',
      playerId: 'ai1',
      symbol: targetFor(state, 'ai1'),
    })
    const childTarget = targetFor(state, 'child')
    state = applyAction(state, { type: 'pick', playerId: 'child', symbol: childTarget })
    // 两人都选好了，点娃选的那个 → 算娃的
    const done = applyAction(state, { type: 'confirm', symbol: childTarget })
    expect(done.scores.child).toBe(1)
    expect(done.scores.ai1).toBe(0)
  })

  it('两个人恰好选了同一个时，算先选中的那个', () => {
    // 构造：两人的牌和公共牌共享的是同一个图案
    const base = setup()
    const shared = base.center[0]
    const state: DobbleState = {
      ...base,
      cards: { child: [shared, 98, 97, 96], ai1: [shared, 95, 94, 93] },
    }
    const first = applyAction(state, { type: 'pick', playerId: 'ai1', symbol: shared })
    const second = applyAction(first, { type: 'pick', playerId: 'child', symbol: shared })
    const done = applyAction(second, { type: 'confirm', symbol: shared })
    expect(done.scores.ai1).toBe(1)
    expect(done.scores.child).toBe(0)
  })

  it('先到 5 分就赢，赢了之后牌面不再变', () => {
    let state = setup()
    for (let i = 0; i < TARGET_SCORE; i++) {
      expect(isFinished(state)).toBe(false)
      const target = targetFor(state, 'child')
      state = applyAction(state, { type: 'pick', playerId: 'child', symbol: target })
      state = applyAction(state, { type: 'confirm', symbol: target })
    }
    expect(getWinner(state)).toBe('child')
    expect(isFinished(state)).toBe(true)
    const frozen = state.center
    expect(applyAction(state, { type: 'confirm', symbol: frozen[0] })).toBe(state)
    expect(getLegalActions(state, 'child')).toEqual([])
  })

  it('牌发完了会重新洗，一直玩得下去', () => {
    // 2 阶只有 7 张牌，每局要 3 张 → 第 3 局就得重洗
    let state = setup(2)
    for (let i = 0; i < 20; i++) {
      expect(state.center).toHaveLength(3)
      expect(state.cards.child).toHaveLength(3)
      const target = targetFor(state, 'child')
      expect(target).toBeGreaterThanOrEqual(0)
      state = applyAction(state, { type: 'pick', playerId: 'child', symbol: target })
      state = applyAction(state, { type: 'confirm', symbol: target })
      if (isFinished(state)) state = setup(2, [child, robot], 100 + i)
    }
  })

  it('applyAction 不修改传进去的状态', () => {
    const state = setup()
    const snapshot = JSON.stringify(state)
    applyAction(state, { type: 'pick', playerId: 'child', symbol: targetFor(state, 'child') })
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})

describe('找相同 AI', () => {
  /** 让 AI 一直走到底，返回它走过的动作 */
  function runAi(state: DobbleState, difficulty: Difficulty, maxSteps = 400) {
    const actions: string[] = []
    for (let i = 0; i < maxSteps && !isFinished(state); i++) {
      const action = chooseAiAction(state, 'ai1', difficulty)
      if (!action) break
      actions.push(action.type)
      state = applyAction(state, action)
    }
    return { state, actions }
  }

  it('走的是和人一样的两步：先选自己的，再点公共牌', () => {
    const state = setup(3, [child, robot], 5)
    const first = chooseAiAction(state, 'ai1', 'serious')!
    expect(first.type).toBe('pick')
    expect(state.cards.ai1).toContain((first as { symbol: number }).symbol)

    const picked = applyAction(state, first)
    const second = chooseAiAction(picked, 'ai1', 'serious')!
    expect(second.type).toBe('confirm')
    expect(picked.center).toContain((second as { symbol: number }).symbol)
  })

  it('认真档基本一次就选对', () => {
    let right = 0
    for (let seed = 1; seed <= 20; seed++) {
      const state = setup(3, [child, robot], seed)
      const action = chooseAiAction(state, 'ai1', 'serious')!
      if ((action as { symbol: number }).symbol === targetFor(state, 'ai1')) right++
    }
    expect(right).toBeGreaterThan(16)
  })

  it('选错了会自己取消重来，不去公共牌上乱点', () => {
    // 乱点可能撞上孩子选中的图案，白送她一分 —— 更糟的是让她以为乱点也能得分
    const state = setup(3, [child, robot], 1)
    const wrong = state.cards.ai1.find((s) => s !== targetFor(state, 'ai1'))!
    const picked = applyAction(state, { type: 'pick', playerId: 'ai1', symbol: wrong })
    expect(chooseAiAction(picked, 'ai1', 'easy')).toEqual({ type: 'clear', playerId: 'ai1' })
  })

  it('连着选错时不会一直选同一个', () => {
    // 实测过：挑"哪个错的"用 state.round 索引，同一轮里 round 不变 → 连选三次同一个，像卡住了
    let state = setup(3, [child, robot], 2)
    const picked = new Set<number>()
    for (let i = 0; i < 14; i++) {
      const action = chooseAiAction(state, 'ai1', 'easy')!
      if (action.type === 'pick') picked.add(action.symbol)
      state = applyAction(state, action)
      if (state.scores.ai1 > 0) break
    }
    expect(picked.size).toBeGreaterThan(1)
  })

  it('简单档也能走完一整局，只是要多花几次', () => {
    // 曾经的真 bug：点错时 rng 不推进 → AI 每次都做同样的选择，永远卡住（看起来像"AI 不动"）
    for (const seed of [1, 2, 3, 4, 5]) {
      const { state, actions } = runAi(setup(3, [child, robot], seed), 'easy')
      expect(getWinner(state)).toBe('ai1')
      // 简单档确实走过弯路（有取消重来），不是一路直奔
      expect(actions).toContain('clear')
    }
  })

  it('永远只选自己牌上有的、只确认公共牌上有的', () => {
    const difficulties: Difficulty[] = ['easy', 'normal', 'serious']
    for (const difficulty of difficulties) {
      for (let seed = 1; seed <= 8; seed++) {
        let state = setup(5, [child, robot], seed)
        for (let i = 0; i < 40 && !isFinished(state); i++) {
          const action = chooseAiAction(state, 'ai1', difficulty)!
          if (action.type === 'pick') expect(state.cards.ai1).toContain(action.symbol)
          if (action.type === 'confirm') expect(state.center).toContain(action.symbol)
          const next = applyAction(state, action)
          expect(next).not.toBe(state)
          state = next
        }
      }
    }
  })
})
