import { describe, expect, it } from 'vitest'
import { TEST_ALIASES, TEST_TEMPLATES, templateFor, testsByCategory } from './testCatalog'

describe('shared test catalogue', () => {
  const names = Object.keys(TEST_TEMPLATES)

  it('covers the basics a hospital orders: blood, urine, cultures, serology, X-ray, ultrasound, CT, MRI, ECG and echo', () => {
    for (const must of [
      'Complete Blood Count (CBC)', 'Comprehensive Metabolic Panel (CMP)', 'Lipid Profile', 'Liver Function Profile (LFT)', 'Renal Function Panel',
      'HbA1c (Glycated Hemoglobin)', 'Thyroid Profile (T3, T4, TSH)', 'Troponin I - Quantitative', 'Urine Routine & Microscopic', 'Blood Culture & Sensitivity',
      'Dengue (NS1 Antigen, IgM, IgG)', 'X-Ray Chest (PA / Lateral)', 'USG Abdomen & Pelvis', 'CT Brain (Plain)', 'CT Chest (HRCT)', 'MRI Brain', 'ECG (12-Lead)', '2D Echocardiogram',
    ]) expect(names, must).toContain(must)
    expect(names.length).toBeGreaterThanOrEqual(60)
  })

  it('gives every test a category, department, specimen, container and at least one result row', () => {
    for (const n of names) {
      const t = TEST_TEMPLATES[n]
      expect(t.category, n).toBeTruthy()
      expect(t.department, n).toBeTruthy()
      expect(t.sampleType, n).toBeTruthy()
      expect(t.container, n).toBeTruthy()
      expect(t.params.length, n).toBeGreaterThan(0)
      for (const p of t.params) {
        expect(p.parameter, n).toBeTruthy()
        expect(p.value, n).toBe('') // a template never carries a result
      }
    }
  })

  it('has no repeated parameter inside one test, so results do not overwrite each other', () => {
    for (const n of names) {
      const seen = TEST_TEMPLATES[n].params.map((p) => p.parameter)
      expect(new Set(seen).size, n).toBe(seen.length)
    }
  })

  it('groups every test under a category the pickers show', () => {
    const grouped = testsByCategory().flatMap(([, list]) => list)
    expect(grouped.sort()).toEqual([...names].sort())
  })

  it('imaging tests are written reports ending in an impression', () => {
    for (const n of names.filter((x) => TEST_TEMPLATES[x].category.startsWith('Imaging'))) {
      expect(TEST_TEMPLATES[n].params.at(-1)?.parameter, n).toMatch(/impression/i)
    }
  })

  it('opens an order written with an older doctor-side name with its parameters', () => {
    for (const [old, current] of Object.entries(TEST_ALIASES)) {
      expect(TEST_TEMPLATES[current], `${old} -> ${current}`).toBeDefined()
      expect(templateFor(old)).toBe(TEST_TEMPLATES[current])
    }
    expect(templateFor('Complete Blood Count with Diff (CBC)')?.params.length).toBeGreaterThan(5)
    expect(templateFor('Something nobody offers')).toBeUndefined()
  })
})
