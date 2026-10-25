import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, FileText } from '../icons';
import { api } from '../api';
import type { CollisionAlert, DuplicateOverride, Patient } from '../types';
import { Modal } from '../components';
import { MedicineInput } from './MedicineInput';
import { DuplicateTherapyModal } from './DuplicateTherapyModal';

export function PrescribeModal({ patient: initPatient, onClose, onSaved }: { patient?: Patient; onClose: () => void; onSaved: () => void }) {
  const [patients, setPatients] = useState<Patient[]>(initPatient ? [initPatient] : []);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initPatient || null);
  const [form, setForm] = useState({
    medicine: 'Metformin HCl',
    dosage: '500 mg',
    route: 'Oral',
    frequency: 'Twice daily with meals',
    duration: '90 days',
    instructions: 'Take with morning and evening meal to minimize gastrointestinal discomfort.',
    refills: 3
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initPatient) api.patients().then(setPatients).catch(() => {});
  }, [initPatient]);

  const popularMeds = [
    { name: 'Metformin HCl', dose: '500 mg', route: 'Oral', freq: 'Twice daily with meals' },
    { name: 'Lisinopril', dose: '10 mg', route: 'Oral', freq: 'Once daily' },
    { name: 'Atorvastatin Calcium', dose: '20 mg', route: 'Oral', freq: 'Once daily at bedtime' },
    { name: 'Amlodipine Besylate', dose: '5 mg', route: 'Oral', freq: 'Once daily' },
    { name: 'Levothyroxine Sodium', dose: '50 mcg', route: 'Oral', freq: 'Once daily in morning before food' },
    { name: 'Amoxicillin', dose: '500 mg', route: 'Oral', freq: 'Every 8 hours' },
    { name: 'Omeprazole', dose: '20 mg', route: 'Oral', freq: 'Once daily before breakfast' },
    { name: 'Ferrous Sulfate', dose: '325 mg', route: 'Oral', freq: 'Once daily with Vitamin C' }
  ];

  // The server checks the patient's recorded allergies. When it blocks a medicine, the doctor can send an override reason.
  const [allergyBlock, setAllergyBlock] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  // Duplicate therapy: the same molecule under another brand. Checked when a medicine is chosen, and again by the server on submit.
  const [collision, setCollision] = useState<CollisionAlert[] | null>(null);
  const [dupOverride, setDupOverride] = useState<DuplicateOverride | null>(null);
  const blockedOnSubmit = useRef(false);

  const checkDuplicates = async (medicine: string, dosage: string, frequency: string) => {
    if (!selectedPatient || medicine.trim().length < 3) return;
    try {
      const r = await api.validatePrescription({ patientId: selectedPatient.id, medicine, dosage, frequency });
      if (r.alerts.some(a => a.severity === 'HIGH_COLLISION')) setCollision(r.alerts);
    } catch { /* the server checks again when the prescription is signed */ }
  };
  const cancelOrder = () => {
    blockedOnSubmit.current = false;
    setCollision(null);
    setDupOverride(null);
    setForm(f => ({ ...f, medicine: '' }));
  };

  const submit = async (e?: React.FormEvent, override: DuplicateOverride | null = dupOverride) => {
    e?.preventDefault();
    if (!selectedPatient) return setError('Please select a patient');
    if (allergyBlock && overrideReason.trim().length < 5) return setError('Give a reason (at least 5 characters) to prescribe despite the allergy.');
    setBusy(true);
    setError('');
    try {
      await api.createPrescription({
        patientId: selectedPatient.id,
        ...form,
        ...(allergyBlock ? { allergyOverrideReason: overrideReason.trim() } : {}),
        ...(override ? { duplicateOverride: override } : {})
      });
      onSaved();
    } catch (err: any) {
      if (err.body?.code === 'DUPLICATE_THERAPY') {
        blockedOnSubmit.current = true;
        setCollision(err.body.alerts);
        setError('');
      } else if (String(err.message).startsWith('Allergy on record')) {
        setAllergyBlock(err.message);
        setError('');
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Authorize E-Prescription" sub="Electronic Prescription with Drug Allergy Verification" onClose={onClose}>
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

        {allergyBlock && (
          <div className="span-2">
            <div className="alert danger">
              <AlertTriangle size={18} />
              <span><b>ALLERGY ALERT:</b> {allergyBlock}</span>
            </div>
            <label>
              Reason for prescribing despite the allergy
              <textarea value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
            </label>
          </div>
        )}

        <label className="span-2">
          Quick Medication Presets
          <select
            onChange={e => {
              const found = popularMeds.find(m => m.name === e.target.value);
              if (found) {
                setDupOverride(null);
                setForm(f => ({ ...f, medicine: found.name, dosage: found.dose, route: found.route, frequency: found.freq }));
                checkDuplicates(found.name, found.dose, found.freq);
              }
            }}
          >
            <option value="">Select common therapeutic agent…</option>
            {popularMeds.map(m => (
              <option key={m.name} value={m.name}>{m.name} {m.dose} ({m.freq})</option>
            ))}
          </select>
        </label>

        <MedicineInput
          value={form.medicine}
          onChange={medicine => { setForm({ ...form, medicine }); setAllergyBlock(''); setDupOverride(null); }}
          onPick={m => { setAllergyBlock(''); setDupOverride(null); setForm(f => ({ ...f, medicine: m.name, dosage: m.strength || f.dosage, route: m.route || f.route })); checkDuplicates(m.name, m.strength || form.dosage, form.frequency); }}
        />

        <label>
          Dosage / Strength
          <input required value={form.dosage} onChange={e => setForm({ ...form, dosage: e.target.value })} />
        </label>

        <label>
          Route of Administration
          <select value={form.route} onChange={e => setForm({ ...form, route: e.target.value })}>
            <option>Oral</option>
            <option>Subcutaneous</option>
            <option>Inhalation</option>
            <option>Topical</option>
            <option>Intravenous</option>
          </select>
        </label>

        <label>
          Frequency
          <input required value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} />
        </label>

        <label>
          Duration
          <input required value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} />
        </label>

        <label>
          Refills Allowed
          <input type="number" min="0" max="11" value={form.refills} onChange={e => setForm({ ...form, refills: Number(e.target.value) })} />
        </label>

        <label className="span-2">
          Patient Instructions (Sig)
          <textarea value={form.instructions} onChange={e => setForm({ ...form, instructions: e.target.value })} />
        </label>

        {error && <div className="alert danger span-2"><AlertTriangle size={16} />{error}</div>}

        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>
            {busy ? 'Authorizing…' : 'Sign & Transmit E-Prescription'}
            <FileText size={16} />
          </button>
        </div>
      </form>
      {collision && (
        <DuplicateTherapyModal
          alerts={collision}
          dosage={form.dosage}
          onCancel={cancelOrder}
          onOverride={o => { setDupOverride(o); setCollision(null); if (blockedOnSubmit.current) { blockedOnSubmit.current = false; submit(undefined, o); } }}
        />
      )}
    </Modal>
  );
}
