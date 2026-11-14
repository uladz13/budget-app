import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/budget-app/',
  // Версия из package.json — для журнала диагностики (BA-008).
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev') },
  plugins: [
    preact(),
    VitePWA({
      // 'prompt': новая версия ждёт нажатия «Обновить» или следующего запуска (BA-008).
      registerType: 'prompt',
      includeAssets: ['icon-180.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Бюджет',
        short_name: 'Бюджет',
        description: 'Личный бюджет: счета, доходы, расходы, накопления',
        lang: 'ru',
        start_url: '/budget-app/',
        scope: '/budget-app/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#111315',
        theme_color: '#111315',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
});
