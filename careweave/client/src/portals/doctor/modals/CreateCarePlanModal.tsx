import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { Patient } from '../types';
import { Modal } from '../components';

export function CreateCarePlanModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [goalText, setGoalText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.patients().then(setPatients).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientId) return setError('Choose the patient this plan is for');
    setBusy(true);
    setError('');
    try {
      await api.createCarePlan({
        patientId,
        title,
        category,
        goals: goalText.split('\n').filter(Boolean),
        // No targets are invented: measured values belong to the patient's record, not to a template.
        targets: []
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Enroll Patient in Chronic Protocol" sub="Evidence-based care pathway" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Patient
          <select required value={patientId} onChange={e => setPatientId(e.target.value)}>
            <option value="">Choose patient…</option>
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.patientId})</option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Care Protocol Title
          <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Hypertension control pathway" />
        </label>
        <label className="span-2">
          Category
          <input required value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Cardiovascular" />
        </label>
        <label className="span-2">
          Protocol Goals (one per line)
          <textarea required rows={3} value={goalText} onChange={e => setGoalText(e.target.value)} placeholder={'One goal per line, e.g.\nBlood pressure below 130/80\nDaily home readings'} />
        </label>
        {error && <div className="alert danger span-2">{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? 'Enrolling…' : 'Enroll Patient'}</button>
        </div>
      </form>
    </Modal>
  );
}
