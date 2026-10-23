import { clearSession, getToken } from '@/auth/session'
import type { LabOrder, LabOrderStatus, Priority, TestResultItem } from './types'

export { TEST_TEMPLATES } from './testCatalog'
import { TEST_TEMPLATES } from './testCatalog'

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401) {
      // Session expired or the server restarted: sign in again instead of retrying forever.
      clearSession()
      window.location.assign('/login')
      throw new Error('Your session has ended. Sign in again.')
    }
    const message = body.error || `Request failed (${res.status})`
    window.dispatchEvent(new CustomEvent('cw:error', { detail: { message, write: !!init.method && init.method !== 'GET' } }))
    throw new Error(message)
  }
  return body as T
}

export async function getLabOrders(): Promise<LabOrder[]> {
  return (await request<{ data: LabOrder[] }>('/api/lab/orders')).data
}

export async function getLabOrder(id: string): Promise<LabOrder | null> {
  try {
    return (await request<{ data: LabOrder }>(`/api/lab/orders/${encodeURIComponent(id)}`)).data
  } catch {
    return null
  }
}

export async function getDoctors(): Promise<{ id: string; name: string; facility: string }[]> {
  return request('/api/doctors')
}

export async function updateOrderStatus(
  id: string,
  status: LabOrderStatus,
  extra: Partial<LabOrder> = {},
): Promise<LabOrder> {
  const body = await request<{ data: LabOrder }>(`/api/lab/orders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...extra, status }),
  })
  return body.data
}

export function recordSampleCollection(
  id: string,
  data: { sampleType: string; container: string; barcode: string; collector: string },
): Promise<LabOrder> {
  return updateOrderStatus(id, 'collected', {
    sampleType: data.sampleType,
    sampleContainer: data.container,
    sampleBarcode: data.barcode,
    collectedBy: data.collector,
  })
}

export function recordTestResults(
  id: string,
  data: { results: TestResultItem[]; notes?: string; submitForVerification?: boolean },
): Promise<LabOrder> {
  return updateOrderStatus(id, data.submitForVerification ? 'awaiting_verification' : 'processing', {
    results: data.results,
    technicianNotes: data.notes,
  })
}

export function verifyAndReleaseOrder(id: string, data: { verifiedBy: string; notes?: string }): Promise<LabOrder> {
  // The server records the signed-in user as the verifier; the name passed here is ignored.
  return updateOrderStatus(id, 'released', { pathologistNotes: data.notes })
}

export function requestOrderRecollection(id: string, reason: string): Promise<LabOrder> {
  return updateOrderStatus(id, 'recollect_required', { statusReason: reason })
}

export interface RegisteredPatient {
  id: string
  patientId: string
  name: string
  dob?: string
  gender?: 'M' | 'F' | 'O'
  phone?: string
  email?: string
}

export function calculateAgeFromDob(dob?: string): number {
  if (!dob) return 40
  const birth = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return Math.max(0, age)
}

export async function searchRegisteredPatients(q = ''): Promise<RegisteredPatient[]> {
  try {
    const list = await request<RegisteredPatient[]>(`/api/patients?query=${encodeURIComponent(q)}`)
    if (Array.isArray(list) && list.length > 0) {
      try {
        const cached = JSON.parse(localStorage.getItem('cw_registered_patients') || '[]')
        const merged = [...list, ...cached.filter((c: any) => !list.some((l: any) => l.patientId === c.patientId))]
        localStorage.setItem('cw_registered_patients', JSON.stringify(merged))
      } catch {}
      return list
    }
  } catch {
    // offline or backend restarting
  }

  try {
    const cached: RegisteredPatient[] = JSON.parse(localStorage.getItem('cw_registered_patients') || '[]')
    const query = q.toLowerCase().trim()
    if (!query) return cached
    return cached.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.patientId.toLowerCase().includes(query) ||
        (p.phone && p.phone.includes(query)),
    )
  } catch {
    return []
  }
}

export async function createLabOrder(data: {
  patientName: string
  patientId?: string
  patientAge: number
  patientGender: 'M' | 'F' | 'O'
  testName: string
  orderingDoctor: string
  priority: Priority
  handlingNote?: string
  patientUhid?: string
  visitNo?: string
  opIp?: 'OP' | 'IP'
  referralDoctor?: string
}): Promise<LabOrder> {
  const template = TEST_TEMPLATES[data.testName]
  const body = await request<{ data: LabOrder }>('/api/lab/orders', {
    method: 'POST',
    body: JSON.stringify({
      ...data,
      department: template?.department,
      sampleType: template?.sampleType,
      sampleContainer: template?.container,
    }),
  })
  return body.data
}
