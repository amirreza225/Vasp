import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import { vaspPlugin } from './vasp/plugin.js'

const app = createApp(App)
app.use(router)
app.use(vaspPlugin)
app.mount('#app')
