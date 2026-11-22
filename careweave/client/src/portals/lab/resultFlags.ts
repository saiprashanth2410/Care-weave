import type { ResultFlag, TestResultItem } from './types'

// Flags a typed value against the printed reference range, and the date helpers the result form uses.
export function evaluateFlag(param: string, rawVal: string, refRange: string): ResultFlag | undefined {
  const num = parseFloat(rawVal.replace(/,/g, ''))
  if (isNaN(num)) return undefined
  refRange = refRange.replace(/(\d),(?=\d{3})/g, '$1')

  // Critical panic values
  if (param.toLowerCase().includes('troponin') && num > 0.04) return 'critical'
  if (/(^|\s)ph(\s|\(|$)/i.test(param) && (num < 7.30 || num > 7.55)) return 'critical'
  if (param.toLowerCase().includes('potassium') && (num < 3.0 || num > 6.0)) return 'critical'
  if (param.toLowerCase().includes('platelet') && num < 50000) return 'critical'
  if (param.toLowerCase().includes('glucose') && num > 300) return 'critical'

  // Only plain numeric intervals are checked automatically. Text such as "Desirable: < 200, Borderline: 200-239"
  // has several bands, so it is left for the technologist and verifier to judge instead of guessing.
  if (!/^[<>=\s\d.\-\u2013]+$/.test(refRange)) return undefined

  // Standard ranges
  const rangeMatch = refRange.match(/([\d.]+)\s*-\s*([\d.]+)/)
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1])
    const high = parseFloat(rangeMatch[2])
    if (num < low || num > high) return 'abnormal'
    return 'normal'
  }

  const maxMatch = refRange.match(/<\s*([\d.]+)/)
  if (maxMatch) {
    const max = parseFloat(maxMatch[1])
    if (num > max) return 'abnormal'
    return 'normal'
  }

  const minMatch = refRange.match(/>\s*([\d.]+)/)
  if (minMatch) {
    const min = parseFloat(minMatch[1])
    if (num < min) return 'abnormal'
    return 'normal'
  }

  return undefined
}

export const withFlags = (rs: TestResultItem[]) => rs.map((r) => ({ ...r, flag: evaluateFlag(r.parameter, r.value, r.referenceRange) }))

export function nowLocalInput() { return toLocalInput(new Date()) }

export function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
