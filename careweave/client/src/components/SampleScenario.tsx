import { useEffect, useState } from 'react'
import { getToken } from '@/auth/session'

// Offers to load one clearly labelled synthetic patient journey. Hidden once it is loaded or when the server has it off.
export default function SampleScenario({ className = '' }: { className?: string }) {
  const [state, setState] = useState<'hidden' | 'ready' | 'loading'>('hidden')
  const [error, setError] = useState('')
  const headers = () => ({ 'content-type': 'application/json', authorization: `Bearer ${getToken()}` })

  useEffect(() => {
    fetch('/api/demo/scenario', { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setState(j?.available && !j.loaded ? 'ready' : 'hidden'))
      .catch(() => setState('hidden'))
  }, [])

  async function load() {
    setState('loading')
    setError('')
    try {
      const r = await fetch('/api/demo/scenario', { method: 'POST', headers: headers(), body: '{}' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Could not load the sample scenario')
      window.location.reload()
    } catch (e) {
      setError((e as Error).message)
      setState('ready')
    }
  }

  if (state === 'hidden') return null
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button type="button" onClick={load} disabled={state === 'loading'} title="Adds one made-up patient with a lab result, a result waiting for verification, and a duplicate and a conflicting outside report">
        {state === 'loading' ? 'Loading sample' : 'Load sample scenario (synthetic)'}
      </button>
      {error && <span role="alert" style={{ color: '#a3341f', fontSize: 12 }}>{error}</span>}
    </span>
  )
}
