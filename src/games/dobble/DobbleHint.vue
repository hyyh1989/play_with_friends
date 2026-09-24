<script setup lang="ts">
/**
 * 找相同的示意：**先在自己的牌上点一个，再到中间那张公共牌上点同一个。**
 *
 * 这个游戏的目标自明（找一样的），看不出来的是**操作** —— 点哪儿、点几下。
 * 所以图讲的是两步，不是规则。
 *
 * 选人页常驻一份，对局中点 `?` 也是这一份。
 */
</script>

<template>
  <div class="how">
    <span class="how-card">
      <span class="how-pip">🐻</span><span class="how-pip target">⭐</span
      ><span class="how-pip">🚗</span>
      <span class="how-step">1</span>
    </span>

    <span class="how-arrow">→</span>

    <span class="how-card is-center">
      <span class="how-pip">🍎</span><span class="how-pip target">⭐</span
      ><span class="how-pip">⚽</span>
      <span class="how-step">2</span>
    </span>
  </div>
</template>

<style scoped>
.how {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(8px, 2vmin, 18px);
}

.how-card {
  position: relative;
  display: flex;
  gap: 4px;
  align-items: center;
  padding: clamp(8px, 1.6vmin, 14px) clamp(10px, 2vmin, 18px);
  background: var(--bg-card);
  border-radius: 999px;
  box-shadow: var(--shadow);
}

/* 公共牌画成虚线边的，和对局里一致 */
.how-card.is-center {
  border: 3px dashed rgba(61, 44, 30, 0.25);
}

/* 第几步。数字是给大人看的，孩子靠"左边那张 → 中间那张"的方向 */
.how-step {
  position: absolute;
  top: -8px;
  left: -8px;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  font-size: 14px;
  font-weight: 900;
  color: #fff;
  background: var(--accent-2);
  border-radius: 50%;
}

.how-pip {
  font-size: clamp(20px, 3.4vmin, 34px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  opacity: 0.45;
}

.how-pip.target {
  padding: 3px;
  opacity: 1;
  border-radius: 50%;
  box-shadow: 0 0 0 3px var(--accent-2);
  animation: how-beat 1.6s ease-in-out infinite;
}

@keyframes how-beat {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.18);
  }
}

.how-arrow {
  font-size: clamp(20px, 3.2vmin, 32px);
  font-weight: 800;
  color: var(--accent-2);
}

@media (prefers-reduced-motion: reduce) {
  .how-pip.target {
    animation: none;
  }
}
</style>
