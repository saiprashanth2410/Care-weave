import React, { useState } from 'react';
import { AlertTriangle, FileText } from '../icons';
import { api } from '../api';
import { Modal } from '../components';
import { IMPORT_EXAMPLE, toRecords } from './importHelpers';

export function ImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [facility, setFacility] = useState('');
  const [raw, setRaw] = useState('');
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<any[] | null>(null);

  const onFile = async (f?: File) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { setError('The file must be smaller than 2 MB'); return; }
    setFileName(f.name);
    setRaw(await f.text());
    setError('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const records = toRecords(raw, fileName, facility.trim());
      const res = await api.importRecord({ facility: facility.trim(), records });
      setResults(res.results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (results) {
    return (
      <Modal title="Import result" onClose={onSaved}>
        <p className="muted">Nothing was overwritten. Anything unclear is waiting in the review queue.</p>
        <ul>
          {results.map((r, i) => (
            <li key={i} style={{ padding: '6px 0', borderTop: '1px solid var(--line)' }}>
              <b>{r.record?.sourceRecordId || r.sourceRecordId || `Record ${i + 1}`}</b>{' '}
              {r.error ? <span style={{ color: '#a3341f' }}>Rejected: {r.error}</span> : <span>{r.outcome}</span>}
            </li>
          ))}
        </ul>
        <div className="modal-actions"><button className="primary" onClick={onSaved}>Done</button></div>
      </Modal>
    );
  }

  return (
    <Modal title="Import external medical records" onClose={onClose}>
      <div className="notice">
        <FileText size={18} />
        <span>JSON or CSV exported from another facility. Source, dates and identifiers are kept as given. Each record is matched to a patient by the rules in the review queue; weak matches are never linked automatically.</span>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <label className="span-2">
          Source facility (used when a record does not name one)
          <input value={facility} onChange={e => setFacility(e.target.value)} placeholder="Name of the sending facility" />
        </label>
        <label className="span-2">
          File (.json or .csv)
          <input type="file" accept=".json,.csv,application/json,text/csv" onChange={e => onFile(e.target.files?.[0])} />
        </label>
        <label className="span-2">
          Or paste records
          <textarea rows={7} value={raw} onChange={e => { setRaw(e.target.value); setFileName(''); }} placeholder="Paste JSON or CSV" style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12 }} />
        </label>
        <details className="span-2">
          <summary>Format</summary>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>{IMPORT_EXAMPLE}</pre>
          <p className="muted" style={{ fontSize: 12 }}>
            CSV columns: sourceRecordId, kind, eventDate, identifier, name, dob, phone, then testName, value, units, referenceRange (lab) or medicine, dosage, frequency, route (medication) or diagnosis, notes (consultation).
          </p>
        </details>
        {error && <div className="alert danger span-2"><AlertTriangle size={16} />{error}</div>}
        <div className="modal-actions span-2">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !raw.trim()}>{busy ? 'Importing' : 'Import and check'}</button>
        </div>
      </form>
    </Modal>
  );
}
