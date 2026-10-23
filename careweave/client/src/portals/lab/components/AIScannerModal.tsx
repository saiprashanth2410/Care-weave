import { useState } from 'react'
import { parseMedicalDocumentWithAI, type ExtractedReportData, type ScannedRow } from '../services/aiScanner'
import type { LabOrder } from '../types'
import { createLabOrder, updateOrderStatus } from '../api'

interface AIScannerModalProps {
  onClose: () => void
  onImportSuccess: (order: LabOrder) => void
}

type ScanStep = 'upload' | 'scanning' | 'review'

export default function AIScannerModal({ onClose, onImportSuccess }: AIScannerModalProps) {
  const [step, setStep] = useState<ScanStep>('upload')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string>('')
  const [scanMessage, setScanMessage] = useState('Reading the document')
  const [data, setData] = useState<ExtractedReportData | null>(null)
  const [importing, setImporting] = useState(false)
  const [scanError, setScanError] = useState('')
  const [importError, setImportError] = useState('')

  const runExtraction = async (file: File) => {
    setScanError('')
    setStep('scanning')
    setScanMessage('Reading the document')
    try {
      setData(await parseMedicalDocumentWithAI(file))
      setStep('review')
    } catch (err) {
      setScanError((err as Error).message)
      setSelectedFile(null)
      setPreviewUrl('')
      setStep('upload')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setPreviewUrl(URL.createObjectURL(file))
      runExtraction(file)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) {
      setSelectedFile(file)
      setPreviewUrl(URL.createObjectURL(file))
      runExtraction(file)
    }
  }

  const updateRow = (i: number, patch: Partial<ScannedRow>) =>
    setData((d) => d && { ...d, results: d.results.map((r, j) => (j === i ? { ...r, ...patch, needsCheck: false, checkReason: '' } : r)) })
  const removeRow = (i: number) => setData((d) => d && { ...d, results: d.results.filter((_, j) => j !== i) })
  const addRow = () =>
    setData((d) => d && { ...d, results: [...d.results, { parameter: '', value: '', unit: '', referenceRange: '', flag: 'normal' }] })

  const handleImportToSystem = async () => {
    if (!data) return
    setImportError('')
    const rows = data.results.filter((r) => r.parameter.trim() && r.value.trim())
    if (!data.patientName.trim()) return setImportError('Enter the patient name before sending.')
    if (!data.testName.trim()) return setImportError('Enter the test name before sending.')
    if (!rows.length) return setImportError('There are no results to send. Add at least one result with a value.')
    setImporting(true)
    try {
      // 1. Create the requisition in the system
      const created = await createLabOrder({
        external: true,
        patientName: data.patientName,
        patientUhid: data.patientUhid,
        visitNo: data.visitNo,
        patientAge: data.patientAge,
        patientGender: data.patientGender,
        opIp: data.opIp,
        testName: data.testName,
        orderingDoctor: data.orderingDoctor,
        referralDoctor: data.referralDoctor,
        priority: data.priority,
        handlingNote: data.impression,
      })

      // 2. Scanned values are a draft. They go to the verification queue, never straight to released.
      await updateOrderStatus(created.id, 'collected')
      const fullyUpdated = await updateOrderStatus(created.id, 'awaiting_verification', {
        results: rows.map(({ needsCheck, checkReason, ...r }) => r),
        technicianNotes: 'Values read from a scanned report. Check each one against the original before verifying.',
      })

      onImportSuccess(fullyUpdated)
    } catch (err) {
      setImportError((err as Error).message || 'Could not send the results. Nothing was released; try again.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-deep/80 overflow-y-auto">
      <div className="w-full max-w-4xl my-auto border-2 border-accent bg-surface p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent-ink uppercase tracking-wider">
                AI Document Vision Scanner
              </span>
              <span className="font-mono text-xs text-ink-3">Draft only: a person must check it</span>
            </div>
            <h2 className="text-xl font-bold text-ink mt-1">Scan a laboratory report</h2>
            <p className="text-xs text-ink-2">
              Upload a report photo or PDF. The scanner reads what is printed; you correct anything it got wrong before it goes to the verification queue.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 border border-rule px-4 text-xs font-semibold text-ink-2 hover:bg-paper"
          >
            Close
          </button>
        </div>

        {/* STAGE 1: UPLOAD */}
        {step === 'upload' && (
          <div className="space-y-6">
            {scanError && (
              <p role="alert" className="border border-alert bg-surface px-3 py-2 text-sm text-alert">
                <strong className="font-semibold">Could not scan.</strong> {scanError}
              </p>
            )}
            {/* Drag & Drop Box */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-accent/60 bg-paper/50 p-8 text-center hover:bg-paper transition"
            >
                            <p className="text-sm font-bold text-ink">Drag and drop a laboratory report</p>
              <p className="text-xs text-ink-3 mt-1">JPG, PNG, WebP or PDF, up to 10 MB</p>

              <label className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-sm bg-accent px-6 text-xs font-bold text-surface hover:bg-accent-ink uppercase tracking-wider">
                Browse File or Camera
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {/* STAGE 2: SCANNING ANIMATION */}
        {step === 'scanning' && (
          <div className="py-16 text-center space-y-4">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Uploaded scan preview"
                className="mx-auto max-h-28 w-auto rounded border border-rule object-contain opacity-85 shadow-sm"
              />
            )}
            <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-accent border-t-transparent" />
            <h3 className="text-base font-bold text-ink">Scanning the report</h3>
            <p className="font-mono text-xs text-accent-ink font-semibold">{scanMessage}</p>
            <p className="text-[11px] text-ink-3">Check every extracted value before you save it.</p>
          </div>
        )}

        {/* STAGE 3: EXTRACTED DATA REVIEW & AUTO-FILL */}
        {step === 'review' && data && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-accent-ink">
                  Extracted ({data.results.length} Parameters Detected)
                </span>
                {data.model && <span className="font-mono text-[11px] text-ink-3">Read by {data.model}</span>}
                {selectedFile && (
                  <span className="font-mono text-[11px] text-ink-3">
                    Source: {selectedFile.name}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="text-xs text-ink-3 underline hover:text-ink"
              >
                Scan Another Document
              </button>
            </div>

            {/* Extracted Demographics Box */}
            <div className="grid gap-3 sm:grid-cols-3 border border-rule bg-paper/60 p-4 text-xs">
              <div>
                <span className="text-ink-3 uppercase font-bold text-[10px]">Patient Name</span>
                <input
                  type="text"
                  value={data.patientName}
                  onChange={(e) => setData({ ...data, patientName: e.target.value })}
                  className="w-full mt-0.5 border border-rule bg-surface px-2 py-1 font-bold text-ink"
                />
              </div>

              <div>
                <span className="text-ink-3 uppercase font-bold text-[10px]">Patient UHID</span>
                <input
                  type="text"
                  value={data.patientUhid}
                  onChange={(e) => setData({ ...data, patientUhid: e.target.value })}
                  className="w-full mt-0.5 border border-rule bg-surface px-2 py-1 font-mono font-bold text-ink"
                />
              </div>

              <div>
                <span className="text-ink-3 uppercase font-bold text-[10px]">Visit No & Care Type</span>
                <div className="flex gap-1 mt-0.5">
                  <input
                    type="text"
                    value={data.visitNo}
                    onChange={(e) => setData({ ...data, visitNo: e.target.value })}
                    className="flex-1 border border-rule bg-surface px-2 py-1 font-mono text-ink"
                  />
                  <select
                    value={data.opIp}
                    onChange={(e) => setData({ ...data, opIp: e.target.value as 'OP' | 'IP' })}
                    className="border border-rule bg-surface px-1 text-xs"
                  >
                    <option value="IP">IP</option>
                    <option value="OP">OP</option>
                  </select>
                </div>
              </div>

              <div>
                <span className="text-ink-3 uppercase font-bold text-[10px]">Age / Gender</span>
                <div className="flex gap-2 mt-0.5">
                  <input
                    type="number"
                    value={data.patientAge}
                    onChange={(e) => setData({ ...data, patientAge: Number(e.target.value) })}
                    className="w-16 border border-rule bg-surface px-2 py-1 text-ink font-mono"
                  />
                  <select
                    value={data.patientGender}
                    onChange={(e) => setData({ ...data, patientGender: e.target.value as 'M' | 'F' | 'O' })}
                    className="flex-1 border border-rule bg-surface px-2 py-1 text-ink"
                  >
                    <option value="F">Female</option>
                    <option value="M">Male</option>
                    <option value="O">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <span className="text-ink-3 uppercase font-bold text-[10px]">Referral Clinician</span>
                <input
                  type="text"
                  value={data.referralDoctor}
                  onChange={(e) => setData({ ...data, referralDoctor: e.target.value })}
                  className="w-full mt-0.5 border border-rule bg-surface px-2 py-1 text-ink"
                />
              </div>

              <div>
                <span className="text-ink-3 uppercase font-bold text-[10px]">Test Panel Requisition</span>
                <input
                  type="text"
                  value={data.testName}
                  onChange={(e) => setData({ ...data, testName: e.target.value })}
                  className="w-full mt-0.5 border border-rule bg-surface px-2 py-1 font-semibold text-ink"
                />
              </div>
            </div>

            {/* Extracted Parameters Table */}
            <div>
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-bold uppercase text-ink">Extracted Analyte Results ({data.results.length})</span>
                <span className="font-mono text-ink-3">
                  {data.results.filter((r) => r.flag === 'abnormal' || r.flag === 'critical').length} values flagged outside reference
                </span>
              </div>

              {data.warnings.length > 0 && (
                <ul role="alert" className="mb-2 space-y-0.5 border border-warn bg-surface px-3 py-2 text-xs text-ink">
                  {data.warnings.map((w) => (
                    <li key={w}>⚠ {w}</li>
                  ))}
                </ul>
              )}

              <div className="max-h-72 overflow-y-auto border border-rule">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-paper border-b border-rule text-[11px] uppercase font-bold text-ink-3">
                    <tr>
                      <th className="py-2 pl-3 pr-2">Parameter</th>
                      <th className="py-2 pr-2">Result</th>
                      <th className="py-2 pr-2">Units</th>
                      <th className="py-2 pr-2">Reference Range</th>
                      <th className="py-2 pr-2">Flag</th>
                      <th className="py-2 pr-3"><span className="sr-only">Remove</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule bg-surface">
                    {data.results.map((r, i) => (
                      <tr key={i} className={r.needsCheck ? 'bg-warn/10' : 'hover:bg-paper/40'}>
                        <td className="py-1 pl-3 pr-2">
                          <input aria-label="Parameter" value={r.parameter} onChange={(e) => updateRow(i, { parameter: e.target.value })} className="w-full border border-rule bg-surface px-1 py-0.5 font-medium text-ink" />
                          {r.needsCheck && <div className="mt-0.5 text-[10px] font-semibold text-warn">Check: {r.checkReason}</div>}
                        </td>
                        <td className="py-1 pr-2"><input aria-label="Result" value={r.value} onChange={(e) => updateRow(i, { value: e.target.value })} className="w-20 border border-rule bg-surface px-1 py-0.5 font-mono font-bold text-ink" /></td>
                        <td className="py-1 pr-2"><input aria-label="Units" value={r.unit} onChange={(e) => updateRow(i, { unit: e.target.value })} className="w-20 border border-rule bg-surface px-1 py-0.5 font-mono text-ink-2" /></td>
                        <td className="py-1 pr-2"><input aria-label="Reference range" value={r.referenceRange} onChange={(e) => updateRow(i, { referenceRange: e.target.value })} className="w-28 border border-rule bg-surface px-1 py-0.5 font-mono text-ink-2" /></td>
                        <td className="py-1 pr-2">
                          <select aria-label="Flag" value={r.flag || 'normal'} onChange={(e) => updateRow(i, { flag: e.target.value as ScannedRow['flag'] })} className="border border-rule bg-surface px-1 py-0.5 text-xs">
                            <option value="normal">Normal</option>
                            <option value="abnormal">Abnormal</option>
                            <option value="critical">Critical</option>
                          </select>
                        </td>
                        <td className="py-1 pr-3">
                          <button type="button" aria-label={`Remove ${r.parameter || 'row'}`} onClick={() => removeRow(i)} className="px-1 text-ink-3 hover:text-alert">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={addRow} className="mt-2 text-xs font-semibold text-accent-ink underline">+ Add a result the scanner missed</button>
            </div>

            {/* Impression Note */}
            {data.impression && (
              <div className="border-l-2 border-accent bg-accent/5 p-3 text-xs text-ink">
                <strong>Extracted Clinical Impression: </strong>
                {data.impression}
              </div>
            )}

            {importError && (
              <p role="alert" className="border border-alert bg-surface px-3 py-2 text-sm text-alert">{importError}</p>
            )}

            {/* Bottom Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="min-h-11 border border-rule px-4 text-xs font-semibold text-ink-2 hover:bg-paper"
              >
                ← Back
              </button>

              <button
                type="button"
                disabled={importing}
                onClick={handleImportToSystem}
                className="min-h-11 rounded-sm bg-accent px-6 text-xs font-bold uppercase tracking-wider text-surface hover:bg-accent-ink disabled:opacity-50"
              >
                {importing ? 'Importing to verification queue...' : 'Send to verification queue'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
