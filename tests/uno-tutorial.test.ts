import { describe, expect, it } from 'vitest'
import { createTutorialState } from '../src/games/uno/tutorial'
import {
  applyAction,
  canPlay,
  currentPlayer,
  getWinner,
  isFinished,
  type UnoState,
} from '../src/games/uno/rules'
import { chooseAiAction } from '../src/games/uno/ai'
import type { Difficulty, PlayerRef } from '../src/core/types'

const child: PlayerRef = { id: 'child', kind: 'human', avatar: '🐻' }
const rival: PlayerRef = { id: 'ai1', kind: 'ai', avatar: '🐰', nameKey: 'ai.player1' }

function playables(state: UnoState, playerId: string) {
  return (state.hands[playerId] ?? []).filter((c) => canPlay(state, c))
}

/**
 * 教学局的全部价值在于"剧本一定会照着走"。这里就测这一件事：
 * 孩子每一步都只有唯一解，所以她不可能走偏；对手用的是正常 AI，
 * 但每一步也只有唯一解，所以三种难度下走法完全一样。
 */
describe('UNO 教学局 · 剧本是确定的', () => {
  it('孩子每个回合要么只有一张能出的牌，要么一张都出不了', () => {
    const difficulties: Difficulty[] = ['easy', 'normal', 'serious']
    for (const difficulty of difficulties) {
      let state = createTutorialState([child, rival])
      let guard = 0
      while (!isFinished(state) && guard++ < 40) {
        if (currentPlayer(state) === 'child') {
          const mine = playables(state, 'child')
          // 0 张 = 必须摸牌；1 张 = 只能出那张。两种都没有选择余地
          expect(mine.length).toBeLessThanOrEqual(1)
          state = applyAction(
            state,
            mine.length === 1 ? { type: 'play', cardId: mine[0].id } : { type: 'draw' },
          )
        } else {
          const action = chooseAiAction(state, 'ai1', difficulty)
          expect(action).not.toBeNull()
          state = applyAction(state, action!)
        }
      }
      expect(isFinished(state)).toBe(true)
      expect(getWinner(state)).toBe('child')
    }
  })

  it('按剧本走：同色 → 同数字 → 摸牌 → 对方摸牌 → 赢', () => {
    let state = createTutorialState([child, rival])
    const log: string[] = []
    let guard = 0

    while (!isFinished(state) && guard++ < 40) {
      const who = currentPlayer(state)
      if (who === 'child') {
        const mine = playables(state, 'child')
        if (mine.length === 0) {
          log.push('娃摸牌')
          state = applyAction(state, { type: 'draw' })
        } else {
          const c = mine[0]
          log.push(c.color === state.activeColor ? '娃出同色' : '娃出同数字')
          state = applyAction(state, { type: 'play', cardId: c.id })
        }
      } else {
        const action = chooseAiAction(state, 'ai1', 'serious')!
        log.push(action.type === 'draw' ? '对方摸牌' : '对方出牌')
        state = applyAction(state, action)
      }
    }

    expect(log).toEqual([
      '娃出同色',
      '对方出牌',
      '娃出同数字',
      '对方出牌',
      '娃摸牌',
      '对方摸牌',
      '娃出同色',
      '对方出牌',
      '娃出同数字',
    ])
    expect(getWinner(state)).toBe('child')
  })

  it('孩子剩一张牌的时刻确实出现过（喊 UNO 的教学要用）', () => {
    let state = createTutorialState([child, rival])
    let sawUno = false
    let guard = 0
    while (!isFinished(state) && guard++ < 40) {
      if ((state.hands.child ?? []).length === 1) sawUno = true
      const who = currentPlayer(state)
      if (who === 'child') {
        const mine = playables(state, 'child')
        state = applyAction(
          state,
          mine.length ? { type: 'play', cardId: mine[0].id } : { type: 'draw' },
        )
      } else {
        state = applyAction(state, chooseAiAction(state, 'ai1', 'serious')!)
      }
    }
    expect(sawUno).toBe(true)
  })

  it('对手摸牌那一刻，它的手牌数确实增加了（"你看它的牌变多了"要站得住）', () => {
    let state = createTutorialState([child, rival])
    let before = -1
    let grew = false
    let guard = 0
    while (!isFinished(state) && guard++ < 40) {
      const who = currentPlayer(state)
      if (who !== 'child') {
        before = (state.hands.ai1 ?? []).length
        const action = chooseAiAction(state, 'ai1', 'serious')!
        state = applyAction(state, action)
        if (action.type === 'draw' && (state.hands.ai1 ?? []).length === before + 1) grew = true
      } else {
        const mine = playables(state, 'child')
        state = applyAction(
          state,
          mine.length ? { type: 'play', cardId: mine[0].id } : { type: 'draw' },
        )
      }
    }
    expect(grew).toBe(true)
  })
})
