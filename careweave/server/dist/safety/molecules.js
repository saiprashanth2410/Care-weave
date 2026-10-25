import { parseMedicine } from '../medicines.js';
const SYNONYMS = {
    acetaminophen: 'paracetamol', apap: 'paracetamol', amoxycillin: 'amoxicillin', clavulanate: 'clavulanic acid',
    'clavulanate potassium': 'clavulanic acid', 'potassium clavulanate': 'clavulanic acid', 'acetylsalicylic acid': 'aspirin',
    asa: 'aspirin', salbutamol: 'albuterol', adrenaline: 'epinephrine', noradrenaline: 'norepinephrine', frusemide: 'furosemide',
    'glyceryl trinitrate': 'nitroglycerin', 'vitamin b12': 'cyanocobalamin', lignocaine: 'lidocaine', 'ascorbic acid': 'vitamin c',
};
const SALTS = new Set(['hydrochloride', 'hcl', 'sodium', 'potassium', 'sulfate', 'sulphate', 'besylate', 'maleate', 'tartrate', 'calcium',
    'trihydrate', 'dihydrate', 'monohydrate', 'anhydrous', 'mesylate', 'phosphate', 'succinate', 'fumarate', 'acetate', 'citrate', 'bromide', 'magnesium']);
const FORM_WORDS = new Set(['tablet', 'tablets', 'tab', 'capsule', 'capsules', 'cap', 'oral', 'injection', 'syrup', 'suspension', 'solution', 'film-coated',
    'film', 'coated', 'extended-release', 'sustained-release', 'release', 'cream', 'ointment', 'gel', 'drops', 'inhaler', 'for', 'sr', 'xr', 'er', 'od', 'forte', 'plus']);
// Brands that are typed as free text without the generic in brackets.
const BRANDS = {
    augmentin: ['amoxicillin', 'clavulanic acid'], 'moxikind-cv': ['amoxicillin', 'clavulanic acid'], 'moxikind cv': ['amoxicillin', 'clavulanic acid'],
    clavam: ['amoxicillin', 'clavulanic acid'], mox: ['amoxicillin'], novamox: ['amoxicillin'],
    calpol: ['paracetamol'], dolo: ['paracetamol'], crocin: ['paracetamol'], panadol: ['paracetamol'], tylenol: ['paracetamol'],
    ultracet: ['tramadol', 'paracetamol'], combiflam: ['ibuprofen', 'paracetamol'], brufen: ['ibuprofen'], voveran: ['diclofenac'],
    glycomet: ['metformin'], glucophage: ['metformin'], lipitor: ['atorvastatin'], norvasc: ['amlodipine'], eltroxin: ['levothyroxine'],
};
const CLASSES = {
    'NSAID': ['ibuprofen', 'diclofenac', 'naproxen', 'ketorolac', 'aceclofenac', 'etoricoxib', 'nimesulide', 'piroxicam', 'mefenamic acid', 'indomethacin', 'celecoxib', 'aspirin'],
    'penicillin antibiotic': ['amoxicillin', 'ampicillin', 'piperacillin', 'cloxacillin', 'flucloxacillin', 'penicillin', 'benzylpenicillin'],
    'cephalosporin antibiotic': ['cefpodoxime', 'cefixime', 'cefuroxime', 'ceftriaxone', 'cefalexin', 'cephalexin', 'cefadroxil', 'cefotaxime'],
    'statin': ['atorvastatin', 'rosuvastatin', 'simvastatin', 'pravastatin'],
    'proton pump inhibitor': ['omeprazole', 'pantoprazole', 'esomeprazole', 'rabeprazole', 'lansoprazole'],
    'ACE inhibitor': ['lisinopril', 'enalapril', 'ramipril', 'perindopril'],
    'angiotensin receptor blocker': ['losartan', 'telmisartan', 'valsartan', 'olmesartan'],
    'benzodiazepine': ['diazepam', 'alprazolam', 'lorazepam', 'clonazepam'],
    'opioid analgesic': ['tramadol', 'codeine', 'morphine', 'tapentadol'],
    'DPP-4 inhibitor': ['linagliptin', 'sitagliptin', 'vildagliptin', 'saxagliptin', 'teneligliptin'],
};
const RISK = {
    paracetamol: 'Combined paracetamol above 4 g in 24 hours risks acute hepatotoxicity and liver failure.',
    amoxicillin: 'Doubling the amoxicillin dose raises the risk of antibiotic overdose: severe diarrhoea, C. difficile infection, rash, crystalluria and renal injury.',
    'clavulanic acid': 'Duplicate clavulanic acid increases cholestatic jaundice and severe diarrhoea.',
    ibuprofen: 'Duplicate NSAID exposure raises the risk of acute kidney injury and gastrointestinal bleeding.',
    diclofenac: 'Duplicate NSAID exposure raises the risk of acute kidney injury and gastrointestinal bleeding.',
    metformin: 'Duplicate metformin raises the risk of lactic acidosis, especially with reduced kidney function.',
    tramadol: 'Duplicate tramadol raises the risk of seizures, serotonin syndrome and respiratory depression.',
    atorvastatin: 'Duplicate statin exposure raises the risk of myopathy and rhabdomyolysis.',
    levothyroxine: 'Duplicate levothyroxine can cause iatrogenic thyrotoxicosis and arrhythmia.',
};
const CLASS_RISK = {
    'NSAID': 'Two NSAIDs together raise the risk of acute kidney injury and gastrointestinal bleeding with no added benefit.',
    'penicillin antibiotic': 'Two penicillin-class antibiotics overlap in spectrum and add to antibiotic toxicity.',
    'opioid analgesic': 'Two opioids together raise the risk of respiratory depression and sedation.',
};
const clean = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
function normalizeMolecule(raw) {
    let t = clean(raw.replace(/\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|kg|ml|l|iu|units?|%)(?:\s*\/\s*\d*\s*(?:ml|l|g))?/gi, ' ').replace(/[^a-z\s-]/gi, ' '));
    const words = t.split(' ').filter((w, i) => w && !FORM_WORDS.has(w) && !(i > 0 && SALTS.has(w)));
    t = words.join(' ');
    return SYNONYMS[t] ?? t;
}
function splitMolecules(generic) {
    const out = generic.split(/\s*(?:\+|\/|,|;|&|\band\b|\bwith\b)\s*/i).map(normalizeMolecule).filter((m) => m.length > 2);
    return [...new Set(out)];
}
/** "Augmentin 625 (amoxicillin + clavulanic acid) oral tablet" becomes ["amoxicillin", "clavulanic acid"]. */
export function extractMolecules(drug, resolved) {
    const name = drug.trim();
    const parens = [...name.matchAll(/\(([^)]*[a-z][^)]*)\)/gi)].map((m) => m[1]);
    if (parens.length)
        return splitMolecules(parens[parens.length - 1]);
    const brandKey = clean(name.replace(/\d+(?:\.\d+)?\s*(?:mg|mcg|g)?/gi, ' ').replace(/\s+/g, ' ')).replace(/\s*(tablet|tab|capsule|syrup)s?$/, '');
    const known = BRANDS[brandKey] ?? BRANDS[brandKey.split(' ')[0]];
    if (known)
        return known;
    if (resolved)
        return splitMolecules(resolved);
    return splitMolecules(name);
}
export function drugParts(drug, molecules) {
    const m = parseMedicine(`x\t${drug}\t`);
    const brand = m && m.generic ? m.brand : drug.replace(/\(.*$/, '').trim();
    return { name: drug, brand: brand || drug, generic: molecules.join(' + ') };
}
/** Pulls strengths such as "500 mg" or "2.5 mg + 500 mg" out of a name or dose text, in milligrams. */
export function strengthsMg(text) {
    return [...text.matchAll(/(\d+(?:\.\d+)?)\s*(mg|mcg|µg|g)\b/gi)].map((m) => {
        const v = parseFloat(m[1]), u = m[2].toLowerCase();
        return u === 'g' ? v * 1000 : u === 'mg' ? v : v / 1000;
    });
}
export function dosesPerDay(frequency) {
    const f = frequency.toLowerCase();
    const every = f.match(/every\s+(\d+)\s*(?:h|hr|hrs|hours)/);
    if (every)
        return 24 / Number(every[1]);
    if (/\b(four times|qid|q\.?i\.?d)\b/.test(f))
        return 4;
    if (/\b(three times|thrice|tid|t\.?i\.?d)\b/.test(f))
        return 3;
    if (/\b(twice|two times|bid|b\.?d)\b/.test(f))
        return 2;
    if (/\b(once|daily|od|nightly|at bedtime)\b/.test(f))
        return 1;
    return null;
}
/** Daily milligrams per molecule when the strengths line up one-to-one with the molecules. */
export function dailyDoseMg(drug, molecules, dosage = '', frequency = '') {
    const strengths = strengthsMg(drug).length ? strengthsMg(drug) : strengthsMg(dosage);
    const per = dosesPerDay(frequency);
    const out = {};
    if (!per)
        return out;
    if (strengths.length === molecules.length)
        molecules.forEach((m, i) => (out[m] = Math.round(strengths[i] * per * 100) / 100));
    else if (molecules.length === 1 && strengths.length === 1)
        out[molecules[0]] = strengths[0] * per;
    return out;
}
const classOf = (molecule) => Object.entries(CLASSES).find(([, list]) => list.includes(molecule))?.[0];
const dayMs = 86400000;
export const durationDays = (s) => {
    const m = String(s ?? '').toLowerCase().match(/(\d+)\s*(day|week|month)/);
    return m ? Number(m[1]) * ({ day: 1, week: 7, month: 30 }[m[2]] ?? 1) : 0;
};
/** Medicines the patient is still taking: Active in-house prescriptions and linked outside records, inside their course (at least 14 days). */
export function activeMedicines(prescriptions, externalRecords, now = new Date()) {
    const live = (date, duration) => {
        const t = Date.parse(date);
        return !isNaN(t) && now.getTime() - t <= Math.max(14, durationDays(duration)) * dayMs;
    };
    const out = [];
    for (const rx of prescriptions) {
        if (rx.status !== 'Active' || !live(rx.date, rx.duration))
            continue;
        out.push({ name: String(rx.medicine), source: 'IN_HOUSE_ENCOUNTER', date: rx.date, doctor: rx.prescribingClinician, facility: rx.source || 'CareWeave Clinic', dose: String(rx.dosage ?? ''), freq: String(rx.frequency ?? '') });
    }
    for (const rec of externalRecords) {
        if (rec.kind !== 'medication' || !rec.patientId || ['Unmatched', 'Kept separate', 'Rejected'].includes(rec.status))
            continue;
        const date = rec.eventDate || rec.importedAt;
        if (!rec.content?.medicine || !live(date, rec.content.duration))
            continue;
        out.push({ name: String(rec.content.medicine), source: 'EXTERNAL_RECONCILED_RECORD', date, facility: rec.facility, dose: String(rec.content.dosage ?? ''), freq: String(rec.content.frequency ?? '') });
    }
    return out;
}
export async function checkDuplicateTherapy(input) {
    const mols = async (name) => extractMolecules(name, /\(/.test(name) || !input.resolve ? undefined : await input.resolve(name).catch(() => undefined));
    const next = await mols(input.medicine);
    if (!next.length)
        return [];
    const nextDose = dailyDoseMg(input.medicine, next, input.dosage, input.frequency);
    const alerts = [];
    for (const cur of activeMedicines(input.prescriptions, input.externalRecords, input.now)) {
        const have = await mols(cur.name);
        const shared = next.filter((m) => have.includes(m));
        const base = {
            prescribedDrug: drugParts(input.medicine, next),
            conflictingDrug: { ...drugParts(cur.name, have), source: cur.source, prescribedDate: cur.date, prescribingDoctor: cur.doctor, facility: cur.facility },
        };
        if (shared.length) {
            const curDose = dailyDoseMg(cur.name, have, cur.dose, cur.freq);
            const totals = shared.filter((m) => nextDose[m] && curDose[m]).map((m) => `${m} ${nextDose[m] + curDose[m]} mg/day combined`);
            const risks = shared.map((m) => RISK[m] ?? (classOf(m) && CLASS_RISK[classOf(m)]) ?? `Taking ${m} twice over exposes the patient to duplicate dosing and its dose-related side effects.`);
            alerts.push({
                severity: 'HIGH_COLLISION', ...base, matchedMolecules: shared,
                clinicalWarning: `Patient is already receiving ${shared.join(' and ')} via ${base.conflictingDrug.brand}. Prescribing ${base.prescribedDrug.brand} leads to duplicate dosage. ${[...new Set(risks)].join(' ')}${totals.length ? ` Estimated exposure: ${totals.join('; ')}.` : ''}`,
            });
            continue;
        }
        const classes = [...new Set(next.map(classOf).filter((c) => !!c))].filter((c) => have.some((m) => classOf(m) === c));
        if (classes.length) {
            alerts.push({
                severity: 'SAME_CLASS_WARNING', ...base, matchedMolecules: [],
                clinicalWarning: `${base.prescribedDrug.brand} and ${base.conflictingDrug.brand} are both ${classes.join(', ')} medicines. ${classes.map((c) => CLASS_RISK[c]).filter(Boolean).join(' ') || 'Check that therapy with two agents of one class is intended.'}`,
            });
        }
    }
    return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'HIGH_COLLISION' ? -1 : 1));
}
