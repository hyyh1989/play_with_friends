import { createRng, nextFloat, type RngState } from '../../core/rng'
import type { GameConfig, PlayerRef } from '../../core/types'

/**
 * 四子棋的规则引擎。
 *
 * 选它来替掉蛇梯棋，是因为它有**真正的选择**（往哪一列丢），但规则一句话讲完，
 * 而且落子有掉落的手感。蛇梯棋的问题是零选择 = 零参与感（见 docs/DESIGN.md 5.2）。
 *
 * 棋盘坐标：index = row * COLS + col，**row 0 是最上面一行**。
 * 丢进某一列时棋子落到那一列最下面的空位。
 */

export const COLS = 7
export const ROWS = 6
/** 连成几个算赢 */
export const WIN_LENGTH = 4

/** 每格要么空着，要么是某个玩家的 id */
export type Cell = string | null

export interface Connect4State {
  players: PlayerRef[]
  board: Cell[]
  currentIndex: number
  rng: RngState
  /** 刚落的那一子，界面用来播掉落动画 */
  lastDrop: { col: number; row: number; playerId: string } | null
  winner: string | null
  /** 连成一线的那四格，界面用来高亮 */
  winningCells: number[]
}

export type Connect4Action = { type: 'drop'; col: number }

export const at = (row: number, col: number) => row * COLS + col

export function createInitialState(config: GameConfig): Connect4State {
  return {
    players: config.players,
    board: Array<Cell>(COLS * ROWS).fill(null),
    currentIndex: 0,
    rng: createRng(config.seed),
    lastDrop: null,
    winner: null,
    winningCells: [],
  }
}

export function currentPlayer(state: Connect4State): string | null {
  return state.players[state.currentIndex]?.id ?? null
}

export function isBoardFull(state: Connect4State): boolean {
  return state.board.every((cell) => cell !== null)
}

export function isFinished(state: Connect4State): boolean {
  return state.winner !== null || isBoardFull(state)
}

export function getWinner(state: Connect4State): string | null {
  return state.winner
}

/** 这一列还能不能丢（最上面一格空着就还能） */
export function canDrop(state: Connect4State, col: number): boolean {
  if (col < 0 || col >= COLS) return false
  return state.board[at(0, col)] === null
}

/** 丢进这一列会落在第几行。满了或越界返回 -1 */
export function landingRow(state: Connect4State, col: number): number {
  // 不检查范围的话，col = -1 会算出一个"隔壁行末尾"的合法下标，落子落到别处去
  if (col < 0 || col >= COLS) return -1
  for (let row = ROWS - 1; row >= 0; row--) {
    if (state.board[at(row, col)] === null) return row
  }
  return -1
}

export function getLegalActions(state: Connect4State, playerId: string): Connect4Action[] {
  if (currentPlayer(state) !== playerId || isFinished(state)) return []
  const actions: Connect4Action[] = []
  for (let col = 0; col < COLS; col++) {
    if (canDrop(state, col)) actions.push({ type: 'drop', col })
  }
  return actions
}

const DIRECTIONS = [
  [0, 1], // 横
  [1, 0], // 竖
  [1, 1], // 右下斜
  [1, -1], // 左下斜
] as const

/** 从刚落的那一子出发，四个方向数过去，够 4 个就赢 */
function findWinningCells(board: Cell[], row: number, col: number): number[] {
  const who = board[at(row, col)]
  if (!who) return []

  for (const [dr, dc] of DIRECTIONS) {
    const line = [at(row, col)]
    for (const sign of [1, -1]) {
      let r = row + dr * sign
      let c = col + dc * sign
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[at(r, c)] === who) {
        line.push(at(r, c))
        r += dr * sign
        c += dc * sign
      }
    }
    if (line.length >= WIN_LENGTH) return line
  }
  return []
}

export function applyAction(input: Connect4State, action: Connect4Action): Connect4State {
  if (isFinished(input)) return input
  const playerId = currentPlayer(input)
  if (!playerId) return input

  const row = landingRow(input, action.col)
  // 非法操作原样返回，不抛异常 —— 孩子会乱点满了的列
  if (row < 0) return input

  const board = input.board.slice()
  board[at(row, action.col)] = playerId

  const winningCells = findWinningCells(board, row, action.col)
  const winner = winningCells.length > 0 ? playerId : null
  // 每步推进一次随机源，AI 的"故意犯错"才会每步不同（UNO 踩过这个坑）
  const [, rng] = nextFloat(input.rng)

  const next: Connect4State = {
    ...input,
    board,
    rng,
    lastDrop: { col: action.col, row, playerId },
    winner,
    winningCells,
  }

  if (winner || isBoardFull(next)) return next
  return { ...next, currentIndex: (next.currentIndex + 1) % next.players.length }
}
