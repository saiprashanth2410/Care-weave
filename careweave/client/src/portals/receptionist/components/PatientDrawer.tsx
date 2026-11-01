import { useEffect, useState } from 'react';
import { AlertCircle, CalendarDays, Mail, Pencil, Phone, ShieldCheck, X } from '../icons';
import { Link } from 'react-router-dom';
import { api } from '../api';
import type { AdminPatientRecord, Patient } from '../types';
import { fmtDate, initials, calculateAge } from '../helpers';

// ─── PATIENT DRAWER (ADMINISTRATIVE FILE) ───────────────────────────────────
export default function PatientDrawer({
  patient,
  onClose,
  onBookAppt,
  onEditPatient
}: {
  patient: Patient;
  onClose: () => void;
  onBookAppt: (p: Patient) => void;
  onEditPatient: (p: Patient) => void;
}) {
  const [record, setRecord] = useState<AdminPatientRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.patientAdmin(patient.id)
      .then(setRecord)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [patient]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <button className="drawer-close" onClick={onClose}>
          <X size={18} />
        </button>

        <div className="drawer-hero">
          <div className="avatar large">{initials(patient.name)}</div>
          <div>
            <p className="eyebrow" style={{ marginBottom: 2 }}>{patient.patientId}</p>
            <h2>{patient.name}</h2>
            <span className="muted">
              DOB: {fmtDate(patient.dob)} ({calculateAge(patient.dob)})
            </span>
          </div>
        </div>

        <div className="notice" style={{ marginBottom: 18 }}>
          <ShieldCheck size={18} />
          <div>
            <strong>Administrative File Scope</strong>
            <p style={{ margin: 0, fontSize: 11 }}>
              Clinical notes, test orders, and prescriptions are protected.
              Front desk access is limited to scheduling and demographic details.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <button className="btn-primary" style={{ flex: 1 }} onClick={() => onBookAppt(patient)}>
            <CalendarDays size={15} />
            <span>Book Appointment</span>
          </button>
          <button className="btn-secondary" onClick={() => onEditPatient(patient)}>
            <Pencil size={15} />
            <span>Edit</span>
          </button>
        </div>

        <div className="drawer-field">
          <Phone size={15} />
          <span>Phone: <strong>{patient.phone}</strong></span>
        </div>

        {patient.email && (
          <div className="drawer-field">
            <Mail size={15} />
            <span>Email: <strong>{patient.email}</strong></span>
          </div>
        )}

        {patient.emergencyContact && (
          <div className="drawer-field">
            <AlertCircle size={15} />
            <span>Emergency: <strong>{patient.emergencyContact}</strong></span>
          </div>
        )}

        <div className="section-label">Appointment History</div>
        {loading ? (
          <p className="muted" style={{ fontSize: 12 }}>Loading appointment history…</p>
        ) : !record?.appointments || record.appointments.length === 0 ? (
          <p className="muted" style={{ fontSize: 12 }}>No appointment history on file.</p>
        ) : (
          <div className="appt-list">
            {record.appointments.map(a => (
              <div className="appt-row" key={a.id}>
                <div>
                  <b>{a.date} · {a.time}</b>
                  <span>{a.reason} {a.doctorName ? `· ${a.doctorName}` : ''}</span>
                </div>
                <span className={`status ${a.status.toLowerCase().replace(/\s+/g, '-')}`}>
                  {a.status}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Central Lab Diagnostics & Reports */}
        <div className="section-label" style={{ marginTop: 20 }}>
          Central Laboratory & Diagnostics
        </div>
        {loading ? (
          <p className="muted" style={{ fontSize: 12 }}>Checking laboratory requisitions…</p>
        ) : !record?.labOrders || record.labOrders.length === 0 ? (
          <div style={{ border: '1px solid var(--border-subtle)', padding: 12, borderRadius: 4, background: 'var(--bg-surface)' }}>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>No lab investigations ordered for this patient yet.</p>
            <Link
              to={`/lab/orders?order=new`}
              className="btn-primary"
              style={{ marginTop: 8, fontSize: 11, padding: '5px 12px', textDecoration: 'none', display: 'inline-flex' }}
            >
              + Send for Lab Requisition
            </Link>
          </div>
        ) : (
          <div className="appt-list">
            {record.labOrders.map((order: any) => (
              <div className="appt-row" key={order.id} style={{ alignItems: 'flex-start' }}>
                <div>
                  <b>{order.testName}</b>
                  <p className="mono" style={{ margin: '2px 0 0' }}>
                    Requisition: {order.id} · {order.department || 'Diagnostics'}
                  </p>
                  <p className="muted" style={{ margin: 0, fontSize: 11 }}>
                    Ordered: {order.orderedAt ? new Date(order.orderedAt).toLocaleDateString() : 'Today'} · Ref: {order.orderingDoctor}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`status ${order.status.toLowerCase().replace(/_/g, '-')}`}>
                    {order.status.replace(/_/g, ' ')}
                  </span>
                  <Link
                    to={`/lab/orders?order=${order.id}`}
                    style={{ display: 'block', fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginTop: 4, textDecoration: 'underline' }}
                  >
                    View in Lab →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
