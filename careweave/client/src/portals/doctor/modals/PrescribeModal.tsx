import React, { useEffect, useState } from 'react';
import { AlertTriangle, FileText } from '../icons';
import { api } from '../api';
import type { CollisionAlert, DuplicateOverride, Patient } from '../types';
import { Modal } from '../components';
import { MedicineInput } from './MedicineInput';
import { DuplicateTherapyModal } from './DuplicateTherapyModal';

/** One medicine of the prescription. Nothing is pre-filled: the doctor chooses every drug. */
type Row = {
  key: number;
  medicine: string;
  dosage: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
  refills: number;
  /** What the server asked this row to decide before it can be saved. */
  allergyBlock: string;
  allergyReason: string;
  dupAlerts: CollisionAlert[] | null;
  dupOverride: DuplicateOverride | null;
};

let nextKey = 1;
const blankRow = (over: Partial<Row> = {}): Row => ({
  key: nextKey++, medicine: '', dosage: '', route: 'Oral', frequency: '', duration: '', instructions: '', refills: 0,
  allergyBlock: '', allergyReason: '', dupAlerts: null, dupOverride: null, ...over,
});
/** A row whose drug or dose changed has to be checked again, so what the server said about it earlier is dropped. */
const cleared = { allergyBlock: '', allergyReason: '', dupAlerts: null, dupOverride: null } as const;

const MAX_ROWS = 15;
const POPULAR = [
  { name: 'Metformin HCl', dose: '500 mg', route: 'Oral', freq: 'Twice daily with meals' },
  { name: 'Lisinopril', dose: '10 mg', route: 'Oral', freq: 'Once daily' },
  { name: 'Atorvastatin Calcium', dose: '20 mg', route: 'Oral', freq: 'Once daily at bedtime' },
  { name: 'Amlodipine Besylate', dose: '5 mg', route: 'Oral', freq: 'Once daily' },
  { name: 'Levothyroxine Sodium', dose: '50 mcg', route: 'Oral', freq: 'Once daily in morning before food' },
  { name: 'Amoxicillin', dose: '500 mg', route: 'Oral', freq: 'Every 8 hours' },
  { name: 'Omeprazole', dose: '20 mg', route: 'Oral', freq: 'Once daily before breakfast' },
  { name: 'Ferrous Sulfate', dose: '325 mg', route: 'Oral', freq: 'Once daily with Vitamin C' },
];

const COLUMNS = 'minmax(190px, 2.2fr) minmax(90px, 1fr) 108px minmax(120px, 1.3fr) minmax(90px, 1fr) 36px';

export function PrescribeModal({ patient: initPatient, onClose, onSaved }: { patient?: Patient; onClose: () => void; onSaved: () => void }) {
  const [patients, setPatients] = useState<Patient[]>(initPatient ? [initPatient] : []);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initPatient || null);
  const [rows, setRows] = useState<Row[]>(() => [blankRow()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The row whose duplicate-therapy warning is open
  const [reviewing, setReviewing] = useState<number | null>(null);

  useEffect(() => {
    if (!initPatient) api.patients().then(setPatients).catch(() => {});
  }, [initPatient]);

  const patch = (key: number, changes: Partial<Row>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...changes } : r)));
  /** Returns the new row's key. The row is made here, not inside the state update, so its key is not drawn twice. */
  const addRow = (over: Partial<Row> = {}) => {
    const row = blankRow(over);
    setRows(rs => (rs.length >= MAX_ROWS ? rs : [...rs, row]));
    return row.key;
  };
  const removeRow = (key: number) => setRows(rs => (rs.length > 1 ? rs.filter(r => r.key !== key) : rs));

  /** Checks a chosen medicine against what the patient already takes and the other medicines in this prescription. */
  const checkDuplicates = async (rowKey: number, medicine: string, dosage: string, frequency: string) => {
    if (!selectedPatient || medicine.trim().length < 3) return;
    const others = rows.filter(r => r.key !== rowKey && r.medicine.trim()).map(r => ({ medicine: r.medicine, dosage: r.dosage, frequency: r.frequency, duration: r.duration }));
    try {
      const r = await api.validatePrescription({ patientId: selectedPatient.id, medicine, dosage, frequency, alsoPrescribing: others });
      if (r.alerts.some(a => a.severity === 'HIGH_COLLISION')) { patch(rowKey, { dupAlerts: r.alerts }); setReviewing(rowKey); }
    } catch { /* the server checks again when the prescription is signed */ }
  };

  const addPreset = (name: string) => {
    const m = POPULAR.find(x => x.name === name);
    if (!m) return;
    const blank = rows.find(r => !r.medicine.trim() && !r.dosage.trim() && !r.frequency.trim());
    const fill = { medicine: m.name, dosage: m.dose, route: m.route, frequency: m.freq };
    let key: number;
    if (blank) { key = blank.key; patch(blank.key, { ...fill, ...cleared }); } else { key = addRow(fill); }
    void checkDuplicates(key, m.name, m.dose, m.freq);
  };

  const needsDecision = rows.some(r => r.allergyBlock || r.dupAlerts);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return setError('Please select a patient');
    const filled = rows.filter(r => r.medicine.trim() || r.dosage.trim() || r.frequency.trim());
    if (!filled.length) return setError('Add at least one medicine.');
    const incomplete = filled.findIndex(r => !r.medicine.trim() || !r.dosage.trim() || !r.frequency.trim());
    if (incomplete >= 0) return setError(`Medicine ${rows.indexOf(filled[incomplete]) + 1}: give the name, dosage and frequency.`);
    const short = filled.find(r => r.allergyBlock && r.allergyReason.trim().length < 15);
    if (short) return setError('Give a reason (at least 15 characters) to prescribe despite the allergy.');
    setBusy(true);
    setError('');
    try {
      await api.createPrescriptions({
        patientId: selectedPatient.id,
        medicines: filled.map(r => ({
          medicine: r.medicine, dosage: r.dosage, route: r.route, frequency: r.frequency, duration: r.duration, instructions: r.instructions, refills: r.refills,
          ...(r.allergyBlock ? { allergyOverrideReason: r.allergyReason.trim() } : {}),
          ...(r.dupOverride ? { duplicateOverride: r.dupOverride } : {}),
        })),
      });
      onSaved();
    } catch (err: any) {
      if (err.body?.code === 'PRESCRIPTION_BLOCKED') {
        // Nothing was saved. Mark each row that needs a decision; the rest stay as they are.
        const next = [...filled];
        setRows(rs => rs.map(r => {
          const at = next.indexOf(r);
          const hit = (err.body.blocked as { index: number; kind: string; error: string; alerts?: CollisionAlert[] }[]).filter(b => b.index === at);
          if (!hit.length) return r;
          return {
            ...r,
            allergyBlock: hit.find(b => b.kind === 'allergy')?.error ?? '',
            dupAlerts: hit.find(b => b.kind === 'duplicate')?.alerts ?? null,
          };
        }));
        setError('Some medicines need your decision. Nothing has been saved yet.');
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const reviewRow = rows.find(r => r.key === reviewing) ?? null;

  return (
    <Modal title="Authorize E-Prescription" sub="Electronic prescription with drug allergy and duplicate-therapy verification" onClose={onClose} wide>
      <form className="form-grid" onSubmit={submit}>
        <div className="span-2">
          <label>Patient</label>
          {initPatient ? (
            <div className="selected-patient">
              <b>{initPatient.name}</b> <span className="mono">{initPatient.patientId}</span>
            </div>
          ) : (
            <select
              required
              value={selectedPatient?.id || ''}
              onChange={e => setSelectedPatient(patients.find(p => p.id === e.target.value) || null)}
            >
              <option value="">Choose patient…</option>
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.patientId})</option>
              ))}
            </select>
          )}
        </div>

        <div className="span-2 rx-section">
          <div className="rx-bar">
            <b>Medicines ({rows.length})</b>
            <span className="rx-bar-actions">
              <select
                aria-label="Add a common medicine"
                value=""
                onChange={e => addPreset(e.target.value)}
                disabled={rows.length >= MAX_ROWS}
              >
                <option value="">+ Add a common medicine…</option>
                {POPULAR.map(m => <option key={m.name} value={m.name}>{m.name} {m.dose} ({m.freq})</option>)}
              </select>
              <button type="button" className="secondary small-btn" onClick={() => addRow()} disabled={rows.length >= MAX_ROWS}>+ Add row</button>
            </span>
          </div>

          <div className="rx-head" style={{ gridTemplateColumns: COLUMNS }}>
            <span>Medicine name *</span><span>Dosage *</span><span>Route</span><span>Frequency *</span><span>Duration</span><span />
          </div>

          {rows.map((r, i) => (
            <div className="rx-row" key={r.key} data-row={i + 1}>
              <div className="rx-line" style={{ gridTemplateColumns: COLUMNS }}>
                <MedicineInput
                  compact
                  value={r.medicine}
                  onChange={medicine => patch(r.key, { medicine, ...cleared })}
                  onPick={m => {
                    const dosage = m.strength || r.dosage;
                    patch(r.key, { medicine: m.name, dosage, route: m.route || r.route, ...cleared });
                    void checkDuplicates(r.key, m.name, dosage, r.frequency);
                  }}
                />
                <input aria-label={`Dosage for medicine ${i + 1}`} placeholder="500 mg" value={r.dosage} onChange={e => patch(r.key, { dosage: e.target.value, ...cleared })} />
                <select aria-label={`Route for medicine ${i + 1}`} value={r.route} onChange={e => patch(r.key, { route: e.target.value })}>
                  <option>Oral</option><option>Subcutaneous</option><option>Inhalation</option><option>Topical</option><option>Intravenous</option>
                </select>
                <input aria-label={`Frequency for medicine ${i + 1}`} placeholder="1-0-1 / twice daily" value={r.frequency} onChange={e => patch(r.key, { frequency: e.target.value, ...cleared })} />
                <input aria-label={`Duration for medicine ${i + 1}`} placeholder="5 days" value={r.duration} onChange={e => patch(r.key, { duration: e.target.value })} />
                <button
                  type="button"
                  className="rx-remove"
                  aria-label={`Remove medicine ${i + 1}`}
                  title="Remove this medicine"
                  onClick={() => removeRow(r.key)}
                  disabled={rows.length === 1}
                >
                  🗑
                </button>
              </div>
              <div className="rx-line2">
                <input aria-label={`Instructions for medicine ${i + 1}`} placeholder="Instructions (e.g. after food)" value={r.instructions} onChange={e => patch(r.key, { instructions: e.target.value })} />
                <label className="rx-refills">
                  Refills
                  <input aria-label={`Refills for medicine ${i + 1}`} type="number" min="0" max="12" value={r.refills} onChange={e => patch(r.key, { refills: Number(e.target.value) })} />
                </label>
              </div>

              {r.allergyBlock && (
                <div className="rx-alert">
                  <div className="alert danger"><AlertTriangle size={16} /><span><b>ALLERGY ALERT:</b> {r.allergyBlock}</span></div>
                  <label>
                    Reason for prescribing despite the allergy
                    <textarea value={r.allergyReason} onChange={e => patch(r.key, { allergyReason: e.target.value })} />
                  </label>
                </div>
              )}
              {r.dupAlerts && (
                <div className="rx-alert">
                  <div className="alert warning">
                    <AlertTriangle size={16} />
                    <span><b>Duplicate therapy:</b> this repeats a medicine the patient already takes{rows.length > 1 ? ' or another in this prescription' : ''}.</span>
                    <button type="button" className="secondary small-btn" onClick={() => setReviewing(r.key)}>Review</button>
                  </div>
                </div>
              )}
              {r.dupOverride && !r.dupAlerts && <p className="muted rx-note">Duplicate-therapy override recorded for this medicine.</p>}
            </div>
          ))}
        </div>

        {error && <div className="alert danger span-2" role="alert"><AlertTriangle size={16} />{error}</div>}

        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !selectedPatient}>
            {busy ? 'Authorizing…' : needsDecision ? 'Sign & Transmit with my decisions' : `Sign & Transmit E-Prescription${rows.length > 1 ? ` (${rows.length} medicines)` : ''}`}
            <FileText size={16} />
          </button>
        </div>
      </form>

      {reviewRow?.dupAlerts && (
        <DuplicateTherapyModal
          alerts={reviewRow.dupAlerts}
          dosage={reviewRow.dosage}
          onCancel={() => { patch(reviewRow.key, { medicine: '', dosage: '', frequency: '', ...cleared }); setReviewing(null); }}
          onOverride={o => { patch(reviewRow.key, { dupOverride: o, dupAlerts: null }); setReviewing(null); }}
        />
      )}
    </Modal>
  );
}
