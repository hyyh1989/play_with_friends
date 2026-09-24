import { createRng } from '../../core/rng'
import type { PlayerRef } from '../../core/types'
import type { Card, UnoState } from './rules'

/**
 * 写死的教学局。
 *
 * 不靠运气让每一课出现，而是把牌发成固定的 —— 这样"同色可出""同数字可出"
 * "出不了就摸牌""对方也摸牌""牌出完就赢"一定会按顺序发生一次。
 *
 * **孩子每一步都只有唯一解**（每回合恰好一张能出的牌，或者一张都出不了），
 * 所以她不会走偏，剧本也不会被打乱。
 *
 * 对手不需要脚本：用的还是正常 AI，但这副牌让它每一步也只有唯一解，
 * 所以行为是确定的 —— 少一套要维护的代码。
 *
 * 整局走向（T = 第几个回合）：
 *   T1 娃 红3   盖在红8上        → 教「颜色一样可以出」
 *   T2 AI 红5
 *   T3 娃 蓝5   盖在红5上        → 教「数字一样也可以出，颜色会跟着变」→ 剩一张，喊 UNO
 *   T4 AI 蓝2
 *   T5 娃 一张都出不了 → 摸到蓝4 → 教「出不了就从这里摸一张」
 *   T6 AI 也出不了 → 摸牌         → 教「对方也没牌了，它的牌变多了」
 *   T7 娃 蓝4
 *   T8 AI 蓝7
 *   T9 娃 绿7（7 对 7）           → 牌出完 → 教「你赢了」
 */

const card = (id: string, color: Card['color'], value: number): Card => ({
  id,
  kind: 'number',
  color,
  value,
})

export function createTutorialState(players: PlayerRef[]): UnoState {
  const child = players[0].id
  const rival = players[1].id

  return {
    players,
    hands: {
      [child]: [card('t-r3', 'red', 3), card('t-b5', 'blue', 5), card('t-g7', 'green', 7)],
      [rival]: [card('t-r5', 'red', 5), card('t-b2', 'blue', 2), card('t-g9', 'green', 9)],
    },
    // 前两张是剧本要用的：娃 T5 摸到蓝4，AI T6 摸到蓝7。后面是填充，正常打不到
    drawPile: [
      card('t-b4', 'blue', 4),
      card('t-b7', 'blue', 7),
      card('t-y1', 'yellow', 1),
      card('t-y6', 'yellow', 6),
      card('t-g2', 'green', 2),
      card('t-r9', 'red', 9),
    ],
    discardPile: [card('t-top', 'red', 8)],
    activeColor: 'red',
    currentIndex: 0,
    direction: 1,
    rng: createRng(20260923),
    lastEvent: null,
  }
}
