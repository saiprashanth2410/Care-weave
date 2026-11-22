import type { Request, Response } from 'express';
import type { AppCtx } from '../context.js';
import { linkedPatientIds } from '../services/access.js';

/** What every doctor route needs: the repos, and the check that a doctor may open a given patient's chart. */
export function doctorAccess(ctx: AppCtx) {
  const R = () => ctx.repos;

  /** Resolve :id to a patient this doctor may use, or answer 404/403 without disclosing anything about the chart. */
  const patientFor = async (req: Request, res: Response, value: string) => {
    const p = await R().patients.byRef(String(value));
    if (!p) { res.status(404).json({ error: 'Patient not found' }); return null; }
    if (!(await linkedPatientIds(R(), req.user.id)).has(p.id)) {
      await ctx.audit(req, 'denied', 'patient', p.id, 'Doctor is not linked to this patient');
      res.status(403).json({ error: 'You are not linked to this patient. Ask the front desk to assign an appointment, or open a patient you are treating.' });
      return null;
    }
    return p;
  };

  /** Ids of the patients linked to this doctor. */
  const mine = async (req: Request) => [...(await linkedPatientIds(R(), req.user.id))];

  return { R, patientFor, mine };
}
export type DoctorAccess = ReturnType<typeof doctorAccess>;
