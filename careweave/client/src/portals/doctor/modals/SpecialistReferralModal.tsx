import React, { useEffect, useState } from 'react';
import { AlertTriangle, ClipboardList } from '../icons';
import { api } from '../api';
import type { Patient } from '../types';
import { Modal } from '../components';

export function SpecialistReferralModal({ patient: initPatient, onClose, onSaved }: { patient?: Patient; onClose: () => void; onSaved: () => void }) {
  const [patients, setPatients] = useState<Patient[]>(initPatient ? [initPatient] : []);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initPatient || null);
  const [specialty, setSpecialty] = useState('Cardiology');
  const [providerName, setProviderName] = useState('Pacific Heart & Vascular Institute');
  const [priority, setPriority] = useState<'Routine' | 'Semi-urgent' | 'Urgent'>('Routine');
  const [reason, setReason] = useState('');
  const [clinicalSummary, setClinicalSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initPatient) api.patients().then(setPatients).catch(() => {});
  }, [initPatient]);

  const specialties = [
    { name: 'Cardiology', provider: 'Pacific Heart & Vascular Institute' },
    { name: 'Endocrinology', provider: 'Bay Area Metabolic & Diabetes Clinic' },
    { name: 'Hematology', provider: 'Bayview Hematology Specialists' },
    { name: 'Nephrology', provider: 'Northwest Kidney & Hypertension Group' },
    { name: 'Neurology', provider: 'Comprehensive Neuroscience Center' },
    { name: 'Gastroenterology', provider: 'Digestive Health Consultants' },
    { name: 'Physical Therapy', provider: 'Active Motion Rehabilitation' }
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return setError('Please select a patient');
    setBusy(true);
    try {
      await api.createReferral({
        patientId: selectedPatient.id,
        specialty,
        providerName,
        priority,
        reason,
        clinicalSummary
      });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Create Specialist Referral" sub="Outbound clinical consultation request" onClose={onClose}>
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

        <label>
          Medical Specialty
          <select
            value={specialty}
            onChange={e => {
              setSpecialty(e.target.value);
              const found = specialties.find(s => s.name === e.target.value);
              if (found) setProviderName(found.provider);
            }}
          >
            {specialties.map(s => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
        </label>

        <label>
          Referral Priority
          <select value={priority} onChange={e => setPriority(e.target.value as any)}>
            <option>Routine (Within 4-6 weeks)</option>
            <option>Semi-urgent (Within 1-2 weeks)</option>
            <option>Urgent (Within 48 hours)</option>
          </select>
        </label>

        <label className="span-2">
          Provider / Clinic Facility
          <input required value={providerName} onChange={e => setProviderName(e.target.value)} />
        </label>

        <label className="span-2">
          Reason for Consultation
          <input
            required
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Refractory anemia evaluation, echocardiogram interpretation"
          />
        </label>

        <label className="span-2">
          Clinical Summary & Relevant Findings
          <textarea
            required
            value={clinicalSummary}
            onChange={e => setClinicalSummary(e.target.value)}
            placeholder="Include recent lab trends, medication trials, past medical history…"
          />
        </label>

        {error && <div className="alert danger span-2"><AlertTriangle size={16} />{error}</div>}

        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>
            {busy ? 'Transmitting…' : 'Transmit Referral'}
            <ClipboardList size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
