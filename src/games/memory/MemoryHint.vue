<script setup lang="ts">
/**
 * 翻牌配对的示意：翻开两张，一样就收走。
 *
 * 这个游戏的目标和操作本来都自明（实测孩子自己就会了），
 * 所以这张图只是把 `?` 这个习惯撑起来 —— 四个游戏同一个位置、同一种用法。
 */
</script>

<template>
  <div class="memory-hint">
    <span class="mh-card back" />
    <span class="mh-card">🐻</span>
    <span class="mh-eq">=</span>
    <span class="mh-card">🐻</span>
    <span class="mh-tick">✓</span>
  </div>
</template>

<style scoped>
.memory-hint {
  display: flex;
  gap: clamp(8px, 2vmin, 18px);
  align-items: center;
  justify-content: center;
}

.mh-card {
  display: grid;
  place-items: center;
  width: clamp(54px, 11vmin, 96px);
  aspect-ratio: 3 / 4;
  font-size: clamp(26px, 5.5vmin, 52px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  background: #fff;
  border: 3px solid var(--ink);
  border-radius: 12px;
}

/* 盖着的那张：黄底 + 一个圈，和游戏里的牌背一致 */
.mh-card.back {
  background: var(--accent);
  box-shadow: inset 0 0 0 5px rgba(255, 255, 255, 0.55);
}

.mh-eq {
  font-size: clamp(18px, 3vmin, 30px);
  font-weight: 800;
  color: var(--ink-soft);
}

.mh-tick {
  font-size: clamp(28px, 5vmin, 48px);
  font-weight: 900;
  color: var(--accent-2);
  animation: tick-beat 1.6s ease-in-out infinite;
}

@keyframes tick-beat {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.2);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mh-tick {
    animation: none;
  }
}
</style>
