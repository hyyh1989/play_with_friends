<script setup lang="ts">
import { AVATARS, useSettingsStore } from '../stores/settings'
import { playSfx } from '../core/audio'

const emit = defineEmits<{ close: [] }>()
const settings = useSettingsStore()

function choose(avatar: string) {
  settings.avatar = avatar
  playSfx('success')
  emit('close')
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="sheet">
      <p class="title">{{ $t('avatar.choose') }}</p>
      <div class="avatar-grid">
        <button
          v-for="avatar in AVATARS"
          :key="avatar"
          class="option pressable"
          :class="{ active: avatar === settings.avatar }"
          @click="choose(avatar)"
        >
          <span class="option-emoji">{{ avatar }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(61, 44, 30, 0.4);
}

.sheet {
  width: min(680px, 100%);
  padding: 28px;
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}

.title {
  margin: 0 0 20px;
  font-size: clamp(20px, 3vmin, 28px);
  font-weight: 700;
  text-align: center;
}

/*
 * minmax(0, 1fr) 而不是 1fr：网格项的默认 min-width 是 auto，
 * 大号 emoji 会把列撑得比 1fr 宽，整个网格就溢出白色面板往右冒出去。
 */
.avatar-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.option {
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: var(--tap-min);
  background: var(--bg);
  border-radius: 20px;
}

.option-emoji {
  display: block;
  font-size: clamp(32px, 6vmin, 52px);
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  line-height: 1;
  text-align: center;
}

.option.active {
  background: var(--accent);
  box-shadow: var(--shadow);
}
</style>
