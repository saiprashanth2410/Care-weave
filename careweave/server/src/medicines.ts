import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

// Medicine catalogue from catalog/BrandMaster.tsv (about 94,000 rows). It is kept in its own MongoDB
// collection rather than the in-memory db, which holds every document in RAM.

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'catalog', 'BrandMaster.tsv');
const COLLECTION = 'medicines';

export type Medicine = {
  id: string;
  name: string;
  brand: string;
  generic: string;
  strength: string;
  form: string;
  route: string;
  search: string;
};

const UNIT_WORDS = new Set(['mg', 'mcg', 'g', 'kg', 'ml', 'l', 'unit', 'units', 'iu', 'million', 'microgram', 'micrograms', 'mmol', 'meq', 'vial', 'dose', 'actuation', 'ampoule', 'sachet', 'mg/ml']);

function routeFor(form: string) {
  const f = form.toLowerCase();
  if (f.includes('oral') || f.includes('sublingual')) return 'Oral';
  if (f.includes('inhal') || f.includes('nasal')) return 'Inhalation';
  if (f.includes('injection') || f.includes('infusion')) return 'Intravenous';
  if (f.includes('cutaneous') || f.includes('topical') || f.includes('cream') || f.includes('ointment') || f.includes('gel')) return 'Topical';
  return '';
}

/** "Safedox (cefpodoxime) 200 mg film-coated oral tablet" becomes brand, generic, strength and form. */
export function parseMedicine(line: string): Medicine | null {
  const cols = line.split('\t');
  const id = cols[0]?.trim(), name = cols[1]?.trim();
  if (!id || !name) return null;
  const m = name.match(/^(.*?)\s*\((.*?)\)\s*(.*)$/);
  const brand = m ? m[1] : name, generic = m ? m[2] : '', rest = m ? m[3] : '';
  const tokens = rest.split(/\s+/).filter(Boolean);
  let i = 0;
  while (i < tokens.length && (/\d/.test(tokens[i]) || tokens[i] === '+' || UNIT_WORDS.has(tokens[i].toLowerCase()))) i++;
  const strength = tokens.slice(0, i).join(' '), form = tokens.slice(i).join(' ');
  return { id, name, brand, generic, strength, form, route: routeFor(form), search: name.toLowerCase() };
}

async function readAll(): Promise<Medicine[]> {
  let raw: string;
  try {
    raw = await fs.readFile(FILE, 'utf8');
  } catch {
    console.warn(`Medicine catalogue not found at ${FILE}. Medicine search is empty until it is added.`);
    return [];
  }
  const out: Medicine[] = [];
  const lines = raw.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const med = lines[i] ? parseMedicine(lines[i]) : null;
    if (med) out.push(med);
  }
  return out;
}

let memory: Promise<Medicine[]> | null = null;

/** Loads the catalogue into the medicines collection when that is empty. Safe to call on every start. */
export async function importMedicines(force = false) {
  const coll = mongoose.connection.db!.collection(COLLECTION);
  if (!force && (await coll.estimatedDocumentCount()) > 0) return 0;
  const meds = await readAll();
  if (!meds.length) return 0;
  await coll.deleteMany({});
  for (let i = 0; i < meds.length; i += 5000) await coll.insertMany(meds.slice(i, i + 5000), { ordered: false });
  await coll.createIndex({ id: 1 }, { unique: true });
  await coll.createIndex({ search: 1 });
  console.log(`Imported ${meds.length} medicines into "${COLLECTION}"`);
  return meds.length;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function searchMedicines(q: string, limit = 15, useMongo = true) {
  const term = q.trim().toLowerCase().slice(0, 80);
  if (term.length < 2) return [];
  const rank = (m: Medicine) => (m.search.startsWith(term) ? 0 : 1);
  let hits: Medicine[];
  if (useMongo) {
    const coll = mongoose.connection.db!.collection(COLLECTION);
    const find = (re: string, n: number) => coll.find({ search: { $regex: re } }, { projection: { _id: 0 } }).limit(n).toArray() as unknown as Promise<Medicine[]>;
    // Prefix matches first, then names that contain the text.
    hits = await find('^' + escapeRe(term), limit);
    if (hits.length < limit) {
      const have = new Set(hits.map((h) => h.id));
      hits.push(...(await find(escapeRe(term), limit * 3)).filter((h) => !have.has(h.id)));
    }
  } else {
    memory ||= readAll();
    hits = (await memory).filter((m) => m.search.includes(term));
  }
  return hits.sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length).slice(0, limit).map(({ search, ...m }) => m);
}
