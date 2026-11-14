/** The roles staff can hold, the permissions each role may be given, and the ones a new account starts with. */
export const ROLES = ['receptionist', 'lab', 'doctor', 'admin'] as const;
export type StaffRole = (typeof ROLES)[number];

export const PERMISSIONS: Record<StaffRole, string[]> = {
  receptionist: ['register', 'triage', 'queue'],
  lab: ['order', 'collect', 'analyze', 'verify'],
  doctor: ['consult', 'prescribe', 'diagnose'],
  admin: ['audit', 'staff'],
};

// A new lab account cannot verify results until an administrator grants it on purpose: the person who enters a result must not also sign it off.
export const DEFAULT_PERMISSIONS: Record<StaffRole, string[]> = {
  ...PERMISSIONS,
  lab: ['order', 'collect', 'analyze'],
};

export const isRole = (v: unknown): v is StaffRole => ROLES.includes(v as StaffRole);
