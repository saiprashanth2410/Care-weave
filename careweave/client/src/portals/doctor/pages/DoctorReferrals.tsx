import { useEffect, useState } from 'react';
import { Plus } from '../icons';
import { api } from '../api';
import type { Patient, Referral } from '../types';
import { fmtDate } from '../helpers';
import { PageHeader, StatusBadge } from '../components';

export function DoctorReferrals({
  notify,
  onNewReferral,
  onOpenPatient: _onOpenPatient
}: {
  notify: (s: string) => void;
  onNewReferral: () => void;
  onOpenPatient: (p: Patient) => void;
}) {
  const [referrals, setReferrals] = useState<Referral[]>([]);

  const load = () => {
    api.referrals().then(setReferrals).catch(e => notify(e.message));
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (r: Referral, status: string) => {
    try {
      await api.updateReferral(r.id, status);
      notify(`Referral marked ${status}`);
      load();
    } catch (e) {
      notify((e as Error).message);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Specialist Coordination"
        title="Specialist Referrals"
        sub="Create, transmit, and monitor outbound clinical consultation referrals to regional specialists."
        action={
          <button className="primary" onClick={onNewReferral}>
            <Plus size={16} /> New Specialist Referral
          </button>
        }
      />

      <div className="referral-grid">
        {referrals.map(rf => (
          <div className="referral-card" key={rf.id}>
            <div className="referral-card-head">
              <div>
                <span className="pill" style={{ background: '#f6f7f3', color: '#084e50', marginBottom: 4 }}>
                  {rf.specialty}
                </span>
                <h3 style={{ fontSize: 15, margin: '4px 0', color: 'var(--navy)' }}>{rf.providerName}</h3>
                <span className="muted" style={{ fontSize: 11 }}>
                  Patient: <b>{rf.patientName}</b> ({rf.patientIdCode})
                </span>
              </div>
              <StatusBadge status={rf.status} />
            </div>

            <div style={{ background: '#f6f7f3', padding: 12, borderRadius: 8, border: '1px solid #c3cac2' }}>
              <b style={{ fontSize: 11, color: '#56655f' }}>Clinical Indication:</b>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink)' }}>{rf.reason}</p>
            </div>

            <div>
              <b style={{ fontSize: 11, color: '#56655f' }}>Clinical Summary & Findings:</b>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                {rf.clinicalSummary}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <span className="mono" style={{ fontSize: 10 }}>{fmtDate(rf.date)}</span>
              <div className="row-actions">
                {rf.status === 'Sent' && (
                  <button className="secondary small-btn" onClick={() => updateStatus(rf, 'Scheduled')}>
                    Mark Scheduled
                  </button>
                )}
                {rf.status === 'Scheduled' && (
                  <button className="secondary small-btn" onClick={() => updateStatus(rf, 'Completed')}>
                    Consult Received
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
