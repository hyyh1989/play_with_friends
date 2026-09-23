import {
  canPlay,
  currentPlayer,
  topCard,
  type Card,
  type CardColor,
  type UnoState,
} from './rules'

/**
 * 教学引导的大脑。
 *
 * 设计原则（和用户一起定的）：**情境教学，辅助逐渐撤掉**，而不是"先上完课再玩"。
 * - 不按课程表教，只在孩子**真的遇到**某个情况时才教那一条
 * - 不问"要不要继续学"，学完一条就自然继续打这一局
 * - 同一条规则做对几次之后，提示自己消失（脚手架撤掉）
 *
 * 这里只负责"该不该提示、提示什么"，纯函数，不碰 DOM 也不放声音。
 */

/** 每条规则做对几次之后就不再提示 */
export const MASTERY = 3

export type HintId =
  | 'colorMatch'
  | 'numberMatch'
  | 'mustDraw'
  | 'wildColor'
  | 'opponentCount'

export interface Hint {
  id: HintId
  /** 指向哪里 */
  target:
    | { kind: 'card'; cardId: string }
    | { kind: 'pile' }
    | { kind: 'colors' }
    | { kind: 'opponent' }
  /** 要播的语音 key（core/audio 的 speak） */
  voice: string
  /** 第一次遇到这条规则 —— 第一次要立刻讲，之后只在孩子卡住时才提示 */
  first: boolean
}

/** 每条规则已经做对多少次。存 localStorage。 */
export type CoachProgress = Partial<Record<HintId, number>>

export function isMastered(progress: CoachProgress, id: HintId): boolean {
  return (progress[id] ?? 0) >= MASTERY
}

/** 全部学完了就不用再教了 */
export function allMastered(progress: CoachProgress): boolean {
  const ids: HintId[] = ['colorMatch', 'numberMatch', 'mustDraw', 'wildColor']
  return ids.every((id) => isMastered(progress, id))
}

/** 这条规则一次都没讲过 */
function unseen(progress: CoachProgress, id: HintId): boolean {
  return (progress[id] ?? 0) === 0
}

function colorVoice(color: CardColor): string {
  return `uno.match.${color}`
}

/**
 * 现在该给什么提示。
 *
 * @param idle 轮到孩子之后已经等了多久（毫秒）。第一次遇到的规则立刻讲；
 *             已经见过的规则只在她卡住（idle 超过阈值）时才提示。
 */
export function nextHint(
  state: UnoState,
  progress: CoachProgress,
  idle: number,
  idleThreshold: number,
): Hint | null {
  if (currentPlayer(state) !== 'child') return null

  const hand = state.hands.child ?? []
  if (hand.length === 0) return null

  // 万能牌的选色弹层由界面单独触发，这里不管

  const playables = hand.filter((c) => canPlay(state, c))
  const top = topCard(state)
  const sameColor = playables.find((c) => c.color === state.activeColor)
  const sameNumber = playables.find(
    (c) =>
      c.kind === 'number' &&
      top.kind === 'number' &&
      c.value === top.value &&
      c.color !== state.activeColor,
  )

  /*
   * 顺序很重要：**从没讲过的规则优先**。
   *
   * 第一版写反了 —— 只要"同色"还没学满 3 次就一直教同色，结果"数字一样也能出"
   * 这条从头到尾没讲过（用户实测反馈）。已经讲过的规则不该挡住没讲过的。
   */
  if (playables.length === 0) {
    return gate('mustDraw', { kind: 'pile' }, 'uno.mustDraw')
  }

  if (sameColor && unseen(progress, 'colorMatch')) {
    return first('colorMatch', { kind: 'card', cardId: sameColor.id }, colorVoice(sameColor.color as CardColor))
  }
  if (sameNumber && unseen(progress, 'numberMatch')) {
    return first('numberMatch', { kind: 'card', cardId: sameNumber.id }, 'uno.matchNumber')
  }
  // 会出牌之后，再告诉她"可以盯着对手还剩几张"
  if (unseen(progress, 'opponentCount') && state.players.length > 1 && !unseen(progress, 'colorMatch')) {
    return first('opponentCount', { kind: 'opponent' }, 'uno.opponentCount')
  }

  // 讲过但还没熟的：不主动打扰，卡住了才提示
  if (sameColor && !isMastered(progress, 'colorMatch')) {
    return gate('colorMatch', { kind: 'card', cardId: sameColor.id }, colorVoice(sameColor.color as CardColor))
  }
  if (sameNumber && !isMastered(progress, 'numberMatch')) {
    return gate('numberMatch', { kind: 'card', cardId: sameNumber.id }, 'uno.matchNumber')
  }

  // 都学会了，只在卡住时指一下能出的牌
  if (idle >= idleThreshold) {
    return {
      id: 'colorMatch',
      target: { kind: 'card', cardId: playables[0].id },
      voice: 'uno.tryThis',
      first: false,
    }
  }
  return null

  function first(id: HintId, target: Hint['target'], voice: string): Hint {
    return { id, target, voice, first: true }
  }

  function gate(id: HintId, target: Hint['target'], voice: string): Hint | null {
    if (unseen(progress, id)) return first(id, target, voice)
    if (idle >= idleThreshold) return { id, target, voice, first: false }
    return null
  }
}

/** 孩子做对了一次，对应规则的熟练度 +1 */
export function recordSuccess(
  progress: CoachProgress,
  state: UnoState,
  played: Card | null,
): CoachProgress {
  const next = { ...progress }
  const bump = (id: HintId) => {
    next[id] = (next[id] ?? 0) + 1
  }

  if (!played) {
    bump('mustDraw')
    return next
  }
  if (played.kind === 'wild' || played.kind === 'wild4') {
    bump('wildColor')
    return next
  }
  if (played.color === state.activeColor) bump('colorMatch')
  else bump('numberMatch')
  return next
}
