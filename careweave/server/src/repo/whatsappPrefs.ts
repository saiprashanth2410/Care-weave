import { baseRepo, idIndex } from './base.js';
import type { Collection, IndexSpec } from './store.js';

// One document per sender: { id: last 10 digits of the phone, language }. Kept in the database so every instance, and a restart, sees it.
export const whatsappPrefsIndexes: IndexSpec[] = [idIndex];

export const whatsappPrefsRepo = (c: Collection) => ({
  ...baseRepo(c),
  languageOf: async (phone: string): Promise<'en' | 'ta'> => ((await c.findOne({ id: phone }))?.language === 'ta' ? 'ta' : 'en'),
  setLanguage: async (phone: string, language: 'en' | 'ta') => {
    const current = await c.findOne({ id: phone });
    if (current) return void (await c.update(current, { language }));
    try { await c.insert({ id: phone, language }); }
    catch { /* another request created it first; the latest choice wins either way */ const again = await c.findOne({ id: phone }); if (again) await c.update(again, { language }); }
  },
});
