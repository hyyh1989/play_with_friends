<script setup lang="ts">
/**
 * 家长设置入口。就是一个普通按钮 —— 点一下就进。
 *
 * 原本做成长按 3 秒，是为了防止孩子误入。实测下来这是过度设计：按住时手指正好
 * 盖住进度环，反馈等于不存在；而 5 岁的孩子已经能判断"这个不是我要点的"，
 * 不需要用交互难度把她挡在外面。图标保持很淡，不吸引注意就够了。
 */
</script>

<template>
  <button class="settings" :aria-label="$t('parent.title')">
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </g>
      <circle cx="9" cy="7" r="2.6" fill="currentColor" />
      <circle cx="15" cy="12" r="2.6" fill="currentColor" />
      <circle cx="8" cy="17" r="2.6" fill="currentColor" />
    </svg>
  </button>
</template>

<style scoped>
.settings {
  display: grid;
  place-items: center;
  width: var(--tap-min);
  height: var(--tap-min);
  color: var(--ink);
  opacity: 0.3;
  transition: opacity 160ms;
}

.settings:active {
  opacity: 0.7;
}

svg {
  width: 30px;
  height: 30px;
}
</style>
