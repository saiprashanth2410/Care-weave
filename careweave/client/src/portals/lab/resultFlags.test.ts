import { describe, expect, it } from 'vitest'
import { evaluateFlag, toLocalInput, withFlags } from './resultFlags'

describe('evaluateFlag', () => {
  it('compares a value with a plain numeric range', () => {
    expect(evaluateFlag('HEMOGLOBIN', '14', '13.5 - 17.5')).toBe('normal')
    expect(evaluateFlag('HEMOGLOBIN', '11.2', '13.5 - 17.5')).toBe('abnormal')
    expect(evaluateFlag('HEMOGLOBIN', '18', '13.5 - 17.5')).toBe('abnormal')
  })
  it('understands "< x" and "> x" limits', () => {
    expect(evaluateFlag('HbA1c', '6.1', '< 5.7')).toBe('abnormal')
    expect(evaluateFlag('HbA1c', '5.2', '< 5.7')).toBe('normal')
    expect(evaluateFlag('HDL', '35', '> 40')).toBe('abnormal')
  })
  it('reads thousands separators in the range', () => {
    expect(evaluateFlag('TOTAL WBC COUNT', '12500', '4,000 - 10,000')).toBe('abnormal')
    expect(evaluateFlag('PLATELET COUNT', '250000', '150,000 - 410,000')).toBe('normal')
  })
  it('marks panic values critical whatever the range says', () => {
    expect(evaluateFlag('Potassium', '6.4', '3.5 - 5.1')).toBe('critical')
    expect(evaluateFlag('Troponin I', '0.5', '< 0.04')).toBe('critical')
    expect(evaluateFlag('Glucose', '420', '70 - 110')).toBe('critical')
    expect(evaluateFlag('PLATELET COUNT', '30000', '150,000 - 410,000')).toBe('critical')
  })
  it('leaves multi-band text ranges and text values to a person', () => {
    expect(evaluateFlag('Cholesterol', '240', 'Desirable: < 200, Borderline: 200-239')).toBeUndefined()
    expect(evaluateFlag('HIV', 'Non reactive', 'Non reactive')).toBeUndefined()
    expect(evaluateFlag('Glucose', '', '70 - 110')).toBeUndefined()
  })
})

describe('result form helpers', () => {
  it('withFlags recomputes every row', () => {
    const rows = withFlags([{ parameter: 'HEMOGLOBIN', value: '9', unit: 'g/dL', referenceRange: '12.0 - 15.5', flag: 'normal' }])
    expect(rows[0].flag).toBe('abnormal')
  })
  it('toLocalInput formats a date for a datetime-local box', () => {
    expect(toLocalInput(new Date(2026, 10, 21, 9, 5))).toBe('2026-11-21T09:05')
  })
})
