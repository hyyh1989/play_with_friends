import { describe, expect, it } from 'vitest'
import {
  applyAction,
  at,
  canDrop,
  COLS,
  createInitialState,
  currentPlayer,
  getLegalActions,
  getWinner,
  isBoardFull,
  isFinished,
  landingRow,
  ROWS,
  type Connect4State,
} from '../src/games/connect4/rules'
import { bestDrop, chooseAiAction } from '../src/games/connect4/ai'
import type { Difficulty, GameConfig, PlayerRef } from '../src/core/types'

const child: PlayerRef = { id: 'child', kind: 'human', avatar: '🐻' }
const robot: PlayerRef = { id: 'ai1', kind: 'ai', avatar: '🤖', nameKey: 'ai.player1' }

function setup(players = [child, robot], seed = 42): Connect4State {
  const config: GameConfig = { players, difficulty: 'easy', seed }
  return createInitialState(config)
}

/** 依次往这些列丢子（轮流），返回最终局面 */
function drops(state: Connect4State, cols: number[]): Connect4State {
  return cols.reduce((s, col) => applyAction(s, { type: 'drop', col }), state)
}

describe('四子棋 · 落子', () => {
  it('开局棋盘是空的，轮到第一个玩家', () => {
    const state = setup()
    expect(state.board).toHaveLength(COLS * ROWS)
    expect(state.board.every((c) => c === null)).toBe(true)
    expect(currentPlayer(state)).toBe('child')
  })

  it('棋子落到那一列最下面的空位', () => {
    const state = applyAction(setup(), { type: 'drop', col: 3 })
    expect(state.board[at(ROWS - 1, 3)]).toBe('child')
    expect(state.lastDrop).toEqual({ col: 3, row: ROWS - 1, playerId: 'child' })
  })

  it('同一列继续丢会往上堆', () => {
    const state = drops(setup(), [3, 3, 3])
    expect(state.board[at(ROWS - 1, 3)]).toBe('child')
    expect(state.board[at(ROWS - 2, 3)]).toBe('ai1')
    expect(state.board[at(ROWS - 3, 3)]).toBe('child')
  })

  it('每落一子就换人', () => {
    const state = setup()
    expect(currentPlayer(applyAction(state, { type: 'drop', col: 0 }))).toBe('ai1')
  })

  it('列满了就不能再丢，点了没反应', () => {
    let state = setup()
    for (let i = 0; i < ROWS; i++) state = applyAction(state, { type: 'drop', col: 2 })
    expect(canDrop(state, 2)).toBe(false)
    expect(landingRow(state, 2)).toBe(-1)
    expect(applyAction(state, { type: 'drop', col: 2 })).toBe(state)
    // 满了的列不再出现在合法动作里
    expect(getLegalActions(state, currentPlayer(state)!).some((a) => a.col === 2)).toBe(false)
  })

  it('越界的列没反应', () => {
    const state = setup()
    expect(applyAction(state, { type: 'drop', col: -1 })).toBe(state)
    expect(applyAction(state, { type: 'drop', col: COLS })).toBe(state)
  })

  it('applyAction 不修改传进去的状态', () => {
    const state = setup()
    const snapshot = JSON.stringify(state)
    applyAction(state, { type: 'drop', col: 3 })
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})

describe('四子棋 · 怎么算赢', () => {
  it('横着连四个', () => {
    // 娃在 0-3 列铺底，机器人一直丢第 6 列
    const state = drops(setup(), [0, 6, 1, 6, 2, 6, 3])
    expect(getWinner(state)).toBe('child')
    expect(state.winningCells).toHaveLength(4)
  })

  it('竖着连四个', () => {
    const state = drops(setup(), [2, 5, 2, 5, 2, 5, 2])
    expect(getWinner(state)).toBe('child')
  })

  it('斜着连四个', () => {
    // 堆出一个阶梯：娃占 (底,0) (底-1,1) (底-2,2) (底-3,3)
    const state = drops(setup(), [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3])
    expect(getWinner(state)).toBe('child')
    expect(state.winningCells).toHaveLength(4)
  })

  it('只连三个不算赢', () => {
    const state = drops(setup(), [0, 6, 1, 6, 2])
    expect(getWinner(state)).toBeNull()
    expect(isFinished(state)).toBe(false)
  })

  it('赢了之后不再换人，也不能再落子', () => {
    const won = drops(setup(), [0, 6, 1, 6, 2, 6, 3])
    expect(isFinished(won)).toBe(true)
    expect(currentPlayer(won)).toBe('child')
    expect(applyAction(won, { type: 'drop', col: 4 })).toBe(won)
    expect(getLegalActions(won, 'child')).toEqual([])
  })

  it('棋盘填满且无人连成四个 = 平局，没有赢家但游戏结束', () => {
    // 手工摆一个填满的棋盘，保证没有四连
    const pattern = ['child', 'child', 'ai1', 'ai1']
    const board = Array.from({ length: COLS * ROWS }, (_, i) => {
      const row = Math.floor(i / COLS)
      const col = i % COLS
      return pattern[(row + Math.floor(col / 2) * 2) % 4]
    })
    const state: Connect4State = { ...setup(), board }
    if (!state.board.some((c) => c === null)) {
      expect(isBoardFull(state)).toBe(true)
      expect(isFinished(state)).toBe(true)
      expect(getWinner(state)).toBeNull()
    }
  })
})

describe('四子棋 AI', () => {
  it('能赢就赢', () => {
    // 娃先铺 0,1,2，轮到娃时第 3 列就是胜着
    const state = drops(setup(), [0, 6, 1, 6, 2, 6])
    expect(bestDrop(state, 'child')).toEqual({ type: 'drop', col: 3 })
  })

  it('对手快连成四个就去堵', () => {
    // 机器人在底排铺了 0,1,2，轮到娃，娃必须堵第 3 列。
    // 娃自己的子要散开（6,5,6），否则她自己就有胜着 —— 那时 AI 应该选择赢而不是堵
    const state = drops(setup(), [6, 0, 5, 1, 6, 2])
    expect(bestDrop(state, 'child')).toEqual({ type: 'drop', col: 3 })
  })

  it('能赢和要堵同时存在时，优先赢', () => {
    // 娃在第 6 列堆了三个（能赢），同时机器人底排 0,1,2 也差一个
    const state = drops(setup(), [6, 0, 6, 1, 6, 2])
    expect(bestDrop(state, 'child')).toEqual({ type: 'drop', col: 6 })
  })

  it('没有胜着也没有威胁时往中间放', () => {
    expect(bestDrop(setup(), 'child')).toEqual({ type: 'drop', col: 3 })
  })

  it('永远不会选一个执行不了的动作', () => {
    const difficulties: Difficulty[] = ['easy', 'normal', 'serious']
    for (const difficulty of difficulties) {
      let state = setup()
      for (let i = 0; i < 60 && !isFinished(state); i++) {
        const action = chooseAiAction(state, currentPlayer(state)!, difficulty)
        expect(action).not.toBeNull()
        const next = applyAction(state, action!)
        expect(next).not.toBe(state)
        state = next
      }
      expect(isFinished(state)).toBe(true)
    }
  })

  it('认真档对简单档，认真档赢得多（这个游戏有真技巧）', () => {
    let seriousWins = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      let state = setup([child, robot], seed)
      while (!isFinished(state)) {
        const who = currentPlayer(state)!
        const difficulty: Difficulty = who === 'ai1' ? 'serious' : 'easy'
        const action = chooseAiAction(state, who, difficulty)
        if (!action) break
        state = applyAction(state, action)
      }
      if (getWinner(state) === 'ai1') seriousWins++
    }
    // 和 UNO 不同，这里技巧真的有用
    expect(seriousWins).toBeGreaterThan(4)
  })
})
