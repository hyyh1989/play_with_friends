import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import ParentView from '../views/ParentView.vue'
import GameHostView from '../views/GameHostView.vue'
import NetCheckView from '../views/NetCheckView.vue'
import { getGame } from '../core/game-registry'

/**
 * 用 hash 模式：这个 app 会被当静态文件部署，也会以 PWA 方式离线打开，
 * hash 路由不依赖服务端 rewrite，最省事。
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/parent', name: 'parent', component: ParentView },
    {
      path: '/game/:id',
      name: 'game',
      component: GameHostView,
      // 没登记的游戏（比如还没做的）直接回首页，不让孩子看到空白页
      beforeEnter: (to) => (getGame(String(to.params.id)) ? true : { path: '/' }),
    },
    /* 联机自检页。**首页不链接它**，是给我们排查用的工具，不是给孩子的入口 */
    { path: '/net/:code?', name: 'netcheck', component: NetCheckView },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
