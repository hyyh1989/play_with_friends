import { describe, expect, it } from 'vitest'
import { createRng, nextInt, pickOne, rollSuboptimal, shuffle } from '../src/core/rng'

/**
 * 这组测试守的是一条设计纪律：随机必须可复现。
 * 规则引擎要保持纯函数，就不能碰 Math.random —— 随机源的状态必须跟着游戏状态走。
 * 同一个 seed 必然复现同一局，这样测试能断言具体结果，将来联机也能服务端复算。
 */
describe('确定性随机', () => {
  it('同一个 seed 产生同一串骰子点数', () => {
    const roll = (seed: number) => {
      let rng = createRng(seed)
      const values: number[] = []
      for (let i = 0; i < 10; i++) {
        const [value, next] = nextInt(rng, 1, 6)
        values.push(value)
        rng = next
      }
      return values
    }

    expect(roll(42)).toEqual(roll(42))
    expect(roll(42)).not.toEqual(roll(43))
  })

  it('骰子点数落在 1-6 之内', () => {
    let rng = createRng(7)
    for (let i = 0; i < 500; i++) {
      const [value, next] = nextInt(rng, 1, 6)
      expect(value).toBeGreaterThanOrEqual(1)
      expect(value).toBeLessThanOrEqual(6)
      rng = next
    }
  })

  it('洗牌不修改入参，且保留全部元素', () => {
    const deck = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8])
    const [shuffled] = shuffle(deck, createRng(1))

    expect(deck).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...shuffled].sort((a, b) => a - b)).toEqual([...deck])
  })

  it('同一个 seed 洗出同样的牌序', () => {
    const deck = [1, 2, 3, 4, 5, 6, 7, 8]
    const [a] = shuffle(deck, createRng(99))
    const [b] = shuffle(deck, createRng(99))
    expect(a).toEqual(b)
  })

  it('pickOne 取到的元素一定来自原数组', () => {
    const items = ['a', 'b', 'c']
    let rng = createRng(3)
    for (let i = 0; i < 50; i++) {
      const [picked, next] = pickOne(items, rng)
      expect(items).toContain(picked)
      rng = next
    }
  })

  it('AI 降智概率大致符合设定（简单档约 60% 放弃最优）', () => {
    let rng = createRng(2026)
    let suboptimal = 0
    const trials = 4000
    for (let i = 0; i < trials; i++) {
      const [yes, next] = rollSuboptimal(rng, 0.6)
      if (yes) suboptimal++
      rng = next
    }
    expect(suboptimal / trials).toBeGreaterThan(0.55)
    expect(suboptimal / trials).toBeLessThan(0.65)
  })
})
