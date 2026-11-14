export type Role = 'receptionist' | 'lab' | 'doctor' | 'admin';

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
  /** Counter the server bumps on every save. Send it back with an edit so the server can tell the copy is out of date. */
  version?: number;
};

export type Doctor = {
  id: string;
  name: string;
  facility: string;
  /** Where they see patients, as the administrator set it. May be empty. */
  room?: string;
  /** Working hours, 24-hour "HH:MM". */
  shiftStart?: string;
  shiftEnd?: string;
};

/** One appointment as the doctor's roster shows it: who, when, and where it stands. No clinical data. */
export type DayAppt = {
  id: string;
  patientName: string;
  patientIdCode?: string;
  time: string;
  token?: string;
  status: string;
  reason?: string;
  checkedInAt?: string;
  startedAt?: string;
  completedAt?: string;
};

export type RosterDoctor = Required<Pick<Doctor, 'id' | 'name' | 'facility' | 'room' | 'shiftStart' | 'shiftEnd'>> & {
  status: 'in_consultation' | 'available' | 'off_shift';
  current: DayAppt | null;
  waiting: number;
  scheduled: number;
  seen: number;
  nextOpenSlot: string | null;
  freeSlots: number;
};

export type DoctorDay = {
  doctor: Doctor;
  date: string;
  current: DayAppt[];
  waiting: DayAppt[];
  upcoming: DayAppt[];
  seen: DayAppt[];
  notSeen: DayAppt[];
};

export type SlotInfo = { time: string; state: 'free' | 'booked' | 'past' };
export type DoctorSlots = { doctor: Doctor; date: string; slots: SlotInfo[]; nextFree: string | null };

export type Appointment = {
  id: string;
  token?: string;
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
  version?: number;
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
