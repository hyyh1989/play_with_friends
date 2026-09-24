<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSettingsStore, type UnoLevel } from '../stores/settings'
import { SUPPORTED_LOCALES } from '../i18n'
import type { Difficulty } from '../core/types'
import { playSfx } from '../core/audio'
import {
  applyUpdate,
  BUILD_TIME,
  checkForUpdate,
  checking,
  hasServiceWorker,
  updateReady,
} from '../core/pwa'

const router = useRouter()
const settings = useSettingsStore()
const { t } = useI18n()

const buildTime = BUILD_TIME
const restarted = ref(false)
/** 查过一次、而且确认没有新版本 —— 只有查过才说"已经是最新的" */
const checkedClean = ref(false)
/** 正在拿新版本（页面马上会刷新） */
const applying = ref(false)

/**
 * 「添加到主屏幕」之后，iOS 不会自己去拿新版本（从多任务切回来算恢复，不算启动）。
 * 所以给家长一个明确的按钮：有新版本就更新，没有就告诉她已经是最新的。
 */
async function handleCheckUpdate() {
  playSfx('tap')
  checkedClean.value = false
  if (updateReady.value) {
    applying.value = true
    await applyUpdate()
    return
  }
  const found = await checkForUpdate()
  if (found) {
    await applyUpdate()
    return
  }
  // 没有 SW 的时候（普通浏览器里打开），硬刷新就是"拿新版本"的全部含义
  if (!hasServiceWorker()) {
    window.location.reload()
    return
  }
  {
    checkedClean.value = true
    setTimeout(() => (checkedClean.value = false), 2400)
  }
}

function handleRestartTutorial() {
  playSfx('tap')
  settings.restartTutorial()
  restarted.value = true
  setTimeout(() => (restarted.value = false), 1600)
}
const difficulties: Difficulty[] = ['easy', 'normal', 'serious']
const unoLevels: UnoLevel[] = [1, 2, 3, 4]
const playtimeOptions = [0, 15, 20, 30]

function handleReset() {
  playSfx('tap')
  if (window.confirm(t('parent.resetConfirm'))) {
    settings.reset()
  }
}
</script>

<template>
  <div class="parent safe-area">
    <header class="bar">
      <h1>{{ $t('parent.title') }}</h1>
      <button class="close pressable" @click="router.back()">✕</button>
    </header>

    <div class="rows">
      <section class="row">
        <p class="label">{{ $t('parent.language') }}</p>
        <div class="options">
          <button
            v-for="item in SUPPORTED_LOCALES"
            :key="item.code"
            class="chip pressable"
            :class="{ active: settings.locale === item.code }"
            @click="settings.locale = item.code"
          >
            {{ item.label }}
          </button>
        </div>
      </section>

      <section class="row">
        <p class="label">{{ $t('parent.volume') }}</p>
        <input
          v-model.number="settings.volume"
          class="slider"
          type="range"
          min="0"
          max="1"
          step="0.1"
        />
      </section>

      <section class="row">
        <p class="label">{{ $t('difficulty.label') }}</p>
        <div class="options">
          <button
            v-for="item in difficulties"
            :key="item"
            class="chip pressable"
            :class="{ active: settings.difficulty === item }"
            @click="settings.difficulty = item"
          >
            {{ $t(`difficulty.${item}`) }}
          </button>
        </div>
      </section>

      <section class="row">
        <p class="label">{{ $t('parent.assist') }}</p>
        <button
          class="toggle pressable"
          :class="{ on: settings.assistHighlight }"
          @click="settings.assistHighlight = !settings.assistHighlight"
        >
          <span class="knob" />
        </button>
      </section>

      <section class="row">
        <p class="label">{{ $t('parent.tutorial') }}</p>
        <button
          class="toggle pressable"
          :class="{ on: settings.tutorialEnabled }"
          @click="settings.tutorialEnabled = !settings.tutorialEnabled"
        >
          <span class="knob" />
        </button>
      </section>

      <section class="row">
        <p class="label">{{ $t('parent.tutorialRestart') }}</p>
        <button class="chip pressable" @click="handleRestartTutorial">
          {{ restarted ? $t('parent.tutorialDone') : $t('parent.tutorialRestartAction') }}
        </button>
      </section>

      <section class="row">
        <p class="label">{{ $t('parent.unoLevel') }}</p>
        <div class="options">
          <button
            v-for="level in unoLevels"
            :key="level"
            class="chip pressable"
            :class="{ active: settings.unoLevel === level }"
            @click="settings.unoLevel = level"
          >
            {{ $t(`parent.unoLevel${level}`) }}
          </button>
        </div>
      </section>

      <section class="row">
        <p class="label">{{ $t('parent.playtime') }}</p>
        <div class="options">
          <button
            v-for="minutes in playtimeOptions"
            :key="minutes"
            class="chip pressable"
            :class="{ active: settings.playtimeReminder === minutes }"
            @click="settings.playtimeReminder = minutes"
          >
            {{ minutes === 0 ? $t('parent.playtimeOff') : $t('parent.playtimeMinutes', { n: minutes }) }}
          </button>
        </div>
      </section>

      <section class="row">
        <button class="danger pressable" @click="handleReset">
          {{ $t('parent.reset') }}
        </button>
      </section>

      <!--
        更新。加到主屏幕之后 iOS 不会自己更新，必须有个地方能手动拿新版本
        （用户实测：iPad 上装了快捷方式后就再也刷不出新版了）
      -->
      <section class="row">
        <p class="label">
          {{ $t('parent.version') }}
          <span class="version">{{ buildTime }}</span>
        </p>
        <!--
          ⚠️ 这个按钮**永远不能变成不可点**。它是家长手里唯一的救生索 ——
          一旦点不动，人就被锁在旧版本里，连"修好了更新按钮"的那一版都拿不到。
          原来写了 :disabled="checking"，而 checking 会因为 update() 不返回
          卡在 true（实测中招）。现在只在真正刷新的那一瞬间挡一下。
          "有新版本"永远排在"正在检查"前面显示：能更新就该让她去点，别让检查挡路。
        -->
        <button
          class="chip pressable"
          :class="{ ready: updateReady }"
          :disabled="applying"
          @click="handleCheckUpdate"
        >
          <template v-if="applying">{{ $t('parent.applying') }}</template>
          <template v-else-if="updateReady">
            {{ $t('parent.updateReady') }} · {{ $t('parent.applyUpdate') }}
          </template>
          <template v-else-if="checking">{{ $t('parent.checking') }}</template>
          <template v-else-if="checkedClean">{{ $t('parent.upToDate') }} ✓</template>
          <template v-else>{{ $t('parent.checkUpdate') }}</template>
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.parent {
  height: 100%;
  overflow-y: auto;
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

h1 {
  margin: 0;
  font-size: 24px;
}

.close {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  font-size: 22px;
  background: var(--bg-card);
  border-radius: 50%;
  box-shadow: var(--shadow);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 720px;
  margin: 0 auto;
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  background: var(--bg-card);
  border-radius: 20px;
  margin-bottom: 12px;
}

.label {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}

.options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chip {
  padding: 12px 18px;
  font-size: 15px;
  font-weight: 600;
  background: var(--bg);
  border-radius: 14px;
}

.chip.active {
  background: var(--accent);
}

.slider {
  flex: 1;
  min-width: 200px;
  accent-color: var(--accent-2);
}

.toggle {
  width: 68px;
  height: 38px;
  padding: 4px;
  background: rgba(61, 44, 30, 0.15);
  border-radius: 999px;
  transition: background 140ms;
}

.toggle.on {
  background: var(--accent-2);
}

.knob {
  display: block;
  width: 30px;
  height: 30px;
  background: #fff;
  border-radius: 50%;
  transition: transform 140ms;
}

.toggle.on .knob {
  transform: translateX(30px);
}

.chip.ready {
  color: #fff;
  background: var(--accent-2);
  animation: ready-beat 1.8s ease-in-out infinite;
}

@keyframes ready-beat {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.06);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chip.ready {
    animation: none;
  }
}

/* 版本号跟在"版本"两个字后面，用来核对到底更没更上 */
.version {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  color: var(--ink-soft);
  opacity: 0.7;
}

.danger {
  width: 100%;
  padding: 16px;
  font-size: 16px;
  font-weight: 700;
  color: var(--accent-3);
  background: rgba(239, 71, 111, 0.1);
  border-radius: 16px;
}
</style>
