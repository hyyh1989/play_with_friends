<script setup lang="ts">
import UnoCard from './UnoCard.vue'
import type { Card } from './rules'

/**
 * UNO 的示意：**颜色一样，或者数字一样，就能出。**
 *
 * UNO 是四个游戏里唯一规则真的多的，所以它另有完整的分步教学。
 * 这里只放最核心的那一条 —— 孩子在对局中途点开 `?` 时，
 * 需要的是"我现在能出哪张"，不是把整套规则再过一遍。
 */
const middle: Card = { id: 'h0', kind: 'number', color: 'red', value: 5 }
const sameColor: Card = { id: 'h1', kind: 'number', color: 'red', value: 8 }
const sameNumber: Card = { id: 'h2', kind: 'number', color: 'blue', value: 5 }
const neither: Card = { id: 'h3', kind: 'number', color: 'green', value: 2 }
</script>

<template>
  <div class="uno-hint">
    <!-- 中间这张是牌桌上的牌 -->
    <div class="uh-row">
      <span class="uh-card is-top"><UnoCard :card="middle" /></span>
    </div>

    <div class="uh-row uh-choices">
      <span class="uh-card ok"><UnoCard :card="sameColor" /></span>
      <span class="uh-card ok"><UnoCard :card="sameNumber" /></span>
      <span class="uh-card no"><UnoCard :card="neither" /></span>
    </div>
  </div>
</template>

<style scoped>
.uno-hint {
  display: flex;
  flex-direction: column;
  gap: clamp(12px, 2.5vmin, 26px);
  align-items: center;
}

.uh-row {
  display: flex;
  gap: clamp(10px, 2.4vmin, 24px);
  align-items: center;
}

.uh-card {
  display: block;
  width: clamp(56px, 11vmin, 98px);
  aspect-ratio: 2 / 3;
  border-radius: 10px;
  container-type: inline-size;
}

/* 牌桌上那张：外面一圈当前颜色，和游戏里的弃牌堆一致 */
.uh-card.is-top {
  box-shadow:
    0 0 0 5px #e63462,
    0 0 0 8px #fff;
}

/* 能出的：绿圈；不能出的：灰掉 —— 和对局里"可以出的牌"用同一种提示 */
.uh-card.ok {
  box-shadow: 0 0 0 5px var(--accent-2);
  animation: uh-beat 1.8s ease-in-out infinite;
}

.uh-card.ok:nth-child(2) {
  animation-delay: 0.3s;
}

.uh-card.no {
  opacity: 0.32;
  filter: grayscale(0.8);
}

@keyframes uh-beat {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-7px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .uh-card.ok {
    animation: none;
  }
}
</style>
