<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { CODE_ICONS, CODE_LEN, iconsToCode } from '../net/protocol'
import { createRoomCode } from '../net/room-client'
import { playSfx } from '../core/audio'

/**
 * 和朋友玩 —— 开房 / 加入。
 *
 * ── 为什么房间号是图案不是数字 ──
 * 5 岁读不出 "A7K2" 也打不进去。图案的话：开房那台把三个图案念出来
 * （「小熊、火箭、星星」），另一台照着点三下就进来了。
 * 这条**远程也成立** —— 电话或微信里一说就行，比二维码适用面更广。
 *
 * ── 这一屏的设计目标不是「零阅读依赖」 ──
 * 加入房间本来就该是**大人做一次**的事，孩子只需要会玩。
 * 所以这里按「大人 3 秒钟搞定」来设计，别为了让 5 岁独立完成而把它做复杂。
 */
const router = useRouter()
const mode = ref<'pick' | 'join'>('pick')
const picked = ref<number[]>([])
const busy = ref(false)
const err = ref('')

const full = computed(() => picked.value.length >= CODE_LEN)

async function openRoom() {
  if (busy.value) return
  busy.value = true
  err.value = ''
  playSfx('tap')
  try {
    router.push({
      name: 'netplay',
      params: { code: await createRoomCode() },
      query: { g: 'uno' },
    })
  } catch {
    // 开房要联网。失败了直说，别让她对着转圈等
    err.value = '连不上，检查一下网络'
    busy.value = false
  }
}

function tapIcon(i: number) {
  if (full.value) return
  playSfx('tap')
  picked.value = [...picked.value, i]
  if (picked.value.length === CODE_LEN) {
    router.push({
      name: 'netplay',
      params: { code: iconsToCode(picked.value) },
      query: { g: 'uno' },
    })
  }
}

function undo() {
  playSfx('tap')
  picked.value = picked.value.slice(0, -1)
}
</script>

<template>
  <div class="lobby safe-area">
    <button
      class="corner-back pressable"
      :aria-label="$t('common.back')"
      @click="mode === 'join' ? ((mode = 'pick'), (picked = [])) : router.push('/')"
    >
      ←
    </button>

    <!-- 两个出口，图形化区分：开房是一间空房子，加入是走进去 -->
    <div v-if="mode === 'pick'" class="two">
      <button class="big pressable" :disabled="busy" @click="openRoom">
        <span class="big-art">🏠</span>
        <span class="big-t">{{ $t('net.openRoom') }}</span>
      </button>
      <button class="big pressable" @click="((mode = 'join'), playSfx('tap'))">
        <span class="big-art">🚪</span>
        <span class="big-t">{{ $t('net.joinRoom') }}</span>
      </button>
      <p v-if="err" class="err">{{ err }}</p>
    </div>

    <!-- 加入：照着对方念的三个图案点三下 -->
    <template v-else>
      <p class="tip">{{ $t('net.tapThree') }}</p>
      <div class="slots">
        <span v-for="n in CODE_LEN" :key="n" class="slot">
          {{ picked[n - 1] !== undefined ? CODE_ICONS[picked[n - 1]] : '' }}
        </span>
      </div>
      <div class="grid">
        <button
          v-for="(ic, i) in CODE_ICONS"
          :key="i"
          class="ic pressable"
          :aria-label="String(i)"
          @click="tapIcon(i)"
        >
          {{ ic }}
        </button>
      </div>
      <button v-if="picked.length" class="undo pressable" @click="undo">↶</button>
    </template>
  </div>
</template>

<style scoped>
.lobby {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(14px, 3vmin, 30px);
  height: 100%;
}
.two {
  display: flex;
  gap: clamp(14px, 4vmin, 40px);
  flex-wrap: wrap;
  justify-content: center;
}
.big {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: clamp(18px, 4vmin, 34px) clamp(24px, 6vmin, 52px);
  background: var(--bg-card);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
}
.big[disabled] {
  opacity: 0.5;
}
.big-art {
  font-size: clamp(52px, 13vmin, 96px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
}
.big-t {
  font-size: clamp(15px, 2.4vmin, 22px);
  font-weight: 700;
}
.tip {
  font-size: clamp(14px, 2.2vmin, 19px);
  color: var(--ink-soft);
}
/* 已经点了几个 —— 三个空槽，点一个填一个，一眼看出还差几下 */
.slots {
  display: flex;
  gap: clamp(8px, 2vmin, 18px);
}
.slot {
  display: grid;
  place-items: center;
  width: clamp(56px, 14vmin, 96px);
  height: clamp(56px, 14vmin, 96px);
  font-size: clamp(34px, 9vmin, 62px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  background: var(--bg-card);
  border: 3px dashed rgba(61, 44, 30, 0.22);
  border-radius: 16px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: clamp(8px, 2vmin, 16px);
  max-width: 420px;
}
.ic {
  display: grid;
  place-items: center;
  /* 可点区按铁律 2 给足 */
  width: clamp(64px, 18vw, 92px);
  height: clamp(64px, 18vw, 92px);
  font-size: clamp(32px, 9vw, 48px);
  line-height: 1;
  font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  background: var(--bg-card);
  border-radius: 16px;
  box-shadow: var(--shadow);
}
.undo {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  font-size: 26px;
  background: var(--bg-card);
  border-radius: 50%;
  box-shadow: var(--shadow);
}
.err {
  color: var(--accent-3);
  font-size: 14px;
  width: 100%;
  text-align: center;
}
</style>
