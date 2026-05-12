import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import VueRouter from 'unplugin-vue-router/vite'
import { resolve } from 'path'

const disableProxy = process.env.VITE_DISABLE_PROXY === '1'
const devHost = process.env.VITE_HOST || 'localhost'
const devPort = Number(process.env.VITE_PORT || 4000)

export default defineConfig({
  plugins: [
    VueRouter({
      routesFolder: 'src/pages',
      dts: 'src/typed-router.d.ts',
    }),
    vue()
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    host: devHost,
    port: devPort,
    strictPort: true,
    hmr: {
      host: process.env.VITE_HMR_HOST || devHost,
      clientPort: devPort,
    },
    proxy: disableProxy
      ? undefined
      : {
          '/api': {
            target: 'http://127.0.0.1:8787',
            changeOrigin: true,
          },
        },
  },
})
