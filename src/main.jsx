import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { initAppLanguage } from '@/lib/appI18n'

// Activate the chosen UI language (no-op for Hebrew, the default → zero cost).
try { initAppLanguage() } catch (e) { console.warn('i18n init failed', e) }

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)

// Register the PWA service worker (offline shell + push). Safe no-op where
// service workers aren't supported.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) =>
      console.warn('SW registration failed:', e),
    )
  })
}
