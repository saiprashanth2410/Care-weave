import crypto from 'node:crypto';

// Rule-based reconciliation for imported external records.
// Nothing here deletes or merges anything. It only decides what a human has to review, and why.

export type Identity = { identifier?: string; name?: string; dob?: string; phone?: string };

export const POLICY = {
  // Points per matching field. A name and a date of birth alone can never reach auto-link.
  points: { identifier: 50, dob: 25, phone: 20, nameExact: 20, nameSimilar: 10 },
  dobConflictPenalty: 20,
  candidateThreshold: 30,
  autoLinkThreshold: 70
};

const clean = (v: unknown) => String(v ?? '').trim();
const digits = (v: unknown) => clean(v).replace(/\D/g, '');
const normName = (v: unknown) =>
  clean(v)
    .toLowerCase()
    .replace(/\b(dr|mr|mrs|ms|miss|mx)\b\.?/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function levenshtein(a: string, b: string) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}

function nameRelation(a: string, b: string): 'exact' | 'similar' | 'none' {
  const x = normName(a), y = normName(b);
  if (!x || !y) return 'none';
  if (x === y || [...x.split(' ')].sort().join(' ') === [...y.split(' ')].sort().join(' ')) return 'exact';
  const ratio = 1 - levenshtein(x, y) / Math.max(x.length, y.length);
  return ratio >= 0.85 ? 'similar' : 'none';
}

export type Candidate = { patient: any; score: number; evidence: string[]; conflicts: string[]; identifierMatch: boolean; strong: boolean };

export function scoreCandidate(p: any, who: Identity): Candidate {
  const evidence: string[] = [];
  const conflicts: string[] = [];
  let score = 0;
  const identifierMatch = !!clean(who.identifier) && clean(who.identifier).toLowerCase() === String(p.patientId).toLowerCase();
  if (identifierMatch) { score += POLICY.points.identifier; evidence.push(`Patient identifier ${p.patientId} matches`); }
  let dobMatch = false;
  if (clean(who.dob) && clean(p.dob)) {
    if (clean(who.dob).slice(0, 10) === clean(p.dob).slice(0, 10)) { dobMatch = true; score += POLICY.points.dob; evidence.push('Date of birth matches'); }
    else { score -= POLICY.dobConflictPenalty; conflicts.push('Date of birth differs'); }
  }
  let phoneMatch = false;
  const a = digits(who.phone), b = digits(p.phone);
  if (a.length >= 7 && b.length >= 7 && a.slice(-7) === b.slice(-7)) { phoneMatch = true; score += POLICY.points.phone; evidence.push('Phone number matches'); }
  const rel = nameRelation(who.name ?? '', p.name);
  if (rel === 'exact') { score += POLICY.points.nameExact; evidence.push('Name matches'); }
  else if (rel === 'similar') { score += POLICY.points.nameSimilar; evidence.push('Name is similar, not identical'); }
  // Auto-link needs an identifier plus one independent confirming field, and nothing contradicting it.
  const strong = identifierMatch && (dobMatch || phoneMatch) && conflicts.length === 0 && score >= POLICY.autoLinkThreshold;
  return { patient: p, score, evidence, conflicts, identifierMatch, strong };
}

export type MatchResult =
  | { status: 'linked'; candidate: Candidate }
  | { status: 'ambiguous'; candidates: Candidate[] }
  | { status: 'unmatched'; candidates: [] };

export function matchPatient(patients: any[], who: Identity): MatchResult {
  const scored = patients
    .map((p) => scoreCandidate(p, who))
    .filter((c) => c.score >= POLICY.candidateThreshold)
    .sort((x, y) => y.score - x.score);
  if (!scored.length) return { status: 'unmatched', candidates: [] };
  const top = scored[0];
  const runnerUp = scored[1];
  if (top.strong && (!runnerUp || runnerUp.score < POLICY.candidateThreshold)) return { status: 'linked', candidate: top };
  return { status: 'ambiguous', candidates: scored.slice(0, 5) };
}

// ── Content helpers ──────────────────────────────────────────────────────────

const day = (v: unknown) => clean(v).slice(0, 10);
const canon = (o: any): string => JSON.stringify(o, Object.keys(o ?? {}).sort());
export const checksum = (content: unknown) => crypto.createHash('sha256').update(canon(content)).digest('hex');
const key = (kind: string, c: any) => (kind === 'lab' ? clean(c?.testName) : kind === 'medication' ? clean(c?.medicine) : clean(c?.diagnosis)).toLowerCase();
const fieldsOf = (kind: string, c: any): { label: string; value: string }[] =>
  kind === 'lab'
    ? [['Test', c?.testName], ['Value', [c?.value, c?.units].filter(Boolean).join(' ')], ['Reference', c?.referenceRange]].map(([label, value]) => ({ label: String(label), value: clean(value) || 'not given' }))
    : kind === 'medication'
      ? [['Medicine', c?.medicine], ['Dose', c?.dosage], ['Frequency', c?.frequency], ['Route', c?.route]].map(([label, value]) => ({ label: String(label), value: clean(value) || 'not given' }))
      : [['Diagnosis', c?.diagnosis], ['Notes', c?.notes]].map(([label, value]) => ({ label: String(label), value: clean(value) || 'not given' }));

export type Issue = {
  type: 'duplicate' | 'conflict';
  title: string;
  detail: string;
  evidence: string[];
  sideBySide?: { a: { title: string; fields: { label: string; value: string }[] }; b: { title: string; fields: { label: string; value: string }[] } };
};

export function incompleteIssues(rec: any): Issue[] {
  const c = rec.content ?? {};
  const missing: string[] = [];
  if (!clean(rec.eventDate)) missing.push('event date');
  if (rec.kind === 'lab') {
    if (!clean(c.testName)) missing.push('test name');
    if (clean(c.value) && !clean(c.units)) missing.push('units');
    if (clean(c.value) && !clean(c.referenceRange)) missing.push('reference range');
  }
  if (rec.kind === 'medication' && (!clean(c.medicine) || !clean(c.dosage))) missing.push('medicine or dose');
  return missing.length
    ? [{ type: 'conflict', title: 'Incomplete report metadata', detail: `${rec.facility} · ${rec.sourceRecordId || 'no source id'} is missing: ${missing.join(', ')}.`, evidence: missing.map((m) => `Missing ${m}`) }]
    : [];
}

/** Compare one imported record with what is already on the patient's chart. */
export function findIssues(rec: any, existingExternal: any[], internalLabs: any[], internalRx: any[]): Issue[] {
  const issues: Issue[] = [...incompleteIssues(rec)];
  const sum = checksum(rec.content);
  const side = (b: any, bTitle: string) => ({
    a: { title: `This import (${rec.facility})`, fields: fieldsOf(rec.kind, rec.content) },
    b: { title: bTitle, fields: fieldsOf(b.kind ?? rec.kind, b.content ?? b) }
  });

  for (const e of existingExternal) {
    if (e.id === rec.id || ['Kept separate', 'Duplicate (linked to original)'].includes(e.status)) continue;
    const sameSource = !!clean(rec.sourceRecordId) && e.facility === rec.facility && e.sourceRecordId === rec.sourceRecordId;
    const sameKey = e.kind === rec.kind && e.facility === rec.facility && key(rec.kind, rec.content) === key(e.kind, e.content) && day(e.eventDate) === day(rec.eventDate);
    if (!sameSource && !sameKey) continue; // a later repeat of the same test is a real new result, not a duplicate
    const identical = e.checksum === sum;
    issues.push(
      identical
        ? { type: 'duplicate', title: 'Possible duplicate external report', detail: `${rec.facility} · ${rec.sourceRecordId || 'no source id'} repeats a record already on file.`, evidence: [sameSource ? 'Same source record identifier' : 'Same facility, test and date', 'Content is identical', 'Original record preserved, nothing overwritten'], sideBySide: side(e, 'Already on file') }
        : { type: 'conflict', title: 'Same report, different content', detail: `${rec.facility} · ${rec.sourceRecordId || 'no source id'} matches an earlier import but the values differ.`, evidence: [sameSource ? 'Same source record identifier' : 'Same facility, test and date', 'Content differs', 'Both versions preserved'], sideBySide: side(e, 'Already on file') },
    );
  }

  if (rec.kind === 'lab') {
    const test = key('lab', rec.content);
    for (const o of internalLabs) {
      for (const r of o.results ?? []) {
        if (String(r.parameter).toLowerCase() !== test || day(o.observedAt ?? o.verifiedAt) !== day(rec.eventDate)) continue;
        const same = clean(r.value) === clean(rec.content?.value);
        issues.push({
          type: same ? 'duplicate' : 'conflict',
          title: same ? 'Matches a result already produced here' : 'Differs from a result produced here on the same day',
          detail: `${rec.content?.testName} on ${day(rec.eventDate)} also exists as internal order ${o.id}.`,
          evidence: ['Same test and date', same ? 'Same value' : 'Different value', 'Both preserved'],
          sideBySide: { a: { title: `This import (${rec.facility})`, fields: fieldsOf('lab', rec.content) }, b: { title: `Internal order ${o.id}`, fields: [{ label: 'Test', value: String(r.parameter) }, { label: 'Value', value: `${r.value} ${r.unit}`.trim() }, { label: 'Reference', value: String(r.referenceRange || 'not given') }] } },
        });
      }
    }
  }

  if (rec.kind === 'medication') {
    const med = key('medication', rec.content);
    const sameDrug = (m: string) => !!med && !!m && (m.toLowerCase().includes(med) || med.includes(m.toLowerCase()));
    const compare = (title: string, other: { medicine: string; dosage?: string; frequency?: string; route?: string }) => {
      const differs = clean(other.dosage).toLowerCase() !== clean(rec.content?.dosage).toLowerCase() || clean(other.frequency).toLowerCase() !== clean(rec.content?.frequency).toLowerCase();
      issues.push({
        type: differs ? 'conflict' : 'duplicate',
        title: differs ? 'Conflicting medication entry' : 'Medication already recorded',
        detail: `${rec.content?.medicine} from ${rec.facility} ${differs ? 'has a different dose or frequency than' : 'matches'} ${title}.`,
        evidence: ['Same medicine', differs ? 'Dose or frequency differs' : 'Dose and frequency match', 'No entry changed or removed'],
        sideBySide: { a: { title: `This import (${rec.facility})`, fields: fieldsOf('medication', rec.content) }, b: { title, fields: fieldsOf('medication', other) } },
      });
    };
    for (const rx of internalRx) if (rx.status !== 'Discontinued' && sameDrug(rx.medicine)) compare(`prescription ${rx.id} (${rx.prescribingClinician})`, rx);
    for (const e of existingExternal) if (e.id !== rec.id && e.kind === 'medication' && e.status !== 'Kept separate' && sameDrug(key('medication', e.content)) && e.checksum !== sum && !(e.facility === rec.facility && e.sourceRecordId === rec.sourceRecordId)) compare(`${e.facility} record ${e.sourceRecordId || e.id}`, e.content);
  }
  return issues;
}
