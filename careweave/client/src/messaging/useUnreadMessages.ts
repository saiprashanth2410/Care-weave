import { useCallback, useEffect, useState } from 'react'
import { useLiveRefresh } from '@/useLiveRefresh'

export const MESSAGES_CHANGED = 'cw-messages-changed'

/** How many staff messages are waiting for the signed-in person, for the badge on the Messages menu item. */
export function useUnreadMessages(): number {
  const [count, setCount] = useState(0)
  const load = useCallback(() => {
    fetch('/api/messages/unread')
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (b && typeof b.count === 'number') setCount(b.count) })
      .catch(() => {})
  }, [])
  useEffect(() => { load() }, [load])
  useLiveRefresh(load)
  useEffect(() => {
    window.addEventListener(MESSAGES_CHANGED, load)
    return () => window.removeEventListener(MESSAGES_CHANGED, load)
  }, [load])
  return count
}
