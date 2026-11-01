import React, { useState } from 'react';
import { AlertTriangle, Check, ShieldCheck, X } from '../icons';
import { api } from '../api';
import type { Patient } from '../types';
import { fmtDate } from '../helpers';

// ─── EDIT PATIENT DEMOGRAPHICS MODAL ───────────────────────────────────────
export default function EditPatientModal({
  patient,
  onClose,
  onSaved
}: {
  patient: Patient;
  onClose: () => void;
  onSaved: (p: Patient) => void;
}) {
  const [form, setForm] = useState({
    name: patient.name,
    phone: patient.phone,
    email: patient.email || '',
    emergencyContact: patient.emergencyContact || ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const update = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // version lets the server refuse the save if someone else changed this patient while the form was open.
      const res = await api.updatePatient(patient.id, { ...form, version: patient.version });
      onSaved(res);
    } catch (e: any) {
      setError(e.message || 'Failed to update demographics');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Edit Contact Demographics</h2>
            <p className="muted">{patient.name} · {patient.patientId}</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="notice" style={{ marginBottom: 14 }}>
          <ShieldCheck size={16} />
          <span>Date of birth ({fmtDate(patient.dob)}) is protected against arbitrary changes.</span>
        </div>

        <form className="form-grid" onSubmit={submit}>
          <label className="span-2">
            Full Name
            <input required value={form.name} onChange={update('name')} />
          </label>

          <label>
            Phone Number
            <input required value={form.phone} onChange={update('phone')} />
          </label>

          <label>
            Email Address
            <input type="email" value={form.email} onChange={update('email')} />
          </label>

          <label className="span-2">
            Emergency Contact
            <input value={form.emergencyContact} onChange={update('emergencyContact')} />
          </label>

          {error && (
            <div className="alert danger span-2">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="modal-actions span-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save Demographic Changes'}
              <Check size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
