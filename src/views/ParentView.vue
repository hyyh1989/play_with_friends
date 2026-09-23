<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSettingsStore, type UnoLevel } from '../stores/settings'
import { SUPPORTED_LOCALES } from '../i18n'
import type { Difficulty } from '../core/types'
import { playSfx } from '../core/audio'

const router = useRouter()
const settings = useSettingsStore()
const { t } = useI18n()

const buildTime = __BUILD_TIME__
const restarted = ref(false)

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

      <!-- 核对线上是不是新版用的（PWA 会缓存旧版本） -->
      <p class="version">{{ buildTime }}</p>
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

.version {
  margin: 4px 0 16px;
  font-size: 12px;
  color: var(--ink-soft);
  text-align: center;
  opacity: 0.6;
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
