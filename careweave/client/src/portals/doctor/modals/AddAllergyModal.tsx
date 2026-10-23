import React, { useState } from 'react';
import { api } from '../api';
import type { Patient } from '../types';
import { Modal } from '../components';

export function AddAllergyModal({ patient, onClose, onSaved }: { patient: Patient; onClose: () => void; onSaved: () => void }) {
  const [allergen, setAllergen] = useState('');
  const [severity, setSeverity] = useState<'Mild' | 'Moderate' | 'Severe / Anaphylaxis'>('Moderate');
  const [reaction, setReaction] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.addAllergy(patient.id, { allergen, severity, reaction });
      onSaved();
    } catch {
      //
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Document Allergy: ${patient.name}`} sub="Clinical safety warning" onClose={onClose}>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Allergen / Substance Name
          <input required value={allergen} onChange={e => setAllergen(e.target.value)} placeholder="e.g. Penicillin, Codeine, Peanuts" />
        </label>
        <label>
          Clinical Severity
          <select value={severity} onChange={e => setSeverity(e.target.value as any)}>
            <option>Mild</option>
            <option>Moderate</option>
            <option>Severe / Anaphylaxis</option>
          </select>
        </label>
        <label className="span-2">
          Clinical Reaction Details
          <input required value={reaction} onChange={e => setReaction(e.target.value)} placeholder="e.g. Urticaria, bronchospasm, angioedema" />
        </label>
        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Add to Allergy Record'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
