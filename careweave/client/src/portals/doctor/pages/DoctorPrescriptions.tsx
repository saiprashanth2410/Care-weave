import { useEffect, useState } from 'react';
import { AlertTriangle, FileText, Plus } from '../icons';
import { api } from '../api';
import type { Patient, PatientRecord } from '../types';
import { fmtDate } from '../helpers';
import { PageHeader } from '../components';

export function DoctorPrescriptions({
  notify,
  onPrescribe,
  onOpenPatient: _onOpenPatient
}: {
  notify: (s: string) => void;
  onPrescribe: () => void;
  onOpenPatient: (p: Patient) => void;
}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [record, setRecord] = useState<PatientRecord | null>(null);

  useEffect(() => {
    api.patients().then(res => {
      setPatients(res);
      if (res.length > 0) setSelectedPatientId(res[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      api.patient(selectedPatientId).then(setRecord).catch(() => {});
    }
  }, [selectedPatientId]);

  return (
    <>
      <PageHeader
        eyebrow="Pharmacotherapy & Safety"
        title="E-Prescriptions & Active Meds"
        sub="Physician-authorized electronic prescriptions with automatic allergy cross-checking and refill management."
        action={
          <button className="primary" onClick={onPrescribe}>
            <Plus size={16} /> New E-Prescription
          </button>
        }
      />

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <b>Select Patient Record:</b>
          <select
            value={selectedPatientId}
            onChange={e => setSelectedPatientId(e.target.value)}
            style={{ minWidth: 260 }}
          >
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.patientId})</option>
            ))}
          </select>
        </div>
      </div>

      {record && (
        <>
          {/* ALLERGY WARNING BANNER */}
          {record.allergies && record.allergies.length > 0 && (
            <div className="allergy-alert-banner">
              <AlertTriangle size={18} />
              <div>
                <b>ALLERGY SAFETY ALERT FOR {record.name.toUpperCase()}:</b>
                <div>
                  Patient has documented adverse reactions to:{' '}
                  {record.allergies.map(a => `${a.allergen} (${a.reaction})`).join('; ')}.
                  Verify cross-reactivity before authorizing new medications.
                </div>
              </div>
            </div>
          )}

          <div className="card table-card">
            <table>
              <thead>
                <tr>
                  <th>Medication & Strength</th>
                  <th>Route / Instructions</th>
                  <th>Duration</th>
                  <th>Prescribed Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {record.prescriptions.map(p => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.medicine}</b>
                      <small className="block">{p.dosage}</small>
                    </td>
                    <td>{p.route} · {p.frequency}</td>
                    <td>{p.duration}</td>
                    <td>{fmtDate(p.date)}</td>
                    <td>
                      <span className={p.status === 'Discontinued' ? 'rx-discontinued-tag' : 'rx-active-tag'}>
                        {p.status || 'Active'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {p.status !== 'Discontinued' ? (
                          <button
                            className="secondary small-btn"
                            onClick={async () => {
                              if (window.confirm(`Discontinue ${p.medicine}?`)) {
                                await api.updatePrescription(p.id, { status: 'Discontinued', discontinueReason: 'Course completed' });
                                notify('Prescription updated');
                                api.patient(record.id).then(setRecord);
                              }
                            }}
                          >
                            Discontinue
                          </button>
                        ) : (
                          <span className="mono" style={{ fontSize: 11, color: '#56655f' }}>Discontinued</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {record.prescriptions.length === 0 && (
              <div className="empty">
                <FileText size={28} />
                <b>No active prescriptions on file</b>
                <span>Click "New E-Prescription" above to write an order.</span>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
