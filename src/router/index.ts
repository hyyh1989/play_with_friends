import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import ParentView from '../views/ParentView.vue'
import ResultView from '../views/ResultView.vue'

/**
 * 用 hash 模式：这个 app 会被当静态文件部署，也会以 PWA 方式离线打开，
 * hash 路由不依赖服务端 rewrite，最省事。
 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/parent', name: 'parent', component: ParentView },
    { path: '/result', name: 'result', component: ResultView },
    // 阶段 1 起：{ path: '/game/:id', name: 'game', component: GameHostView }
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
