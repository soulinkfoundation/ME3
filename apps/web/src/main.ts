import { createApp } from 'vue'
import { createPinia, type Pinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './styles/main.css'
import 'vue-sonner/style.css'
import { useTheme } from './composables/useTheme'
import { cleanupLegacyServiceWorker } from './serviceWorkerCleanup'

const staleChunkReloadKey = 'me3:stale-chunk-reload'
let latestPreloadError: unknown = null

window.addEventListener('vite:preloadError', (event) => {
  // Let Vite reject the import so Vue Router can report which route failed.
  latestPreloadError = event.payload
})

router.onError((error, to) => {
  if (error !== latestPreloadError) return
  latestPreloadError = null

  const previousReload = Number(
    window.sessionStorage.getItem(staleChunkReloadKey) || '0',
  )
  if (Date.now() - previousReload < 10_000) {
    return
  }

  window.sessionStorage.setItem(staleChunkReloadKey, String(Date.now()))
  // The browser URL still points at the route we are leaving because the
  // failed lazy component prevented Vue Router from committing navigation.
  window.location.assign(to.fullPath)
})

// Extend window interface for testing
declare global {
  interface Window {
    __PINIA_STATE__?: Record<string, unknown>
    __PINIA__?: Pinia
  }
}

const app = createApp(App)
const { initTheme } = useTheme()

initTheme()

const pinia = createPinia()
app.use(pinia)

// Expose Pinia state for e2e testing (only in development)
if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  window.__PINIA__ = pinia
  
  // Subscribe to state changes to expose current state
  pinia.use(({ store }) => {
    // Initialize state object if not exists
    if (!window.__PINIA_STATE__) {
      window.__PINIA_STATE__ = {}
    }
    
    // Set initial state
    window.__PINIA_STATE__[store.$id] = store.$state
    
    // Subscribe to changes
    store.$subscribe((_, state) => {
      if (window.__PINIA_STATE__) {
        window.__PINIA_STATE__[store.$id] = JSON.parse(JSON.stringify(state))
      }
    })
  })
}

app.use(router)

// Existing installs may still be controlled by the retired PWA service worker.
// Remove its registration and app-shell caches once the current page has loaded.
cleanupLegacyServiceWorker()

void router.isReady().finally(() => {
  // Keep the static, branded launch state in place until the initial route has
  // resolved. Mounting immediately replaces it with an empty RouterView while
  // the auth guard is still checking the owner session.
  app.mount('#app')
})
