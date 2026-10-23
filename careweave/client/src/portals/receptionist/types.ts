export type Role = 'receptionist' | 'lab' | 'doctor';

export type AppointmentStatus =
  | 'Scheduled'
  | 'Checked In'
  | 'Waiting'
  | 'In Consultation'
  | 'Completed'
  | 'Cancelled'
  | 'No Show';

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  facility: string;
};

export type Patient = {
  id: string;
  patientId: string;
  name: string;
  dob: string;
  phone: string;
  email?: string;
  emergencyContact?: string;
  createdAt: string;
  risk?: string;
  rev?: number;
};

export type Doctor = {
  id: string;
  name: string;
  facility: string;
};

export type Appointment = {
  id: string;
  patientId: string;
  patientName: string;
  patientIdCode?: string;
  doctorId?: string;
  doctorName?: string;
  date: string;
  time: string;
  reason: string;
  status: string;
  checkedInAt?: string;
  rescheduledAt?: string;
};

export type AdminPatientRecord = Patient & {
  appointments: Appointment[];
  labOrders?: any[];
};

export type AuditLog = {
  id: string;
  actorId: string;
  actorRole: string;
  action: string;
  entity: string;
  entityId: string;
  detail: string;
  timestamp: string;
};

export type Dashboard = {
  stats: {
    patients: number;
    appointments: number;
    waiting: number;
    checkedIn: number;
    inConsultation?: number;
    completed: number;
    cancelled: number;
    todayCompleted: number;
    todayScheduled: number;
    followups?: number;
  };
  appointments: Appointment[];
  recent: AuditLog[];
};

/** Details a registration form can be pre-filled with. */
export interface ExtractedReceptionData {
  name: string
  dob: string
  age: number
  gender: 'M' | 'F' | 'O'
  phone: string
  doctorName: string
  department: string
  reason: string
  emergencyContact?: string
}
