import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowRight, ShieldCheck, X } from '../icons';
import { api } from '../api';
import type { ExtractedReceptionData, Patient } from '../types';
import { fmtDate, initials, todayISO } from '../helpers';

// ─── PATIENT REGISTRATION MODAL ─────────────────────────────────────────────
export default function PatientRegistrationModal({
  initialData,
  onClose,
  onSaved,
  onBookAppt
}: {
  initialData?: ExtractedReceptionData | null;
  onClose: () => void;
  onSaved: (p: Patient) => void;
  onBookAppt: (p: Patient) => void;
}) {
  const [form, setForm] = useState({
    name: initialData?.name || '',
    dob: initialData?.dob || '',
    phone: initialData?.phone || '',
    email: '',
    emergencyContact: initialData?.emergencyContact || ''
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [duplicates, setDuplicates] = useState<Patient[]>([]);
  const [liveMatches, setLiveMatches] = useState<Patient[]>([]);

  // Smart Live Duplicate Check while typing
  useEffect(() => {
    const q = (form.phone.trim().length > 5 ? form.phone.trim() : form.name.trim().length > 3 ? form.name.trim() : '');
    if (!q) {
      setLiveMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      api.patients(q).then((res) => {
        const matches = res.filter(p =>
          (form.phone && p.phone === form.phone) ||
          (form.name && p.name.toLowerCase() === form.name.toLowerCase())
        );
        setLiveMatches(matches);
      }).catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [form.name, form.phone]);

  const update = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setDuplicates([]);
    try {
      const res = await api.createPatient(form);
      try {
        const cached = JSON.parse(localStorage.getItem('cw_registered_patients') || '[]');
        localStorage.setItem(
          'cw_registered_patients',
          JSON.stringify([res, ...cached.filter((x: any) => x.patientId !== res.patientId)])
        );
      } catch {}
      onSaved(res);
    } catch (err: any) {
      if (err.message?.includes('duplicate') || err.message?.includes('Duplicate')) {
        try {
          const matches = await api.patients(form.name);
          const likely = matches.filter(p => p.dob === form.dob);
          if (likely.length > 0) {
            setDuplicates(likely);
            setBusy(false);
            return;
          }
        } catch {}
      }
      setError(err.message || 'Failed to create patient record');
    } finally {
      setBusy(false);
    }
  };

  if (duplicates.length > 0) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2>Possible Duplicate Patient</h2>
              <p className="muted">An existing patient with the same name and date of birth was found.</p>
            </div>
            <button className="icon-btn" onClick={onClose}><X size={18} /></button>
          </div>

          <div className="alert warning" style={{ marginBottom: 14 }}>
            <AlertCircle size={16} />
            <span>Please verify with the patient before creating duplicate medical identities.</span>
          </div>

          {duplicates.map(p => (
            <div className="duplicate-card" key={p.id}>
              <div className="person">
                <div className="avatar">{initials(p.name)}</div>
                <div>
                  <b>{p.name}</b>
                  <span className="mono">{p.patientId}</span>
                  <small>DOB: {fmtDate(p.dob)} · Phone: {p.phone}</small>
                </div>
              </div>
              <div className="duplicate-actions">
                <button className="btn-secondary" onClick={() => onBookAppt(p)}>
                  Book for this Patient
                </button>
                <button className="btn-primary" onClick={onClose}>
                  Use Existing File
                </button>
              </div>
            </div>
          ))}

          <div className="modal-actions">
            <button className="btn-secondary" onClick={() => setDuplicates([])}>
              ← Back to Registration
            </button>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const res = await fetch('/api/patients', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...form, _forceCreate: true, risk: 'Reviewed duplicate override' })
                  });
                  const body = await res.json();
                  if (!res.ok) throw new Error(body.error);
                  onSaved(body);
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Creating…' : 'Register as New Patient Anyway'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>Register New Patient</h2>
            <p className="muted">Enter demographic info. A unique CareWeave ID will be generated.</p>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <form className="form-grid" onSubmit={submit}>
          {liveMatches.length > 0 && (
            <div className="alert warning span-2" style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ flex: 1 }}>
                <strong style={{ display: 'block' }}>⚠️ Existing Patient Record Detected ({liveMatches.length} match)</strong>
                <p style={{ margin: '2px 0 6px', fontSize: 12 }}>
                  "{liveMatches[0].name}" · UHID: <span className="mono font-bold">{liveMatches[0].patientId}</span> · Phone: {liveMatches[0].phone}
                </p>
                <button
                  type="button"
                  className="btn-secondary small-btn"
                  onClick={() => onBookAppt(liveMatches[0])}
                >
                  Use Existing File & Book Appointment →
                </button>
              </div>
            </div>
          )}

          <label className="span-2">
            Full Legal Name
            <input
              required
              value={form.name}
              onChange={update('name')}
              placeholder="e.g. Eleanor Vance"
            />
          </label>

          <label>
            Date of Birth
            <input
              required
              type="date"
              value={form.dob}
              onChange={update('dob')}
              max={todayISO()}
            />
          </label>

          <label>
            Contact Phone Number
            <input
              required
              value={form.phone}
              onChange={update('phone')}
              placeholder="+1 (555) 000-0000"
            />
          </label>

          <label className="span-2">
            Email Address <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
            <input
              type="email"
              value={form.email}
              onChange={update('email')}
              placeholder="patient@example.com"
            />
          </label>

          <label className="span-2">
            Emergency Contact <span className="muted" style={{ fontWeight: 400 }}>(optional)</span>
            <input
              value={form.emergencyContact}
              onChange={update('emergencyContact')}
              placeholder="Name · Relationship · Phone"
            />
          </label>

          {error && (
            <div className="alert danger span-2">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="notice span-2">
            <ShieldCheck size={16} />
            <span>Date of birth is immutable once registered to protect patient identity integrity.</span>
          </div>

          <div className="modal-actions span-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" disabled={busy}>
              {busy ? 'Registering…' : 'Complete Registration'}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
