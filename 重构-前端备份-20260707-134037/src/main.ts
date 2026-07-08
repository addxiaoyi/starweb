import { createApp as createVueApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import './styles/main.css'
import App from './App.vue'
import floatUp from './directives/vFloatUp'
import errorHandlerPlugin from './shared/utils/errorHandler'
import { initWebVitals } from '@/shared/utils/reportWebVitals'
import { startRoutePreload } from '@/shared/performance/routePreload'
import i18n from './i18n'

export function createApp() {
  const app = createVueApp(App)

  app.use(createPinia())
  app.use(router)
  app.use(i18n)
  app.use(errorHandlerPlugin)
  app.directive('float-up', floatUp)

  return { app, router }
}

const { app } = createApp()
app.mount('#app')

startRoutePreload()
initWebVitals()
