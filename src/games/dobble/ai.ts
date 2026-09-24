import { nextInt, rollSuboptimal } from '../../core/rng'
import { SUBOPTIMAL_RATE, type Difficulty } from '../../core/types'
import { aiReactionMs, targetFor, type DobbleAction, type DobbleState } from './rules'

/**
 * 找相同的 AI。
 *
 * 这个游戏没有策略 —— 正确答案只有一个，找不找得到不是"棋力"问题。
 * 所以难度全靠**反应时间**：AI 总能看见答案，但它要"想"一会儿才动。
 * 简单档慢到孩子几乎总能先按到。
 *
 * 它走的是和人完全一样的两步（先点自己的、再点中间的公共牌），
 * 这样每一轮孩子都在看它示范一遍"先这边、再那边" —— 比任何教学页都有效。
 *
 * 按铁律 5 它也会犯错：有一定概率在自己牌上选错一个。
 * 选错的那个在公共牌上找不到，它会自己取消重来（而不是去公共牌上乱点 ——
 * 那样可能撞上孩子选中的图案，白送她一分，或者更糟：让她以为乱点也能得分）。
 */
export const REACTION_MS: Record<Difficulty, [number, number]> = {
  easy: [3200, 5200],
  normal: [2000, 3200],
  serious: [1100, 1800],
}

/** 选中之后再"伸手"去点公共牌要多久。给孩子留出看清它选了什么的时间 */
export const CONFIRM_MS = 800

export function chooseAiAction(
  state: DobbleState,
  playerId: string,
  difficulty: Difficulty,
): DobbleAction | null {
  const own = state.cards[playerId] ?? []
  if (own.length === 0) return null
  const picked = state.picks[playerId]

  // 第一步：在自己牌上选
  if (!picked) {
    const target = targetFor(state, playerId)
    const [beDumb, rng] = rollSuboptimal(state.rng, SUBOPTIMAL_RATE[difficulty])
    if (beDumb) {
      const wrong = own.filter((s) => s !== target)
      if (wrong.length > 0) {
        /*
         * 挑哪个错的要用掷骰之后的随机源，不能用 state.round ——
         * 同一轮里 round 不变，它会**连着好几次选同一个错的**，看起来像卡住了
         * （实测连选三次 🚗）。一轮里可能试很多次，所以每次都得重新随机。
         */
        const [index] = nextInt(rng, 0, wrong.length - 1)
        return { type: 'pick', playerId, symbol: wrong[index] }
      }
    }
    return { type: 'pick', playerId, symbol: target }
  }

  // 选错了（公共牌上没有它）→ 取消重来，不去公共牌上乱点
  if (!state.center.includes(picked.symbol)) return { type: 'clear', playerId }

  // 第二步：去公共牌上确认
  return { type: 'confirm', symbol: picked.symbol }
}

/** 这一步 AI 要等多久才动。界面用它设定时器 */
export function aiDelay(state: DobbleState, playerId: string, difficulty: Difficulty): number {
  // 已经选好了，就只是"伸手过去点"，不用再想
  if (state.picks[playerId]) return CONFIRM_MS
  return aiReactionMs(state, REACTION_MS[difficulty])
}
