// Lab-side view of the shared LabOrder contract (see docs/lab-contract.md).
// Extended with full NABL / NABH accredited hospital laboratory reporting fields.

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

export type ResultFlag = 'normal' | 'abnormal' | 'critical'

export interface TestResultItem {
  parameter: string
  value: string
  unit: string
  referenceRange: string
  methodology?: string
  subGroup?: string
  flag?: ResultFlag
  criticalRange?: string
}

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

  // Official Hospital Demographics (NABL / NABH Hospital format)
  patientUhid?: string       // e.g. 618135
  patientNo?: string         // Same as UHID / MRN
  visitNo?: string           // e.g. 3882620
  labNo?: string             // e.g. 2057808, 2058027
  opIp?: 'OP' | 'IP'         // Inpatient / Outpatient
  referralDoctor?: string    // e.g. Dr. ANIRBAN LAHA
  registrationAt?: string    // e.g. ISO string
  reportedAt?: string        // e.g. ISO string
  approvedAt?: string        // e.g. ISO string

  // Extended clinical details
  patientName?: string
  patientAge?: number
  patientGender?: 'M' | 'F' | 'O'
  department?: string
  sampleContainer?: string
  sampleBarcode?: string
  collectedBy?: string
  processedBy?: string
  technicianNotes?: string
  pathologistNotes?: string
  consultantPathologist?: string
  headOfDepartment?: string
  verifiedBy?: string
  verifiedAt?: string
  results?: TestResultItem[]
}
