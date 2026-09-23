<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

/**
 * 指示手指：指着屏幕上某个元素，并把它从暗背景里"挖"出来。
 *
 * 类名带 coach- 前缀：UNO 的手牌容器也叫 .hand，虽然 scoped 样式不会串，
 * 但调试时选择器分不清是哪一个（项目里已经因为 .back 撞名吃过亏）。
 *
 * 给不认字的孩子用，"该点哪里"只能靠指。配合语音就是一次完整的示范。
 * 跟随目标元素的实际位置，所以牌重新排列、窗口旋转都不会指偏。
 */
const props = defineProps<{
  /** 要指向的元素。null = 不显示 */
  target: HTMLElement | null
  /** 是否把周围压暗（第一次教某条规则时压暗，后面只是轻轻指一下） */
  spotlight?: boolean
}>()

const rect = ref<DOMRect | null>(null)

function measure() {
  rect.value = props.target ? props.target.getBoundingClientRect() : null
}

let frame: number | null = null
function track() {
  measure()
  frame = requestAnimationFrame(track)
}

onMounted(() => {
  if (props.target) track()
})
onUnmounted(() => {
  if (frame !== null) cancelAnimationFrame(frame)
})

watch(
  () => props.target,
  (el) => {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    if (el) track()
    else rect.value = null
  },
)

/** 手指放在目标正下方偏右，不挡住目标本身 */
const handStyle = computed(() => {
  const r = rect.value
  if (!r) return {}
  return {
    left: `${r.left + r.width * 0.72}px`,
    top: `${r.top + r.height * 0.86}px`,
  }
})

const holeStyle = computed(() => {
  const r = rect.value
  if (!r) return {}
  const pad = 10
  return {
    left: `${r.left - pad}px`,
    top: `${r.top - pad}px`,
    width: `${r.width + pad * 2}px`,
    height: `${r.height + pad * 2}px`,
  }
})
</script>

<template>
  <template v-if="rect">
    <!--
      压暗层用一个超大的 box-shadow 在目标处"挖洞"，
      这样孩子的注意力只会落在该点的那个东西上。
      pointer-events: none 保证她还是能点得到。
    -->
    <div v-if="spotlight" class="coach-spotlight" :style="holeStyle" />
    <div class="coach-hand" :style="handStyle">👆</div>
  </template>
</template>

<style scoped>
.coach-spotlight {
  position: fixed;
  z-index: 40;
  border-radius: 16px;
  box-shadow: 0 0 0 9999px rgba(61, 44, 30, 0.55);
  pointer-events: none;
  animation: halo 1.6s ease-in-out infinite;
}

.coach-hand {
  position: fixed;
  z-index: 41;
  font-size: clamp(34px, 6vmin, 56px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  pointer-events: none;
  filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.4));
  animation: poke 1.1s ease-in-out infinite;
}

@keyframes poke {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-6px, -14px);
  }
}

@keyframes halo {
  0%,
  100% {
    box-shadow: 0 0 0 9999px rgba(61, 44, 30, 0.55), inset 0 0 0 3px rgba(255, 255, 255, 0.9);
  }
  50% {
    box-shadow: 0 0 0 9999px rgba(61, 44, 30, 0.55), inset 0 0 0 6px rgba(255, 255, 255, 1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .coach-hand,
  .coach-spotlight {
    animation: none;
  }
}
</style>
