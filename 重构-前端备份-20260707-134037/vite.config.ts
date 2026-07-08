/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import type { PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import path from 'node:path'
import { visualizer } from 'rollup-plugin-visualizer'
import viteCompression from 'vite-plugin-compression'
import { VitePWA } from 'vite-plugin-pwa'
import Sitemap from 'vite-plugin-sitemap'
import { createStarMcDevProxy } from './vite.proxy.config'
import { applyStarMcGeneratedEnv } from './vite.generated-env'
import { STARMC_SITEMAP_HOSTNAME, STARMC_SITEMAP_ROUTES } from './vite.sitemap.config'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  applyStarMcGeneratedEnv(mode, __dirname)
  const devProxy = createStarMcDevProxy()

  return {
    plugins: [
      vue(),
      vueJsx(),
      visualizer({
        open: false,
        gzipSize: true,
        brotliSize: true,
        filename: 'stats.html',
      }),
      viteCompression({
        verbose: true,
        disable: false,
        threshold: 10240,
        algorithm: 'gzip',
        ext: '.gz',
      }),
      Sitemap({
        hostname: STARMC_SITEMAP_HOSTNAME,
        dynamicRoutes: STARMC_SITEMAP_ROUTES,
        generateRobotsTxt: false,
      }),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
          globIgnores: ['**/*.map', '**/stats.html', '**/*.LICENSE.txt', '**/*.gz', '**/*.br'],
          navigateFallbackDenylist: [/^\/api\//, /^\/plugin/, /^\/uploads\//, /^\/healthz/],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'images',
                expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 7 },
              },
            },
          ],
        },
        manifest: {
          name: 'StarMC Server Community',
          short_name: 'StarMC',
          description: 'StarMC - 专注于提供优质Minecraft服务器体验的社区',
          theme_color: '#1e1e23',
          background_color: '#1e1e23',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
      }),
    ] satisfies PluginOption[],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        'vue-i18n': 'vue-i18n/dist/vue-i18n.runtime.esm-bundler.js',
      },
    },
    define: {
      __VUE_I18N_FULL_INSTALL__: true,
      __VUE_I18N_LEGACY_API__: false,
      __INTLIFY_JIT_COMPILATION__: true,
      __INTLIFY_DROP_MESSAGE_COMPILER__: false,
      __INTLIFY_PROD_DEVTOOLS__: false,
    },
    esbuild: {
      drop: ['console'],
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('skinview3d') || id.includes('skinview-utils')) {
                return 'skinview3d-vendor'
              }
              if (id.includes('three') || id.includes('ogl')) {
                return 'three-vendor'
              }
              if (id.includes('gsap') || id.includes('lottie-web') || id.includes('matter-js')) {
                return 'animation-vendor'
              }
              if (id.includes('vue') || id.includes('pinia') || id.includes('vue-router')) {
                return 'vue-vendor'
              }
              return 'vendor'
            }
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: devProxy,
      headers: {
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://api.mcsrvstat.us https://api.mcstatus.io https://api.allorigins.win https://api.rss2json.com https://v1.hitokoto.cn; frame-src 'self' https://player.bilibili.com https://live.bilibili.com; media-src 'self' data: blob: https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; worker-src 'self' blob:; manifest-src 'self';",
      },
    },
    preview: {
      port: 4173,
      proxy: devProxy,
      headers: {
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://api.mcsrvstat.us https://api.mcstatus.io https://api.allorigins.win https://api.rss2json.com https://v1.hitokoto.cn; frame-src 'self' https://player.bilibili.com https://live.bilibili.com; media-src 'self' data: blob: https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; worker-src 'self' blob:; manifest-src 'self';",
      },
    },
    test: {
      environment: 'jsdom',
      include: ['tests/unit/**/*.spec.ts', 'src/**/*.spec.ts'],
      exclude: ['e2e/**', 'tests/e2e/**', 'node_modules/**', 'tests/example.spec.ts'],
      globals: true,
    },
  }
})
