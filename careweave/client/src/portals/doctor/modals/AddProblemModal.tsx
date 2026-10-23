import React, { useState } from 'react';
import { api } from '../api';
import type { Patient } from '../types';
import { Modal } from '../components';

export function AddProblemModal({ patient, onClose, onSaved }: { patient: Patient; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'Active' | 'Resolved' | 'Chronic'>('Active');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.addProblem(patient.id, { name, code, status });
      onSaved();
    } catch {
      //
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Add Chronic Condition: ${patient.name}`} sub="Update clinical problem list" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Condition / Diagnosis Name
          <input required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Type 2 Diabetes Mellitus" />
        </label>
        <label>
          ICD-10 Code
          <input required value={code} onChange={e => setCode(e.target.value)} placeholder="e.g. E11.9, I10" />
        </label>
        <label>
          Clinical Status
          <select value={status} onChange={e => setStatus(e.target.value as any)}>
            <option>Active</option>
            <option>Chronic</option>
            <option>Resolved</option>
          </select>
        </label>
        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Record Diagnosis'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
