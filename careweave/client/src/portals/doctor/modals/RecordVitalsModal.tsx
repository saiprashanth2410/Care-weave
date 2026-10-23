import React, { useState } from 'react';
import { AlertTriangle, Check } from '../icons';
import { api } from '../api';
import type { Patient } from '../types';
import { Modal } from '../components';

export function RecordVitalsModal({ patient, onClose, onSaved }: { patient: Patient; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({ bpSystolic: '', bpDiastolic: '', heartRate: '', tempF: '', respRate: '', spo2: '', bmi: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // Only what was measured is sent. Empty boxes stay empty.
    const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Number(v)]));
    if (!Object.keys(body).length) { setError('Enter at least one measurement'); return; }
    setBusy(true);
    try {
      await api.addVitals(patient.id, body as any);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Record Vitals: ${patient.name}`} sub="Clinical examination measurements" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label>
          Blood Pressure (Systolic)
          <input
            type="number"
            value={form.bpSystolic}
            onChange={e => setForm({ ...form, bpSystolic: e.target.value })}
            required
          />
        </label>
        <label>
          Blood Pressure (Diastolic)
          <input
            type="number"
            value={form.bpDiastolic}
            onChange={e => setForm({ ...form, bpDiastolic: e.target.value })}
            required
          />
        </label>
        <label>
          Heart Rate (bpm)
          <input
            type="number"
            value={form.heartRate}
            onChange={e => setForm({ ...form, heartRate: e.target.value })}
            required
          />
        </label>
        <label>
          Body Temp (°F)
          <input
            type="number"
            step="0.1"
            value={form.tempF}
            onChange={e => setForm({ ...form, tempF: e.target.value })}
            required
          />
        </label>
        <label>
          Oxygen Saturation SpO2 (%)
          <input
            type="number"
            value={form.spo2}
            onChange={e => setForm({ ...form, spo2: e.target.value })}
            required
          />
        </label>
        <label>
          Body Mass Index (BMI)
          <input
            type="number"
            step="0.1"
            value={form.bmi}
            onChange={e => setForm({ ...form, bmi: e.target.value })}
            required
          />
        </label>
        {error && <div className="alert danger span-2"><AlertTriangle size={16} />{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Record Vitals'}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
