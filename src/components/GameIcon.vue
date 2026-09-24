<script setup lang="ts">
/**
 * 首页每个游戏的图标。
 *
 * 为什么不用 emoji：🧩🔴🃏 这三个和游戏本身没关系，孩子不认字，图标就是唯一的线索。
 * 画成 SVG 后，图标直接就是游戏里会看到的东西 —— 万能牌、连成一线的棋子、
 * 对角相同的牌阵，点进去能对得上。
 *
 * 没画过的游戏（比如还没做的）自动退回 meta.icon 里的 emoji。
 */

defineProps<{ id: string; fallback: string }>()

// clipPath 的 id 在整个页面里必须唯一，同一个图标渲染两次就会撞
let seq = 0
const uid = `gi${(seq += 1)}-${Math.random().toString(36).slice(2, 7)}`

const RED = '#ef476f'
const YELLOW = '#ffd166'
const GREEN = '#06d6a0'
const BLUE = '#4cc9f0'
const INK = '#3d2c1e'
</script>

<template>
  <!-- UNO：万能牌。黑底 + 斜白椭圆 + 四色，是 UNO 最好认的一张牌 -->
  <svg v-if="id === 'uno'" class="game-icon" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <clipPath :id="`${uid}-oval`">
        <ellipse cx="50" cy="50" rx="34" ry="22" :transform="`rotate(-22 50 50)`" />
      </clipPath>
    </defs>
    <rect x="12" y="3" width="76" height="94" rx="12" :fill="INK" />
    <rect x="18" y="9" width="64" height="82" rx="8" fill="none" stroke="#fff" stroke-width="2.5" stroke-opacity="0.35" />
    <g :clip-path="`url(#${uid}-oval)`">
      <rect x="10" y="10" width="40" height="40" :fill="RED" />
      <rect x="50" y="10" width="40" height="40" :fill="YELLOW" />
      <rect x="10" y="50" width="40" height="40" :fill="BLUE" />
      <rect x="50" y="50" width="40" height="40" :fill="GREEN" />
    </g>
    <ellipse
      cx="50"
      cy="50"
      rx="34"
      ry="22"
      transform="rotate(-22 50 50)"
      fill="none"
      stroke="#fff"
      stroke-width="4.5"
    />
  </svg>

  <!-- 四子棋：蓝板 + 底排四个红子连成一线 -->
  <svg v-else-if="id === 'connect4'" class="game-icon" viewBox="0 0 100 100" aria-hidden="true">
    <rect x="6" y="11" width="88" height="78" rx="13" :fill="BLUE" />
    <g>
      <!-- 上两排：空孔 + 两个黄子，表示"正在下" -->
      <circle v-for="c in [23, 41, 59, 77]" :key="`t${c}`" :cx="c" cy="30" r="8.5" fill="#fff8e7" />
      <circle cx="23" cy="50" r="8.5" fill="#fff8e7" />
      <circle cx="41" cy="50" r="8.5" :fill="YELLOW" />
      <circle cx="59" cy="50" r="8.5" :fill="YELLOW" />
      <circle cx="77" cy="50" r="8.5" fill="#fff8e7" />
      <!-- 底排：四连 -->
      <circle v-for="c in [23, 41, 59, 77]" :key="`b${c}`" :cx="c" cy="70" r="8.5" :fill="RED" />
    </g>
    <!-- 白线穿过四连，一眼看出"连成一条" -->
    <line
      x1="23"
      y1="70"
      x2="77"
      y2="70"
      stroke="#fff"
      stroke-width="3.2"
      stroke-linecap="round"
      stroke-opacity="0.7"
    />
  </svg>

  <!-- 翻牌配对：2×2 牌阵，对角两张翻开且图案相同 -->
  <svg v-else-if="id === 'memory'" class="game-icon" viewBox="0 0 100 100" aria-hidden="true">
    <g>
      <!-- 翻开的（左上、右下）：白牌 + 同一只小动物 -->
      <rect x="6" y="6" width="40" height="42" rx="7" fill="#fff" :stroke="INK" stroke-width="3" />
      <text x="26" y="27" class="pip" text-anchor="middle" dominant-baseline="central">🐻</text>
      <rect x="54" y="52" width="40" height="42" rx="7" fill="#fff" :stroke="INK" stroke-width="3" />
      <text x="74" y="73" class="pip" text-anchor="middle" dominant-baseline="central">🐻</text>
      <!-- 盖着的（右上、左下）：黄牌 + 背面花纹 -->
      <rect x="54" y="6" width="40" height="42" rx="7" :fill="YELLOW" :stroke="INK" stroke-width="3" />
      <circle cx="74" cy="27" r="9" fill="none" stroke="#fff" stroke-width="3.5" />
      <rect x="6" y="52" width="40" height="42" rx="7" :fill="YELLOW" :stroke="INK" stroke-width="3" />
      <circle cx="26" cy="73" r="9" fill="none" stroke="#fff" stroke-width="3.5" />
    </g>
  </svg>

  <span v-else class="game-icon emoji">{{ fallback }}</span>
</template>

<style scoped>
.game-icon {
  display: block;
  width: clamp(64px, 16vmin, 140px);
  height: clamp(64px, 16vmin, 140px);
}

.emoji {
  display: grid;
  place-items: center;
  font-size: clamp(48px, 11vmin, 110px);
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  line-height: 1;
}

/* SVG 里的 emoji 同样要指定字体栈，否则 Safari 会掉成黑白字形 */
.pip {
  font-size: 25px;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}
</style>
