import type { LabOrderStatus } from './types'

export const STATUS_META: Record<LabOrderStatus, { label: string; badge: string; dot: string }> = {
  requested: { label: 'Requested', badge: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' },
  collection_pending: { label: 'Collection pending', badge: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  collected: { label: 'Sample collected', badge: 'bg-sky-50 text-sky-800 ring-sky-200', dot: 'bg-sky-500' },
  processing: { label: 'Processing', badge: 'bg-indigo-50 text-indigo-800 ring-indigo-200', dot: 'bg-indigo-500' },
  awaiting_verification: { label: 'Awaiting verification', badge: 'bg-violet-50 text-violet-800 ring-violet-200', dot: 'bg-violet-500' },
  verified: { label: 'Verified', badge: 'bg-teal-50 text-teal-800 ring-teal-200', dot: 'bg-teal-600' },
  released: { label: 'Released', badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-600' },
  recollect_required: { label: 'Recollect required', badge: 'bg-rose-50 text-rose-800 ring-rose-200', dot: 'bg-rose-500' },
  cancelled: { label: 'Cancelled', badge: 'bg-slate-100 text-slate-500 ring-slate-200', dot: 'bg-slate-300' },
}

export const PIPELINE: LabOrderStatus[] = [
  'requested',
  'collection_pending',
  'collected',
  'processing',
  'awaiting_verification',
  'verified',
  'released',
]
