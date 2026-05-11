import { createApp } from 'vue'
import { createPinia, type Pinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './styles/main.css'
import 'vue-sonner/style.css'
import { useTheme } from './composables/useTheme'
import { registerServiceWorker } from './registerServiceWorker'

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

registerServiceWorker()

app.mount('#app')
