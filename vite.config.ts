import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
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
