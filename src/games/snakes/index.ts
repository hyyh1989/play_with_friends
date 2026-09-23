import type { GameModule } from '../../core/types'
import SnakesGame from './SnakesGame.vue'
import { chooseAiAction } from './ai'
import {
  applyAction,
  createInitialState,
  currentPlayer,
  getLegalActions,
  getWinner,
  isFinished,
  type SnakesAction,
  type SnakesState,
} from './rules'

export const snakesGame: GameModule<SnakesState, SnakesAction> = {
  meta: {
    id: 'snakes',
    nameKey: 'games.snakes.name',
    icon: '🎲',
    minPlayers: 2,
    maxPlayers: 4,
    estimatedMinutes: 8,
    supportsSolo: false,
  },
  createInitialState,
  applyAction,
  getLegalActions,
  currentPlayer,
  isFinished,
  getWinner,
  chooseAiAction,
  component: SnakesGame,
}
