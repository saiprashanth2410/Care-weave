import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import { expectedVersion } from '../middleware.js';
import { implausibleValue } from '../labRules.js';
import { registerScanRoutes } from '../scanRoutes.js';
import { ageFromDob, diff, id, now, text } from '../util.js';
import { linkedPatientIds } from '../services/access.js';
import { FILE_TYPES, LAB_EDITABLE, LAB_NEXT, LAB_STATUSES, OPEN_VISIT, can, cleanResults, resultsSignature } from '../services/labOrders.js';
import { emitEvent } from '../whatsapp/emitter.js';
import { broadcast } from '../liveEvents.js';

/** Requests that carry a base64 file. They are the only ones allowed a large JSON body; see index.ts. */
export const UPLOAD_ROUTES = [/^\/api\/lab\/extract$/, /^\/api\/lab\/orders\/[^/]+\/attachments$/];

export function labRoutes(ctx: AppCtx) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit } = ctx;

  router.get('/lab/orders', roles('lab'), async (req: any, res) => {
    const rows = await ctx.repos.orders.newestFirst();
    await audit(req, 'view', 'labOrder', 'list', `${rows.length} orders`);
    res.json({ data: rows });
  });

  router.get('/lab/orders/:id', roles('lab'), async (req: any, res) => {
    const o = await ctx.repos.orders.byId(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });
    await audit(req, 'view', 'labOrder', o.id);
    res.json({ data: o });
  });

  // The lab sees only what it needs to order a test: identifier, name, age and visit slots. No contact details, no visit reasons.
  router.get('/lab/patients', roles('lab'), async (req: any, res) => {
    const q = text(req.query.query, 60);
    if (q.length < 2) return res.json({ data: [] });
    const found = await ctx.repos.patients.lookup(q, 8);
    const rows = await Promise.all(found.map(async (p: any) => ({
      patientId: p.patientId,
      name: p.name,
      ageYears: ageFromDob(p.dob),
      encounters: (await ctx.repos.appointments.forPatient(p.id))
        .filter(OPEN_VISIT)
        .sort((x: any, y: any) => `${y.date} ${y.time}`.localeCompare(`${x.date} ${x.time}`))
        .slice(0, 5)
        .map((a: any) => ({ id: a.id, date: a.date, time: a.time, doctorName: a.doctorName }))
    })));
    await audit(req, 'search', 'labPatient', 'lookup', `${rows.length} matches`);
    res.json({ data: rows });
  });

  router.post('/lab/orders', roles('lab'), async (req: any, res) => {
    const b = req.body || {};
    const testName = text(b.testName);
    const orderingDoctor = text(b.orderingDoctor);
    if (!testName || !orderingDoctor) return res.status(400).json({ error: 'The test and the ordering doctor are required' });
    if (!['M', 'F', 'O'].includes(b.patientGender)) return res.status(400).json({ error: 'Select the patient gender' });

    const external = b.external === true;
    let patient: any = null;
    let encounterId = '';
    if (!external) {
      patient = b.patientId ? await ctx.repos.patients.byRef(String(b.patientId)) : null;
      if (!patient) return res.status(400).json({ error: 'Select a registered patient, or mark this as an external requisition' });
      const visit = (await ctx.repos.appointments.forPatient(patient.id)).find((a: any) => a.id === b.encounterId && OPEN_VISIT(a));
      if (!visit) return res.status(400).json({ error: 'Select one of this patient\'s visits (encounters) for the order' });
      encounterId = visit.id;
    }
    const patientName = patient ? patient.name : text(b.patientName);
    const age = patient ? ageFromDob(patient.dob) : Number(b.patientAge);
    if (!patientName) return res.status(400).json({ error: 'Patient name is required' });
    if (!Number.isFinite(age) || age < 0 || age > 130) return res.status(400).json({ error: 'Enter a valid patient age' });

    // The id is the database key: the unique index rejects a repeat, so a repeat just draws again.
    const draw = () => `ORD-${Date.now().toString().slice(-7)}${crypto.randomInt(10, 100)}`;
    let orderId = draw();
    while (await ctx.repos.orders.byId(orderId)) orderId = draw();
    const o = await ctx.repos.orders.insert({
      id: orderId,
      external,
      patientId: patient ? patient.patientId : text(b.patientId, 40) || `EXT-${orderId.slice(4)}`,
      registeredPatientRef: patient ? patient.id : undefined,
      patientName,
      patientAge: age,
      patientGender: b.patientGender,
      patientUhid: text(b.patientUhid, 40) || undefined,
      visitNo: text(b.visitNo, 40) || undefined,
      opIp: b.opIp === 'IP' ? 'IP' : 'OP',
      referralDoctor: text(b.referralDoctor) || orderingDoctor,
      encounterId: encounterId || text(b.encounterId, 40) || `EXT-${orderId.slice(4)}`,
      testName,
      department: text(b.department) || undefined,
      orderingDoctor,
      orderedAt: now(),
      registrationAt: now(),
      status: 'requested',
      priority: b.priority === 'urgent' ? 'urgent' : 'routine',
      sampleType: text(b.sampleType) || undefined,
      sampleContainer: text(b.sampleContainer) || undefined,
      handlingNote: text(b.handlingNote, 500) || undefined,
      amendments: [],
      attachments: [],
      createdBy: req.user.id
    });
    await audit(req, 'create', 'labOrder', o.id, `${testName} · ${o.priority}${external ? ' · external' : ''}`);
    res.status(201).json({ data: o });
  });

  router.patch('/lab/orders/:id', roles('lab'), async (req: any, res) => {
    const before = await ctx.repos.orders.byId(req.params.id);
    if (!before) return res.status(404).json({ error: 'Order not found' });
    const expected = expectedVersion(req, before);
    const o = structuredClone(before); // edited below, then only the fields that changed are written
    const b = req.body || {};
    const status = b.status;
    const results = b.results !== undefined ? cleanResults(b.results) : undefined;
    for (const r of results ?? []) {
      const bad = implausibleValue(r.parameter, r.value, r.unit);
      if (bad) return res.status(400).json({ error: bad });
    }
    const resultsChanged = results !== undefined && resultsSignature(results) !== resultsSignature(o.results);
    const submitted = ['awaiting_verification', 'verified', 'released'].includes(o.status);
    const t = new Date();
    let labReleased = false;

    let observedAt: string | undefined;
    if (b.observedAt !== undefined) {
      const d = new Date(b.observedAt);
      if (isNaN(+d) || d.getTime() > t.getTime() + 5 * 60000) return res.status(400).json({ error: 'The observation time cannot be in the future' });
      observedAt = d.toISOString();
    }

    // A change to results that were already submitted is an amendment: reason required, old values kept, re-verification forced.
    let amendment: any = null;
    if (resultsChanged && submitted) {
      if (status) return res.status(400).json({ error: 'Amend the results and change the status in two separate steps' });
      const reason = text(b.amendReason, 500);
      if (reason.length < 5) return res.status(400).json({ error: 'Give a reason (at least 5 characters) for changing submitted results' });
      const prior: any[] = o.results || [];
      const changes = (results as any[])
        .map((r) => ({ r, old: prior.find((x) => x.parameter === r.parameter) }))
        .filter(({ r, old }) => !old || old.value !== r.value || old.unit !== r.unit)
        .map(({ r, old }) => ({ parameter: r.parameter, before: old ? { value: old.value, unit: old.unit } : null, after: { value: r.value, unit: r.unit } }));
      amendment = { id: id('amd'), at: now(), by: req.user.id, byName: req.user.name, reason, statusBefore: o.status, previouslyVerifiedBy: o.verifiedBy || null, changes };
    } else if (resultsChanged && ['requested', 'collection_pending', 'cancelled', 'recollect_required'].includes(o.status) && status !== 'collected') {
      return res.status(409).json({ error: 'Collect the sample before entering results' });
    }

    if (status) {
      if (!LAB_STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
      if (!(LAB_NEXT[o.status] || []).includes(status)) {
        return res.status(409).json({ error: `An order that is "${o.status}" cannot move to "${status}"` });
      }
      if (['recollect_required', 'cancelled'].includes(status) && !text(b.statusReason)) {
        return res.status(400).json({ error: 'A reason is required to cancel or request a recollection' });
      }
      if (['awaiting_verification', 'verified', 'released'].includes(status)) {
        const have = results ?? o.results;
        if (!Array.isArray(have) || !have.some((r: any) => text(r?.value))) {
          return res.status(400).json({ error: 'Enter at least one result before sending for verification' });
        }
      }
      // Finalising is a separate permission, and never by the person who entered the results.
      if (o.status === 'awaiting_verification' && ['processing', 'verified', 'released', 'recollect_required'].includes(status)) {
        if (!can(req, 'verify')) {
          await audit(req, 'blocked', 'labOrder', o.id, 'Maker-checker: user without verification permission tried to finalise a result');
          return res.status(403).json({ error: 'Only an account with verification permission can do this' });
        }
      }
      if (['verified', 'released'].includes(status) && o.processedById && o.processedById === req.user.id) {
        await audit(req, 'blocked', 'labOrder', o.id, 'Maker-checker: the person who entered the results tried to verify them');
        return res.status(403).json({ error: 'The person who entered the results cannot verify them. Ask another verifier.' });
      }
    }

    if (results !== undefined && (resultsChanged || !o.results)) o.results = results;
    for (const k of LAB_EDITABLE) {
      if (k !== 'results' && b[k] !== undefined) o[k] = text(b[k], 1000);
    }
    if (observedAt) o.observedAt = observedAt;

    if (amendment) {
      o.amendments = [...(o.amendments || []), amendment];
      o.processedBy = req.user.name;
      o.processedById = req.user.id;
      if (['verified', 'released'].includes(o.status)) {
        o.status = 'awaiting_verification';
        delete o.verifiedBy; delete o.verifiedAt; delete o.approvedAt;
        o.reportedAt = now();
      }
    }
    if (status) {
      const wasFinal = ['verified', 'released'].includes(o.status);
      o.status = status;
      if (!wasFinal && ['verified', 'released'].includes(status)) labReleased = true;
      if (status === 'collected') { o.collectedAt = now(); o.collectedBy = o.collectedBy || req.user.name; }
      if (['processing', 'awaiting_verification'].includes(status) && o.status !== 'released') { o.processedBy = req.user.name; o.processedById = req.user.id; }
      if (status === 'awaiting_verification') { o.reportedAt = now(); o.observedAt = observedAt || o.observedAt || now(); }
      if (status === 'verified' || status === 'released') { o.verifiedBy = req.user.name; o.verifiedAt = now(); o.approvedAt = now(); }
      if (!['recollect_required', 'cancelled'].includes(status)) delete o.statusReason;
    }
    o.updatedAt = now();
    const saved = await ctx.repos.orders.update(before, diff(before, o), expected);
    await audit(req, amendment ? 'amend' : status ? `status:${status}` : 'update', 'labOrder', o.id,
      amendment ? `${amendment.changes.length} value(s) amended · ${amendment.reason}` : status ? `${status}${o.statusReason ? ' · ' + o.statusReason : ''}` : 'Fields updated');
    if (labReleased) {
      const pt = o.registeredPatientRef ? await ctx.repos.patients.byRef(o.registeredPatientRef) : null;
      const rs = (o.results || []).filter((r: any) => r.value);
      emitEvent('LAB_REPORT_RELEASED', {
        patientId: o.patientId, name: o.patientName, phone: pt?.phone, testName: o.testName, pathologist: o.verifiedBy, verifiedAt: o.verifiedAt,
        criticalCount: rs.filter((r: any) => r.flag === 'critical').length, abnormalCount: rs.filter((r: any) => r.flag === 'abnormal').length,
        summary: rs.slice(0, 10).map((r: any) => ({ parameter: r.parameter, value: r.value, unit: r.unit, flag: r.flag || 'normal' }))
      });
      // A critical value cannot wait for the doctor to open the lab page: tell the ordering and linked doctors now.
      const critical = rs.filter((r: any) => r.flag === 'critical');
      if (critical.length) {
        const doctors: any[] = await ctx.repos.users.byRole('doctor');
        const who = new Set<string>();
        for (const d of doctors) {
          if (d.id === o.createdBy || d.name === o.orderingDoctor || (pt && (await linkedPatientIds(ctx.repos, d.id)).has(pt.id))) who.add(d.id);
        }
        broadcast('critical', {
          orderId: o.id, patientName: o.patientName, patientId: o.patientId, testName: o.testName, at: now(),
          values: critical.slice(0, 6).map((r: any) => ({ parameter: r.parameter, value: r.value, unit: r.unit })),
        }, (userId) => who.has(userId));
        await audit(req, 'alert', 'labOrder', o.id, `Critical value pushed to ${who.size} doctor(s)`);
      }
    }
    res.json({ data: saved });
  });

  // ── Report files ────────────────────────────────────────────────────────────
  router.post('/lab/orders/:id/attachments', roles('lab'), ctx.limits.upload, async (req: any, res) => {
    const o = await ctx.repos.orders.byId(req.params.id);
    if (!o) return res.status(404).json({ error: 'Order not found' });
    if (o.status === 'cancelled') return res.status(409).json({ error: 'This order was cancelled' });
    const mime = text(req.body?.mimeType, 60);
    const type = FILE_TYPES[mime];
    if (!type) return res.status(400).json({ error: 'Attach a PDF, PNG or JPEG file' });
    const buf = Buffer.from(String(req.body?.data || '').replace(/^data:[^;]+;base64,/, ''), 'base64');
    if (!buf.length || buf.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'The file must be smaller than 10 MB' });
    if (!type.magic.every((byte, i) => buf[i] === byte)) return res.status(400).json({ error: 'The file content does not match its type' });
    const attId = id('att');
    await fs.mkdir(ctx.config.uploadsDir, { recursive: true });
    await fs.writeFile(path.join(ctx.config.uploadsDir, `${attId}.${type.ext}`), buf);
    const meta = {
      id: attId,
      name: text(req.body?.name, 120).replace(/[^\w.\- ()]/g, '_') || `report.${type.ext}`,
      mimeType: mime,
      size: buf.length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex'),
      uploadedBy: req.user.name,
      uploadedAt: now()
    };
    const saved = await ctx.repos.orders.update(o, { attachments: [...(o.attachments || []), meta] }, expectedVersion(req, o));
    await audit(req, 'attach', 'labOrder', o.id, `${meta.name} (${Math.round(buf.length / 1024)} KB)`);
    res.status(201).json({ data: saved });
  });

  // Files are served only to signed-in lab and doctor users, never from a public folder.
  router.get('/lab/orders/:id/attachments/:attId', roles('lab', 'doctor'), async (req: any, res) => {
    const o = await ctx.repos.orders.byId(req.params.id);
    const meta = o?.attachments?.find((a: any) => a.id === req.params.attId);
    if (!meta) return res.status(404).json({ error: 'File not found' });
    if (req.user.role === 'doctor' && !(o.registeredPatientRef && (await linkedPatientIds(ctx.repos, req.user.id)).has(o.registeredPatientRef))) {
      return res.status(403).json({ error: 'You are not linked to this patient' });
    }
    const ext = FILE_TYPES[meta.mimeType].ext;
    try {
      const buf = await fs.readFile(path.join(ctx.config.uploadsDir, `${meta.id}.${ext}`));
      await audit(req, 'download', 'labOrder', o.id, meta.name);
      res.setHeader('Content-Type', meta.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `inline; filename="${meta.name}"`);
      res.send(buf);
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  });

  registerScanRoutes({ app: router, roles, uploadLimit: ctx.limits.upload, text, audit: ctx.audit, repos: () => ctx.repos });
  return router;
}
