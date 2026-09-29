import { createRng, nextFloat, shuffle, type RngState } from '../../core/rng'
import type { GameConfig, PlayerRef } from '../../core/types'

/**
 * UNO 的规则引擎。
 *
 * 做法是**实现完整规则，然后用"牌组里放哪些牌"调难度**（见 docs/DESIGN.md 5.3）。
 * 不是简化版，也不是四套代码 —— enabledCardTypes 只是发牌时的配置。
 * 难度阶梯本身就是教学路径：每解锁一种功能牌，就是教孩子一个新概念，
 * 而已经掌握的部分完全不变。
 *
 * 明确不做的两条：
 * - **质疑（挑战万能 +4）**：要推理别人手里有什么，远超这个年龄
 * - **累计叠加加牌**：不是官方规则，且会造成一次抽 6-8 张的挫败
 *
 * 喊 UNO 不需要孩子操作，也不会因为忘记而被罚（界面自动播音效）。
 */

export const COLORS = ['red', 'yellow', 'green', 'blue'] as const
export type CardColor = (typeof COLORS)[number]

export type CardKind = 'number' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4'

export interface Card {
  id: string
  kind: CardKind
  /** 万能牌没有固有颜色 */
  color: CardColor | null
  /** 只有数字牌有 */
  value: number | null
}

/** 牌组等级：用"放哪些牌"调难度，L1 只有数字牌 */
export type UnoLevel = 1 | 2 | 3 | 4

export const LEVEL_KINDS: Record<UnoLevel, CardKind[]> = {
  1: ['number'],
  2: ['number', 'skip'],
  3: ['number', 'skip', 'reverse', 'draw2'],
  4: ['number', 'skip', 'reverse', 'draw2', 'wild', 'wild4'],
}

export const HAND_SIZE = 5

export interface UnoState {
  players: PlayerRef[]
  hands: Record<string, Card[]>
  drawPile: Card[]
  discardPile: Card[]
  /** 当前有效颜色。万能牌打出后由出牌者指定，所以不能只看弃牌堆顶 */
  activeColor: CardColor
  currentIndex: number
  /** 1 = 顺时针，-1 = 逆时针（反转牌会改这个） */
  direction: 1 | -1
  rng: RngState
  /**
   * **裁剪过的局面才有这个字段**：每个人手上几张牌。
   *
   * 完整局面里没有它（张数从 `hands` 现算）。所以**一律用 `handSize()` 读张数，
   * 别直接 `hands[谁].length`** —— 裁剪版里别人的手牌根本不在。
   */
  handCounts?: Record<string, number>
  /**
   * 这一份是发给某一个玩家看的**裁剪版**，缺了别人的手牌、摸牌堆和 rng。
   * ⚠️ **只能拿来显示，绝不能喂回 `applyAction`。**
   * 联机时客户端本来就不跑规则引擎（只发动作、由服务端算），所以不会踩到；
   * 留这个标记是为了在开发者工具里一眼看出手上是哪一份。
   */
  redacted?: true
  /** 上一步发生了什么，界面用来播动画和音效 */
  lastEvent:
    | { type: 'play'; playerId: string; card: Card }
    | { type: 'draw'; playerId: string; count: number }
    | { type: 'skipped'; playerId: string }
    | null
}

export type UnoAction =
  | { type: 'play'; cardId: string; chosenColor?: CardColor }
  | { type: 'draw' }

function buildDeck(kinds: CardKind[], rng: RngState): [Card[], RngState] {
  const cards: Card[] = []
  let n = 0
  const add = (kind: CardKind, color: CardColor | null, value: number | null) => {
    cards.push({ id: `c${n++}`, kind, color, value })
  }

  for (const color of COLORS) {
    // 官方牌组：0 各一张，1-9 各两张
    add('number', color, 0)
    for (let v = 1; v <= 9; v++) {
      add('number', color, v)
      add('number', color, v)
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      if (!kinds.includes(kind)) continue
      add(kind, color, null)
      add(kind, color, null)
    }
  }
  if (kinds.includes('wild')) for (let i = 0; i < 4; i++) add('wild', null, null)
  if (kinds.includes('wild4')) for (let i = 0; i < 4; i++) add('wild4', null, null)

  return shuffle(cards, rng)
}

export function createInitialState(config: GameConfig): UnoState {
  const level = (config.variant?.level as UnoLevel) ?? 1
  let rng = createRng(config.seed)

  const [deck, afterDeck] = buildDeck(LEVEL_KINDS[level], rng)
  rng = afterDeck

  const hands: Record<string, Card[]> = {}
  let cursor = 0
  for (const player of config.players) {
    hands[player.id] = deck.slice(cursor, cursor + HAND_SIZE)
    cursor += HAND_SIZE
  }

  // 起始牌必须是普通数字牌，避免开局就触发功能牌，规则解释不清
  let startIndex = deck.findIndex((c, i) => i >= cursor && c.kind === 'number')
  if (startIndex < 0) startIndex = cursor
  const start = deck[startIndex]
  const rest = deck.filter((_, i) => i >= cursor && i !== startIndex)

  return {
    players: config.players,
    hands,
    drawPile: rest,
    discardPile: [start],
    activeColor: start.color ?? COLORS[0],
    currentIndex: 0,
    direction: 1,
    rng,
    lastEvent: null,
  }
}

export function currentPlayer(state: UnoState): string | null {
  return state.players[state.currentIndex]?.id ?? null
}

export function topCard(state: UnoState): Card {
  return state.discardPile[state.discardPile.length - 1]
}

/**
 * 某个人手上几张牌。
 *
 * ⚠️ **判张数一律走这里，不要直接读 `hands[谁].length`。**
 * 联机时每个人收到的是**裁剪版**：只有自己的手牌，别人的只剩一个数字
 * （`handCounts`）。直接读 `hands` 的话，别人的那一项是 `undefined` ——
 * 而 `undefined?.length === 0` 是 `false`，**不会报错，只会静静地算错**。
 * `isFinished` 当初就是这么写的：对手打完最后一张牌，你这边永远不结算。
 */
export function handSize(state: UnoState, playerId: string): number {
  return state.handCounts?.[playerId] ?? state.hands[playerId]?.length ?? 0
}

/** 所有人各几张。界面算"这一步是不是新的"要用到总数 */
export function handSizes(state: UnoState): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of state.players) out[p.id] = handSize(state, p.id)
  return out
}

export function isFinished(state: UnoState): boolean {
  return state.players.some((p) => handSize(state, p.id) === 0)
}

export function getWinner(state: UnoState): string | null {
  const winner = state.players.find((p) => handSize(state, p.id) === 0)
  return winner?.id ?? null
}

/**
 * 发给 `playerId` 的那一份局面：**把他不该看见的东西去掉**。
 *
 * 不做的话，打开开发者工具看一眼 WebSocket 就能拿到：
 *   - `hands` —— 所有人的手牌，每张牌的颜色数字
 *   - `drawPile` —— **整个摸牌堆的顺序，等于这一局剩下的全部未来**
 *   - `rng` —— 种子状态，能推算后面的洗牌
 * 第二条才是真正严重的：不只是偷看对手，是接下来每张牌是什么都已经写好了。
 *
 * 留下的都是本来就该公开的：弃牌堆、当前颜色、轮到谁、方向、各人还剩几张。
 * ⚠️ 结果**只能显示，不能喂回规则引擎**（见 `UnoState.redacted`）。
 */
export function redactFor(state: UnoState, playerId: string): UnoState {
  return {
    ...state,
    // 只留自己的牌。**不是留一个空数组** —— 那样 handSize 会安静地算出 0
    hands: { [playerId]: state.hands[playerId] ?? [] },
    handCounts: handSizes(state),
    drawPile: [],
    rng: 0,
    redacted: true,
  }
}

/** 这张牌现在能不能出 */
export function canPlay(state: UnoState, card: Card): boolean {
  if (card.kind === 'wild' || card.kind === 'wild4') return true
  const top = topCard(state)
  if (card.color === state.activeColor) return true
  if (card.kind === 'number' && top.kind === 'number' && card.value === top.value) return true
  return card.kind !== 'number' && card.kind === top.kind
}

/** 手里最多的颜色。万能牌没指定颜色时用它兜底 */
export function dominantColor(hand: Card[], fallback: CardColor): CardColor {
  const counts = new Map<CardColor, number>()
  hand.forEach((c) => c.color && counts.set(c.color, (counts.get(c.color) ?? 0) + 1))
  let best: CardColor | null = null
  counts.forEach((n, color) => {
    if (!best || n > (counts.get(best) ?? 0)) best = color
  })
  return best ?? fallback
}

export function getLegalActions(state: UnoState, playerId: string): UnoAction[] {
  if (currentPlayer(state) !== playerId || isFinished(state)) return []
  const hand = state.hands[playerId] ?? []
  const plays: UnoAction[] = hand
    .filter((card) => canPlay(state, card))
    .map((card) => {
      // 万能牌必须带颜色才是一个可以直接执行的动作，这里给个默认值，
      // 界面会用孩子选的颜色覆盖掉
      const isWild = card.kind === 'wild' || card.kind === 'wild4'
      return isWild
        ? { type: 'play' as const, cardId: card.id, chosenColor: dominantColor(hand, state.activeColor) }
        : { type: 'play' as const, cardId: card.id }
    })
  // 没牌可出就抽一张；有牌可出时也允许抽（孩子可能就是不想出）
  return [...plays, { type: 'draw' }]
}

function nextIndex(state: UnoState, step = 1): number {
  const count = state.players.length
  return (state.currentIndex + state.direction * step + count * step) % count
}

/** 摸牌堆空了就把弃牌堆（除顶牌）洗回去 */
function refill(state: UnoState): UnoState {
  if (state.drawPile.length > 0) return state
  const top = topCard(state)
  const recycled = state.discardPile.slice(0, -1)
  if (recycled.length === 0) return state
  const [shuffled, rng] = shuffle(recycled, state.rng)
  return { ...state, drawPile: shuffled, discardPile: [top], rng }
}

function drawCards(state: UnoState, playerId: string, count: number): UnoState {
  let next = state
  const taken: Card[] = []
  for (let i = 0; i < count; i++) {
    next = refill(next)
    if (next.drawPile.length === 0) break
    taken.push(next.drawPile[0])
    next = { ...next, drawPile: next.drawPile.slice(1) }
  }
  return {
    ...next,
    hands: { ...next.hands, [playerId]: [...(next.hands[playerId] ?? []), ...taken] },
  }
}

export function applyAction(input: UnoState, action: UnoAction): UnoState {
  if (isFinished(input)) return input
  const playerId = currentPlayer(input)
  if (!playerId) return input

  /*
   * 每个动作都推进一次随机数状态。
   *
   * 这个游戏除了洗牌不需要随机，所以一开始没推进 —— 结果 AI 的"故意犯错"判定
   * 整局都读到同一个随机值，要么每一步都犯错、要么一步都不犯，难度等于没生效。
   * 纯函数规则引擎里随机源的状态必须跟着状态走，这是配套的代价。
   */
  const state: UnoState = { ...input, rng: nextFloat(input.rng)[1] }
  // 动作非法时要返回【原始】入参，调用方靠引用相等判断"没反应"
  const reject = () => input

  if (action.type === 'draw') {
    const drawn = drawCards(state, playerId, 1)
    if (drawn === state) return reject()
    return {
      ...drawn,
      currentIndex: nextIndex(drawn),
      lastEvent: { type: 'draw', playerId, count: 1 },
    }
  }

  const hand = state.hands[playerId] ?? []
  const card = hand.find((c) => c.id === action.cardId)
  if (!card || !canPlay(state, card)) return reject()

  const isWild = card.kind === 'wild' || card.kind === 'wild4'
  // 万能牌必须指定颜色；没指定就当非法（界面负责先让人选）
  if (isWild && !action.chosenColor) return reject()

  let next: UnoState = {
    ...state,
    hands: { ...state.hands, [playerId]: hand.filter((c) => c.id !== card.id) },
    discardPile: [...state.discardPile, card],
    activeColor: isWild ? action.chosenColor! : card.color!,
    lastEvent: { type: 'play', playerId, card },
  }

  if (next.hands[playerId].length === 0) return next

  // 反转：两人局里等同于跳过（转一圈回到自己）
  if (card.kind === 'reverse') {
    next = { ...next, direction: (next.direction * -1) as 1 | -1 }
    if (next.players.length === 2) {
      return { ...next, currentIndex: nextIndex(next, 2) }
    }
    return { ...next, currentIndex: nextIndex(next) }
  }

  if (card.kind === 'skip') {
    return { ...next, currentIndex: nextIndex(next, 2) }
  }

  if (card.kind === 'draw2' || card.kind === 'wild4') {
    const victim = next.players[nextIndex(next)].id
    const count = card.kind === 'draw2' ? 2 : 4
    // 官方规则：被加牌的人抽牌并跳过一轮，不做累计叠加
    next = drawCards(next, victim, count)
    return { ...next, currentIndex: nextIndex(next, 2) }
  }

  return { ...next, currentIndex: nextIndex(next) }
}

/** 剩一张牌的人。界面据此自动播 UNO 音效，孩子不需要操作也不会被罚 */
export function playersAtUno(state: UnoState): string[] {
  return state.players.filter((p) => state.hands[p.id]?.length === 1).map((p) => p.id)
}
