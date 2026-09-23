import { beforeEach, describe, expect, it } from 'vitest'
import { _clearRegistry, getGame, listGames, registerGame } from '../src/core/game-registry'
import type { GameModule } from '../src/core/types'

function fakeGame(id: string): GameModule {
  return {
    meta: {
      id,
      nameKey: `games.${id}.name`,
      icon: '🎮',
      minPlayers: 1,
      maxPlayers: 2,
      estimatedMinutes: 5,
      supportsSolo: true,
    },
    createInitialState: () => ({}),
    applyAction: (state) => state,
    getLegalActions: () => [],
    currentPlayer: () => null,
    isFinished: () => false,
    getWinner: () => null,
    chooseAiAction: () => null,
    component: {},
  }
}

describe('游戏注册表', () => {
  beforeEach(_clearRegistry)

  it('登记后能按 id 取回', () => {
    registerGame(fakeGame('memory'))
    expect(getGame('memory')?.meta.nameKey).toBe('games.memory.name')
  })

  it('id 重复直接报错，不静默覆盖', () => {
    registerGame(fakeGame('memory'))
    expect(() => registerGame(fakeGame('memory'))).toThrow(/重复/)
  })

  it('取不存在的游戏返回 undefined', () => {
    expect(getGame('nope')).toBeUndefined()
  })

  it('listGames 返回全部已登记的游戏', () => {
    registerGame(fakeGame('memory'))
    registerGame(fakeGame('snakes'))
    expect(listGames().map((g) => g.meta.id)).toEqual(['memory', 'snakes'])
  })
})
