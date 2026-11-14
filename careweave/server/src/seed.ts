import bcrypt from 'bcryptjs';

/** Demo accounts with a published password exist only on a developer machine or in tests, never in production or on Vercel. */
const DEMO_ACCOUNTS = process.env.NODE_ENV !== 'production' && !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME;

export async function buildSeed() {
  const users = [
    // Staff directory for Firebase sign-in. These accounts have no local password; they sign in only through Firebase.
    {
      id: 'u-reception-com',
      name: 'Maya Patel (Front Desk Officer)',
      email: 'reception@careweave.com',
      role: 'receptionist',
      facility: 'CareWeave Front Desk & Triage',
      permissions: ['register', 'triage', 'queue']
    },
    {
      id: 'u-lab-com',
      name: 'Dr. KALA.K MD., DNB (Head of Laboratory)',
      email: 'lab@careweave.com',
      role: 'lab',
      facility: 'CareWeave Central Laboratory',
      permissions: ['order', 'collect', 'analyze', 'verify']
    },
    {
      id: 'u-doctor-com',
      name: 'Dr. ANIRBAN LAHA (Consultant Physician)',
      email: 'doctor@careweave.com',
      role: 'doctor',
      facility: 'CareWeave General Medicine & OPD',
      permissions: ['consult', 'prescribe', 'diagnose']
    },

    {
      id: 'u-admin-com',
      name: 'Ravi Menon (System Administrator)',
      email: 'admin@careweave.com',
      role: 'admin',
      facility: 'CareWeave Administration',
      permissions: ['audit', 'staff']
    },

    // Acceptance testing & local development aliases. Known passwords: never created on a deployed server.
    ...(DEMO_ACCOUNTS ? [
    { id: 'u-reception', name: 'Maya Patel', email: 'reception@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'receptionist', facility: 'CareWeave Front Desk' },
    { id: 'u-lab', name: 'Lena Okafor', email: 'lab@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'lab', facility: 'CareWeave Central Laboratory' },
    { id: 'u-pathologist', name: 'Dr. KALA.K MD., DNB', email: 'pathologist@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'lab', permissions: ['verify'], facility: 'CareWeave Laboratory' },
    { id: 'u-doctor', name: 'Dr. ANIRBAN LAHA', email: 'doctor@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'doctor', facility: 'CareWeave General Medicine' },
    { id: 'u-admin', name: 'Ravi Menon', email: 'admin@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'admin', permissions: ['audit', 'staff'], facility: 'CareWeave Administration' }
    ] : [])
  ];

  // Only login accounts are seeded. Patients, appointments and lab orders start empty, so there is nothing to give a version to:
  // every record created later is inserted at version 1 by the repo layer.
  return { users, patients: [], appointments: [], labOrders: [], auditLogs: [] };
}
