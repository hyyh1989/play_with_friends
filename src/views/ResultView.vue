<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { playSfx } from '../core/audio'

/**
 * 结算页骨架。阶段 1 起接收真实对局结果。
 *
 * 设计纪律：赢和"没赢"用同样欢快的基调，差别只在庆祝程度。
 * 不出现失败文案，只有"再玩一次"和"换个游戏"两个大按钮。
 */
const router = useRouter()

onMounted(() => playSfx('celebrate'))
</script>

<template>
  <div class="result safe-area">
    <div class="celebration">
      <span class="emoji">🎉</span>
    </div>

    <div class="actions">
      <button class="action again pressable" @click="router.back()">
        <span class="icon">🔄</span>
        <span>{{ $t('common.playAgain') }}</span>
      </button>
      <button class="action other pressable" @click="router.push('/')">
        <span class="icon">🏠</span>
        <span>{{ $t('common.otherGame') }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(24px, 6vmin, 64px);
  height: 100%;
}

.emoji {
  font-size: clamp(90px, 22vmin, 200px);
  animation: pop 600ms ease-out;
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
  min-width: 180px;
  min-height: var(--tap-min);
  padding: 24px 32px;
  font-size: clamp(18px, 2.6vmin, 24px);
  font-weight: 700;
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}

.action .icon {
  font-size: clamp(36px, 6vmin, 56px);
}

.again {
  background: var(--accent-2);
}

.other {
  background: var(--accent);
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

@media (prefers-reduced-motion: reduce) {
  .emoji {
    animation: none;
  }
}
</style>
