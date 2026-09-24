<script setup lang="ts">
/**
 * "连成四个就赢" 的示意图：横、竖、斜各一张小棋盘，四个子依次亮起来再连成一条线。
 *
 * 为什么要有它：规则一句话讲得完，但孩子不认字，一句话也讲不了。
 * 必须让她**看见**四个连成一条是什么样子 —— 而且三个方向都要看见，
 * 否则她只会去凑横的那一种（首页图标也只画了横的）。
 *
 * 动画是循环的：亮 → 连线 → 停一下 → 重来。不用点、不用等，瞄一眼就懂。
 */

const CENTERS = [17, 39, 61, 83]
const R = 9

/** 三种连法，每种四个 [row, col] */
const PATTERNS: { key: string; cells: [number, number][] }[] = [
  { key: 'row', cells: [[2, 0], [2, 1], [2, 2], [2, 3]] },
  { key: 'col', cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  { key: 'diag', cells: [[3, 0], [2, 1], [1, 2], [0, 3]] },
]

const x = (col: number) => CENTERS[col]
const y = (row: number) => CENTERS[row]

/** 这一格在不在四连里 —— 不在的画成空洞 */
function isWinner(cells: [number, number][], row: number, col: number) {
  return cells.some(([r, c]) => r === row && c === col)
}

const ALL = Array.from({ length: 16 }, (_, i) => [Math.floor(i / 4), i % 4] as [number, number])
</script>

<template>
  <div class="win-hint">
    <svg
      v-for="pattern in PATTERNS"
      :key="pattern.key"
      class="mini"
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <rect x="4" y="4" width="92" height="92" rx="12" fill="#4cc9f0" />

      <!-- 空洞 -->
      <template v-for="([row, col], i) in ALL" :key="`h${i}`">
        <circle
          v-if="!isWinner(pattern.cells, row, col)"
          :cx="x(col)"
          :cy="y(row)"
          :r="R"
          fill="#fff8e7"
        />
      </template>

      <!--
        连线画在棋子【下面】：画在上面的话，小尺寸下白线会把红子切开，
        看起来像一条虚线而不是四个子。放下面就只有缝隙露出白杠，
        读起来是"四个被串起来的棋子"。
      -->
      <line
        class="win-line"
        :x1="x(pattern.cells[0][1])"
        :y1="y(pattern.cells[0][0])"
        :x2="x(pattern.cells[3][1])"
        :y2="y(pattern.cells[3][0])"
        stroke="#fff"
        stroke-width="7"
        stroke-linecap="round"
      />

      <!-- 四连：依次亮起 -->
      <circle
        v-for="([row, col], i) in pattern.cells"
        :key="`w${i}`"
        class="win-dot"
        :style="{ '--i': i }"
        :cx="x(col)"
        :cy="y(row)"
        :r="R"
        fill="#e63462"
      />

    </svg>
  </div>
</template>

<style scoped>
.win-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(10px, 2.5vmin, 22px);
}

.mini {
  display: block;
  width: clamp(72px, 15vmin, 128px);
  height: clamp(72px, 15vmin, 128px);
  filter: drop-shadow(0 4px 0 rgba(61, 44, 30, 0.14));
}

/*
 * 一个 3.2 秒的循环：四个子按 --i 依次弹出 → 连线 → 停 → 一起淡掉重来。
 * transform-box/origin 要显式写，否则 SVG 里的 scale 是绕画布原点缩的，
 * 圆会从左上角飞出来。
 */
.win-dot {
  transform-box: fill-box;
  transform-origin: center;
  opacity: 0;
  animation: dot-pop 3.2s ease-out infinite;
  animation-delay: calc(var(--i) * 0.2s);
}

@keyframes dot-pop {
  0% {
    opacity: 0;
    transform: scale(0.2);
  }
  8% {
    opacity: 1;
    transform: scale(1.18);
  }
  13% {
    transform: scale(1);
  }
  78% {
    opacity: 1;
  }
  88%,
  100% {
    opacity: 0;
    transform: scale(1);
  }
}

.win-line {
  /* 线长最长是对角线 ≈ 93，取 100 够用 */
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation: line-draw 3.2s ease-out infinite;
}

@keyframes line-draw {
  0%,
  25% {
    stroke-dashoffset: 100;
    opacity: 0.9;
  }
  40% {
    stroke-dashoffset: 0;
    opacity: 0.9;
  }
  78% {
    stroke-dashoffset: 0;
    opacity: 0.9;
  }
  88%,
  100% {
    stroke-dashoffset: 0;
    opacity: 0;
  }
}

/* 关掉动画的话就直接显示最终状态 —— 信息不能丢 */
@media (prefers-reduced-motion: reduce) {
  .win-dot,
  .win-line {
    animation: none;
    opacity: 1;
    stroke-dashoffset: 0;
  }
}
</style>
