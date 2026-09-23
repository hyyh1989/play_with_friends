<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'

/**
 * 家长入口：长按 3 秒才触发。
 *
 * 用长按而不是普通按钮，是为了孩子不会误入设置页。按住期间有一个环形进度，
 * 否则家长会以为没反应。
 *
 * iOS 上的坑：长按时 Safari 可能认为用户要滚动或要弹系统菜单，于是发出
 * pointercancel 把计时掐断，结果就是"怎么按都进不去"。`touch-action: none`
 * 是在告诉浏览器这个手势归我管，别抢；再配合 pointerdown 里的 preventDefault
 * 和禁用右键菜单，长按才稳。
 */
const HOLD_MS = 3000

const emit = defineEmits<{ open: [] }>()

const progress = ref(0)
const holding = computed(() => progress.value > 0)
let frame: number | null = null
let startedAt = 0

function tick() {
  const elapsed = performance.now() - startedAt
  progress.value = Math.min(1, elapsed / HOLD_MS)
  if (progress.value >= 1) {
    stop()
    emit('open')
  } else {
    frame = requestAnimationFrame(tick)
  }
}

function start(event: PointerEvent) {
  event.preventDefault()
  stop()
  startedAt = performance.now()
  frame = requestAnimationFrame(tick)
}

function stop() {
  if (frame !== null) cancelAnimationFrame(frame)
  frame = null
  progress.value = 0
}

onUnmounted(stop)
</script>

<template>
  <button
    class="gate"
    :class="{ holding }"
    :aria-label="$t('parent.title')"
    @pointerdown="start"
    @pointerup="stop"
    @pointerleave="stop"
    @pointercancel="stop"
    @contextmenu.prevent
  >
    <svg class="ring" viewBox="0 0 48 48" aria-hidden="true">
      <circle class="ring-track" cx="24" cy="24" r="21" />
      <circle
        class="ring-fill"
        cx="24"
        cy="24"
        r="21"
        :stroke-dasharray="`${progress * 132} 132`"
      />
    </svg>

    <!-- 用 SVG 而不是 ⚙️ emoji：字形的居中受字体影响，SVG 的几何是确定的 -->
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      >
        <path d="M4 7h16M4 12h16M4 17h16" />
      </g>
      <circle cx="9" cy="7" r="2.6" fill="currentColor" />
      <circle cx="15" cy="12" r="2.6" fill="currentColor" />
      <circle cx="8" cy="17" r="2.6" fill="currentColor" />
    </svg>
  </button>
</template>

<style scoped>
.gate {
  position: relative;
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  color: var(--ink);
  opacity: 0.3;
  /* 关键：告诉 iOS 这个手势归我管，否则长按会被 pointercancel 打断 */
  touch-action: none;
  transition: opacity 160ms;
}

.gate.holding {
  opacity: 0.75;
}

.icon {
  grid-area: 1 / 1;
  width: 30px;
  height: 30px;
}

.ring {
  grid-area: 1 / 1;
  width: 64px;
  height: 64px;
  transform: rotate(-90deg);
}

.ring-track {
  fill: none;
  stroke: rgba(61, 44, 30, 0.12);
  stroke-width: 4;
}

.ring-fill {
  fill: none;
  stroke: var(--accent-2);
  stroke-width: 4;
  stroke-linecap: round;
  transition: stroke-dasharray 60ms linear;
}
</style>
