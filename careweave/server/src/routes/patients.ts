import crypto from 'node:crypto';
import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { expectedVersion } from '../middleware.js';
import { DuplicateError } from '../repo/index.js';
import { adminPatientView, id, now } from '../util.js';
import { linkedPatientIds } from '../services/access.js';

export function patientRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit, auditOnce } = ctx;

  router.get('/patients', roles('receptionist', 'doctor'), async (req: any, res) => {
    const q = String(req.query.query || '').trim();
    const linked = req.user.role === 'doctor' ? [...(await linkedPatientIds(ctx.repos, req.user.id))] : null;
    // Paged so a large directory never goes to the browser in one response.
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 200));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const { rows, total } = await ctx.repos.patients.search(q, linked, limit, offset);
    await auditOnce(req, 'search', 'patient', 'directory', q ? 'Search by permitted identifiers' : 'Open patient directory');
    res.setHeader('X-Total-Count', String(total));
    res.json(rows.map(adminPatientView));
  });

  router.post('/patients', roles('receptionist', 'doctor', 'lab'), async (req: any, res) => {
    const { name, dob, phone, email, emergencyContact, _forceCreate, risk, gender } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'Full name is required' });
    if (typeof dob !== 'string' || !dob) return res.status(400).json({ error: 'Date of birth is required' });
    if (!(Date.parse(dob) <= Date.now())) return res.status(400).json({ error: 'Date of birth must be a valid date that is not in the future' });
    if (typeof phone !== 'string' || !phone.trim()) return res.status(400).json({ error: 'Phone number is required' });

    const duplicates = await ctx.repos.patients.duplicatesOf(String(name).trim(), dob);
    if (duplicates.length > 0 && !_forceCreate) {
      return res.status(409).json({
        error: 'Possible duplicate registration detected.',
        duplicates: duplicates.map(adminPatientView)
      });
    }

    // The unique index on patientId is the real guard: if two requests draw the same code, the second insert fails and draws again.
    for (let attempt = 0; attempt < 8; attempt++) {
      const p = {
        id: id('p'),
        patientId: `CW-${crypto.randomInt(10000, 100000)}`,
        name: String(name).trim(),
        dob,
        gender: ['M', 'F', 'O'].includes(gender) ? gender : 'O',
        phone: String(phone).trim(),
        email: email || undefined,
        emergencyContact: emergencyContact || undefined,
        createdAt: now(),
        risk: risk || undefined
      };
      try {
        const saved = await ctx.repos.patients.insert(p);
        await audit(req, 'create', 'patient', p.id, 'Administrative registration');
        return res.status(201).json(adminPatientView(saved));
      } catch (err) {
        if (!(err instanceof DuplicateError)) throw err;
      }
    }
    res.status(503).json({ error: 'Could not allocate a patient code. Try again.' });
  });

  router.get('/patients/:id/admin', roles('receptionist', 'doctor', 'lab'), async (req: any, res) => {
    const p = await ctx.repos.patients.byRef(req.params.id);
    if (!p) return res.status(404).json({ error: 'Patient not found' });
    await audit(req, 'read', 'patient', p.id, 'Open administrative patient profile');
    const [appts, labOrders] = await Promise.all([
      ctx.repos.appointments.forPatient(p.id),
      ctx.repos.orders.find({ $or: [{ registeredPatientRef: p.id }, { patientId: p.patientId }, { patientUhid: p.patientId }] }, { sort: { orderedAt: -1 } }),
    ]);
    const appointments = appts.map((a: any) => ({
      id: a.id, date: a.date, time: a.time, reason: a.reason, status: a.status, doctorName: a.doctorName, checkedInAt: a.checkedInAt
    }));
    res.json({ ...adminPatientView(p), appointments, labOrders });
  });

  router.patch('/patients/:id', roles('receptionist'), async (req: any, res) => {
    const p = await ctx.repos.patients.byRef(req.params.id);
    if (!p) return res.status(404).json({ error: 'Patient not found' });
    const { name, phone, email, emergencyContact } = req.body || {};
    // A form opened before someone else saved must not overwrite their change.
    const expected = expectedVersion(req, p);
    const changes: Record<string, any> = {};
    if (name) changes.name = String(name).trim();
    if (phone) changes.phone = String(phone).trim();
    if (email !== undefined) changes.email = email || undefined;
    if (emergencyContact !== undefined) changes.emergencyContact = emergencyContact || undefined;
    const saved = await ctx.repos.patients.update(p, changes, expected);
    await audit(req, 'update', 'patient', p.id, 'Updated permitted demographic fields');
    res.json(adminPatientView(saved));
  });

  return router;
}
