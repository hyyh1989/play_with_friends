import { describe, expect, it } from 'vitest'
import {
  applyAction,
  createInitialState,
  currentPlayer,
  isFinished,
  type Card,
  type CardColor,
  type CardKind,
  type UnoLevel,
  type UnoState,
} from '../src/games/uno/rules'
import { bestPlay, chooseAiAction } from '../src/games/uno/ai'
import type { Difficulty, GameConfig, PlayerRef } from '../src/core/types'

const child: PlayerRef = { id: 'child', kind: 'human', avatar: '🐻' }
const bear: PlayerRef = { id: 'bear', kind: 'ai', avatar: '🐰', nameKey: 'ai.player1' }

function setup(level: UnoLevel = 4, seed = 42, players = [child, bear]): UnoState {
  const config: GameConfig = { players, difficulty: 'easy', variant: { level }, seed }
  return createInitialState(config)
}

const card = (kind: CardKind, color: CardColor | null, value: number | null = null): Card => ({
  id: `x${kind}${color}${value}`,
  kind,
  color,
  value,
})

/** 把轮次交给 AI，并指定它的手牌与台面 */
function rigAi(state: UnoState, hand: Card[], top: Card, activeColor?: CardColor): UnoState {
  return {
    ...state,
    currentIndex: 1,
    hands: { ...state.hands, bear: hand },
    discardPile: [top],
    activeColor: activeColor ?? top.color ?? 'red',
  }
}

describe('UNO AI', () => {
  it('轮不到它就不出手', () => {
    expect(chooseAiAction(setup(), 'bear', 'normal')).toBeNull()
  })

  it('没牌可出就抽牌', () => {
    const state = rigAi(setup(), [card('number', 'blue', 9)], card('number', 'red', 3))
    expect(chooseAiAction(state, 'bear', 'serious')).toEqual({ type: 'draw' })
  })

  it('能出普通牌时不浪费万能牌', () => {
    const state = rigAi(
      setup(),
      [card('wild', null), card('number', 'red', 7)],
      card('number', 'red', 3),
    )
    const action = chooseAiAction(state, 'bear', 'serious')
    expect(action).toMatchObject({ type: 'play', cardId: 'xnumberred7' })
  })

  it('只剩万能牌时就用，并指定手里最多的颜色', () => {
    const state = rigAi(
      setup(),
      [card('wild', null), card('number', 'blue', 1), card('number', 'blue', 2)],
      card('number', 'red', 3),
    )
    const action = chooseAiAction(state, 'bear', 'serious')
    expect(action).toMatchObject({ type: 'play', cardId: 'xwildnullnull', chosenColor: 'blue' })
  })

  it('下家快出完了就优先甩功能牌拦一下', () => {
    const base = setup()
    const state: UnoState = {
      ...rigAi(
        base,
        [card('draw2', 'red'), card('number', 'red', 9)],
        card('number', 'red', 3),
      ),
      // child 只剩一张牌，下一个就是它
      hands: {
        ...base.hands,
        child: [card('number', 'red', 1)],
        bear: [card('draw2', 'red'), card('number', 'red', 9)],
      },
      direction: 1,
      currentIndex: 1,
    }
    const action = chooseAiAction(state, 'bear', 'serious')
    expect(action).toMatchObject({ cardId: 'xdraw2rednull' })
  })

  it('永远不会选一个执行不了的动作', () => {
    const difficulties: Difficulty[] = ['easy', 'normal', 'serious']
    for (const difficulty of difficulties) {
      for (const seed of [1, 2, 3]) {
        let state = setup(4, seed)
        for (let i = 0; i < 120 && !isFinished(state); i++) {
          const playerId = currentPlayer(state)!
          const action = chooseAiAction(state, playerId, difficulty)
          expect(action).not.toBeNull()
          const next = applyAction(state, action!)
          expect(next).not.toBe(state)
          state = next
        }
      }
    }
  })

  /*
   * 这里测的是【行为】不是【胜率】。
   *
   * 实测 600 局（交换座位抵消先手优势）：认真档胜率 54.5%、简单档 46.7%，
   * 而光是先手优势就有 53.7% —— UNO 运气成分太大，难度对输赢只值 8 个百分点，
   * 十局的样本量根本测不出来。
   *
   * 但孩子感知到的不是胜率，是"它刚才出了张傻牌"。所以要测的是
   * 偏离最优解的频率，这个才是难度旋钮真正在控制的东西。
   * 实测：简单档偏离 21.1%，认真档 3.8%。
   *
   * 注意简单档的 21% 远低于 SUBOPTIMAL_RATE 的 60% —— 因为 UNO 常常只有一张
   * 牌能出，这时"随机选"和"选最优"是同一张，放弃最优也看不出来。
   */
  it('简单档偏离最优出牌的次数远多于认真档', () => {
    const countDeviations = (difficulty: Difficulty) => {
      let deviations = 0
      let decisions = 0
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        let state = setup(4, seed)
        for (let i = 0; i < 150 && !isFinished(state); i++) {
          const playerId = currentPlayer(state)!
          const best = bestPlay(state, playerId)
          const action = chooseAiAction(state, playerId, difficulty)
          if (!action) break
          if (best) {
            decisions++
            if (action.type !== 'play' || action.cardId !== best.cardId) deviations++
          }
          state = applyAction(state, action)
        }
      }
      return deviations / Math.max(1, decisions)
    }

    const easy = countDeviations('easy')
    const serious = countDeviations('serious')
    expect(easy).toBeGreaterThan(0.15)
    expect(serious).toBeLessThan(0.06)
    expect(easy).toBeGreaterThan(serious * 3)
  })
})
