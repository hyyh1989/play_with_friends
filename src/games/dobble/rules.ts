import { createRng, nextFloat, nextInt, shuffle, type RngState } from '../../core/rng'
import type { GameConfig, PlayerRef } from '../../core/types'

/**
 * 找相同（Dobble / Spot It）的规则引擎。
 *
 * 整个游戏建立在一个几何事实上：**任意两张牌，恰好有且只有一个相同的图案**。
 * 这不是随机凑出来的，是"有限投影平面"的性质 —— 见 buildDeck 的注释。
 * 有了这条，游戏规则就只剩一句话：找出两张牌上一样的那个，点它。
 *
 * 和别的游戏不同，这里**没有轮次** —— 两个人同时看、同时抢。
 * 所以 currentPlayer() 恒为 null，谁都可以随时出手。
 */

/**
 * 投影平面的阶数。每张牌上有 order + 1 个图案，一共 order² + order + 1 张牌。
 *
 * **只能是质数**（见 buildDeck）。所以可选的难度就是这三档：
 *   2 → 每张 3 个图案，7 张牌     （第一次玩）
 *   3 → 每张 4 个图案，13 张牌    （默认）
 *   5 → 每张 6 个图案，31 张牌    （接近真正的 Dobble）
 */
export type DobbleOrder = 2 | 3 | 5

export interface DobbleState {
  players: PlayerRef[]
  order: DobbleOrder
  /** 洗好的牌堆，每张牌是一组图案编号 */
  deck: number[][]
  /** 下一张要发的牌在 deck 里的下标 */
  next: number
  /** 每人面前的那张牌 */
  cards: Record<string, number[]>
  scores: Record<string, number>
  round: number
  /** 先到几分赢 */
  target: number
  rng: RngState
  /** 上一次点击的结果，界面用来播对/错的反馈 */
  lastTap: { playerId: string; symbol: number; correct: boolean } | null
  winner: string | null
}

export type DobbleAction = { type: 'tap'; playerId: string; symbol: number }

/** 先到几分算赢。太长了孩子会失去耐心，5 分大概两三分钟 */
export const TARGET_SCORE = 5

/**
 * 造一副"任意两张恰好共享一个图案"的牌。
 *
 * 用的是阶数为 n 的有限投影平面：
 *   - 图案总数 = 牌数 = n² + n + 1
 *   - 每张牌 n + 1 个图案
 *
 * 构造分三组：
 *   1 张：把前 n+1 个图案放一起
 *   n 张：第一个图案 + 第 i 组的全部
 *   n² 张：第 i+1 个图案 + 每组里按 (i*k + j) mod n 挑一个
 * 第三组的"斜率 i、截距 j"正是直线方程 y = i·x + j —— 两条不同的直线只交于一点，
 * 这就是"只共享一个图案"的来源。
 *
 * ⚠️ **n 必须是质数**，否则整个游戏是坏的。mod n 要构成一个域，两条直线才只交于一点；
 * n = 4 时 2×2 ≡ 0 (mod 4)，直线会退化 —— 实测 i=0,j=0 和 i=2,j=0 这两张牌会
 * **共享两个图案**，孩子点了"对的"却判错。有测试逐对检查 n = 2/3/5。
 */
export function buildDeck(order: number): number[][] {
  const cards: number[][] = []

  // 1. 过原点的那一"束"
  cards.push(Array.from({ length: order + 1 }, (_, i) => i))

  // 2. 竖直方向的 n 条线
  for (let i = 0; i < order; i++) {
    const card = [0]
    for (let j = 0; j < order; j++) card.push(order + 1 + order * i + j)
    cards.push(card)
  }

  // 3. 斜率 i、截距 j 的 n² 条线
  for (let i = 0; i < order; i++) {
    for (let j = 0; j < order; j++) {
      const card = [i + 1]
      for (let k = 0; k < order; k++) {
        card.push(order + 1 + order * k + ((i * k + j) % order))
      }
      cards.push(card)
    }
  }

  return cards
}

/** 两张牌共享的那个图案。构造保证有且只有一个 */
export function sharedSymbol(a: number[], b: number[]): number {
  for (const s of a) {
    if (b.includes(s)) return s
  }
  // 构造正确的话到不了这里
  return -1
}

/** 当前这一局两张牌共享的图案 */
export function currentTarget(state: DobbleState): number {
  const [first, second] = state.players.map((p) => state.cards[p.id] ?? [])
  return sharedSymbol(first, second)
}

/** 发两张新牌。牌不够了就重新洗一副 */
function deal(state: DobbleState): DobbleState {
  let { deck, next, rng } = state
  if (next + state.players.length > deck.length) {
    const [shuffled, nextRng] = shuffle(deck, rng)
    deck = shuffled
    rng = nextRng
    next = 0
  }
  const cards: Record<string, number[]> = {}
  state.players.forEach((player, i) => {
    cards[player.id] = deck[next + i]
  })
  return { ...state, deck, rng, next: next + state.players.length, cards }
}

export function createInitialState(config: GameConfig): DobbleState {
  const order = (config.variant?.order as DobbleOrder) ?? 3
  const [deck, rng] = shuffle(buildDeck(order), createRng(config.seed))

  const base: DobbleState = {
    players: config.players,
    order,
    deck,
    next: 0,
    cards: {},
    scores: Object.fromEntries(config.players.map((p) => [p.id, 0])),
    round: 1,
    target: TARGET_SCORE,
    rng,
    lastTap: null,
    winner: null,
  }
  return deal(base)
}

/** 抢答游戏没有"轮到谁"，两个人随时都能点 */
export function currentPlayer(): string | null {
  return null
}

export function isFinished(state: DobbleState): boolean {
  return state.winner !== null
}

export function getWinner(state: DobbleState): string | null {
  return state.winner
}

/** 能点的就是自己牌上的每一个图案（包括点错的那些 —— 点错了才有"抢答"可言） */
export function getLegalActions(state: DobbleState, playerId: string): DobbleAction[] {
  if (isFinished(state)) return []
  return (state.cards[playerId] ?? []).map((symbol) => ({ type: 'tap', playerId, symbol }))
}

export function applyAction(state: DobbleState, action: DobbleAction): DobbleState {
  if (isFinished(state)) return state

  const card = state.cards[action.playerId]
  // 点了自己牌上没有的东西 = 非法，原样返回（不抛异常，孩子会乱点）
  if (!card || !card.includes(action.symbol)) return state

  const correct = action.symbol === currentTarget(state)
  const lastTap = { playerId: action.playerId, symbol: action.symbol, correct }

  /*
   * ⚠️ 每一次被接受的点击都要推进随机源，**点错的那次也要**。
   * 不推进的话，AI 下一次"要不要故意犯错"的掷骰会读到完全一样的值、
   * 挑中完全一样的那个错图案 —— 它会永远卡在同一个错误答案上，一分也拿不到。
   * （UNO 踩过一模一样的坑：rng 不动 → AI 整局的"故意失误"都是同一个结果。）
   */
  const [, rng] = nextFloat(state.rng)

  // 点错不扣分，只是这一下没用 —— 铁律 4：不做失败叙事
  if (!correct) return { ...state, rng, lastTap }

  const scores = { ...state.scores, [action.playerId]: (state.scores[action.playerId] ?? 0) + 1 }
  const winner = scores[action.playerId] >= state.target ? action.playerId : null
  const scored: DobbleState = { ...state, rng, scores, lastTap, winner, round: state.round + 1 }

  // 赢了就停在这一局的牌面上，让孩子看清是哪个图案
  return winner ? scored : deal(scored)
}

/**
 * AI 的反应时间（毫秒）。纯函数：同一个局面永远算出同一个值。
 *
 * 这是 AI 在这个游戏里唯一的"难度旋钮" —— 它总能找到正确答案，
 * 只是慢。慢到什么程度由难度定。
 */
export function aiReactionMs(state: DobbleState, range: [number, number]): number {
  const [ms] = nextInt(state.rng, range[0], range[1])
  return ms
}
