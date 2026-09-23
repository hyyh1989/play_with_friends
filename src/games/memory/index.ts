import type { GameModule } from '../../core/types'
import MemoryGame from './MemoryGame.vue'
import { chooseAiAction } from './ai'
import {
  applyAction,
  createInitialState,
  currentPlayer,
  getLegalActions,
  getWinner,
  isFinished,
  type MemoryAction,
  type MemoryState,
} from './rules'

export const memoryGame: GameModule<MemoryState, MemoryAction> = {
  meta: {
    id: 'memory',
    nameKey: 'games.memory.name',
    icon: '🧩',
    minPlayers: 1,
    maxPlayers: 2,
    estimatedMinutes: 5,
    supportsSolo: true,
  },
  createInitialState,
  applyAction,
  getLegalActions,
  currentPlayer,
  isFinished,
  getWinner,
  chooseAiAction,
  component: MemoryGame,
}
