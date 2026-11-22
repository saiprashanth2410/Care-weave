import { useEffect, useState } from 'react'
import { createLabOrder, getDoctors, type RegisteredPatient, searchRegisteredPatients, TEST_TEMPLATES, testsByCategory } from '../api'
import type { LabOrder, Priority } from '../types'

/** The "New Laboratory Requisition" form: look up a registered patient (or enter an outside one), pick the test and the ordering doctor. */
export default function NewRequisitionModal({ onClose, onCreated }: { onClose: () => void; onCreated: (order: LabOrder) => void }) {
  // New Requisition Form State
  const [newPatientName, setNewPatientName] = useState('')
  const [newUhid, setNewUhid] = useState('')
  const [newVisitNo, setNewVisitNo] = useState('')
  const [newOpIp, setNewOpIp] = useState<'OP' | 'IP'>('IP')
  const [newPatientAge, setNewPatientAge] = useState<number | ''>('')
  const [newPatientGender, setNewPatientGender] = useState<'' | 'M' | 'F' | 'O'>('')
  const [newTestName, setNewTestName] = useState<string>('') // chosen by the technician, never pre-picked
  const [newDoctor, setNewDoctor] = useState('')
  const [doctors, setDoctors] = useState<string[]>([])
  const [newPriority, setNewPriority] = useState<Priority>('routine')
  const [newHandlingNote, setNewHandlingNote] = useState('')

  // Central Database Patient Autocomplete
  const [patientSearchQuery, setPatientSearchQuery] = useState('')
  const [patientSearchResults, setPatientSearchResults] = useState<RegisteredPatient[]>([])
  const [selectedPatientRef, setSelectedPatientRef] = useState<RegisteredPatient | null>(null)
  const [isSearchingPatient, setIsSearchingPatient] = useState(false)
  const [selectedEncounterId, setSelectedEncounterId] = useState('')
  const [externalOrder, setExternalOrder] = useState(false)

  useEffect(() => {
    getDoctors()
      .then((list) => {
        setDoctors(list.map((d) => d.name))
        setNewDoctor((cur) => cur || list[0]?.name || '')
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!patientSearchQuery.trim()) return
    const timer = setTimeout(() => {
      setIsSearchingPatient(true)
      searchRegisteredPatients(patientSearchQuery)
        .then((res) => setPatientSearchResults(res))
        .catch(() => setPatientSearchResults([]))
        .finally(() => setIsSearchingPatient(false))
    }, 200)
    return () => clearTimeout(timer)
  }, [patientSearchQuery])

  const handleSelectPatient = (p: RegisteredPatient) => {
    setSelectedPatientRef(p)
    setNewPatientName(p.name)
    setNewUhid(p.patientId)
    setNewPatientAge(p.ageYears)
    setSelectedEncounterId(p.encounters[0]?.id ?? '')
    setExternalOrder(false)
    setNewOpIp('OP')
    setPatientSearchQuery('')
    setPatientSearchResults([])
  }

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPatientName.trim() || !newDoctor || newPatientAge === '' || !newPatientGender) return
    if (!selectedPatientRef && !externalOrder) return
    if (selectedPatientRef && !selectedEncounterId) return
    const created = await createLabOrder({
      patientName: newPatientName.trim(),
      patientId: selectedPatientRef?.patientId,
      encounterId: selectedPatientRef ? selectedEncounterId : undefined,
      external: !selectedPatientRef,
      patientUhid: newUhid.trim() || selectedPatientRef?.patientId || undefined,
      visitNo: newVisitNo.trim() || undefined,
      opIp: newOpIp,
      patientAge: Number(newPatientAge),
      patientGender: newPatientGender,
      testName: newTestName,
      orderingDoctor: newDoctor,
      referralDoctor: newDoctor,
      priority: newPriority,
      handlingNote: newHandlingNote.trim() || undefined,
    })
    onCreated(created)
  }

  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-deep/60 overflow-y-auto">
          <div className="w-full max-w-xl my-8 border-2 border-accent bg-surface p-6 sm:p-8 space-y-6">
            <div className="border-b border-rule pb-3 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-ink">New Laboratory Requisition</h2>
                <p className="text-xs text-ink-3">Register a walk-in patient or internal clinical requisition</p>
              </div>
              <button
                onClick={() => onClose()}
                className="min-h-11 px-3 text-xs font-semibold text-ink-2 hover:bg-paper"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4">
              {/* Central Database Patient Search & Link */}
              <div className="border border-accent/40 bg-accent/5 p-3 relative">
                <label className="block text-xs font-bold uppercase tracking-wider text-accent-ink mb-1">
                  🔍 Search Central Patient Registry (Registered at Reception)
                </label>
                <div className="relative">
                  <input
                    type="search"
                    placeholder="Type patient name, UHID (e.g. CW-...) or phone number..."
                    value={patientSearchQuery}
                    onChange={(e) => {
                      setPatientSearchQuery(e.target.value)
                      if (!e.target.value.trim()) setPatientSearchResults([])
                    }}
                    className="w-full min-h-11 border border-accent/40 bg-surface px-3 text-sm text-ink placeholder:text-ink-3"
                  />
                  {isSearchingPatient && (
                    <span className="absolute right-3 top-3 text-xs font-mono text-ink-3 animate-pulse">
                      Searching...
                    </span>
                  )}
                </div>

                {/* Dropdown list of matching patients */}
                {patientSearchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 max-h-56 overflow-y-auto border-2 border-accent bg-surface shadow-md">
                    <div className="bg-paper px-3 py-1 text-[11px] font-bold text-ink-3 uppercase border-b border-rule">
                      Select Patient to Auto-Fill Requisition ({patientSearchResults.length} found)
                    </div>
                    {patientSearchResults.map((p) => (
                      <button
                        key={p.patientId}
                        type="button"
                        onClick={() => handleSelectPatient(p)}
                        className="w-full text-left p-2.5 hover:bg-paper/80 border-b border-rule last:border-b-0 flex items-center justify-between"
                      >
                        <div>
                          <p className="text-sm font-bold text-ink">{p.name}</p>
                          <p className="font-mono text-xs text-ink-2">
                            UHID: <span className="text-accent-ink font-bold">{p.patientId}</span>
                            {` · ${p.ageYears}y`}
                          </p>
                        </div>
                        <span className="text-xs bg-accent/10 border border-accent/30 text-accent-ink font-semibold px-2 py-0.5">
                          Select ↵
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {selectedPatientRef ? (
                  <div className="mt-2 flex items-center justify-between text-xs text-accent-ink font-semibold bg-accent/10 px-2 py-1">
                    <span>✓ Linked to Central Patient: <b>{selectedPatientRef.name}</b> ({selectedPatientRef.patientId})</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPatientRef(null)}
                      className="text-ink-3 hover:text-alert underline"
                    >
                      Clear link
                    </button>
                  </div>
                ) : (
                  <label className="mt-2 flex min-h-11 items-center gap-2 text-xs text-ink-2">
                    <input type="checkbox" checked={externalOrder} onChange={(e) => setExternalOrder(e.target.checked)} />
                    <span>External requisition: this patient is not registered at the front desk. Enter the details below.</span>
                  </label>
                )}
                {selectedPatientRef && (
                  <div className="mt-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">Visit (encounter) *</label>
                    <select
                      required
                      value={selectedEncounterId}
                      onChange={(e) => setSelectedEncounterId(e.target.value)}
                      className="w-full min-h-11 border border-rule bg-paper px-3 text-sm text-ink"
                    >
                      {selectedPatientRef.encounters.length === 0 && <option value="">No visits on record, register one at the front desk</option>}
                      {selectedPatientRef.encounters.map((en) => (
                        <option key={en.id} value={en.id}>{en.date} {en.time} · {en.doctorName}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Patient Demographics */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                    Patient Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Meera Natarajan"
                    value={newPatientName}
                    readOnly={!!selectedPatientRef}
                    onChange={(e) => setNewPatientName(e.target.value)}
                    className="w-full min-h-11 border border-rule bg-paper px-3 text-sm text-ink font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                    Age & Gender *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      required
                      min={1}
                      max={120}
                      value={newPatientAge}
                      readOnly={!!selectedPatientRef}
                      onChange={(e) => setNewPatientAge(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-16 min-h-11 border border-rule bg-paper px-2 text-sm text-ink text-center"
                    />
                    <select
                      required
                      value={newPatientGender}
                      onChange={(e) => setNewPatientGender(e.target.value as '' | 'M' | 'F' | 'O')}
                      className="flex-1 min-h-11 border border-rule bg-paper px-2 text-sm text-ink"
                    >
                      <option value="">Select</option>
                      <option value="M">Male</option>
                      <option value="F">Female</option>
                      <option value="O">Other</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Hospital identifiers */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                    Patient UHID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 618135"
                    value={newUhid}
                    onChange={(e) => setNewUhid(e.target.value)}
                    className="w-full min-h-11 border border-rule bg-paper px-3 font-mono text-sm text-ink"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                    Visit No (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 3882620"
                    value={newVisitNo}
                    onChange={(e) => setNewVisitNo(e.target.value)}
                    className="w-full min-h-11 border border-rule bg-paper px-3 font-mono text-sm text-ink"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                    Patient Care Type
                  </label>
                  <select
                    value={newOpIp}
                    onChange={(e) => setNewOpIp(e.target.value as 'OP' | 'IP')}
                    className="w-full min-h-11 border border-rule bg-paper px-3 text-sm text-ink"
                  >
                    <option value="IP">IP (Inpatient)</option>
                    <option value="OP">OP (Outpatient)</option>
                  </select>
                </div>
              </div>

              {/* Test Selection */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Requested Diagnostic Test Panel *
                </label>
                <select
                  required
                  value={newTestName}
                  onChange={(e) => setNewTestName(e.target.value)}
                  className="w-full min-h-11 border border-rule bg-paper px-3 text-sm text-ink font-medium"
                >
                  <option value="">Choose test…</option>
                  {testsByCategory().map(([category, names]) => (
                    <optgroup key={category} label={category}>
                      {names.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {newTestName && (
                  <p className="mt-1 text-[11px] text-ink-3">
                    {TEST_TEMPLATES[newTestName]?.department} · Specimen: {TEST_TEMPLATES[newTestName]?.sampleType} · Container: {TEST_TEMPLATES[newTestName]?.container}
                  </p>
                )}
              </div>

              {/* Ordering Physician */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Ordering Clinician / Department *
                </label>
                <select
                  value={newDoctor}
                  onChange={(e) => setNewDoctor(e.target.value)}
                  className="w-full min-h-11 border border-rule bg-paper px-3 text-sm text-ink"
                >
                  {doctors.length === 0 && <option value="">No doctors registered</option>}
                  {doctors.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Requisition Urgency / Priority *
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-ink cursor-pointer">
                    <input
                      type="radio"
                      name="priority"
                      value="routine"
                      checked={newPriority === 'routine'}
                      onChange={() => setNewPriority('routine')}
                      className="accent-accent"
                    />
                    Routine Outpatient
                  </label>
                  <label className="flex items-center gap-2 text-sm font-bold text-alert cursor-pointer">
                    <input
                      type="radio"
                      name="priority"
                      value="urgent"
                      checked={newPriority === 'urgent'}
                      onChange={() => setNewPriority('urgent')}
                      className="accent-alert"
                    />
                    STAT / Emergency Urgent
                  </label>
                </div>
              </div>

              {/* Clinical Handling Note */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink-3 mb-1">
                  Clinical Indications / Handling Remarks (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newHandlingNote}
                  onChange={(e) => setNewHandlingNote(e.target.value)}
                  placeholder="e.g. Fasting sample verified. Patient on metformin 500mg BD. Rule out acute kidney injury."
                  className="w-full border border-rule bg-paper p-3 text-sm text-ink"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-rule pt-4">
                <button
                  type="button"
                  onClick={() => onClose()}
                  className="min-h-11 border border-rule px-4 text-xs font-semibold text-ink-2 hover:bg-paper"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-11 bg-accent px-6 text-xs font-semibold text-surface hover:bg-accent-ink"
                >
                  Create & Dispatch Requisition
                </button>
              </div>
            </form>
          </div>
        </div>
  )
}
