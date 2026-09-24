<script setup lang="ts">
import { watch } from 'vue'
import { playSfx, speak, stopVoice } from '../core/audio'

/**
 * 每个游戏右上角那个 `?`。
 *
 * 为什么四个游戏都要有、而且都在同一个位置：**要教会的是一个习惯**，
 * 不是四套教学 —— "不懂就点右上角那个圈"。学会一次，四个游戏通用。
 *
 * 里面放什么由各游戏自己给（插槽），因为每个游戏**看不出来的那一半不一样**：
 *   翻牌配对 → 目标和操作都自明，放最简单的一张示意就够
 *   四子棋   → 操作自明，看不出"为什么要连四个" → 讲目标
 *   找相同   → 目标自明，看不出"点哪儿、点几下" → 讲操作
 *   UNO      → 两样都看不出，所以它另有完整教学，这里只放最核心的一条出牌规则
 * 详见 docs/DESIGN.md。
 */
const props = defineProps<{
  /** 打开时念的那句话（语音文件的 key）。没有就只看图 */
  voice?: string
}>()

const open = defineModel<boolean>('open', { default: false })

/** 念完了报一声，谁想"讲完自动收起来"就用它（四子棋开局那次） */
const emit = defineEmits<{ spoke: [seconds: number] }>()

function toggle() {
  playSfx('tap')
  open.value = !open.value
}

function close() {
  open.value = false
}

// 打开就念，关上就闭嘴 —— 自动弹出的那次也走这里，不用各游戏自己念
watch(open, (isOpen) => {
  if (isOpen) {
    if (props.voice) void speak(props.voice).then((seconds) => emit('spoke', seconds))
  } else {
    stopVoice()
  }
})
</script>

<template>
  <button class="help-btn pressable" aria-label="?" @click="toggle">?</button>

  <!-- 点哪里都能关掉：孩子不会去找关闭按钮 -->
  <div v-if="open" class="help-overlay" @click="close">
    <div class="help-card">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.help-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 6;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  font-size: 26px;
  font-weight: 800;
  color: var(--ink-soft);
  background: var(--bg-card);
  border-radius: 50%;
  box-shadow: var(--shadow);
}

.help-overlay {
  position: fixed;
  inset: 0;
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 5vmin;
  background: rgba(61, 44, 30, 0.55);
  animation: help-in 220ms ease-out;
}

@keyframes help-in {
  from {
    opacity: 0;
  }
}

/* 垫一块白卡，否则示意图压在花花绿绿的牌桌上会糊成一片 */
.help-card {
  max-width: 100%;
  max-height: 100%;
  padding: clamp(16px, 3.5vmin, 34px);
  overflow: auto;
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}

@media (prefers-reduced-motion: reduce) {
  .help-overlay {
    animation: none;
  }
}
</style>
