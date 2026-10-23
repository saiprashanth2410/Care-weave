import React, { useState } from 'react';
import { Check } from '../icons';
import { api } from '../api';
import type { Patient } from '../types';
import { Modal } from '../components';

export function SOAPEncounterModal({ patient, onClose, onSaved }: { patient: Patient; onClose: () => void; onSaved: () => void }) {
  const [diagnosis, setDiagnosis] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const fullNotes = `CHIEF COMPLAINT: ${chiefComplaint}\n\nS: ${subjective}\nO: ${objective}\nA: ${assessment}\nP: ${plan}`;
      await api.createEncounter({
        patientId: patient.id,
        diagnosis,
        notes: fullNotes,
        chiefComplaint,
        subjective,
        objective,
        assessment,
        plan
      });
      onSaved();
    } catch {
      //
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Clinical Encounter: ${patient.name}`} sub={`${patient.patientId} · Document Findings`} onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Chief Complaint
          <input required value={chiefComplaint} onChange={e => setChiefComplaint(e.target.value)} placeholder="Reason for encounter…" />
        </label>
        <label className="span-2">
          Diagnosis / Assessment
          <input required value={diagnosis} onChange={e => setDiagnosis(e.target.value)} placeholder="Primary clinical diagnosis…" />
        </label>
        <label className="span-2">
          [S] Subjective Findings
          <textarea required rows={2} value={subjective} onChange={e => setSubjective(e.target.value)} placeholder="Symptoms, history, patient statements…" />
        </label>
        <label className="span-2">
          [O] Objective Findings
          <textarea required rows={2} value={objective} onChange={e => setObjective(e.target.value)} placeholder="Physical exam, clinical observations…" />
        </label>
        <label className="span-2">
          [A] Assessment
          <textarea required rows={2} value={assessment} onChange={e => setAssessment(e.target.value)} placeholder="Clinical evaluation, differential diagnosis…" />
        </label>
        <label className="span-2">
          [P] Care Plan
          <textarea required rows={2} value={plan} onChange={e => setPlan(e.target.value)} placeholder="Therapy, lab orders, follow-up schedule…" />
        </label>
        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Sign & Record Encounter'}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
