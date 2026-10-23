import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { Patient } from '../types';
import { Modal } from '../components';

export function CreateCarePlanModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [title, setTitle] = useState('Type 2 Diabetes Glycemic Control Pathway');
  const [category, setCategory] = useState('Endocrine Management');
  const [goalText, setGoalText] = useState('Maintain HbA1c < 7.0%\nDaily fasting blood glucose monitoring\nNutritional consultation');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.patients().then(res => {
      setPatients(res);
      if (res.length > 0) setPatientId(res[0].id);
    }).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createCarePlan({
        patientId,
        title,
        category,
        goals: goalText.split('\n').filter(Boolean),
        targets: [
          { metric: 'HbA1c', target: '< 7.0%', current: '7.8%', status: 'needs-attention' },
          { metric: 'Blood Pressure', target: '< 130/80', current: '136/84', status: 'needs-attention' }
        ]
      });
      onSaved();
    } catch {
      //
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Enroll Patient in Chronic Protocol" sub="Evidence-based care pathway" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Patient
          <select value={patientId} onChange={e => setPatientId(e.target.value)}>
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.patientId})</option>
            ))}
          </select>
        </label>
        <label className="span-2">
          Care Protocol Title
          <input required value={title} onChange={e => setTitle(e.target.value)} />
        </label>
        <label className="span-2">
          Category
          <input required value={category} onChange={e => setCategory(e.target.value)} />
        </label>
        <label className="span-2">
          Protocol Goals (one per line)
          <textarea required rows={3} value={goalText} onChange={e => setGoalText(e.target.value)} />
        </label>
        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>Enroll Patient</button>
        </div>
      </form>
    </Modal>
  );
}
