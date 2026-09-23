import { describe, expect, it } from 'vitest'
import {
  allMastered,
  isMastered,
  MASTERY,
  nextHint,
  recordSuccess,
  type CoachProgress,
} from '../src/games/uno/coach'
import {
  createInitialState,
  type Card,
  type CardColor,
  type CardKind,
  type UnoState,
} from '../src/games/uno/rules'
import type { GameConfig, PlayerRef } from '../src/core/types'

const child: PlayerRef = { id: 'child', kind: 'human', avatar: '🐻' }
const bear: PlayerRef = { id: 'bear', kind: 'ai', avatar: '🐰', nameKey: 'ai.player1' }

const IDLE = 5000

const card = (kind: CardKind, color: CardColor | null, value: number | null = null): Card => ({
  id: `x${kind}${color}${value}`,
  kind,
  color,
  value,
})

function rig(hand: Card[], top: Card, activeColor?: CardColor): UnoState {
  const config: GameConfig = {
    players: [child, bear],
    difficulty: 'easy',
    variant: { level: 4 },
    seed: 1,
  }
  const base = createInitialState(config)
  return {
    ...base,
    currentIndex: 0,
    hands: { ...base.hands, child: hand },
    discardPile: [top],
    activeColor: activeColor ?? top.color ?? 'red',
  }
}

describe('教学引导 · 什么时候提示', () => {
  it('不是孩子的回合就不提示', () => {
    const state = { ...rig([card('number', 'red', 3)], card('number', 'red', 1)), currentIndex: 1 }
    expect(nextHint(state, {}, 99999, IDLE)).toBeNull()
  })

  it('第一次遇到同色可出：立刻教，不用等她卡住', () => {
    const state = rig([card('number', 'red', 3)], card('number', 'red', 1))
    const hint = nextHint(state, {}, 0, IDLE)
    expect(hint).toMatchObject({ id: 'colorMatch', first: true, voice: 'uno.match.red' })
    expect(hint?.target).toEqual({ kind: 'card', cardId: 'xnumberred3' })
  })

  it('语音跟着牌的颜色走', () => {
    const blue = rig([card('number', 'blue', 3)], card('number', 'blue', 1))
    expect(nextHint(blue, {}, 0, IDLE)?.voice).toBe('uno.match.blue')
    const green = rig([card('number', 'green', 3)], card('number', 'green', 1))
    expect(nextHint(green, {}, 0, IDLE)?.voice).toBe('uno.match.green')
  })

  it('见过一次之后就不啰嗦了 —— 除非她卡住', () => {
    const state = rig([card('number', 'red', 3)], card('number', 'red', 1))
    const seen: CoachProgress = { colorMatch: 1 }
    expect(nextHint(state, seen, 1000, IDLE)).toBeNull()
    expect(nextHint(state, seen, IDLE, IDLE)).toMatchObject({ id: 'colorMatch', first: false })
  })

  it('做对 3 次就不再提示这条规则', () => {
    const state = rig([card('number', 'red', 3)], card('number', 'red', 1))
    const mastered: CoachProgress = { colorMatch: MASTERY }
    // 已掌握同色，且没有别的可教 —— 卡住时只给一句泛泛的鼓励
    const hint = nextHint(state, mastered, IDLE, IDLE)
    expect(hint?.voice).toBe('uno.tryThis')
    expect(nextHint(state, mastered, 0, IDLE)).toBeNull()
  })

  it('一张都出不了：指向摸牌堆', () => {
    const state = rig([card('number', 'blue', 9)], card('number', 'red', 1))
    const hint = nextHint(state, {}, 0, IDLE)
    expect(hint).toMatchObject({ id: 'mustDraw', voice: 'uno.mustDraw' })
    expect(hint?.target).toEqual({ kind: 'pile' })
  })

  it('同色学会了、同数字还没学 —— 优先教没学会的那条', () => {
    const state = rig(
      [card('number', 'red', 3), card('number', 'blue', 1)],
      card('number', 'red', 1),
    )
    const hint = nextHint(state, { colorMatch: MASTERY }, 0, IDLE)
    expect(hint).toMatchObject({ id: 'numberMatch', voice: 'uno.matchNumber' })
    expect(hint?.target).toEqual({ kind: 'card', cardId: 'xnumberblue1' })
  })

  it('手里没牌了不提示（已经赢了）', () => {
    const state = rig([], card('number', 'red', 1))
    expect(nextHint(state, {}, IDLE, IDLE)).toBeNull()
  })
})

describe('教学引导 · 熟练度', () => {
  it('出同色牌记到 colorMatch，出同数字记到 numberMatch', () => {
    const state = rig([], card('number', 'red', 1))
    expect(recordSuccess({}, state, card('number', 'red', 7)).colorMatch).toBe(1)
    expect(recordSuccess({}, state, card('number', 'blue', 1)).numberMatch).toBe(1)
  })

  it('抽牌记到 mustDraw，出万能牌记到 wildColor', () => {
    const state = rig([], card('number', 'red', 1))
    expect(recordSuccess({}, state, null).mustDraw).toBe(1)
    expect(recordSuccess({}, state, card('wild', null)).wildColor).toBe(1)
  })

  it('累计到 MASTERY 就算掌握', () => {
    let progress: CoachProgress = {}
    const state = rig([], card('number', 'red', 1))
    for (let i = 0; i < MASTERY; i++) {
      progress = recordSuccess(progress, state, card('number', 'red', 7))
    }
    expect(isMastered(progress, 'colorMatch')).toBe(true)
  })

  it('四条规则都掌握了才算全部学会', () => {
    const almost: CoachProgress = {
      colorMatch: MASTERY,
      numberMatch: MASTERY,
      mustDraw: MASTERY,
    }
    expect(allMastered(almost)).toBe(false)
    expect(allMastered({ ...almost, wildColor: MASTERY })).toBe(true)
  })

  it('不会改传进去的进度对象', () => {
    const progress: CoachProgress = { colorMatch: 1 }
    const state = rig([], card('number', 'red', 1))
    recordSuccess(progress, state, card('number', 'red', 7))
    expect(progress.colorMatch).toBe(1)
  })
})
