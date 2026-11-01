import { useEffect, useRef } from 'react'

type LiveEvent = (type: string, data: any) => void

/**
 * Keeps a screen current. It listens to the server's live stream (/api/events) and reloads the moment something
 * changes anywhere; when the stream cannot be opened (serverless host, proxy, offline) it falls back to reloading
 * every `ms` while the tab is visible. With the stream up, a slow poll still runs as a safety net.
 */
export function useLiveRefresh(onTick: () => void, ms = 5000, onEvent?: LiveEvent) {
  const tickRef = useRef(onTick)
  const eventRef = useRef(onEvent)
  useEffect(() => { tickRef.current = onTick; eventRef.current = onEvent })

  useEffect(() => {
    let live = false
    let stopped = false
    let beats = 0
    let debounce: ReturnType<typeof setTimeout> | undefined
    const ctrl = new AbortController()
    const fire = () => { if (document.visibilityState === 'visible') tickRef.current() }

    const poll = setInterval(() => { beats++; if (!live || beats % 6 === 0) fire() }, ms)
    document.addEventListener('visibilitychange', fire)

    const handle = (type: string, raw: string) => {
      if (type === 'change') { clearTimeout(debounce); debounce = setTimeout(fire, 150); return }
      let data: any = {}
      try { data = JSON.parse(raw) } catch { /* an unreadable payload still counts as a nudge */ }
      eventRef.current?.(type, data)
      fire()
    }

    async function connect() {
      while (!stopped) {
        try {
          const token = localStorage.getItem('cw_token')
          if (!token) return
          const res = await fetch('/api/events', { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal })
          if (!res.ok || !res.body || !(res.headers.get('content-type') || '').includes('text/event-stream')) return // no stream here: polling carries on
          live = true
          const reader = res.body.getReader()
          const dec = new TextDecoder()
          let buf = ''
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            buf += dec.decode(value, { stream: true })
            let i: number
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const block = buf.slice(0, i)
              buf = buf.slice(i + 2)
              const type = /^event: (.+)$/m.exec(block)?.[1]
              const data = /^data: (.*)$/m.exec(block)?.[1] ?? ''
              if (type) handle(type, data)
            }
          }
        } catch { /* dropped or aborted: retry below unless the screen is gone */ }
        live = false
        if (stopped) return
        await new Promise((r) => setTimeout(r, 5000))
      }
    }
    connect()

    return () => {
      stopped = true
      ctrl.abort()
      clearInterval(poll)
      clearTimeout(debounce)
      document.removeEventListener('visibilitychange', fire)
    }
  }, [ms])
}
