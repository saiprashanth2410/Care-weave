import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { installSessionFetch } from './auth/installFetch'

installSessionFetch()

// A tab opened before a deploy asks for page chunks that the new deploy no longer has ("Importing a module script failed").
// Vite reports that as an event; reload once to pick up the new build. The flag stops a loop if the reload does not help.
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem('cw_chunk_reload') === '1') return
    sessionStorage.setItem('cw_chunk_reload', '1')
  } catch { /* storage blocked: reload once anyway */ }
  event.preventDefault()
  window.location.reload()
})
// A page that stays up for ten seconds loaded fine, so it may reload for this reason again later. Clearing the flag sooner
// would let a genuinely missing chunk reload the page forever.
window.addEventListener('load', () => setTimeout(() => { try { sessionStorage.removeItem('cw_chunk_reload') } catch { /* ignore */ } }, 10_000))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
