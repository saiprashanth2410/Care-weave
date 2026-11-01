import bcrypt from 'bcryptjs';
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
        // Acceptance testing & local development aliases
        { id: 'u-reception', name: 'Maya Patel', email: 'reception@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'receptionist', facility: 'CareWeave Front Desk' },
        { id: 'u-lab', name: 'Lena Okafor', email: 'lab@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'lab', facility: 'CareWeave Central Laboratory' },
        { id: 'u-pathologist', name: 'Dr. KALA.K MD., DNB', email: 'pathologist@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'lab', permissions: ['verify'], facility: 'CareWeave Laboratory' },
        { id: 'u-doctor', name: 'Dr. ANIRBAN LAHA', email: 'doctor@careweave.test', passwordHash: await bcrypt.hash('demo123', 10), role: 'doctor', facility: 'CareWeave General Medicine' }
    ];
    // Only login accounts are seeded. Patients, appointments and lab orders start empty, so there is nothing to give a version to:
    // every record created later is inserted at version 1 by the repo layer.
    return { users, patients: [], appointments: [], labOrders: [], auditLogs: [] };
}
