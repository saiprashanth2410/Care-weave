import fs from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const now = new Date();
const iso = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

export async function buildSeed() {
  const users = [
    { id: 'u-reception', name: 'Maya Patel', email: 'reception@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'receptionist', facility: 'CareWeave Front Desk' },
    { id: 'u-lab', name: 'Lena Okafor', email: 'lab@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'lab', facility: 'CareWeave Central Laboratory' },
    { id: 'u-pathologist', name: 'Dr. KALA.K MD., DNB', email: 'pathologist@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'lab', permissions: ['verify'], facility: 'CareWeave Laboratory' },
    { id: 'u-doctor', name: 'Dr. ANIRBAN LAHA', email: 'doctor@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'doctor', facility: 'CareWeave General Medicine' }
  ];

  // Only login accounts are seeded. Patients, appointments and lab orders start empty.
  return { users, patients: [], appointments: [], labOrders: [], auditLogs: [] };
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
