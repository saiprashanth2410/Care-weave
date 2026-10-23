// Lab-side view of the shared LabOrder contract (see docs/lab-contract.md).
// Laboratory order and report fields.

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

export interface Amendment {
  id: string
  at: string
  byName: string
  reason: string
  statusBefore: LabOrderStatus
  previouslyVerifiedBy: string | null
  changes: { parameter: string; before: { value: string; unit: string } | null; after: { value: string; unit: string } }[]
}

export interface Attachment {
  id: string
  name: string
  mimeType: string
  size: number
  sha256: string
  uploadedBy: string
  uploadedAt: string
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

  // Requisition identifiers
  patientUhid?: string      
  patientNo?: string        
  visitNo?: string          
  labNo?: string            
  opIp?: 'OP' | 'IP'        
  referralDoctor?: string   
  registrationAt?: string   
  reportedAt?: string       
  approvedAt?: string       

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
  external?: boolean
  observedAt?: string
  amendments?: Amendment[]
  attachments?: Attachment[]
}
