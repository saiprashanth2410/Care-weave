import { useEffect, useRef } from 'react'

/**
 * Calls onTick every `ms` while the tab is visible, and once when the tab becomes visible again, so a screen
 * left open on another device catches up with changes made elsewhere. There is no push channel on the server.
 */
export function useLiveRefresh(onTick: () => void, ms = 5000) {
  const cb = useRef(onTick)
  useEffect(() => { cb.current = onTick })
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') cb.current() }
    const timer = setInterval(tick, ms)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [ms])
}
