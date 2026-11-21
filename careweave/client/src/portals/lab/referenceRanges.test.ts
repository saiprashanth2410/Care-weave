import { describe, expect, it } from 'vitest'
import { referenceRangeFor } from './referenceRanges'

const DEFAULT = '12.0 - 15.0'

describe('haemoglobin reference range follows age and sex', () => {
  it('adult male, adult female and child get their own range', () => {
    expect(referenceRangeFor('HEMOGLOBIN', DEFAULT, 40, 'M')).toBe('13.5 - 17.5')
    expect(referenceRangeFor('Haemoglobin', DEFAULT, 34, 'F')).toBe('12.0 - 15.5')
    expect(referenceRangeFor('Hb', DEFAULT, 7, 'M')).toBe('11.0 - 14.0')
    expect(referenceRangeFor('Hemoglobin', DEFAULT, 7, 'F')).toBe('11.0 - 14.0')
  })
  it('an unknown sex keeps the catalogue default, and an unknown age is treated as an adult', () => {
    expect(referenceRangeFor('HEMOGLOBIN', DEFAULT, 40, 'O')).toBe(DEFAULT)
    expect(referenceRangeFor('HEMOGLOBIN', DEFAULT, 0, 'M')).toBe('13.5 - 17.5')
    expect(referenceRangeFor('HEMOGLOBIN', DEFAULT, undefined, undefined)).toBe(DEFAULT)
  })
  it('other tests, including HbA1c, are untouched', () => {
    expect(referenceRangeFor('Glycated Hemoglobin (HbA1c)', '< 5.7', 40, 'M')).toBe('< 5.7')
    expect(referenceRangeFor('PCV', '36.0 - 46.0', 40, 'M')).toBe('36.0 - 46.0')
  })
})
