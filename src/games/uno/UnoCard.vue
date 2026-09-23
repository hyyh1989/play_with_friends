<script setup lang="ts">
import { computed } from 'vue'
import type { Card, CardColor } from './rules'

/**
 * 一张 UNO 牌。
 *
 * 做成"一眼认得出是 UNO"的样子：彩色牌身 + 中间一个斜着的白椭圆 + 椭圆里的大字，
 * 左上右下各一个小字。2026-09-23 第一版只是个纯色方块加个数字，用户反馈
 * "懂规则的人也很难理解这是在打 UNO" —— 缺的就是这个椭圆。
 *
 * 不传 card 就是牌背（对手手牌、摸牌堆用）。
 */
const props = defineProps<{
  card?: Card
  /** 牌背 */
  back?: boolean
}>()

const COLOR_HEX: Record<CardColor, string> = {
  red: '#e63462',
  yellow: '#f9c22e',
  green: '#00b884',
  blue: '#2a9df4',
}

const body = computed(() => {
  if (props.back || !props.card) return '#2b2118'
  const c = props.card.color
  // 万能牌没有固有颜色，牌身用深色，椭圆里放四色
  return c ? COLOR_HEX[c] : '#2b2118'
})

const isWild = computed(
  () => props.card?.kind === 'wild' || props.card?.kind === 'wild4',
)

const glyph = computed(() => {
  const card = props.card
  if (!card) return ''
  switch (card.kind) {
    case 'number':
      return String(card.value)
    case 'skip':
      return '⊘'
    case 'reverse':
      return '⇄'
    case 'draw2':
      return '+2'
    case 'wild4':
      return '+4'
    default:
      return ''
  }
})
</script>

<template>
  <div class="uno-card" :style="{ '--body': body }">
    <span class="oval" :class="{ wild: isWild }">
      <span v-if="!back && card" class="glyph" :class="{ onwild: isWild }">{{ glyph }}</span>
    </span>
    <template v-if="!back && card">
      <span class="corner tl">{{ glyph }}</span>
      <span class="corner br">{{ glyph }}</span>
    </template>
  </div>
</template>

<style scoped>
.uno-card {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  background: var(--body);
  border-radius: 12%;
  /* 白边框用 inset 阴影做：CSS 的 border-width 不接受百分比，写了等于没写 */
  box-shadow: inset 0 0 0 5cqw #fffdf7, 0 3px 6px rgba(61, 44, 30, 0.3);
  overflow: hidden;
}

/* 斜着的白椭圆 —— UNO 最好认的特征 */
.oval {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 118%;
  height: 62%;
  background: #fffdf7;
  border-radius: 50%;
  transform: translate(-50%, -50%) rotate(-24deg);
}

.oval.wild {
  background: conic-gradient(
    from 0deg,
    #e63462 0deg 90deg,
    #f9c22e 90deg 180deg,
    #00b884 180deg 270deg,
    #2a9df4 270deg 360deg
  );
}

.glyph {
  font-size: 46cqw;
  font-weight: 900;
  line-height: 1;
  color: var(--body);
  transform: rotate(24deg);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
}

.glyph.onwild {
  color: #fffdf7;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.55);
}

/* 左上右下的小字，和真牌一样 */
.corner {
  position: absolute;
  font-size: 22cqw;
  font-weight: 900;
  line-height: 1;
  color: #fffdf7;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}

.tl {
  top: 5%;
  left: 7%;
}

.br {
  right: 7%;
  bottom: 5%;
  transform: rotate(180deg);
}
</style>
