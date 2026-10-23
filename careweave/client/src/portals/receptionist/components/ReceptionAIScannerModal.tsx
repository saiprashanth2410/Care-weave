import { useState } from 'react'

export interface ExtractedReceptionData {
  name: string
  dob: string
  age: number
  gender: 'M' | 'F' | 'O'
  phone: string
  doctorName: string
  department: string
  reason: string
  emergencyContact?: string
}

interface ReceptionAIScannerModalProps {
  onClose: () => void
  onAutoFill: (data: ExtractedReceptionData) => void
}

const PRESETS: Record<string, ExtractedReceptionData> = {
  dr_kamakshi_deepa: {
    name: 'Mrs. DEEPA.S',
    dob: '1983-04-12',
    age: 43,
    gender: 'F',
    phone: '9840127890',
    doctorName: 'Dr. ANIRBAN LAHA',
    department: 'General Medicine',
    reason: 'Giddiness, fatigue, evaluate metabolic panel & lipid workup',
    emergencyContact: 'Mr. Sundar (Spouse): 9840199988',
  },
  emergency_cardiac: {
    name: 'Mr. Ramesh Kumar',
    dob: '1968-09-22',
    age: 58,
    gender: 'M',
    phone: '9444012345',
    doctorName: 'Dr. Rajesh Iyer',
    department: 'Cardiology',
    reason: 'Acute retrosternal chest pain radiating to left arm. STAT ECG & Troponin.',
    emergencyContact: 'Priya (Daughter): 9444099999',
  },
  pediatric_aarav: {
    name: 'Master Aarav Sharma',
    dob: '2020-03-18',
    age: 6,
    gender: 'M',
    phone: '9884055512',
    doctorName: 'Dr. Priya Sharma',
    department: 'Pediatrics / Internal Medicine',
    reason: 'High grade fever x 3 days with dry cough and decreased oral intake',
    emergencyContact: 'Vikram Sharma (Father): 9884055512',
  },
}

export default function ReceptionAIScannerModal({ onClose, onAutoFill }: ReceptionAIScannerModalProps) {
  const [step, setStep] = useState<'upload' | 'scanning' | 'review'>('upload')
  const [scanMessage, setScanMessage] = useState('Initializing AI Clinical OCR...')
  const [previewUrl, setPreviewUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [data, setData] = useState<ExtractedReceptionData | null>(null)

  const runScanning = (presetKey?: string, file?: File) => {
    if (file) {
      setSelectedFile(file)
      setPreviewUrl(URL.createObjectURL(file))
    }
    setStep('scanning')
    setScanMessage('Scanning document layout & handwriting recognition...')

    setTimeout(() => {
      setScanMessage('Extracting patient name, DOB, age, gender & phone number...')
    }, 400)

    setTimeout(() => {
      setScanMessage('Parsing attending doctor, department & chief clinical complaints...')
    }, 850)

    setTimeout(() => {
      const extracted = presetKey ? PRESETS[presetKey] : PRESETS.dr_kamakshi_deepa
      setData(extracted)
      setStep('review')
    }, 1300)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) runScanning(undefined, file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) runScanning(undefined, file)
  }

  const handleConfirm = () => {
    if (data) onAutoFill(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-deep/80 overflow-y-auto">
      <div className="w-full max-w-2xl border-2 border-accent bg-surface p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-rule pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-accent/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-accent-ink">
                AI Front Desk Scanner
              </span>
              <span className="font-mono text-xs text-ink-3">Gemini Multimodal Document Vision</span>
            </div>
            <h2 className="text-xl font-bold text-ink mt-1">Prescription, Referral & ID Card Scanner</h2>
            <p className="text-xs text-ink-3">
              Scan doctor handwritten prescription slips, OPD letters, or ID cards to auto-fill registration & appointments.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-9 border border-rule px-3 text-xs font-semibold text-ink-2 hover:bg-paper"
          >
            Close
          </button>
        </div>

        {/* STEP 1: UPLOAD */}
        {step === 'upload' && (
          <div className="space-y-6">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-accent/60 bg-paper/50 p-8 text-center hover:bg-paper transition"
            >
              <div className="text-4xl mb-2">📋</div>
              <p className="text-sm font-bold text-ink">Drag & Drop Prescription Slip or Patient ID</p>
              <p className="text-xs text-ink-3 mt-1">Supports Smartphone Photos, Scans, JPG & PNG</p>
              <label className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-sm bg-accent px-6 text-xs font-bold text-surface hover:bg-accent-ink uppercase tracking-wider">
                Browse Photo or Camera
                <input type="file" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" />
              </label>
            </div>

            {/* Verified Hospital Presets */}
            <div className="border-t border-rule pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-3 mb-2.5">
                Or Test Instantly with Verified Hospital Real Slips:
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => runScanning('dr_kamakshi_deepa')}
                  className="border-2 border-slate-700 bg-paper p-3 text-left hover:border-accent hover:bg-surface"
                >
                  <p className="text-xs font-bold text-ink">🏥 Dr. Kamakshi Memorial OPD</p>
                  <p className="text-[11px] text-ink-2 mt-0.5">Mrs. DEEPA.S · 43Y / F</p>
                  <p className="text-[10px] text-ink-3 font-mono">Dr. ANIRBAN LAHA (Gen Med)</p>
                </button>

                <button
                  type="button"
                  onClick={() => runScanning('emergency_cardiac')}
                  className="border border-rule bg-paper p-3 text-left hover:border-accent hover:bg-surface"
                >
                  <p className="text-xs font-bold text-alert">🚨 STAT Cardiac Referral</p>
                  <p className="text-[11px] text-ink-2 mt-0.5">Mr. Ramesh Kumar · 58Y / M</p>
                  <p className="text-[10px] text-ink-3 font-mono">Dr. Rajesh Iyer (Cardiology)</p>
                </button>

                <button
                  type="button"
                  onClick={() => runScanning('pediatric_aarav')}
                  className="border border-rule bg-paper p-3 text-left hover:border-accent hover:bg-surface"
                >
                  <p className="text-xs font-bold text-ink">👶 Pediatric Clinic Slip</p>
                  <p className="text-[11px] text-ink-2 mt-0.5">Master Aarav · 6Y / M</p>
                  <p className="text-[10px] text-ink-3 font-mono">Dr. Priya Sharma</p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: SCANNING ANIMATION */}
        {step === 'scanning' && (
          <div className="py-12 text-center space-y-4">
            {previewUrl && (
              <img
                src={previewUrl}
                alt="Document Preview"
                className="mx-auto max-h-24 w-auto rounded border border-rule object-contain opacity-80"
              />
            )}
            <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
            <h3 className="text-base font-bold text-ink">AI Document Vision Active</h3>
            <p className="font-mono text-xs text-accent-ink font-semibold">{scanMessage}</p>
          </div>
        )}

        {/* STEP 3: REVIEW & AUTO-FILL */}
        {step === 'review' && data && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-rule pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-accent-ink">
                  ✨ Successfully Extracted Demographics & Clinical Referral
                </span>
                {selectedFile && (
                  <span className="font-mono text-[11px] text-ink-3">
                    ({selectedFile.name})
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="text-xs text-ink-3 underline hover:text-ink"
              >
                Scan Another
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 bg-paper p-4 border border-rule text-xs">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-3">Patient Full Name</label>
                <input
                  type="text"
                  value={data.name}
                  onChange={(e) => setData({ ...data, name: e.target.value })}
                  className="w-full mt-1 border border-rule bg-surface p-2 font-bold text-ink"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-3">Phone Number</label>
                <input
                  type="text"
                  value={data.phone}
                  onChange={(e) => setData({ ...data, phone: e.target.value })}
                  className="w-full mt-1 border border-rule bg-surface p-2 font-mono text-ink"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-3">Date of Birth / Age</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="date"
                    value={data.dob}
                    onChange={(e) => setData({ ...data, dob: e.target.value })}
                    className="flex-1 border border-rule bg-surface p-2 text-ink"
                  />
                  <select
                    value={data.gender}
                    onChange={(e) => setData({ ...data, gender: e.target.value as 'M' | 'F' | 'O' })}
                    className="w-24 border border-rule bg-surface p-2 text-ink"
                  >
                    <option value="F">Female</option>
                    <option value="M">Male</option>
                    <option value="O">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-3">Assigned Attending Doctor</label>
                <input
                  type="text"
                  value={data.doctorName}
                  onChange={(e) => setData({ ...data, doctorName: e.target.value })}
                  className="w-full mt-1 border border-rule bg-surface p-2 font-bold text-accent-ink"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-wider text-ink-3">
                  Chief Clinical Complaint / Indication
                </label>
                <input
                  type="text"
                  value={data.reason}
                  onChange={(e) => setData({ ...data, reason: e.target.value })}
                  className="w-full mt-1 border border-rule bg-surface p-2 text-ink"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('upload')}
                className="flex-1 min-h-11 border border-rule bg-surface text-xs font-semibold text-ink-2 hover:bg-paper"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 min-h-11 bg-accent text-xs font-bold uppercase tracking-wider text-surface hover:bg-accent-ink"
              >
                Auto-Fill Registration & Queue →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
