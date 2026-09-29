import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  getWinner,
  handSize,
  isFinished,
  redactFor,
  type Card,
  type UnoState,
} from '../src/games/uno/rules'
import type { GameConfig, PlayerRef } from '../src/core/types'

/**
 * 隐藏信息裁剪。
 *
 * 不做的话，联机时打开开发者工具看一眼 WebSocket 就能拿到所有人的手牌
 * **和整个摸牌堆的顺序**（= 这一局剩下的全部未来）。
 */

const a: PlayerRef = { id: 'a', kind: 'human', avatar: '🐻' }
const b: PlayerRef = { id: 'b', kind: 'human', avatar: '🐰' }
const c: PlayerRef = { id: 'c', kind: 'human', avatar: '🐱' }
const cfg = (players: PlayerRef[]): GameConfig => ({ players, difficulty: 'easy', seed: 42 })

/** 把一份局面里出现的所有牌 id 捞出来，用来证明"某张牌确实不在里面" */
function idsIn(value: unknown): string[] {
  const out: string[] = []
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk)
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (typeof o.id === 'string' && typeof o.kind === 'string') out.push(o.id)
      Object.values(o).forEach(walk)
    }
  }
  walk(value)
  return out
}

describe('UNO 隐藏信息裁剪', () => {
  it('发给 a 的那份里，一张 b 的牌都没有', () => {
    const full = createInitialState(cfg([a, b]))
    const view = redactFor(full, 'a')
    const leaked = idsIn(view).filter((id) => full.hands.b.some((card) => card.id === id))
    expect(leaked).toEqual([])
  })

  it('摸牌堆整个没了 —— 这是最严重的一条，它等于这局剩下的全部未来', () => {
    const full = createInitialState(cfg([a, b]))
    expect(full.drawPile.length).toBeGreaterThan(0)
    const view = redactFor(full, 'a')
    expect(view.drawPile).toEqual([])
    const leaked = idsIn(view).filter((id) => full.drawPile.some((card) => card.id === id))
    expect(leaked).toEqual([])
  })

  it('rng 也去掉 —— 留着能推算后面的洗牌', () => {
    const full = createInitialState(cfg([a, b]))
    expect(redactFor(full, 'a').rng).toBe(0)
  })

  it('自己的牌一张不少', () => {
    const full = createInitialState(cfg([a, b]))
    expect(redactFor(full, 'a').hands.a).toEqual(full.hands.a)
  })

  it('三个人时，两个对手的牌都不在', () => {
    const full = createInitialState(cfg([a, b, c]))
    const view = redactFor(full, 'a')
    const others = [...full.hands.b, ...full.hands.c].map((card) => card.id)
    expect(idsIn(view).filter((id) => others.includes(id))).toEqual([])
    expect(Object.keys(view.hands)).toEqual(['a'])
  })

  it('各人还剩几张仍然看得到 —— 这是公开信息，界面要画牌背', () => {
    const full = createInitialState(cfg([a, b, c]))
    const view = redactFor(full, 'a')
    for (const id of ['a', 'b', 'c']) {
      expect(handSize(view, id)).toBe(full.hands[id].length)
    }
  })

  it('弃牌堆、当前颜色、轮到谁、方向原样保留', () => {
    const full = createInitialState(cfg([a, b]))
    const view = redactFor(full, 'a')
    expect(view.discardPile).toEqual(full.discardPile)
    expect(view.activeColor).toBe(full.activeColor)
    expect(view.currentIndex).toBe(full.currentIndex)
    expect(view.direction).toBe(full.direction)
    expect(view.players).toEqual(full.players)
  })

  /*
   * ⚠️ 下面这两条是这次改动真正的坑。
   * `isFinished`/`getWinner` 是**在客户端跑的**（界面靠它们出结算页）。
   * 它们原来靠 `hands[谁].length === 0` 判赢 —— 而裁剪版里对手的手牌根本不在，
   * `undefined?.length === 0` 是 false，**不报错，只是永远不结算**。
   */
  it('对手打完最后一张牌时，我这边也要能判出游戏结束', () => {
    const full = createInitialState(cfg([a, b]))
    const won: UnoState = { ...full, hands: { ...full.hands, b: [] as Card[] } }
    expect(isFinished(won)).toBe(true)
    const view = redactFor(won, 'a')
    expect(isFinished(view)).toBe(true)
  })

  it('而且要认出赢的是对手，不是没人赢', () => {
    const full = createInitialState(cfg([a, b]))
    const won: UnoState = { ...full, hands: { ...full.hands, b: [] as Card[] } }
    expect(getWinner(redactFor(won, 'a'))).toBe('b')
  })

  it('自己赢的那一局照常认得出', () => {
    const full = createInitialState(cfg([a, b]))
    const won: UnoState = { ...full, hands: { ...full.hands, a: [] as Card[] } }
    expect(getWinner(redactFor(won, 'a'))).toBe('a')
  })

  it('没人赢的时候不要误报', () => {
    const full = createInitialState(cfg([a, b]))
    const view = redactFor(full, 'a')
    expect(isFinished(view)).toBe(false)
    expect(getWinner(view)).toBeNull()
  })

  it('打上 redacted 标记，方便在开发者工具里一眼认出是哪一份', () => {
    const full = createInitialState(cfg([a, b]))
    expect(full.redacted).toBeUndefined()
    expect(redactFor(full, 'a').redacted).toBe(true)
  })
})
