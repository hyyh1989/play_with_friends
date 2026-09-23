import { describe, expect, it } from 'vitest'
import {
  applyAction,
  BOARD_SIZE,
  cellPosition,
  COLS,
  createInitialState,
  currentPlayer,
  getLegalActions,
  getWinner,
  isFinished,
  LADDERS,
  ROWS,
  SLIDES,
  type SnakesState,
} from '../src/games/snakes/rules'
import type { GameConfig, PlayerRef } from '../src/core/types'

const child: PlayerRef = { id: 'child', kind: 'human', avatar: '🐻' }
const bear: PlayerRef = { id: 'bear', kind: 'ai', avatar: '🐰', nameKey: 'ai.player1' }
const cat: PlayerRef = { id: 'cat', kind: 'ai', avatar: '🐱', nameKey: 'ai.player2' }

function setup(players: PlayerRef[] = [child, bear], seed = 42): SnakesState {
  const config: GameConfig = { players, difficulty: 'easy', seed }
  return createInitialState(config)
}

/** 把当前玩家摆到指定格子，用来测特定情形 */
function place(state: SnakesState, playerId: string, square: number): SnakesState {
  return { ...state, positions: { ...state.positions, [playerId]: square } }
}

describe('蛇梯棋 · 棋盘数据', () => {
  it('梯子都是往上爬，滑梯都是往下滑', () => {
    Object.entries(LADDERS).forEach(([from, to]) => expect(to).toBeGreaterThan(Number(from)))
    Object.entries(SLIDES).forEach(([from, to]) => expect(to).toBeLessThan(Number(from)))
  })

  it('梯子和滑梯不会连锁触发（爬上去正好又踩到滑梯那种）', () => {
    const starts = [...Object.keys(LADDERS), ...Object.keys(SLIDES)].map(Number)
    const ends = [...Object.values(LADDERS), ...Object.values(SLIDES)]
    ends.forEach((end) => expect(starts).not.toContain(end))
  })

  it('起点和终点上没有梯子或滑梯', () => {
    const starts = [...Object.keys(LADDERS), ...Object.keys(SLIDES)].map(Number)
    expect(starts).not.toContain(1)
    expect(starts).not.toContain(BOARD_SIZE)
  })

  it('路径是蛇形的：第一行从左往右，第二行折回来', () => {
    // 1 号在左下角
    expect(cellPosition(1)).toEqual({ row: ROWS - 1, col: 0 })
    // 10 号在同一行最右
    expect(cellPosition(COLS)).toEqual({ row: ROWS - 1, col: COLS - 1 })
    // 11 号在 10 号正上方（折返，不是跳回左边）
    expect(cellPosition(COLS + 1)).toEqual({ row: ROWS - 2, col: COLS - 1 })
    // 20 号走到那一行的最左
    expect(cellPosition(COLS * 2)).toEqual({ row: ROWS - 2, col: 0 })
  })

  it('50 个格子占满棋盘且互不重叠', () => {
    const seen = new Set<string>()
    for (let n = 1; n <= BOARD_SIZE; n++) {
      const { row, col } = cellPosition(n)
      expect(row).toBeGreaterThanOrEqual(0)
      expect(row).toBeLessThan(ROWS)
      expect(col).toBeGreaterThanOrEqual(0)
      expect(col).toBeLessThan(COLS)
      seen.add(`${row},${col}`)
    }
    expect(seen.size).toBe(BOARD_SIZE)
  })
})

describe('蛇梯棋 · 掷骰与移动', () => {
  it('开局所有人都在 1 号格，轮到第一个玩家', () => {
    const state = setup()
    expect(state.positions).toEqual({ child: 1, bear: 1 })
    expect(currentPlayer(state)).toBe('child')
  })

  it('骰子点数永远在 1-6 之间，且棋子按点数前进', () => {
    let state = setup()
    for (let i = 0; i < 40; i++) {
      const before = state.positions[currentPlayer(state)!]
      const rolled = applyAction(state, { type: 'roll' })
      if (rolled === state) break
      const move = rolled.lastMove!
      expect(move.roll).toBeGreaterThanOrEqual(1)
      expect(move.roll).toBeLessThanOrEqual(6)
      expect(move.landed).toBe(Math.min(before + move.roll, BOARD_SIZE))
      state = applyAction(rolled, { type: 'endTurn' })
      if (isFinished(rolled)) break
    }
  })

  it('踩到梯子会爬上去', () => {
    const ladderFrom = Number(Object.keys(LADDERS)[0])
    // 摆在梯子前一格，掷到 1 就会踩中
    let state = place(setup(), 'child', ladderFrom - 1)
    for (let seed = 0; seed < 60; seed++) {
      const attempt = applyAction({ ...state, rng: state.rng + seed }, { type: 'roll' })
      if (attempt.lastMove?.landed === ladderFrom) {
        expect(attempt.lastMove.kind).toBe('ladder')
        expect(attempt.lastMove.final).toBe(LADDERS[ladderFrom])
        expect(attempt.positions.child).toBe(LADDERS[ladderFrom])
        return
      }
    }
    throw new Error('没掷出踩中梯子的点数')
  })

  it('踩到滑梯会滑下去', () => {
    const slideFrom = Number(Object.keys(SLIDES)[0])
    const state = place(setup(), 'child', slideFrom - 1)
    for (let seed = 0; seed < 60; seed++) {
      const attempt = applyAction({ ...state, rng: state.rng + seed }, { type: 'roll' })
      if (attempt.lastMove?.landed === slideFrom) {
        expect(attempt.lastMove.kind).toBe('slide')
        expect(attempt.lastMove.final).toBe(SLIDES[slideFrom])
        return
      }
    }
    throw new Error('没掷出踩中滑梯的点数')
  })

  it('走过头也算到终点 —— 不需要正好掷中', () => {
    const state = place(setup(), 'child', BOARD_SIZE - 1)
    const rolled = applyAction(state, { type: 'roll' })
    expect(rolled.positions.child).toBe(BOARD_SIZE)
    expect(isFinished(rolled)).toBe(true)
    expect(getWinner(rolled)).toBe('child')
  })
})

describe('蛇梯棋 · 回合流转', () => {
  it('掷完骰子还是自己的回合，endTurn 之后才换人', () => {
    const state = setup()
    const rolled = applyAction(state, { type: 'roll' })
    expect(currentPlayer(rolled)).toBe('child')
    expect(rolled.lastMove).not.toBeNull()

    const next = applyAction(rolled, { type: 'endTurn' })
    expect(currentPlayer(next)).toBe('bear')
    expect(next.lastMove).toBeNull()
  })

  it('三个人轮流转一圈回到第一个人', () => {
    let state = setup([child, bear, cat])
    const order: string[] = []
    for (let i = 0; i < 4; i++) {
      order.push(currentPlayer(state)!)
      state = applyAction(applyAction(state, { type: 'roll' }), { type: 'endTurn' })
    }
    expect(order).toEqual(['child', 'bear', 'cat', 'child'])
  })

  it('没掷骰子之前只能掷骰子，掷完只能结束回合', () => {
    const state = setup()
    expect(getLegalActions(state, 'child')).toEqual([{ type: 'roll' }])
    const rolled = applyAction(state, { type: 'roll' })
    expect(getLegalActions(rolled, 'child')).toEqual([{ type: 'endTurn' }])
  })

  it('不是你的回合就没有合法动作', () => {
    const state = setup()
    expect(getLegalActions(state, 'bear')).toEqual([])
  })
})

describe('蛇梯棋 · 非法操作原样返回，不抛异常', () => {
  it('一个回合里掷两次骰子无效', () => {
    const rolled = applyAction(setup(), { type: 'roll' })
    expect(applyAction(rolled, { type: 'roll' })).toBe(rolled)
  })

  it('没掷骰子就结束回合无效', () => {
    const state = setup()
    expect(applyAction(state, { type: 'endTurn' })).toBe(state)
  })

  it('分出胜负之后不能再掷', () => {
    const won = applyAction(place(setup(), 'child', BOARD_SIZE - 1), { type: 'roll' })
    const cleared = applyAction(won, { type: 'endTurn' })
    expect(isFinished(cleared)).toBe(true)
    expect(applyAction(cleared, { type: 'roll' })).toBe(cleared)
    // 赢了之后回合不再往下转，停在赢家身上
    expect(currentPlayer(cleared)).toBe('child')
  })

  it('applyAction 不修改传进去的状态', () => {
    const state = setup()
    const snapshot = JSON.stringify(state)
    applyAction(state, { type: 'roll' })
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})

describe('蛇梯棋 · 可复现', () => {
  it('同一个 seed 掷出同一串点数', () => {
    const rolls = (seed: number) => {
      let state = setup([child, bear], seed)
      const out: number[] = []
      for (let i = 0; i < 12; i++) {
        const rolled = applyAction(state, { type: 'roll' })
        out.push(rolled.lastMove!.roll)
        state = applyAction(rolled, { type: 'endTurn' })
        if (isFinished(rolled)) break
      }
      return out
    }
    expect(rolls(2026)).toEqual(rolls(2026))
    expect(rolls(2026)).not.toEqual(rolls(2027))
  })

  it('一局总能在合理步数内结束（不会卡死）', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let state = setup([child, bear], seed)
      let turns = 0
      while (!isFinished(state) && turns < 300) {
        state = applyAction(applyAction(state, { type: 'roll' }), { type: 'endTurn' })
        turns++
      }
      expect(isFinished(state)).toBe(true)
      expect(getWinner(state)).not.toBeNull()
    }
  })
})
