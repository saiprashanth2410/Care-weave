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
  data: { results: TestResultItem[]; notes?: string; submitForVerification?: boolean; observedAt?: string },
): Promise<LabOrder> {
  return updateOrderStatus(id, data.submitForVerification ? 'awaiting_verification' : 'processing', {
    results: data.results,
    technicianNotes: data.notes,
    observedAt: data.observedAt,
  })
}

// Changing results that were already submitted is an amendment: a reason is required and the old values are kept.
export async function amendResults(id: string, results: TestResultItem[], reason: string, observedAt?: string): Promise<LabOrder> {
  const body = await request<{ data: LabOrder }>(`/api/lab/orders/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ results, amendReason: reason, observedAt }),
  })
  return body.data
}

export async function attachReport(id: string, file: File): Promise<LabOrder> {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(new Error('Could not read the file'))
    r.readAsDataURL(file)
  })
  const body = await request<{ data: LabOrder }>(`/api/lab/orders/${encodeURIComponent(id)}/attachments`, {
    method: 'POST',
    body: JSON.stringify({ name: file.name, mimeType: file.type, data }),
  })
  return body.data
}

// Files need the session token, so they are fetched and opened as a blob rather than linked directly.
export async function openReportFile(orderId: string, attId: string): Promise<void> {
  const token = getToken()
  const res = await fetch(`/api/lab/orders/${encodeURIComponent(orderId)}/attachments/${encodeURIComponent(attId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    window.dispatchEvent(new CustomEvent('cw:error', { detail: { message: 'Could not open the file', write: false } }))
    return
  }
  window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener')
}

export function verifyAndReleaseOrder(id: string, data: { verifiedBy: string; notes?: string }): Promise<LabOrder> {
  // The server records the signed-in user as the verifier; the name passed here is ignored.
  return updateOrderStatus(id, 'released', { pathologistNotes: data.notes })
}

export function requestOrderRecollection(id: string, reason: string): Promise<LabOrder> {
  return updateOrderStatus(id, 'recollect_required', { statusReason: reason })
}

export interface RegisteredPatient {
  patientId: string
  name: string
  ageYears: number
  encounters: { id: string; date: string; time: string; doctorName: string }[]
}

// Minimal lookup: the lab gets an identifier, a name, an age and visit slots. Nothing is cached in the browser.
export async function searchRegisteredPatients(q = ''): Promise<RegisteredPatient[]> {
  if (q.trim().length < 2) return []
  try {
    return (await request<{ data: RegisteredPatient[] }>(`/api/lab/patients?query=${encodeURIComponent(q.trim())}`)).data
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
  encounterId?: string
  external?: boolean
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
