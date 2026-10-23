import { getToken } from '@/auth/session'
import type { Priority, TestResultItem } from '../types'

export interface ExtractedReportData {
  patientName: string
  patientUhid: string
  visitNo: string
  labNo: string
  patientAge: number
  patientGender: 'M' | 'F' | 'O'
  opIp: 'OP' | 'IP'
  referralDoctor: string
  orderingDoctor: string
  testName: string
  department: string
  priority: Priority
  sampleType?: string
  sampleContainer?: string
  registrationDate?: string
  collectionDate?: string
  reportedDate?: string
  approvedDate?: string
  results: ScannedRow[]
  impression?: string
  warnings: string[]
  model?: string
}

export type ScannedRow = TestResultItem & { needsCheck?: boolean; checkReason?: string }

export const SCAN_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export async function parseMedicalDocumentWithAI(file: File): Promise<ExtractedReportData> {
  if (!SCAN_TYPES.includes(file.type)) throw new Error('Upload a JPG, PNG, WebP or PDF report. Phone photos in HEIC format must be saved as JPG first.')
  if (file.size > 10 * 1024 * 1024) throw new Error('The file must be smaller than 10 MB')
  const token = getToken()
  const res = await fetch('/api/lab/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ mimeType: file.type, data: await fileToBase64(file) }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'The scanner could not read this file')
  return sanitizeExtractedData(body.data)
}

// Fills gaps with empty values, never with invented ones. The reviewer sees every field before it is used.
function sanitizeExtractedData(data: Partial<ExtractedReportData>): ExtractedReportData {
  return {
    patientName: data.patientName || '',
    patientUhid: data.patientUhid || '',
    visitNo: data.visitNo || '',
    labNo: data.labNo || '',
    patientAge: Number(data.patientAge) || 0,
    patientGender: (data.patientGender === 'M' || data.patientGender === 'F' ? data.patientGender : 'O') as 'M' | 'F' | 'O',
    opIp: (data.opIp === 'IP' ? 'IP' : 'OP') as 'OP' | 'IP',
    referralDoctor: data.referralDoctor || data.orderingDoctor || '',
    orderingDoctor: data.orderingDoctor || data.referralDoctor || '',
    testName: data.testName || '',
    department: data.department || '',
    priority: (data.priority === 'urgent' ? 'urgent' : 'routine') as Priority,
    sampleType: data.sampleType || undefined,
    sampleContainer: data.sampleContainer || undefined,
    results: Array.isArray(data.results) ? data.results : [],
    impression: data.impression || undefined,
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    model: typeof data.model === 'string' ? data.model : undefined,
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = reader.result as string
      resolve(res.replace(/^data:[^;]+;base64,/, ''))
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
