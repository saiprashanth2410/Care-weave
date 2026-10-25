import { Schema, model } from 'mongoose';
/** Production MongoDB schema reference for CareWeave. */
export const UserModel = model('User', new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['receptionist', 'lab', 'doctor'], required: true },
    facility: String
}, { timestamps: true }));
export const PatientModel = model('Patient', new Schema({
    patientId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, index: true },
    dob: { type: String, required: true, index: true },
    phone: { type: String, required: true, index: true },
    email: String,
    emergencyContact: String,
    risk: String
}, { timestamps: true }));
export const AppointmentModel = model('Appointment', new Schema({
    patientId: { type: String, required: true, index: true },
    patientName: { type: String, required: true },
    patientIdCode: String,
    doctorId: String,
    doctorName: String,
    date: { type: String, required: true, index: true },
    time: { type: String, required: true },
    reason: { type: String, required: true },
    status: { type: String, required: true, index: true },
    checkedInAt: String,
    rescheduledAt: String
}, { timestamps: true }));
export const AuditLogModel = model('AuditLog', new Schema({
    actorId: { type: String, index: true },
    actorRole: String,
    action: { type: String, index: true },
    entity: { type: String, index: true },
    entityId: { type: String, index: true },
    detail: String,
    timestamp: { type: String, index: true }
}, { timestamps: false }));
