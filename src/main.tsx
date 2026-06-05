import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerSW } from 'virtual:pwa-register'
import { I18nProvider } from './I18nProvider'

registerSW({
  onNeedRefresh() {
    // Optional: Show a prompt to user to refresh
  },
  onOfflineReady() {
    // Optional: Show a message that app is ready to work offline
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
