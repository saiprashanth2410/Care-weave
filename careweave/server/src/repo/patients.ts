import { baseRepo, containsCI, exactCI, idIndex, phoneLike } from './base.js';
import type { Collection, IndexSpec } from './store.js';

export const patientsIndexes: IndexSpec[] = [
  idIndex,
  { keys: { patientId: 1 }, unique: true },
  { keys: { name: 1, dob: 1 } },
  { keys: { phone: 1 } },
  { keys: { createdAt: -1 } },
];

export const patientsRepo = (c: Collection) => ({
  ...baseRepo(c),
  /** By internal id or by the patient code printed on the card. */
  byRef: (value: string) => c.findOne({ $or: [{ id: value }, { patientId: value }] }),
  byCode: (code: string) => c.findOne({ patientId: exactCI(code) }),
  codeTaken: async (code: string) => (await c.count({ patientId: code })) > 0,
  duplicatesOf: (name: string, dob: string) => c.find({ name: exactCI(name), dob }),
  /** Newest first. `ids` limits the search to those patients (a doctor sees only the patients linked to them). */
  async search(q: string, ids: string[] | null, limit: number, skip: number) {
    const filter: Record<string, any> = {};
    if (ids) filter.id = { $in: ids };
    if (q) filter.$or = ['name', 'patientId', 'phone', 'email'].map((f) => ({ [f]: containsCI(q) }));
    const [rows, total] = await Promise.all([c.find(filter, { sort: { createdAt: -1 }, limit, skip }), c.count(filter)]);
    return { rows, total };
  },
  byPhone: (digits: string) => c.find({ phone: phoneLike(digits) }),
  /**
   * Every patient who could score at least the match threshold for an imported record: the identifier matches, the date of
   * birth matches, or the last seven digits of the phone match. A name alone is worth less than the threshold, so it never qualifies.
   */
  candidatesFor(who: { identifier?: string; dob?: string; phone?: string }) {
    const or: Record<string, any>[] = [];
    const idf = String(who.identifier ?? '').trim();
    const dob = String(who.dob ?? '').trim().slice(0, 10);
    const ph = String(who.phone ?? '').replace(/\D/g, '');
    if (idf) or.push({ patientId: exactCI(idf) });
    if (dob) or.push({ dob: { $regex: `^${dob}` } });
    if (ph.length >= 7) or.push({ phone: phoneLike(ph.slice(-7)) });
    return or.length ? c.find({ $or: or }) : Promise.resolve([]);
  },
  /** Lab look-up: code or name only. */
  lookup: (q: string, limit: number) => c.find({ $or: [{ patientId: containsCI(q) }, { name: containsCI(q) }] }, { limit }),
});
