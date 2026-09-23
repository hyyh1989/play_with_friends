import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * 构建时间戳。PWA 会缓存，线上到底是不是新版，靠家长设置页底部这行核对。
 *
 * 注：`wrangler deploy` 会自作主张往这里插 @cloudflare/vite-plugin。
 * 这是个纯静态站，不需要它 —— 部署只是把 dist/ 传上去（见 wrangler.jsonc）。
 * 如果它又被加回来了，删掉即可。
 */
const buildStamp = new Date()
  .toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' })
  .slice(0, 16)

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(buildStamp),
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: '一起玩',
        short_name: '一起玩',
        description: '给小朋友的桌游合集',
        lang: 'zh-CN',
        start_url: '.',
        display: 'standalone',
        background_color: '#fff8e7',
        theme_color: '#ffd166',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // 音频也要进缓存，否则断网后没有音效
        globPatterns: ['**/*.{js,css,html,png,svg,wav}'],
        /*
         * 但只预缓存中文语音。三种语言全塞进去要 5.8MB，而每个用户只用其中一种 ——
         * 等于让所有人替另外两种语言付流量。英韩改成"用到才下载、下载后缓存"。
         */
        globIgnores: ['**/audio/voice/en/**', '**/audio/voice/ko/**'],
        runtimeCaching: [
          {
            urlPattern: /audio\/voice\/.*\.wav$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'voice',
              expiration: { maxEntries: 80 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // 允许局域网访问，这样 iPad 能直接打开 Mac 上的 dev server 实测
    host: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
