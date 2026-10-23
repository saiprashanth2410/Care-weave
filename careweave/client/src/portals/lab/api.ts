import type { LabOrder } from './types'

// Talks to the CareWeave backend (proxied to :4000 in vite.config.ts).
export async function getLabOrders(): Promise<LabOrder[]> {
  const res = await fetch('/api/lab/orders', { credentials: 'include' })
  if (!res.ok) throw new Error(`Request failed (${res.status})`)
  const body = await res.json()
  return body.data as LabOrder[]
}
