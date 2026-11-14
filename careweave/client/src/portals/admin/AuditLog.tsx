import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AuditRow } from './api';
import { PageHeader } from '../doctor/components';

const PAGE = 50; // the server's page size; a shorter page means there is nothing older
const ACTIONS = ['', 'read', 'create', 'update', 'open', 'denied', 'blocked', 'override', 'login', 'download', 'import'];

export function AuditLog({ notify }: { notify: (s: string) => void }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [action, setAction] = useState('');
  const [patient, setPatient] = useState('');
  const [patientLabel, setPatientLabel] = useState('');
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // `before` pages backwards. Without it this loads the newest rows for the current filters.
  const fetchPage = useCallback((before?: string) => {
    const query = { action, patient: patient.trim(), before };
    return adminApi.auditLog(query).then(r => {
      setRows(prev => (before ? [...prev, ...r.rows] : r.rows));
      setNext(r.rows.length >= PAGE ? r.nextBefore : null);
      setPatientLabel(r.patient ? `${r.patient.name} (${r.patient.patientId})` : '');
    });
  }, [action, patient]);

  useEffect(() => {
    let live = true;
    // Typing a patient id fires a request per keystroke otherwise; wait until they pause.
    const t = setTimeout(() => {
      fetchPage()
        .catch(e => { if (live) { setRows([]); setNext(null); notify(e.message); } })
        .finally(() => { if (live) setLoading(false); });
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [fetchPage, notify]);

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Audit Log"
        sub="Who opened, changed, or was refused access to patient records. Reading this log is itself recorded."
      />
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <label>
            Action
            <select value={action} onChange={e => { setLoading(true); setAction(e.target.value); }}>
              {ACTIONS.map(a => <option key={a} value={a}>{a || 'All actions'}</option>)}
            </select>
          </label>
          <label>
            Patient (UHID or id)
            <input value={patient} placeholder="Who accessed this chart?" onChange={e => { setLoading(true); setPatient(e.target.value); }} />
          </label>
        </div>
        {patientLabel && <p className="muted">Showing access history for <b>{patientLabel}</b></p>}
        {loading ? <p className="muted">Loading…</p> : rows.length === 0 ? <p className="muted">No matching entries.</p> : (
          <div className="table-card" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr><th>Time</th><th>Who</th><th>Role</th><th>Action</th><th>Record</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td>{new Date(r.timestamp).toLocaleString()}</td>
                    <td>{r.actorName || r.actorId}</td>
                    <td>{r.actorRole}</td>
                    <td><b>{r.action}</b></td>
                    <td>{r.entity}{r.entityId ? ` · ${r.entityId}` : ''}</td>
                    <td className="muted">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {next && !loading && (
          <button style={{ marginTop: 12 }} onClick={() => fetchPage(next).catch(e => notify(e.message))}>Load older</button>
        )}
      </div>
    </>
  );
}
