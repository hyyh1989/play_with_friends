/**
 * 确定性随机数。
 *
 * 为什么不直接用 Math.random：规则引擎的 applyAction 必须是纯函数，而洗牌、发牌、
 * 掷骰子都需要随机。解法是把随机数发生器的状态也放进游戏状态里，每次取值都返回
 * 「值 + 新状态」。这样同一个 seed 必然复现同一局游戏——单元测试能断言具体结果，
 * 将来联机时服务端也能用同一份规则复算校验。
 */

export type RngState = number

export function createRng(seed?: number): RngState {
  return (seed ?? Math.floor(Math.random() * 2 ** 32)) >>> 0
}

/** mulberry32：返回 [0,1) 区间的值和下一个状态 */
export function nextFloat(state: RngState): [number, RngState] {
  let s = (state + 0x6d2b79f5) >>> 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [value, s]
}

/** 返回 [min, max] 闭区间的整数（掷骰子用） */
export function nextInt(state: RngState, min: number, max: number): [number, RngState] {
  const [value, next] = nextFloat(state)
  return [min + Math.floor(value * (max - min + 1)), next]
}

/** Fisher-Yates 洗牌，不修改入参 */
export function shuffle<T>(items: readonly T[], state: RngState): [T[], RngState] {
  const result = items.slice()
  let rng = state
  for (let i = result.length - 1; i > 0; i--) {
    const [j, next] = nextInt(rng, 0, i)
    rng = next
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return [result, rng]
}

/** 从数组里随机取一个，不修改入参 */
export function pickOne<T>(items: readonly T[], state: RngState): [T, RngState] {
  const [index, next] = nextInt(state, 0, items.length - 1)
  return [items[index], next]
}

/**
 * AI 降智用：以 rate 的概率返回 true（该放弃最优解了）。
 * 见 core/types.ts 的 SUBOPTIMAL_RATE。
 */
export function rollSuboptimal(state: RngState, rate: number): [boolean, RngState] {
  const [value, next] = nextFloat(state)
  return [value < rate, next]
}
