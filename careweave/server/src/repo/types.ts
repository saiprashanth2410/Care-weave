// The shape of every stored record. Each type names the fields the code relies on; `[field: string]: any` keeps room for
// the extra fields a record may carry (imported data, per-feature flags), so a typo in a *known* field is a compile error
// while an extra field still works.

/** Every stored record: an id, and a version on the collections written with optimistic concurrency. */
export type Row = { id: string; version?: number; [field: string]: any };

export type Role = 'receptionist' | 'lab' | 'doctor' | 'admin';

export interface User extends Row {
  name: string; email: string; role: string; facility?: string; active?: boolean; passwordHash?: string; permissions?: string[];
}
export interface Session extends Row { tokenHash: string; userId: string; createdAt?: string; expiresAt?: string }

export interface Allergy { id: string; allergen: string; severity: string; reaction: string }
export interface Problem { id: string; code: string; name: string; status: string; diagnosedDate: string }

export interface Patient extends Row {
  patientId: string; name: string; dob: string; gender: string; phone?: string; email?: string; address?: string;
  allergies?: Allergy[]; problems?: Problem[]; createdAt?: string;
}

export interface Appointment extends Row {
  patientId: string; doctorId?: string; date: string; time: string; reason?: string; status: string;
  token?: string | number; slotKey?: string; patientKey?: string; tokenKey?: string;
}

export interface LabResult { parameter: string; value: string; unit: string; referenceRange: string; flag?: string; methodology?: string; subGroup?: string }
export interface LabOrder extends Row {
  patientId: string; testName: string; status: string; priority?: string; orderingDoctor?: string; results?: LabResult[];
  patientAge?: number; patientGender?: string; department?: string; createdAt?: string;
}

export interface Encounter extends Row {
  patientId: string; doctorId?: string; date: string; diagnosis?: string; notes?: string; vitals?: Record<string, number>;
  chiefComplaint?: string; subjective?: string; objective?: string; assessment?: string; plan?: string;
}
export interface Prescription extends Row {
  patientId: string; medicine: string; dosage?: string; route?: string; frequency?: string; duration?: string; status: string; date: string;
  encounterId?: string; prescribingClinician?: string; refills?: number;
}
export interface Vital extends Row {
  patientId: string; date: string; bpSystolic?: number; bpDiastolic?: number; heartRate?: number; tempF?: number; spo2?: number;
}
export interface Referral extends Row { patientId: string; specialty: string; status: string; date: string; priority?: string }
export interface CarePlan extends Row { patientId: string; title: string; status: string; goals?: string[]; targets?: unknown[] }
export interface ExternalRecord extends Row { kind: string; status: string; patientId?: string; facility?: string; eventDate?: string; importedAt?: string; content?: Record<string, any> }
export interface ReconCase extends Row { status?: string; patientId?: string; kind?: string }

export interface AuditEntry extends Row { at?: string; userId?: string; action: string; entity: string; entityId: string; detail?: string }
export interface InboxItem extends Row { kind?: string; status?: string; createdAt?: string; message?: string }
export interface Message extends Row { convId: string; fromId: string; toId: string; at: number; text?: string; imageId?: string; read: boolean }
export interface LiveEventRow extends Row { at: string; origin: string; type: string; data: unknown; to?: string[]; expireAt?: Date }
export interface VideoConsult extends Row { patientId?: string | null; patientName?: string; phone?: string; doctorName?: string; doctorKey?: string; doctorSeenAt?: string; createdAt?: string; doctorId: string; token?: string; expiresAt: string; endedAt?: string | null }
