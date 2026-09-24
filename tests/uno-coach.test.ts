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
    const seen: CoachProgress = { colorMatch: 1, opponentCount: MASTERY }
    expect(nextHint(state, seen, 1000, IDLE)).toBeNull()
    expect(nextHint(state, seen, IDLE, IDLE)).toMatchObject({ id: 'colorMatch', first: false })
  })

  it('做对 3 次就不再提示这条规则', () => {
    const state = rig([card('number', 'red', 3)], card('number', 'red', 1))
    const mastered: CoachProgress = { colorMatch: MASTERY, opponentCount: MASTERY }
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

  it('【实测反馈修的】没讲过的规则优先：同色才讲过一次，遇到同数字机会要马上讲', () => {
    // 第一版写反了：只要同色还没学满 3 次就一直教同色，
    // 结果"数字一样也能出"从头到尾没讲过
    const state = rig(
      [card('number', 'red', 3), card('number', 'blue', 1)],
      card('number', 'red', 1),
    )
    const hint = nextHint(state, { colorMatch: 1 }, 0, IDLE)
    expect(hint).toMatchObject({ id: 'numberMatch', first: true, voice: 'uno.matchNumber' })
  })

  it('会出牌之后才讲"对手还剩几张"，不会一上来就讲', () => {
    const state = rig([card('number', 'red', 3)], card('number', 'red', 1))
    // 同色都还没讲过时，先教出牌
    expect(nextHint(state, {}, 0, IDLE)).toMatchObject({ id: 'colorMatch' })
    // 同色讲过、且没有别的新规则可讲时，才讲对手牌数
    expect(nextHint(state, { colorMatch: 1 }, 0, IDLE)).toMatchObject({
      id: 'opponentCount',
      voice: 'uno.opponentCount',
    })
  })

  it('同色学会了、同数字还没学 —— 优先教没学会的那条', () => {
    const state = rig(
      [card('number', 'red', 3), card('number', 'blue', 1)],
      card('number', 'red', 1),
    )
    const hint = nextHint(state, { colorMatch: MASTERY, opponentCount: MASTERY }, 0, IDLE)
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

  it('抽牌记到 mustDraw；万能牌不计入教学局的熟练度', () => {
    const state = rig([], card('number', 'red', 1))
    expect(recordSuccess({}, state, null).mustDraw).toBe(1)
    // 万能牌走正常对局里的随堂讲解，不参与教学局的完成判定
    expect(recordSuccess({}, state, card('wild', null))).toEqual({})
  })

  it('累计到 MASTERY 就算掌握', () => {
    let progress: CoachProgress = {}
    const state = rig([], card('number', 'red', 1))
    for (let i = 0; i < MASTERY; i++) {
      progress = recordSuccess(progress, state, card('number', 'red', 7))
    }
    expect(isMastered(progress, 'colorMatch')).toBe(true)
  })

  it('教学局真正教的三条都掌握了，才算学完', () => {
    // 教学那副牌是纯数字的，只会教到这三条。
    // 原来把万能牌也算进来，结果 L1 的孩子永远凑不齐、会被无限次追问
    expect(allMastered({ colorMatch: MASTERY, numberMatch: MASTERY })).toBe(false)
    expect(
      allMastered({ colorMatch: MASTERY, numberMatch: MASTERY, mustDraw: MASTERY }),
    ).toBe(true)
  })

  it('不会改传进去的进度对象', () => {
    const progress: CoachProgress = { colorMatch: 1 }
    const state = rig([], card('number', 'red', 1))
    recordSuccess(progress, state, card('number', 'red', 7))
    expect(progress.colorMatch).toBe(1)
  })
})
