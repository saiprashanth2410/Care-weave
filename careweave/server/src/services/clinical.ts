// A short list of drug families, so an allergy to one member also catches the others. It is a safety net for the
// demo, not clinical decision support: anything not listed here is only matched by name.
const DRUG_FAMILIES: string[][] = [
  ['penicillin', 'amoxicillin', 'amoxycillin', 'ampicillin', 'piperacillin', 'flucloxacillin', 'cloxacillin', 'oxacillin', 'augmentin', 'co-amoxiclav', 'amoxiclav'],
  ['sulfa', 'sulfonamide', 'sulfamethoxazole', 'co-trimoxazole', 'cotrimoxazole', 'trimethoprim', 'bactrim'],
  ['nsaid', 'ibuprofen', 'diclofenac', 'naproxen', 'ketorolac', 'aspirin', 'indomethacin'],
  ['cephalosporin', 'cefuroxime', 'ceftriaxone', 'cefixime', 'cefalexin', 'cephalexin', 'cefazolin']
];
export function conflictsWith(allergen: string, medicine: string) {
  const a = allergen.toLowerCase().trim(), m = medicine.toLowerCase().trim();
  if (!a || !m) return false;
  if (m.includes(a) || a.includes(m)) return true;
  return DRUG_FAMILIES.some((fam) => fam.some((x) => a.includes(x)) && fam.some((x) => m.includes(x)));
}

const RANGES: Record<string, [number, number]> = { bpSystolic: [40, 300], bpDiastolic: [20, 200], heartRate: [20, 300], tempF: [85, 110], respRate: [4, 80], spo2: [40, 100], bmi: [8, 80] };
export function cleanVitals(src: any): { ok?: any; error?: string } {
  const out: any = {};
  for (const [k, [lo, hi]] of Object.entries(RANGES)) {
    if (src[k] === undefined || src[k] === '' || src[k] === null) continue; // missing stays missing, never filled in
    const n = Number(src[k]);
    if (!Number.isFinite(n) || n < lo || n > hi) return { error: `${k} must be a number between ${lo} and ${hi}` };
    out[k] = n;
  }
  return Object.keys(out).length ? { ok: out } : {};
}
