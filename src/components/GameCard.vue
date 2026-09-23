<script setup lang="ts">
import { ref } from 'vue'
import type { GameMeta } from '../core/types'

const props = defineProps<{
  meta: GameMeta
  /** 还没做完的游戏显示成暗的，孩子知道"还有别的在路上" */
  upcoming?: boolean
}>()

const shaking = ref(false)

/**
 * 待上线的卡片点下去要有反应，否则孩子会以为 app 坏了（设计原则 2：立即反馈）。
 * 只播提示音是不够的 —— iPad 侧边静音开关一拨就什么都没有了。
 */
function handleTap() {
  if (!props.upcoming || shaking.value) return
  shaking.value = true
  setTimeout(() => (shaking.value = false), 420)
}
</script>

<template>
  <button class="card pressable" :class="{ upcoming, shaking }" @click="handleTap">
    <span class="icon">{{ meta.icon }}</span>
    <span class="name">{{ $t(meta.nameKey) }}</span>
    <!-- 待上线用沙漏图标表达，不用文字（零阅读依赖） -->
    <span v-if="upcoming" class="badge">⏳</span>
  </button>
</template>

<style scoped>
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-width: var(--tap-min);
  min-height: var(--tap-min);
  aspect-ratio: 1;
  padding: 16px;
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}

/*
 * emoji 用专门的字体栈 + line-height:1。
 * Safari 下 emoji 走的是 Apple Color Emoji，它和正文字体的基线/行高不一致，
 * 混排时会让字形在容器里偏移 —— 明确指定字体并压掉行高能避免这个问题。
 */
.icon {
  font-size: clamp(48px, 11vmin, 110px);
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  line-height: 1;
}

.name {
  font-size: clamp(16px, 2.4vmin, 26px);
  font-weight: 700;
}

.upcoming {
  opacity: 0.45;
  box-shadow: var(--shadow);
}

.badge {
  position: absolute;
  top: 10px;
  right: 14px;
  font-size: clamp(20px, 3vmin, 30px);
  line-height: 1;
}

.shaking {
  animation: shake 400ms ease-in-out;
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  20% {
    transform: translateX(-10px) rotate(-2deg);
  }
  40% {
    transform: translateX(10px) rotate(2deg);
  }
  60% {
    transform: translateX(-7px) rotate(-1deg);
  }
  80% {
    transform: translateX(7px) rotate(1deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .shaking {
    animation: none;
  }
}
</style>
