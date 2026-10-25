import { useEffect, useState } from 'react';
import { Plus, RefreshCw } from '../icons';
import { api } from '../api';
import { PageHeader, StatusBadge } from '../components';
import { ImportModal } from '../modals/ImportModal';

export function DoctorReconciliation({ notify }: { notify: (s: string) => void }) {
  const [cases, setCases] = useState<any[]>([]);
  const [show, setShow] = useState(false);

  const load = () => api.cases().then(setCases).catch(e => notify(e.message));
  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader
        eyebrow="CareWeave Record Review"
        title="External Record Review & Reconciliation"
        sub="Inspect fragmented records across facilities while preserving strict provenance, uncertainty flags, and clinician authority."
        action={
          <button className="primary" onClick={() => setShow(true)}>
            <Plus size={17} /> Import External Medical Record
          </button>
        }
      />

      <div className="intel-banner">
        <div className="spark large"><RefreshCw size={22} /></div>
        <div>
          <b>Traceable Provenance Engine</b>
          <span>
            Potential matches, duplicate lab entries, and conflicting prescription frequencies are surfaced for physician sign-off — never silently overridden.
          </span>
        </div>
        <div className="banner-stats">
          <span><b>{cases.filter(c => c.type === 'match' || c.type === 'unmatched').length}</b>identity reviews</span>
          <span><b>{cases.filter(c => c.type === 'duplicate').length}</b>possible duplicates</span>
          <span><b>{cases.filter(c => c.type === 'conflict').length}</b>conflicts</span>
        </div>
      </div>

      <div className="reconcile-grid">
        {cases.length === 0 && <p className="muted">Nothing is waiting for review.</p>}
        {cases.map(c => (
          <div className="card case-card" key={c.id}>
            <div className="case-top">
              <span className={`case-icon ${c.type}`} />
              <StatusBadge status="Requires Review" />
            </div>
            <h3>{c.title}</h3>
            <p>{c.detail}</p>
            <div className="case-evidence">
              <b>Evidence</b>
              {c.evidence.map((x: string) => (
                <span key={x}>{x}</span>
              ))}
            </div>
            {c.candidates?.length > 0 && (
              <div className="case-evidence">
                <b>Possible patients</b>
                {c.candidates.map((p: any) => (
                  <span key={p.id}>{p.name} ({p.patientId}), score {p.score}{p.conflicts?.length ? ` · ${p.conflicts.join(', ')}` : ''}</span>
                ))}
              </div>
            )}
            {c.sideBySide && (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', margin: '10px 0' }}>
                <thead>
                  <tr><th style={{ textAlign: 'left' }}>{c.sideBySide.a.title}</th><th style={{ textAlign: 'left' }}>{c.sideBySide.b.title}</th></tr>
                </thead>
                <tbody>
                  {c.sideBySide.a.fields.map((f: any, i: number) => (
                    <tr key={f.label} style={{ borderTop: '1px solid var(--line)' }}>
                      <td><span className="muted">{f.label}</span> {f.value}</td>
                      <td><span className="muted">{c.sideBySide.b.fields[i]?.label}</span> {c.sideBySide.b.fields[i]?.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="case-footer">
              <span className="mono">{c.reference}</span>
              <div>
                <button
                  className="secondary small-btn"
                  onClick={() => api.resolveCase(c.id, 'keep-separate').then(() => { notify(c.type === 'duplicate' ? 'Kept as a separate record' : 'Record kept separate, nothing linked'); load(); }).catch(e => notify(e.message))}
                >
                  {c.type === 'duplicate' ? 'Not a duplicate' : 'Keep separate'}
                </button>
                <button
                  className="primary small-btn"
                  onClick={() => {
                    let linkPatientId: string | undefined;
                    if (c.type === 'unmatched') {
                      linkPatientId = window.prompt('CareWeave patient ID to link this record to (for example CW-12345)') || undefined;
                      if (!linkPatientId) return;
                    }
                    api.resolveCase(c.id, 'link', linkPatientId).then(() => { notify(c.type === 'duplicate' ? 'Marked as a duplicate of the original' : 'Record linked to the chart'); load(); }).catch(e => notify(e.message));
                  }}
                >
                  {c.type === 'duplicate' ? 'Confirm duplicate' : c.type === 'conflict' ? 'Accept as history' : 'Review and link'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {show && (
        <ImportModal
          onClose={() => setShow(false)}
          onSaved={() => {
            setShow(false);
            load();
            notify('Import finished');
          }}
        />
      )}
    </>
  );
}
