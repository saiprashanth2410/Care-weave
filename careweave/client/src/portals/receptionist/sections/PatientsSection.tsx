import { useEffect, useState, useCallback } from 'react';
import { CalendarDays, ChevronRight, Pencil, Plus, Search, Users, X } from '../icons';
import { api } from '../api';
import type { Patient } from '../types';
import { fmtDate, initials, calculateAge } from '../helpers';
import PatientDrawer from '../components/PatientDrawer';
import EditPatientModal from '../modals/EditPatientModal';

// ─── RECEPTIONIST: PATIENT DIRECTORY ────────────────────────────────────────
export default function PatientsSection({
  refresh,
  notify,
  onRegister,
  onBookForPatient
}: {
  refresh: number;
  notify: (s: string) => void;
  onRegister: () => void;
  onBookForPatient: (p: Patient) => void;
}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);

  const loadPatients = useCallback(() => {
    api.patients(q)
      .then(setPatients)
      .catch(e => notify(e.message));
  }, [q, notify]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPatients();
    }, 150);
    return () => clearTimeout(timer);
  }, [loadPatients, refresh]);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">PATIENT ADMINISTRATION</p>
          <h1>Patient Directory</h1>
          <p className="muted">
            Search patient records, update contact demographics, and view administrative history.
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-primary" onClick={onRegister}>
            <Plus size={16} />
            <span>New Patient</span>
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search" style={{ minWidth: 360 }}>
          <Search size={16} />
          <input
            placeholder="Search by patient ID (CW-XXXXX), name, phone, or email…"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          {q && (
            <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setQ('')}>
              <X size={14} />
            </button>
          )}
        </div>
        <span className="muted" style={{ fontSize: 13 }}>
          {patients.length} registered patient{patients.length !== 1 ? 's' : ''} in directory
        </span>
      </div>

      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Patient Name</th>
              <th>CareWeave ID</th>
              <th>Date of Birth & Age</th>
              <th>Phone Number</th>
              <th>Email</th>
              <th>Emergency Contact</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {patients.map(p => (
              <tr key={p.id}>
                <td>
                  <div className="person">
                    <div className="avatar small">{initials(p.name)}</div>
                    <div>
                      <b>{p.name}</b>
                      {p.risk && <small style={{ color: '#d97706' }}>{p.risk}</small>}
                    </div>
                  </div>
                </td>
                <td>
                  <span className="mono" style={{ fontWeight: 600 }}>{p.patientId}</span>
                </td>
                <td>
                  <span>{fmtDate(p.dob)}</span>
                  <small style={{ color: 'var(--slate-400)', display: 'block', fontSize: 11 }}>
                    {calculateAge(p.dob)}
                  </small>
                </td>
                <td>{p.phone}</td>
                <td>{p.email || '—'}</td>
                <td>
                  <span style={{ fontSize: 12 }}>{p.emergencyContact || '—'}</span>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                    <button
                      className="btn-soft small-btn"
                      onClick={() => onBookForPatient(p)}
                      title="Schedule appointment"
                    >
                      <CalendarDays size={13} />
                      <span>Book</span>
                    </button>

                    <button
                      className="icon-btn"
                      onClick={() => setEditPatient(p)}
                      title="Edit demographic contact details"
                    >
                      <Pencil size={14} />
                    </button>

                    <button
                      className="icon-btn"
                      onClick={() => setSelectedPatient(p)}
                      title="View administrative profile drawer"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {patients.length === 0 && (
          <div className="empty">
            <Users size={32} />
            <b>No patients found matching your search</b>
            <span>Double check the patient ID or register a new patient file.</span>
          </div>
        )}
      </div>

      {selectedPatient && (
        <PatientDrawer
          patient={selectedPatient}
          onClose={() => setSelectedPatient(null)}
          onBookAppt={p => {
            setSelectedPatient(null);
            onBookForPatient(p);
          }}
          onEditPatient={p => {
            setSelectedPatient(null);
            setEditPatient(p);
          }}
        />
      )}

      {editPatient && (
        <EditPatientModal
          patient={editPatient}
          onClose={() => setEditPatient(null)}
          onSaved={updated => {
            setEditPatient(null);
            setPatients(prev => prev.map(p => (p.id === updated.id ? updated : p)));
            notify('Patient demographic details updated successfully');
          }}
        />
      )}
    </>
  );
}
