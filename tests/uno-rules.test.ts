import { describe, expect, it } from 'vitest'
import {
  applyAction,
  canPlay,
  COLORS,
  createInitialState,
  currentPlayer,
  getLegalActions,
  getWinner,
  HAND_SIZE,
  isFinished,
  LEVEL_KINDS,
  playersAtUno,
  topCard,
  type Card,
  type CardColor,
  type CardKind,
  type UnoLevel,
  type UnoState,
} from '../src/games/uno/rules'
import type { GameConfig, PlayerRef } from '../src/core/types'

const child: PlayerRef = { id: 'child', kind: 'human', avatar: '🐻' }
const bear: PlayerRef = { id: 'bear', kind: 'ai', avatar: '🐰', nameKey: 'ai.player1' }
const cat: PlayerRef = { id: 'cat', kind: 'ai', avatar: '🐱', nameKey: 'ai.player2' }

function setup(players = [child, bear], level: UnoLevel = 4, seed = 42): UnoState {
  const config: GameConfig = { players, difficulty: 'easy', variant: { level }, seed }
  return createInitialState(config)
}

const card = (kind: CardKind, color: CardColor | null, value: number | null = null): Card => ({
  id: `x${kind}${color}${value}`,
  kind,
  color,
  value,
})

/** 摆一个确定的局面：指定当前玩家的手牌和台面顶牌 */
function rig(
  state: UnoState,
  hand: Card[],
  top: Card,
  activeColor: CardColor = top.color ?? 'red',
): UnoState {
  const playerId = currentPlayer(state)!
  return {
    ...state,
    hands: { ...state.hands, [playerId]: hand },
    discardPile: [top],
    activeColor,
  }
}

describe('UNO · 牌组等级', () => {
  it('L1 只有数字牌，没有任何功能牌', () => {
    const state = setup([child, bear], 1)
    const all = [...state.drawPile, ...state.discardPile, ...Object.values(state.hands).flat()]
    expect(all.every((c) => c.kind === 'number')).toBe(true)
  })

  it('逐级解锁：L2 加跳过，L3 加反转和 +2，L4 加万能牌', () => {
    const kindsOf = (level: UnoLevel) => {
      const state = setup([child, bear], level)
      const all = [...state.drawPile, ...state.discardPile, ...Object.values(state.hands).flat()]
      return new Set(all.map((c) => c.kind))
    }
    expect(kindsOf(2).has('skip')).toBe(true)
    expect(kindsOf(2).has('draw2')).toBe(false)
    expect(kindsOf(3).has('reverse')).toBe(true)
    expect(kindsOf(3).has('draw2')).toBe(true)
    expect(kindsOf(3).has('wild')).toBe(false)
    expect(kindsOf(4).has('wild')).toBe(true)
    expect(kindsOf(4).has('wild4')).toBe(true)
  })

  it('每一级的牌型都是上一级的超集 —— 阶梯只加不减', () => {
    const levels: UnoLevel[] = [1, 2, 3, 4]
    for (let i = 1; i < levels.length; i++) {
      const prev = LEVEL_KINDS[levels[i - 1]]
      const curr = LEVEL_KINDS[levels[i]]
      prev.forEach((kind) => expect(curr).toContain(kind))
    }
  })

  it('每人发 5 张，起始牌是普通数字牌', () => {
    const state = setup([child, bear, cat])
    expect(state.hands.child).toHaveLength(HAND_SIZE)
    expect(state.hands.bear).toHaveLength(HAND_SIZE)
    expect(state.hands.cat).toHaveLength(HAND_SIZE)
    // 开局就触发功能牌的话规则讲不清楚
    expect(topCard(state).kind).toBe('number')
  })

  it('同一个 seed 发出同样的牌', () => {
    expect(setup([child, bear], 4, 7).hands).toEqual(setup([child, bear], 4, 7).hands)
    expect(setup([child, bear], 4, 7).hands).not.toEqual(setup([child, bear], 4, 8).hands)
  })
})

describe('UNO · 什么牌能出', () => {
  it('同色可出，同数字可出，都不同不能出', () => {
    const state = rig(setup(), [], card('number', 'red', 5))
    expect(canPlay(state, card('number', 'red', 9))).toBe(true)
    expect(canPlay(state, card('number', 'blue', 5))).toBe(true)
    expect(canPlay(state, card('number', 'blue', 9))).toBe(false)
  })

  it('万能牌任何时候都能出', () => {
    const state = rig(setup(), [], card('number', 'red', 5))
    expect(canPlay(state, card('wild', null))).toBe(true)
    expect(canPlay(state, card('wild4', null))).toBe(true)
  })

  it('功能牌可以盖同类功能牌（跳过盖跳过）', () => {
    const state = rig(setup(), [], card('skip', 'red'))
    expect(canPlay(state, card('skip', 'blue'))).toBe(true)
    expect(canPlay(state, card('draw2', 'blue'))).toBe(false)
  })

  it('万能牌指定颜色后，按新颜色判断能不能出', () => {
    const state = rig(setup(), [], card('wild', null), 'green')
    expect(canPlay(state, card('number', 'green', 3))).toBe(true)
    expect(canPlay(state, card('number', 'red', 3))).toBe(false)
  })

  it('getLegalActions 给出的每个动作都能直接执行（万能牌自带兜底颜色）', () => {
    let state = setup([child, bear], 4)
    for (let i = 0; i < 30; i++) {
      const actions = getLegalActions(state, currentPlayer(state)!)
      expect(actions.length).toBeGreaterThan(0)
      for (const action of actions) {
        expect(applyAction(state, action)).not.toBe(state)
      }
      state = applyAction(state, actions[0])
      if (isFinished(state)) break
    }
  })
})

describe('UNO · 功能牌', () => {
  it('跳过：下一家被跳过', () => {
    const state = rig(setup([child, bear, cat]), [card('skip', 'red'), card('number', 'green', 7)], card('number', 'red', 1))
    const after = applyAction(state, { type: 'play', cardId: state.hands.child[0].id })
    expect(currentPlayer(after)).toBe('cat')
  })

  it('反转：三人局方向掉头', () => {
    const state = rig(setup([child, bear, cat]), [card('reverse', 'red'), card('number', 'green', 7)], card('number', 'red', 1))
    const after = applyAction(state, { type: 'play', cardId: state.hands.child[0].id })
    expect(after.direction).toBe(-1)
    expect(currentPlayer(after)).toBe('cat')
  })

  it('反转：两人局等同于跳过，转一圈回到自己', () => {
    const state = rig(setup([child, bear]), [card('reverse', 'red'), card('number', 'red', 2)], card('number', 'red', 1))
    const after = applyAction(state, { type: 'play', cardId: state.hands.child[0].id })
    expect(currentPlayer(after)).toBe('child')
  })

  it('+2：下一家抽两张并被跳过', () => {
    const state = rig(setup([child, bear, cat]), [card('draw2', 'red'), card('number', 'green', 7)], card('number', 'red', 1))
    const before = state.hands.bear.length
    const after = applyAction(state, { type: 'play', cardId: state.hands.child[0].id })
    expect(after.hands.bear).toHaveLength(before + 2)
    expect(currentPlayer(after)).toBe('cat')
  })

  it('万能+4：下一家抽四张并被跳过，颜色按出牌人指定', () => {
    const state = rig(setup([child, bear, cat]), [card('wild4', null), card('number', 'green', 7)], card('number', 'red', 1))
    const before = state.hands.bear.length
    const after = applyAction(state, {
      type: 'play',
      cardId: state.hands.child[0].id,
      chosenColor: 'green',
    })
    expect(after.hands.bear).toHaveLength(before + 4)
    expect(after.activeColor).toBe('green')
    expect(currentPlayer(after)).toBe('cat')
  })

  it('加牌不累计叠加 —— 被加牌的人不能再甩一张 +2 给下家', () => {
    const state = rig(setup([child, bear, cat]), [card('draw2', 'red'), card('number', 'green', 7)], card('number', 'red', 1))
    const after = applyAction(state, { type: 'play', cardId: state.hands.child[0].id })
    // 轮次直接跳到第三家，被加牌的 bear 根本没有出牌机会
    expect(currentPlayer(after)).toBe('cat')
    expect(getLegalActions(after, 'bear')).toEqual([])
  })

  it('万能牌不指定颜色不能出 —— 界面必须先让人选', () => {
    const state = rig(setup(), [card('wild', null)], card('number', 'red', 1))
    expect(applyAction(state, { type: 'play', cardId: state.hands.child[0].id })).toBe(state)
  })
})

describe('UNO · 抽牌与洗牌', () => {
  it('抽一张牌然后换人', () => {
    const state = setup([child, bear])
    const before = state.hands.child.length
    const after = applyAction(state, { type: 'draw' })
    expect(after.hands.child).toHaveLength(before + 1)
    expect(currentPlayer(after)).toBe('bear')
  })

  it('摸牌堆空了就把弃牌堆洗回去，牌不会凭空消失', () => {
    const base = setup([child, bear], 1)
    const recycled = base.drawPile.slice(0, 12)
    const state: UnoState = {
      ...base,
      drawPile: [],
      discardPile: [...recycled, topCard(base)],
    }
    const totalBefore =
      state.drawPile.length +
      state.discardPile.length +
      Object.values(state.hands).flat().length

    const after = applyAction(state, { type: 'draw' })
    const totalAfter =
      after.drawPile.length + after.discardPile.length + Object.values(after.hands).flat().length

    expect(after.hands.child).toHaveLength(state.hands.child.length + 1)
    expect(totalAfter).toBe(totalBefore)
    expect(after.discardPile).toHaveLength(1)
  })
})

describe('UNO · 结束与 UNO 提示', () => {
  it('打完最后一张牌就赢，且不再触发功能牌效果', () => {
    // 手里只剩这一张跳过牌：打出去就赢了，跳过的效果不该再生效
    const state = rig(setup([child, bear, cat]), [card('skip', 'red')], card('number', 'red', 1))
    const after = applyAction(state, { type: 'play', cardId: state.hands.child[0].id })
    expect(isFinished(after)).toBe(true)
    expect(getWinner(after)).toBe('child')
  })

  it('剩一张牌的人会被标记出来（界面据此自动播 UNO 音效）', () => {
    const state = rig(
      setup([child, bear]),
      [card('number', 'red', 3), card('number', 'red', 4)],
      card('number', 'red', 1),
    )
    expect(playersAtUno(state)).toEqual([])
    const after = applyAction(state, { type: 'play', cardId: state.hands.child[0].id })
    expect(playersAtUno(after)).toContain('child')
  })

  it('结束之后任何动作都没反应', () => {
    const state = rig(setup([child, bear]), [card('number', 'red', 3)], card('number', 'red', 1))
    const won = applyAction(state, { type: 'play', cardId: state.hands.child[0].id })
    expect(isFinished(won)).toBe(true)
    expect(applyAction(won, { type: 'draw' })).toBe(won)
  })
})

describe('UNO · 非法操作原样返回，不抛异常', () => {
  it('出手里没有的牌没反应', () => {
    const state = setup()
    expect(applyAction(state, { type: 'play', cardId: '不存在' })).toBe(state)
  })

  it('出不合法的牌没反应', () => {
    const state = rig(setup(), [card('number', 'blue', 9)], card('number', 'red', 5))
    expect(applyAction(state, { type: 'play', cardId: state.hands.child[0].id })).toBe(state)
  })

  it('不是你的回合就没有合法动作', () => {
    const state = setup([child, bear])
    expect(getLegalActions(state, 'bear')).toEqual([])
  })

  it('applyAction 不修改传进去的状态', () => {
    const state = setup()
    const snapshot = JSON.stringify(state)
    applyAction(state, { type: 'draw' })
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})

describe('UNO · 整局能打完', () => {
  it('四个等级各跑几局都能分出胜负，不会卡死', () => {
    const levels: UnoLevel[] = [1, 2, 3, 4]
    for (const level of levels) {
      for (const seed of [1, 2, 3]) {
        let state = setup([child, bear, cat], level, seed)
        let steps = 0
        while (!isFinished(state) && steps < 2000) {
          const actions = getLegalActions(state, currentPlayer(state)!)
          state = applyAction(state, actions[0])
          steps++
        }
        expect(isFinished(state)).toBe(true)
        expect(COLORS).toContain(state.activeColor)
      }
    }
  })
})
