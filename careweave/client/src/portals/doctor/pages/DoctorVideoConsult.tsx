import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Patient } from '../types';
import { PageHeader } from '../components';
import VideoCall from '@/video/VideoCall';

type Started = { id: string; doctorKey: string; expiresAt: string; patientName: string; hasPhone: boolean };

/** Start a video consultation with a patient from the doctor portal; the patient joins from a link, no account needed. */
export function DoctorVideoConsult({ notify }: { notify: (s: string) => void }) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [started, setStarted] = useState<Started | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendNote, setSendNote] = useState('');

  useEffect(() => {
    api.patients().then((rows) => {
      setPatients(rows);
      if (rows.length) setPatientId(rows[0].id);
    }).catch(() => {});
  }, []);

  const link = started ? `${window.location.origin}/consult/${started.id}` : '';

  const start = async () => {
    setBusy(true);
    setSendNote('');
    try {
      const res = await fetch('/api/video/consults', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patientId }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not start the consultation');
      setStarted(body);
    } catch (e: any) {
      notify(e.message || 'Could not start the consultation');
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async () => {
    if (!started) return;
    setSendNote('Sending…');
    const res = await fetch(`/api/video/consults/${started.id}/send`, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    setSendNote(res.ok ? 'Link sent to the patient on WhatsApp.' : `Not sent: ${body.error || 'unknown error'}. Copy the link and share it yourself.`);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); notify('Link copied'); } catch { notify('Select the link and copy it'); }
  };

  const end = async () => {
    if (started) await fetch(`/api/video/consults/${started.id}/end`, { method: 'POST' }).catch(() => {});
    setStarted(null);
    setSendNote('');
    notify('Consultation ended');
  };

  return (
    <>
      <PageHeader
        eyebrow="Telemedicine"
        title="Video Consultation"
        sub="Start a secure video call. The patient opens a temporary link on their phone, with no account or app. The video goes browser to browser."
      />

      {!started ? (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <b>Patient:</b>
            <select value={patientId} onChange={(e) => setPatientId(e.target.value)} style={{ minWidth: 'min(260px, 100%)', flex: '1 1 260px', maxWidth: 420 }} aria-label="Patient">
              {patients.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.patientId})</option>)}
            </select>
            <button className="primary" onClick={start} disabled={busy || !patientId}>{busy ? 'Starting…' : 'Start video consult'}</button>
          </div>
          {patients.length === 0 && <p className="muted" style={{ marginTop: 12 }}>Only patients with an appointment or encounter assigned to you appear here.</p>}
        </div>
      ) : (
        <div className="vc-layout">
          <div className="card">
            <VideoCall token={started.id} role="doctor" doctorKey={started.doctorKey} onHangUp={end} />
          </div>
          <div className="card vc-side">
            <h3>Consultation with {started.patientName}</h3>
            <p className="muted">Share this link with the patient. It works for about 2 hours and needs no account.</p>
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Patient link" style={{ width: '100%', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }} />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="secondary" onClick={copy}>Copy link</button>
              <button className="secondary" onClick={sendLink} disabled={!started.hasPhone}>Send on WhatsApp</button>
              {!started.hasPhone && <span className="muted">No phone number on file.</span>}
            </div>
            {sendNote && <p className="muted" role="status">{sendNote}</p>}
            <ul className="vc-tips">
              <li>Allow the camera and microphone when the browser asks.</li>
              <li>The video goes directly between your browser and the patient's phone.</li>
              <li>Press <b>End consultation</b> when you are done; the link stops working.</li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
