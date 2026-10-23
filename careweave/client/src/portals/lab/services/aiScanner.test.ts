import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseMedicalDocumentWithAI } from './aiScanner'

const file = (type: string, size = 10) => new File([new Uint8Array(size)], 'r', { type })
const reply = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))

afterEach(() => vi.unstubAllGlobals())

describe('parseMedicalDocumentWithAI', () => {
  it('refuses file types the scanner cannot read, before any upload', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    await expect(parseMedicalDocumentWithAI(file('image/heic'))).rejects.toThrow(/JPG, PNG, WebP or PDF/)
    expect(f).not.toHaveBeenCalled()
  })

  it('refuses a file over 10 MB', async () => {
    await expect(parseMedicalDocumentWithAI(file('image/png', 10 * 1024 * 1024 + 1))).rejects.toThrow(/10 MB/)
  })

  it('shows the server message when the scan fails', async () => {
    reply(429, { error: 'The scanner is rate limited' })
    await expect(parseMedicalDocumentWithAI(file('image/png'))).rejects.toThrow('The scanner is rate limited')
  })

  it('fills missing fields with empty values, never invented ones', async () => {
    reply(200, { data: { patientName: 'Ravi', patientGender: 'male', results: [{ parameter: 'LDL', value: '165' }] } })
    const out = await parseMedicalDocumentWithAI(file('image/png'))
    expect(out.patientName).toBe('Ravi')
    expect(out.patientGender).toBe('O')
    expect(out.patientAge).toBe(0)
    expect(out.testName).toBe('')
    expect(out.warnings).toEqual([])
    expect(out.results).toHaveLength(1)
  })

  it('survives a response with no data at all', async () => {
    reply(200, { data: {} })
    const out = await parseMedicalDocumentWithAI(file('application/pdf'))
    expect(out.results).toEqual([])
  })
})
