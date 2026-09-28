<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import GameCard from '../components/GameCard.vue'
import SettingsButton from '../components/SettingsButton.vue'
import AvatarPicker from '../components/AvatarPicker.vue'
import { listGames } from '../core/game-registry'
import { UPCOMING } from '../games'
import { playSfx, speak } from '../core/audio'
import { recentRoom } from '../net/room-client'
import { codeToIcons } from '../net/protocol'
import { useSettingsStore } from '../stores/settings'

const router = useRouter()
const settings = useSettingsStore()
const showAvatarPicker = ref(false)

const games = listGames()

/*
 * 刚才在联机房间里没？
 * 浏览器重开会自己回到原来那页，但**「添加到主屏幕」的 app 每次都从头开** ——
 * iPad 一关一开就回到这里，房间号只能靠记（用户实测中招）。给一条回去的路。
 * 只在服务端还留着局面的那 10 分钟内出现，过期了就不显示 —— 显示了也回不去。
 */
const back = ref(recentRoom())
function resume() {
  if (!back.value) return
  playSfx('tap')
  router.push({
    name: 'netplay',
    params: { code: back.value.code },
    query: { g: back.value.gameId },
  })
}

/**
 * 首页排几列。
 *
 * 4 个游戏时必须是 2×2 —— 排成 3 + 1 的话最后一个孤零零掉在左下角，
 * 看着像"没做完"。其余情况 3 列。窄屏由 CSS 自己折行。
 */
const columns = computed(() => {
  const total = games.length + UPCOMING.length
  return total === 4 ? 2 : 3
})

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

    <!-- 回到刚才的房间。放在游戏格子上面：它是"接着刚才那件事"，比重新挑一个游戏更急 -->
    <button v-if="back" class="resume pressable" @click="resume">
      <span class="resume-t">{{ $t('net.backToRoom') }}</span>
      <span class="resume-code">
        <i v-for="(ic, i) in codeToIcons(back.code)" :key="i">{{ ic }}</i>
      </span>
    </button>

    <main class="grid" :style="{ '--cols': columns }">
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
.resume {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(10px, 2.5vmin, 22px);
  margin: 0 auto 6px;
  padding: clamp(10px, 2vmin, 16px) clamp(16px, 4vmin, 30px);
  background: var(--accent-2);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.resume-t {
  font-size: clamp(14px, 2.2vmin, 19px);
  font-weight: 700;
  color: #fff;
}
.resume-code {
  display: flex;
  gap: 6px;
}
.resume-code i {
  font-size: clamp(24px, 4.5vmin, 38px);
  font-style: normal;
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}

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
  /*
   * 列数按游戏总数算（见 columns），不用 auto-fit ——
   * auto-fit 在 4 个游戏时会排成 3 + 1，最后一个孤零零掉在左下角。
   * 窄屏时仍然让它自己折行：min() 保证列数不会超过放得下的数量。
   */
  grid-template-columns: repeat(var(--cols, 3), minmax(140px, 240px));
  gap: clamp(16px, 3vmin, 36px);
  padding: 16px 0 24px;
}
</style>
