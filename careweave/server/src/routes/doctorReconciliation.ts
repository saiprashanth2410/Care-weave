import { Router } from 'express';
import type { AppCtx } from '../context.js';
import { catchAsyncRoutes } from '../asyncRoutes.js';
import type { DoctorAccess } from './doctorAccess.js';
import { expectedVersion } from '../middleware.js';
import { checksum, findIssues, matchPatient, type Identity, type Issue } from '../reconcile.js';
import { id, now, text } from '../util.js';
import { linkedPatientIds } from '../services/access.js';
import { casesFor, labsFor } from '../services/chart.js';


// Doctor API: importing outside records and resolving reconciliation cases.
export function doctorReconciliationRoutes(ctx: AppCtx, access: DoctorAccess) {
  const router = Router();
  catchAsyncRoutes(router);
  const { roles, audit } = ctx;
  const { R } = access;

  // ── external records and reconciliation ───────────────────────────────────
  const caseFrom = (rec: any, patientId: string | null, issue: Issue | { type: 'match' | 'unmatched'; title: string; detail: string; evidence: string[]; candidates?: any[] }, importedBy: string) => ({
    id: id('case'), type: issue.type, title: issue.title, detail: issue.detail, reference: rec.sourceRecordId || rec.id,
    evidence: issue.evidence, sideBySide: (issue as any).sideBySide, candidates: (issue as any).candidates,
    recordId: rec.id, patientId, importedBy, status: 'open', createdAt: now()
  });

  /** Run the duplicate and conflict checks for a record that now belongs to a patient. Returns the cases to open and the record's new status; writes nothing. */
  const analyze = async (rec: any, p: any, by: string) => {
    const [others, labs, rx] = await Promise.all([
      R().externalRecords.find({ patientId: p.id, id: { $ne: rec.id } }),
      labsFor(R(), p).then((l) => l.filter((o) => ['verified', 'released'].includes(o.status))),
      R().prescriptions.forPatient(p.id),
    ]);
    const issues = findIssues(rec, others, labs, rx);
    const status = issues.some((i) => i.type === 'conflict') ? 'Conflict flagged' : issues.length ? 'Duplicate flagged' : 'Imported';
    return { cases: issues.map((i) => caseFrom(rec, p.id, i, by)), status };
  };

  const validRecord = (raw: Record<string, any>) => {
    const facility = text(raw?.facility, 120);
    const kind = text(raw?.kind, 20);
    if (!facility) return { error: 'Name the source facility' };
    if (!['lab', 'medication', 'consultation'].includes(kind)) return { error: 'Record type must be lab, medication or consultation' };
    const content = raw?.content;
    if (!content || typeof content !== 'object' || Array.isArray(content) || JSON.stringify(content).length > 20000) return { error: 'The record content is missing or too large' };
    const ed = text(raw?.eventDate, 40);
    if (ed) { const d = new Date(ed); if (isNaN(+d) || d.getTime() > Date.now() + 86400000) return { error: 'The event date is not a valid past date' }; }
    const who: Identity = { identifier: text(raw?.patient?.identifier ?? raw?.patientId, 40), name: text(raw?.patient?.name, 120), dob: text(raw?.patient?.dob, 20), phone: text(raw?.patient?.phone, 40) };
    if (!who.identifier && !who.name && !who.dob && !who.phone) return { error: 'Give at least one identity field (patient identifier, name, date of birth or phone) so the record can be matched' };
    return { ok: { facility, kind, content, eventDate: ed || '', sourceRecordId: text(raw?.sourceRecordId, 80), documentRef: text(raw?.documentRef, 160), who } };
  };

  router.post('/external-records/import', roles('doctor'), async (req, res) => {
    const list = Array.isArray(req.body?.records) ? req.body.records : [req.body];
    if (list.length > 200) return res.status(400).json({ error: 'Import at most 200 records at a time' });
    const out: any[] = [];
    for (const raw of list) {
      const v = validRecord({ ...raw, facility: raw?.facility ?? req.body?.facility });
      if (!v.ok) { out.push({ error: v.error, sourceRecordId: raw?.sourceRecordId }); continue; }
      const { who, ...base } = v.ok;
      const rec: any = { id: id('ext'), ...base, patientId: null, importedAt: now(), importedBy: req.user.id, importedByName: req.user.name, checksum: checksum(base.content), identity: who, status: 'Requires review' };
      const m = matchPatient(await R().patients.candidatesFor(who), who);
      const cases: any[] = [];
      if (m.status === 'linked') {
        rec.patientId = m.candidate.patient.id;
        rec.matchEvidence = m.candidate.evidence;
        const a = await analyze(rec, m.candidate.patient, req.user.id);
        cases.push(...a.cases);
        rec.status = a.status;
      } else if (m.status === 'ambiguous') {
        rec.status = 'Requires review (identity)';
        const cands = m.candidates.map((x) => ({ patientId: x.patient.patientId, id: x.patient.id, name: x.patient.name, score: x.score, evidence: x.evidence, conflicts: x.conflicts }));
        cases.push(caseFrom(rec, null, { type: 'match', title: 'Possible patient match needs review', detail: `${rec.facility} · ${rec.sourceRecordId || rec.id}: ${cands.length} possible patient(s). Nothing was linked.`, evidence: ['Similar details are not proof of identity', ...(cands[0]?.evidence ?? []), ...(cands[0]?.conflicts ?? [])], candidates: cands }, req.user.id));
      } else {
        rec.status = 'Unmatched';
        cases.push(caseFrom(rec, null, { type: 'unmatched', title: 'No matching patient', detail: `${rec.facility} · ${rec.sourceRecordId || rec.id} stays separate until a reviewer links it to a patient.`, evidence: ['No patient scored high enough on the identity fields supplied'] }, req.user.id));
      }
      // The record and its review cases are saved together: a record without the cases that flag it for review would look clean.
      await R().transaction(async (tx) => {
        await tx.externalRecords.insert(rec);
        for (const k of cases) await tx.cases.insert(k);
      });
      await audit(req, 'import', 'external-record', rec.id, `Source: ${rec.facility} · ${rec.status}`);
      out.push({ record: rec, outcome: rec.status, cases });
    }
    const failed = out.filter((x) => x.error).length;
    res.status(out.length && failed === out.length ? 400 : 201).json({ results: out, imported: out.length - failed, rejected: failed, ...(out[0]?.record ? { record: out[0].record, case: out[0].cases?.[0] } : { error: out[0]?.error }) });
  });

  router.get('/reconciliation/cases', roles('doctor'), async (req, res) => {
    await audit(req, 'read', 'reconciliation', 'queue');
    res.json(await casesFor(R(), req.user.id));
  });

  router.patch('/reconciliation/cases/:id', roles('doctor'), async (req, res) => {
    const k = (await casesFor(R(), req.user.id)).find((x) => x.id === req.params.id);
    if (!k) return res.status(404).json({ error: 'Review case not found' });
    const decision = req.body?.decision;
    if (!['keep-separate', 'link'].includes(decision)) return res.status(400).json({ error: 'Decision must be keep-separate or link' });
    const rec = await R().externalRecords.byId(k.recordId);
    if (!rec) return res.status(404).json({ error: 'The imported record no longer exists' });

    const recChanges: Record<string, any> = {};
    const newCases: any[] = [];
    if (decision === 'keep-separate') {
      recChanges.status = 'Kept separate';
    } else if (k.type === 'match' || k.type === 'unmatched') {
      // The reviewer chooses the patient. It must be one this doctor is linked to.
      const wanted = text(req.body?.linkPatientId, 60) || k.candidates?.[0]?.id;
      const p = wanted ? await R().patients.byRef(wanted) : null;
      if (!p) return res.status(400).json({ error: 'Choose the patient to link this record to' });
      if (!(await linkedPatientIds(R(), req.user.id)).has(p.id)) return res.status(403).json({ error: 'You are not linked to that patient' });
      recChanges.patientId = p.id;
      const a = await analyze({ ...rec, patientId: p.id }, p, req.user.id);
      newCases.push(...a.cases);
      // Duplicate or conflict cases opened for the reviewer keep their flag; otherwise the record is simply linked.
      recChanges.status = a.status !== 'Imported' ? a.status : 'Linked (reviewed)';
    } else if (k.type === 'duplicate') {
      recChanges.status = 'Duplicate (linked to original)';
    } else {
      recChanges.status = 'Linked (reviewed)';
    }
    const expected = expectedVersion(req, k);
    // Linking the record, opening any new cases and closing this one happen together. A second reviewer who decided the same
    // case a moment earlier makes the case update fail with a conflict, which also undoes the record change.
    const saved = await R().transaction(async (tx) => {
      await tx.externalRecords.update(rec, recChanges);
      for (const c of newCases) await tx.cases.insert(c);
      return tx.cases.update(k, { status: 'reviewed', decision, reviewedBy: req.user.name, reviewedAt: now() }, expected);
    });
    await audit(req, 'resolve', 'reconciliation-case', k.id, `Decision: ${decision}`);
    res.json(saved);
  });


  return router;
}
