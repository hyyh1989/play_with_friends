import { createRng, nextInt, type RngState } from '../../core/rng'
import type { GameConfig, PlayerRef } from '../../core/types'

/**
 * 蛇梯棋的规则引擎。
 *
 * 玩法就一句话：掷骰子往前走，踩到梯子往上爬，踩到滑梯往下滑，先到终点的赢。
 * 全程没有任何选择 —— 这正是它适合 5 岁孩子的原因：**没有人会"玩得不好"**，
 * 输赢纯靠运气，不会有挫败感。也因此难度设置对这个游戏无效（见 ai.ts）。
 *
 * 和翻牌配对一样是 roll / endTurn 两段式：规则只负责算，停顿多久、棋子怎么
 * 一格一格跳，都是界面的事。
 */

export const BOARD_SIZE = 50
export const COLS = 10
export const ROWS = 5

/** 梯子：踩到 key 就爬到 value */
export const LADDERS: Readonly<Record<number, number>> = {
  3: 22,
  8: 26,
  20: 38,
  28: 44,
}

/** 滑梯：踩到 key 就滑到 value */
export const SLIDES: Readonly<Record<number, number>> = {
  17: 4,
  32: 13,
  41: 24,
  47: 29,
}

export interface SnakesMove {
  playerId: string
  roll: number
  from: number
  /** 骰子走完落在哪 */
  landed: number
  /** 梯子/滑梯生效之后的最终位置 */
  final: number
  kind: 'plain' | 'ladder' | 'slide'
}

export interface SnakesState {
  players: PlayerRef[]
  positions: Record<string, number>
  currentIndex: number
  rng: RngState
  /** 本回合刚发生的移动。不为空 = 还在展示动画，等 endTurn */
  lastMove: SnakesMove | null
}

export type SnakesAction = { type: 'roll' } | { type: 'endTurn' }

export function createInitialState(config: GameConfig): SnakesState {
  return {
    players: config.players,
    // 所有人从 1 号格起步，不搞"未入场"那套，棋盘上一眼看得到自己
    positions: Object.fromEntries(config.players.map((p) => [p.id, 1])),
    currentIndex: 0,
    rng: createRng(config.seed),
    lastMove: null,
  }
}

export function currentPlayer(state: SnakesState): string | null {
  return state.players[state.currentIndex]?.id ?? null
}

export function isFinished(state: SnakesState): boolean {
  return Object.values(state.positions).some((p) => p >= BOARD_SIZE)
}

export function getWinner(state: SnakesState): string | null {
  const winner = state.players.find((p) => (state.positions[p.id] ?? 0) >= BOARD_SIZE)
  return winner?.id ?? null
}

export function getLegalActions(state: SnakesState, playerId: string): SnakesAction[] {
  if (currentPlayer(state) !== playerId) return []
  if (isFinished(state)) return []
  return state.lastMove ? [{ type: 'endTurn' }] : [{ type: 'roll' }]
}

export function applyAction(state: SnakesState, action: SnakesAction): SnakesState {
  return action.type === 'roll' ? roll(state) : endTurn(state)
}

function roll(state: SnakesState): SnakesState {
  if (state.lastMove || isFinished(state)) return state
  const playerId = currentPlayer(state)
  if (!playerId) return state

  const [dice, rng] = nextInt(state.rng, 1, 6)
  const from = state.positions[playerId] ?? 1
  // 不要求"正好走到终点"—— 走过头也算赢。
  // 经典规则里多出来的步数要往回退，对 5 岁孩子只是徒增挫败。
  const landed = Math.min(from + dice, BOARD_SIZE)

  const ladder = LADDERS[landed]
  const slide = SLIDES[landed]
  const final = ladder ?? slide ?? landed
  const kind: SnakesMove['kind'] = ladder ? 'ladder' : slide ? 'slide' : 'plain'

  return {
    ...state,
    rng,
    positions: { ...state.positions, [playerId]: final },
    lastMove: { playerId, roll: dice, from, landed, final, kind },
  }
}

function endTurn(state: SnakesState): SnakesState {
  if (!state.lastMove) return state
  if (isFinished(state)) return { ...state, lastMove: null }
  return {
    ...state,
    lastMove: null,
    currentIndex: (state.currentIndex + 1) % state.players.length,
  }
}

/**
 * 格子在棋盘上的位置。路径是蛇形的：第一行从左往右，第二行从右往左，
 * 以此类推 —— 这样走起来是一条连续的路，不会走到行尾突然跳回左边。
 *
 * 返回的 row 以最上面一行为 0（方便直接喂给 CSS grid）。
 */
export function cellPosition(square: number): { row: number; col: number } {
  const index = square - 1
  const rowFromBottom = Math.floor(index / COLS)
  const indexInRow = index % COLS
  const col = rowFromBottom % 2 === 0 ? indexInRow : COLS - 1 - indexInRow
  return { row: ROWS - 1 - rowFromBottom, col }
}
