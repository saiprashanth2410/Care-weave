import { useEffect, useRef } from 'react'

type LiveEvent = (type: string, data: any) => void

/** How many quiet polls pass before a screen reloads anyway, as a safety net (12 polls of 5 s is a minute). */
export const QUIET_POLLS_BEFORE_RELOAD = 12

/**
 * What one poll of the server's change token means. `version` is null when the server cannot say (an older server, or a
 * failed request): then the screen reloads as it always did. The first token only sets the baseline; after that a screen
 * reloads when the token moved, and otherwise only after a long quiet spell.
 */
export function pollDecision(prev: { last: string | null; quiet: number }, version: string | null): { reload: boolean; next: { last: string | null; quiet: number } } {
  if (version === null) return { reload: true, next: { last: prev.last, quiet: 0 } }
  if (prev.last === null) return { reload: false, next: { last: version, quiet: 0 } }
  if (version !== prev.last) return { reload: true, next: { last: version, quiet: 0 } }
  const quiet = prev.quiet + 1
  return quiet >= QUIET_POLLS_BEFORE_RELOAD ? { reload: true, next: { last: version, quiet: 0 } } : { reload: false, next: { last: version, quiet } }
}

/** The server's change token, or null when it cannot be read. One small request, no lists. */
async function readVersion(signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch('/api/changes', { signal })
    if (!res.ok) return null
    const body = await res.json()
    return typeof body.version === 'string' ? body.version : null
  } catch { return null }
}

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

    // Polling asks the server one cheap question ("has anything been saved?") and reloads only when the answer changed.
    let state: { last: string | null; quiet: number } = { last: null, quiet: 0 }
    void readVersion(ctrl.signal).then((v) => { if (v !== null && state.last === null) state = { last: v, quiet: 0 } })
    const poll = setInterval(async () => {
      beats++
      if (live && beats % 6 !== 0) return // the stream is up: only the slow safety check
      if (document.visibilityState !== 'visible') return
      const decision = pollDecision(state, await readVersion(ctrl.signal))
      state = decision.next
      if (decision.reload && !stopped) fire()
    }, ms)
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
          const res = await fetch('/api/events', { signal: ctrl.signal })
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
