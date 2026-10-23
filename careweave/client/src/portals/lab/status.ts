import type { LabOrderStatus } from './types'

// One hue family for progress, brick for problems, umber for waiting.
// Filled badges mean "finished and trustworthy"; outlined means "still moving".
export const STATUS_META: Record<LabOrderStatus, { label: string; badge: string }> = {
  requested: { label: 'Requested', badge: 'border-ink-3 text-ink-2' },
  collection_pending: { label: 'Collection pending', badge: 'border-warn text-warn' },
  collected: { label: 'Sample collected', badge: 'border-accent text-accent-ink' },
  processing: { label: 'Processing', badge: 'border-accent text-accent-ink' },
  awaiting_verification: { label: 'Awaiting verification', badge: 'border-accent-ink text-accent-ink border-2' },
  verified: { label: 'Verified', badge: 'border-accent bg-accent text-surface' },
  released: { label: 'Released', badge: 'border-deep bg-deep text-surface' },
  recollect_required: { label: 'Recollect required', badge: 'border-alert text-alert' },
  cancelled: { label: 'Cancelled', badge: 'border-rule text-ink-3 line-through' },
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
