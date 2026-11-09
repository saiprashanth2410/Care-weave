import type { Repos } from '../repo/index.js';
import { SAMPLE_NAME } from '../scenario.js';

export const SAMPLE_EMAIL = 'sample.patient@example.test';

/**
 * The sample scenario is a long run of real API calls, so it cannot be one transaction. When it stops half-way this removes
 * what it had created, so the next attempt starts clean instead of finding a half-loaded patient. A patient counts only when it
 * carries the sample name and e-mail and was never flagged `sample` (the flag is set as the last step of a successful run).
 */
export async function removeUnfinishedSample(repos: Repos) {
  const stray = (await repos.patients.find({ name: SAMPLE_NAME, email: SAMPLE_EMAIL })).filter((p: any) => !p.sample);
  for (const p of stray) {
    const records = await repos.externalRecords.find({ patientId: p.id });
    await repos.transaction(async (tx) => {
      if (records.length) await tx.cases.remove({ recordId: { $in: records.map((r: any) => r.id) } });
      await tx.cases.remove({ patientId: p.id });
      await tx.externalRecords.remove({ patientId: p.id });
      await tx.orders.remove({ registeredPatientRef: p.id });
      await tx.prescriptions.remove({ patientId: p.id });
      await tx.vitals.remove({ patientId: p.id });
      await tx.encounters.remove({ patientId: p.id });
      await tx.appointments.remove({ patientId: p.id });
      await tx.patients.remove({ id: p.id });
    });
  }
  return stray.length;
}
