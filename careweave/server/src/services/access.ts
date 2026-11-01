import type { Repos } from '../repo/index.js';

/** Patients a doctor may open: an appointment assigned to them, or an encounter of their own. */
export async function linkedPatientIds(repos: Repos, userId: string) {
  const [appts, encs] = await Promise.all([repos.appointments.forDoctor(userId), repos.encounters.forDoctor(userId)]);
  return new Set<string>([...appts.map((a: any) => a.patientId), ...encs.map((e: any) => e.patientId)]);
}
