import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const now = new Date();
const iso = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

export async function buildSeed() {
  const users = [
    { id: 'u-reception', name: 'Maya Patel', email: 'reception@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'receptionist', facility: 'CareWeave Front Desk' },
    { id: 'u-doctor', name: 'Dr. Amara Singh', email: 'doctor@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'doctor', facility: 'CareWeave Clinic' }
  ];

  const patients = [
    { id: 'p-ava', patientId: 'CW-10482', name: 'Ava Morgan', dob: '1991-04-12', phone: '+1 (415) 555-0182', email: 'ava.morgan@example.test', emergencyContact: 'Eli Morgan · +1 (415) 555-0107', createdAt: iso(42) },
    { id: 'p-liam', patientId: 'CW-10531', name: 'Liam Chen', dob: '1986-09-28', phone: '+1 (415) 555-0124', email: 'liam.chen@example.test', createdAt: iso(18) },
    { id: 'p-noor', patientId: 'CW-10544', name: 'Noor Williams', dob: '1978-02-19', phone: '+1 (415) 555-0148', createdAt: iso(10) }
  ];

  const appointments = [
    { id: 'a-1', patientId: 'p-ava', patientName: 'Ava Morgan', patientIdCode: 'CW-10482', doctorId: 'u-doctor', doctorName: 'Dr. Amara Singh', date: 'Today', time: '09:30 AM', reason: 'Follow-up Consultation', status: 'Checked In', checkedInAt: new Date(Date.now() - 12 * 60000).toISOString() },
    { id: 'a-2', patientId: 'p-liam', patientName: 'Liam Chen', patientIdCode: 'CW-10531', doctorId: 'u-doctor', doctorName: 'Dr. Amara Singh', date: 'Today', time: '10:15 AM', reason: 'Annual Wellness Review', status: 'Scheduled' },
    { id: 'a-3', patientId: 'p-noor', patientName: 'Noor Williams', patientIdCode: 'CW-10544', doctorId: 'u-doctor', doctorName: 'Dr. Amara Singh', date: 'Today', time: '11:00 AM', reason: 'Medication Review', status: 'Waiting', checkedInAt: new Date(Date.now() - 25 * 60000).toISOString() }
  ];

  return { users, patients, appointments, auditLogs: [] };
}

export async function ensureSeed(file = path.resolve('data/careweave.json')) {
  try {
    await fs.access(file);
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    const data = await buildSeed();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    return data;
  }
}
