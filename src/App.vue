<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useSettingsStore } from './stores/settings'
import { unlock, playSfx, setVoiceLocale } from './core/audio'

const settings = useSettingsStore()
const audioReady = ref(false)

onMounted(() => {
  setVoiceLocale(settings.locale)
})

/**
 * iOS 不允许在用户触摸之前播放音频，所以启动时用一个全屏的"点一下开始"来解锁。
 * 顺便它也是个不错的开场：一个大到不可能点不到的按钮。
 */
async function handleStart() {
  await unlock(settings.volume)
  playSfx('tap')
  audioReady.value = true
}
</script>

<template>
  <router-view v-if="audioReady" />

  <button v-else class="start-screen pressable" @click="handleStart">
    <span class="start-icon">🎈</span>
    <span class="start-text">{{ $t('home.tapToStart') }}</span>
  </button>
</template>

<style scoped>
.start-screen {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  background: radial-gradient(circle at 50% 40%, #fff3cf, var(--bg));
}

.start-icon {
  font-size: clamp(80px, 18vmin, 160px);
  animation: float 2.4s ease-in-out infinite;
}

.start-text {
  font-size: clamp(24px, 4vmin, 40px);
  font-weight: 700;
  color: var(--ink-soft);
}

@keyframes float {
  0%,
  100% {
    transform: translateY(0) rotate(-3deg);
  }
  50% {
    transform: translateY(-18px) rotate(3deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .start-icon {
    animation: none;
  }
}
</style>
