// Reference ranges that depend on the patient. The catalogue holds one default range per test; for haemoglobin the range differs
// by age and sex, so the result form uses the range for the patient the order is for.
type Gender = 'M' | 'F' | 'O' | undefined

const HAEMOGLOBIN = /^\s*(h(a)?emoglobin|hb|hgb)\s*$/i
const CHILD_UNDER = 12

/** Haemoglobin in g/dL: child 11.0 - 14.0, adult male 13.5 - 17.5, adult female 12.0 - 15.5. Other cases keep the catalogue default. */
export function referenceRangeFor(parameter: string, defaultRange: string, age?: number, gender?: Gender): string {
  if (!HAEMOGLOBIN.test(parameter)) return defaultRange
  if (age && age > 0 && age < CHILD_UNDER) return '11.0 - 14.0'
  if (gender === 'M') return '13.5 - 17.5'
  if (gender === 'F') return '12.0 - 15.5'
  return defaultRange
}
