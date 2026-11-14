import React, { useEffect, useState } from 'react';
import { AlertTriangle, TestTube2 } from '../icons';
import { api } from '../api';
import type { Patient } from '../types';
import { Modal } from '../components';
import { TEST_TEMPLATES, testsByCategory } from '@/portals/lab/testCatalog';

export function OrderLabModal({ patient: initPatient, onClose, onSaved }: { patient?: Patient; onClose: () => void; onSaved: () => void }) {
  const [patients, setPatients] = useState<Patient[]>(initPatient ? [initPatient] : []);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(initPatient || null);
  const [testName, setTestName] = useState('');
  const [sampleType, setSampleType] = useState('');
  const [priority, setPriority] = useState('Routine');
  const [clinicalIndication, setClinicalIndication] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!initPatient) api.patients().then(setPatients).catch(() => {});
  }, [initPatient]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return setError('Please select a patient');
    setBusy(true);
    setError('');
    try {
      await api.createLabOrder({
        patientId: selectedPatient.id,
        testName,
        department: TEST_TEMPLATES[testName]?.department,
        sampleContainer: TEST_TEMPLATES[testName]?.container,
        sampleType,
        priority,
        clinicalIndication
      });
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Order Diagnostic Test / Imaging" sub="Physician diagnostic requisition" onClose={onClose}>
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

        <label className="span-2">
          Diagnostic Test Panel
          <select
            required
            value={testName}
            onChange={e => {
              setTestName(e.target.value);
              setSampleType(TEST_TEMPLATES[e.target.value]?.sampleType ?? '');
            }}
          >
            <option value="">Choose test…</option>
            {testsByCategory().map(([category, names]) => (
              <optgroup key={category} label={category}>
                {names.map(name => <option key={name} value={name}>{name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>

        <label>
          Sample / Modality
          <input value={sampleType} onChange={e => setSampleType(e.target.value)} required />
        </label>

        <label>
          Clinical Priority
          <select value={priority} onChange={e => setPriority(e.target.value)}>
            <option>Routine</option>
            <option>Urgent (Within 24h)</option>
            <option>STAT (Immediate)</option>
          </select>
        </label>

        <label className="span-2">
          Clinical Indication / Diagnostic Reason
          <input
            required
            value={clinicalIndication}
            onChange={e => setClinicalIndication(e.target.value)}
            placeholder="e.g. Unexplained fatigue, monitoring glycemic control, rule out anemia"
          />
        </label>

        {error && <div className="alert danger span-2"><AlertTriangle size={16} />{error}</div>}

        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>
            {busy ? 'Transmitting…' : 'Transmit Diagnostic Requisition'}
            <TestTube2 size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
