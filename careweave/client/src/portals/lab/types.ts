// Lab-side view of the shared LabOrder contract (see docs/lab-contract.md).
// Field names are proposals until Core (Person D) publishes the Mongoose models.

export type LabOrderStatus =
  | 'requested'
  | 'collection_pending'
  | 'collected'
  | 'processing'
  | 'awaiting_verification'
  | 'verified'
  | 'released'
  | 'recollect_required'
  | 'cancelled'

export type Priority = 'routine' | 'urgent'

export interface LabOrder {
  id: string
  patientId: string
  encounterId: string
  testName: string
  orderingDoctor: string
  orderedAt: string // ISO
  sampleType?: string
  collectedAt?: string
  status: LabOrderStatus
  priority: Priority
  handlingNote?: string
  statusReason?: string // required for recollect_required / cancelled
}
