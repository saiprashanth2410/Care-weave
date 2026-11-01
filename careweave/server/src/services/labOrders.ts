import { text } from '../util.js';

export const LAB_STATUSES = ['requested', 'collection_pending', 'collected', 'processing', 'awaiting_verification', 'verified', 'released', 'recollect_required', 'cancelled'];
export const LAB_NEXT: Record<string, string[]> = {
  requested: ['collection_pending', 'collected', 'cancelled'],
  collection_pending: ['collected', 'recollect_required', 'cancelled'],
  collected: ['processing', 'awaiting_verification', 'recollect_required', 'cancelled'],
  processing: ['processing', 'awaiting_verification', 'recollect_required', 'cancelled'],
  awaiting_verification: ['processing', 'verified', 'released', 'recollect_required'],
  verified: ['released'],
  released: [],
  recollect_required: ['collection_pending', 'collected', 'cancelled'],
  cancelled: []
};
// Fields the laboratory may change on an order. Identity and ordering fields are fixed at creation.
export const LAB_EDITABLE = ['sampleType', 'sampleContainer', 'sampleBarcode', 'collectedBy', 'technicianNotes', 'pathologistNotes', 'statusReason', 'results', 'consultantPathologist', 'headOfDepartment', 'handlingNote'];

export const cleanResults = (v: any) =>
  (Array.isArray(v) ? v.slice(0, 200) : []).map((r: any) => ({
    parameter: text(r?.parameter, 120),
    value: text(r?.value, 60),
    unit: text(r?.unit, 30),
    referenceRange: text(r?.referenceRange, 120),
    methodology: text(r?.methodology, 160) || undefined,
    subGroup: text(r?.subGroup, 120) || undefined,
    flag: ['normal', 'abnormal', 'critical'].includes(r?.flag) ? r.flag : undefined
  }));

export const resultsSignature = (rs: any[]) => JSON.stringify((rs || []).map((r) => [r.parameter, r.value, r.unit, r.referenceRange]));

export const FILE_TYPES: Record<string, { ext: string; magic: number[] }> = {
  'application/pdf': { ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] },
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] }
};

export const OPEN_VISIT = (a: any) => !['Cancelled', 'No Show'].includes(a.status);
export const can = (req: any, permission: string) => (req.user.permissions || []).includes(permission);
