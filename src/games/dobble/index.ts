import type { GameModule } from '../../core/types'
import DobbleGame from './DobbleGame.vue'
import { chooseAiAction } from './ai'
import {
  applyAction,
  createInitialState,
  currentPlayer,
  getLegalActions,
  getWinner,
  isFinished,
  type DobbleAction,
  type DobbleState,
} from './rules'

export const dobbleGame: GameModule<DobbleState, DobbleAction> = {
  meta: {
    id: 'dobble',
    nameKey: 'games.dobble.name',
    icon: '🔍',
    minPlayers: 2,
    maxPlayers: 2,
    estimatedMinutes: 4,
    // 抢答游戏一个人玩没意思 —— 没人跟你抢
    supportsSolo: false,
  },
  createInitialState,
  applyAction,
  getLegalActions,
  currentPlayer,
  isFinished,
  getWinner,
  chooseAiAction,
  component: DobbleGame,
}
