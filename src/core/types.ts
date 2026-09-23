import type { Component } from 'vue'

export type Difficulty = 'easy' | 'normal' | 'serious'

/** 次优概率：AI 故意不选最优解的概率。难度靠这个调，不靠搜索深度。 */
export const SUBOPTIMAL_RATE: Record<Difficulty, number> = {
  easy: 0.6,
  normal: 0.3,
  serious: 0.05,
}

export interface PlayerRef {
  id: string
  kind: 'human' | 'ai'
  /** 头像 emoji。最终美术替换时改成资源路径。 */
  avatar: string
  /** AI 的显示名走 i18n key；真人玩家没有名字（界面上只有头像） */
  nameKey?: string
}

export interface GameConfig {
  players: PlayerRef[]
  difficulty: Difficulty
  /** 每个游戏自己的配置：记忆棋的对数、UNO 的 enabledCardTypes 等 */
  variant?: Record<string, unknown>
  seed: number
}

export interface GameMeta {
  id: string
  /** i18n key，不是字面文字 */
  nameKey: string
  /** 卡片图标 emoji。最终美术替换时改成资源路径。 */
  icon: string
  minPlayers: number
  maxPlayers: number
  estimatedMinutes: number
  supportsSolo: boolean
}

/**
 * 一个游戏就是一个自包含模块。加新游戏只需实现这个接口并在 games/index.ts 登记。
 *
 * applyAction 必须是纯函数：不可变、不碰 DOM、不读全局、不调 Math.random。
 * 需要随机数时把 RNG 状态放进 state（见 core/rng.ts）——这条同时支撑单元测试、
 * AI 试算，以及将来联机时服务端用同一份规则做权威校验。
 */
export interface GameModule<S = any, A = any> {
  meta: GameMeta
  createInitialState(config: GameConfig): S
  applyAction(state: S, action: A): S
  getLegalActions(state: S, playerId: string): A[]
  currentPlayer(state: S): string | null
  isFinished(state: S): boolean
  getWinner(state: S): string | null
  chooseAiAction(state: S, playerId: string, difficulty: Difficulty): A | null
  component: Component
}
