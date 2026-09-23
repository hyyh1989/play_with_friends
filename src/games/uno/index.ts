import type { GameModule } from '../../core/types'
import UnoGame from './UnoGame.vue'
import { chooseAiAction } from './ai'
import {
  applyAction,
  createInitialState,
  currentPlayer,
  getLegalActions,
  getWinner,
  isFinished,
  type UnoAction,
  type UnoState,
} from './rules'

export const unoGame: GameModule<UnoState, UnoAction> = {
  meta: {
    id: 'uno',
    nameKey: 'games.uno.name',
    icon: '🃏',
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
  component: UnoGame,
}
