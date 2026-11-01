// The session token lives in an httpOnly cookie the server sets, so no script here can read it. Every call to our own API
// carries the cookie automatically; this adds the header the server requires on state-changing browser requests.
const HEADER = 'X-CW-Session'

export function installSessionFetch() {
  // An earlier version kept the token in localStorage. Remove any copy still sitting in this browser.
  try { localStorage.removeItem('cw_token') } catch { /* storage blocked: nothing to remove */ }

  const original = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url
    if (!url.startsWith('/api')) return original(input, init)
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined))
    headers.set(HEADER, 'cookie')
    return original(input, { ...init, headers, credentials: 'same-origin' })
  }
}
