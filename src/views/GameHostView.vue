<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { getGame } from '../core/game-registry'

/**
 * 游戏外壳。只负责按路由参数找到对应的游戏模块并渲染它 ——
 * 开局设置、回合推进、结算都归游戏自己管。
 *
 * 路由守卫已经挡掉了不存在的 id，所以这里不需要再兜底。
 */
const route = useRoute()
const game = computed(() => getGame(String(route.params.id)))
</script>

<template>
  <component :is="game!.component" />
</template>
