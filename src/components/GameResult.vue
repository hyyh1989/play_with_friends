<script setup lang="ts">
import { onMounted } from 'vue'
import { playSfx } from '../core/audio'
import type { PlayerRef } from '../core/types'

/**
 * 结算覆盖层。
 *
 * 设计纪律：赢和"没赢"用同一套欢快的基调，差别只在庆祝的热闹程度。
 * 不出现失败文案，只有"再玩一次"和"换个游戏"两个大按钮。
 */
const props = defineProps<{
  players: PlayerRef[]
  /**
   * 每人得几颗星。只在"得分=收集了多少个东西"的游戏里传（比如翻牌配对的对数）。
   * 蛇梯棋这种"位置不是分数"的游戏不要传 —— 传了会把棋盘格号画成几十颗星。
   */
  scores?: Record<string, number>
  /** 平局或单人模式时为 null */
  winnerId: string | null
  solo: boolean
}>()

defineEmits<{ again: []; home: [] }>()

onMounted(() => playSfx('celebrate'))

function isWinner(player: PlayerRef): boolean {
  return !props.solo && player.id === props.winnerId
}
</script>

<template>
  <div class="result">
    <span class="confetti">🎉</span>

    <div class="players">
      <div v-for="player in players" :key="player.id" class="player" :class="{ won: isWinner(player) }">
        <span class="avatar">{{ player.avatar }}</span>
        <div v-if="scores" class="stars">
          <span v-for="n in scores[player.id] ?? 0" :key="n" class="star">⭐</span>
        </div>
        <!-- 没有分数概念的游戏（蛇梯棋）用奖杯表示赢家 -->
        <span v-else-if="isWinner(player)" class="trophy">🏆</span>
      </div>
    </div>

    <div class="actions">
      <button class="action again pressable" @click="$emit('again')">
        <span class="icon">🔄</span>
        <span>{{ $t('common.playAgain') }}</span>
      </button>
      <button class="action other pressable" @click="$emit('home')">
        <span class="icon">🏠</span>
        <span>{{ $t('common.otherGame') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.result {
  position: fixed;
  inset: 0;
  /* 要压过游戏里可能还在飞的牌（UNO 的飞牌是 z-index 20） */
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(16px, 4vmin, 40px);
  /*
   * 必须【完全】不透明。原来是 0.96，翻牌配对和蛇梯棋的画面淡，看不出来；
   * 到了 UNO 就露馅了 —— 大块饱和色的牌会从这 4% 里透出来，
   * 结算页背景上能看见最后那张牌。
   */
  background: var(--bg);
  animation: fade 240ms ease-out;
}

.confetti {
  font-size: clamp(70px, 16vmin, 150px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  animation: pop 600ms ease-out;
}

.players {
  display: flex;
  gap: clamp(20px, 5vmin, 56px);
}

.player {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  opacity: 0.55;
}

.player.won {
  opacity: 1;
}

.avatar {
  font-size: clamp(40px, 8vmin, 72px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.player.won .avatar {
  animation: bounce 900ms ease-in-out infinite;
}

.stars {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  max-width: 140px;
}

.star {
  font-size: clamp(14px, 2.4vmin, 22px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.trophy {
  font-size: clamp(22px, 3.6vmin, 34px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(16px, 3vmin, 32px);
  justify-content: center;
}

.action {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 160px;
  min-height: var(--tap-min);
  padding: 20px 28px;
  font-size: clamp(17px, 2.4vmin, 22px);
  font-weight: 700;
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}

.action .icon {
  font-size: clamp(32px, 5vmin, 48px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

.again {
  background: var(--accent-2);
}

.other {
  background: var(--accent);
}

@keyframes fade {
  from {
    opacity: 0;
  }
}

@keyframes pop {
  0% {
    transform: scale(0.3);
    opacity: 0;
  }
  70% {
    transform: scale(1.15);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .confetti,
  .player.won .avatar {
    animation: none;
  }
}
</style>
