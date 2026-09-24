import type { GameModule } from '../../core/types'
import Connect4Game from './Connect4Game.vue'
import { chooseAiAction } from './ai'
import {
  applyAction,
  createInitialState,
  currentPlayer,
  getLegalActions,
  getWinner,
  isFinished,
  type Connect4Action,
  type Connect4State,
} from './rules'

export const connect4Game: GameModule<Connect4State, Connect4Action> = {
  meta: {
    id: 'connect4',
    nameKey: 'games.connect4.name',
    icon: '🔴',
    minPlayers: 2,
    maxPlayers: 2,
    estimatedMinutes: 5,
    supportsSolo: false,
  },
  createInitialState,
  applyAction,
  getLegalActions,
  currentPlayer,
  isFinished,
  getWinner,
  chooseAiAction,
  component: Connect4Game,
}
