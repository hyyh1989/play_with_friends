import { createRng, nextFloat, nextInt, shuffle, type RngState } from '../../core/rng'
import type { GameConfig, PlayerRef } from '../../core/types'

/**
 * 找相同（Dobble / Spot It）的规则引擎。
 *
 * 整个游戏建立在一个几何事实上：**任意两张牌，恰好有且只有一个相同的图案**。
 * 这不是随机凑出来的，是"有限投影平面"的性质 —— 见 buildDeck 的注释。
 *
 * 桌面上有三张牌：中间一张**公共牌**，上下各一张属于一个人。
 * 每个人拿自己的牌去跟中间那张比，所以两个人要找的答案通常不是同一个，可以各找各的。
 *
 * 怎么算答对是**两步**（2026-09-24 用户实测后改的）：
 *   1. 在【自己的牌】上点中一个图案 —— 选中，亮起来
 *   2. 在【中间的公共牌】上点中同一个 —— 对上了，得分
 * 原来是一步（在自己牌上点对就得分），问题是缺一个"我选的是这个"的中间状态：
 * 点错了只是灰一下，孩子无从判断到底是自己点错了、还是系统没收到。
 * 改成两步之后，"这两个是一样的"变成她亲手指出来的一件事，而不是系统替她判定的。
 *
 * 和别的游戏不同，这里**没有轮次** —— 两个人同时看、同时抢，
 * 所以 currentPlayer() 恒为 null。
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

/** 一次操作的结果，界面靠它播反馈 */
export type FeedbackKind =
  /** 在自己牌上选中了 */
  | 'pick'
  /** 在公共牌上对上了自己选的那个 */
  | 'hit'
  /** 在公共牌上点的和谁选的都不一样 */
  | 'miss'
  /** 谁都还没选就先去点公共牌 —— 要提示"先点自己那张" */
  | 'needPick'

/** 一个人当前选中的图案。seq 用来在两人选了同一个时判定谁先 */
export interface Pick {
  symbol: number
  seq: number
}

export interface DobbleState {
  players: PlayerRef[]
  order: DobbleOrder
  /** 洗好的牌堆，每张牌是一组图案编号 */
  deck: number[][]
  /** 下一张要发的牌在 deck 里的下标 */
  next: number
  /** 中间那张公共牌，两个人都拿自己的牌跟它比 */
  center: number[]
  /** 每人面前的那张牌 */
  cards: Record<string, number[]>
  /** 每人在自己牌上选中的那个（还没去公共牌确认） */
  picks: Record<string, Pick | null>
  /** 选中的先后次序，只增不减 */
  pickSeq: number
  scores: Record<string, number>
  round: number
  /** 先到几分赢 */
  target: number
  rng: RngState
  /** 上一次操作的结果。playerId 为 null = 这一下认不出是谁点的（只会是 miss/needPick） */
  feedback: { playerId: string | null; symbol: number; kind: FeedbackKind } | null
  winner: string | null
}

export type DobbleAction =
  /** 点自己牌上的一个图案 */
  | { type: 'pick'; playerId: string; symbol: number }
  /**
   * 点中间公共牌上的一个图案。
   *
   * **故意不带 playerId** —— 公共牌是共用的，屏幕根本分不清按下去的是谁的手指。
   * 由规则按"这一下对上了谁选的那个"来认领：一次成功的确认必然只匹配得上一个人，
   * 所以认领是确定的，不用猜。这也正是把牌改成"中间一张公共的"之后白赚到的好处。
   */
  | { type: 'confirm'; symbol: number }
  /** 取消选中（限时到了，或者自己改主意） */
  | { type: 'clear'; playerId: string }

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

/** 这个人这一局要找的那个 = 他的牌和公共牌共享的那个 */
export function targetFor(state: DobbleState, playerId: string): number {
  return sharedSymbol(state.cards[playerId] ?? [], state.center)
}

/** 发新的一轮：中间一张 + 每人一张。牌不够了就重新洗一副 */
function deal(state: DobbleState): DobbleState {
  let { deck, next, rng } = state
  const need = state.players.length + 1
  if (next + need > deck.length) {
    const [shuffled, nextRng] = shuffle(deck, rng)
    deck = shuffled
    rng = nextRng
    next = 0
  }
  const center = deck[next]
  const cards: Record<string, number[]> = {}
  state.players.forEach((player, i) => {
    cards[player.id] = deck[next + 1 + i]
  })
  return {
    ...state,
    deck,
    rng,
    next: next + need,
    center,
    cards,
    picks: Object.fromEntries(state.players.map((p) => [p.id, null])),
  }
}

export function createInitialState(config: GameConfig): DobbleState {
  const order = (config.variant?.order as DobbleOrder) ?? 3
  const [deck, rng] = shuffle(buildDeck(order), createRng(config.seed))

  const base: DobbleState = {
    players: config.players,
    order,
    deck,
    next: 0,
    center: [],
    cards: {},
    picks: {},
    pickSeq: 0,
    scores: Object.fromEntries(config.players.map((p) => [p.id, 0])),
    round: 1,
    target: TARGET_SCORE,
    rng,
    feedback: null,
    winner: null,
  }
  return deal(base)
}

/** 抢答游戏没有"轮到谁"，两个人随时都能动 */
export function currentPlayer(): string | null {
  return null
}

export function isFinished(state: DobbleState): boolean {
  return state.winner !== null
}

export function getWinner(state: DobbleState): string | null {
  return state.winner
}

export function getLegalActions(state: DobbleState, playerId: string): DobbleAction[] {
  if (isFinished(state)) return []
  const own = state.cards[playerId] ?? []
  const picked = state.picks[playerId]

  // 还没选：只能在自己牌上选
  if (!picked) {
    return own.map((symbol) => ({ type: 'pick', playerId, symbol }) as DobbleAction)
  }

  // 选好了：去公共牌上确认，或者改选 / 取消
  return [
    ...state.center.map((symbol) => ({ type: 'confirm', symbol }) as DobbleAction),
    ...own.map((symbol) => ({ type: 'pick', playerId, symbol }) as DobbleAction),
    { type: 'clear', playerId } as DobbleAction,
  ]
}

/**
 * 这一下点在公共牌上，算谁的？
 *
 * 算"选中了同一个图案的那个人"。两个人恰好选了同一个时（他们各自和公共牌
 * 共享的碰巧是同一个图案），算**先选中的那个** —— 他先找到的。
 */
function resolveConfirm(state: DobbleState, symbol: number): string | null {
  let owner: string | null = null
  let bestSeq = Infinity
  for (const [playerId, pick] of Object.entries(state.picks)) {
    if (pick && pick.symbol === symbol && pick.seq < bestSeq) {
      owner = playerId
      bestSeq = pick.seq
    }
  }
  return owner
}

export function applyAction(state: DobbleState, action: DobbleAction): DobbleState {
  if (isFinished(state)) return state

  /*
   * ⚠️ 每一个被接受的动作都要推进随机源，**"没用"的那种也要**。
   * 不推进的话 AI 下一次掷骰会读到一样的值、做出一样的选择，
   * 它会永远卡在同一个错误答案上（UNO 和这个游戏都栽过，见 CLAUDE.md）。
   */
  const [, rng] = nextFloat(state.rng)

  if (action.type === 'clear') {
    if (!state.picks[action.playerId]) return state
    return { ...state, rng, picks: { ...state.picks, [action.playerId]: null }, feedback: null }
  }

  if (action.type === 'pick') {
    const own = state.cards[action.playerId]
    // 点了自己牌上没有的东西 = 非法，原样返回（不抛异常，孩子会乱点）
    if (!own?.includes(action.symbol)) return state
    const seq = state.pickSeq + 1
    return {
      ...state,
      rng,
      pickSeq: seq,
      picks: { ...state.picks, [action.playerId]: { symbol: action.symbol, seq } },
      feedback: { playerId: action.playerId, symbol: action.symbol, kind: 'pick' },
    }
  }

  // ── confirm：点在中间的公共牌上 ──
  if (!state.center.includes(action.symbol)) return state

  // 谁都还没选就来点公共牌 → 提示"先点自己那张"
  if (!Object.values(state.picks).some(Boolean)) {
    return { ...state, rng, feedback: { playerId: null, symbol: action.symbol, kind: 'needPick' } }
  }

  const owner = resolveConfirm(state, action.symbol)
  /*
   * 没对上任何人选的那个。不扣分、也不清掉谁的选择（铁律 4：不做失败叙事），
   * 而且这一下本来就认不出是谁点的 —— 认不出就谁都别罚。
   * 界面会让公共牌抖一下并短暂不可点，这样乱按也讨不到便宜。
   */
  if (!owner) {
    return { ...state, rng, feedback: { playerId: null, symbol: action.symbol, kind: 'miss' } }
  }

  const scores = { ...state.scores, [owner]: (state.scores[owner] ?? 0) + 1 }
  const winner = scores[owner] >= state.target ? owner : null
  const scored: DobbleState = {
    ...state,
    rng,
    scores,
    winner,
    round: state.round + 1,
    feedback: { playerId: owner, symbol: action.symbol, kind: 'hit' },
  }

  // 赢了就停在这一局的牌面上，让孩子看清是哪个图案
  return winner ? scored : deal(scored)
}

/**
 * AI 的反应时间（毫秒）。纯函数：同一个局面永远算出同一个值。
 *
 * 这是 AI 在这个游戏里唯一的"难度旋钮" —— 它总能找到正确答案，只是慢。
 */
export function aiReactionMs(state: DobbleState, range: [number, number]): number {
  const [ms] = nextInt(state.rng, range[0], range[1])
  return ms
}
