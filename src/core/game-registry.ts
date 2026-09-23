import type { GameModule } from './types'

const registry = new Map<string, GameModule>()

export function registerGame(game: GameModule): void {
  if (registry.has(game.meta.id)) {
    throw new Error(`游戏 id 重复：${game.meta.id}`)
  }
  registry.set(game.meta.id, game)
}

export function getGame(id: string): GameModule | undefined {
  return registry.get(id)
}

/** 登记过的就是能玩的；还没做的游戏放在 games/index.ts 的 UPCOMING 里，不进注册表 */
export function listGames(): GameModule[] {
  return [...registry.values()]
}

/** 仅测试用 */
export function _clearRegistry(): void {
  registry.clear()
}
