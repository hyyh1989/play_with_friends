<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import GameCard from '../components/GameCard.vue'
import SettingsButton from '../components/SettingsButton.vue'
import AvatarPicker from '../components/AvatarPicker.vue'
import { listGames } from '../core/game-registry'
import { UPCOMING } from '../games'
import { playSfx, speak } from '../core/audio'
import { useSettingsStore } from '../stores/settings'

const router = useRouter()
const settings = useSettingsStore()
const showAvatarPicker = ref(false)

const games = listGames()

function openGame(id: string) {
  playSfx('tap')
  void speak(`game.${id}`)
  router.push({ name: 'game', params: { id } })
}

/** 还没做完的游戏：给一个温和的反馈，不是报错音 */
function tapUpcoming(id: string) {
  playSfx('nope')
  void speak(`game.${id}`)
}
</script>

<template>
  <div class="home safe-area">
    <header class="bar">
      <button class="avatar pressable" @click="showAvatarPicker = true">
        <span class="avatar-emoji">{{ settings.avatar }}</span>
      </button>
      <SettingsButton @click="router.push({ name: 'parent' })" />
    </header>

    <main class="grid">
      <GameCard
        v-for="game in games"
        :key="game.meta.id"
        :meta="game.meta"
        @click="openGame(game.meta.id)"
      />
      <GameCard
        v-for="meta in UPCOMING"
        :key="meta.id"
        :meta="meta"
        upcoming
        @click="tapUpcoming(meta.id)"
      />
    </main>

    <AvatarPicker v-if="showAvatarPicker" @close="showAvatarPicker = false" />
  </div>
</template>

<style scoped>
.home {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.avatar {
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  padding: 0;
  background: var(--bg-card);
  border-radius: 50%;
  box-shadow: var(--shadow);
}

/* 见 GameCard 里关于 emoji 字体栈的说明 */
.avatar-emoji {
  display: block;
  font-size: clamp(36px, 6vmin, 52px);
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  line-height: 1;
  text-align: center;
}

.grid {
  display: grid;
  flex: 1;
  align-content: center;
  justify-content: center;
  /* iPad 横屏一行放得下 3-4 个；竖屏自动折成两行 */
  grid-template-columns: repeat(auto-fit, minmax(180px, 240px));
  gap: clamp(16px, 3vmin, 36px);
  padding: 16px 0 24px;
}
</style>
