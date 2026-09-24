import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { registerAllGames } from './games'
import { setupPwa } from './core/pwa'
import './styles/global.css'

registerAllGames()
setupPwa()

createApp(App).use(createPinia()).use(router).use(i18n).mount('#app')
