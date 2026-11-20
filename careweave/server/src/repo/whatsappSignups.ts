import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

// One document per phone that is part-way through registering on WhatsApp: { id: last 10 digits, step, data, updatedAt }.
// It lives in the database so every server instance (and a restart) continues the same conversation. It is deleted when the
// patient finishes or sends CANCEL; one left behind simply expires and is ignored after an hour.
export const whatsappSignupsIndexes: IndexSpec[] = [idIndex];

export type SignupStep = 'name' | 'dob' | 'gender';
const STALE_MS = 60 * 60 * 1000;

export const whatsappSignupsRepo = (c: Collection) => ({
  ...baseRepo(c),
  /** The conversation in progress for this phone, or null when there is none or it went quiet for more than an hour. */
  async get(phone: string): Promise<{ id: string; step: SignupStep; data: Record<string, string>; updatedAt: string } | null> {
    const row = await c.findOne({ id: phone });
    if (!row) return null;
    if (Date.now() - Date.parse(row.updatedAt) > STALE_MS) { await c.remove({ id: phone }); return null; }
    return row as any;
  },
  async save(phone: string, step: SignupStep, data: Record<string, string>) {
    const row = { step, data, updatedAt: new Date().toISOString() };
    const current = await c.findOne({ id: phone });
    if (current) return void (await c.update(current, row));
    try { await c.insert({ id: phone, ...row }); }
    catch { const again = await c.findOne({ id: phone }); if (again) await c.update(again, row); }
  },
  clear: async (phone: string) => void (await c.remove({ id: phone })),
});
