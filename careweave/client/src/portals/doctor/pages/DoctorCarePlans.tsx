import { useEffect, useState } from 'react';
import { Plus } from '../icons';
import { api } from '../api';
import type { CarePlan, Patient } from '../types';
import { fmtDate } from '../helpers';
import { PageHeader, StatusBadge } from '../components';
import { CreateCarePlanModal } from '../modals/CreateCarePlanModal';

export function DoctorCarePlans({
  notify,
  onOpenPatient: _onOpenPatient
}: {
  notify: (s: string) => void;
  onOpenPatient: (p: Patient) => void;
}) {
  const [plans, setPlans] = useState<CarePlan[]>([]);
  const [showNewModal, setShowNewModal] = useState(false);

  const load = () => {
    api.carePlans().then(setPlans).catch(e => notify(e.message));
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <PageHeader
        eyebrow="Chronic Disease Management"
        title="Care Plans & Clinical Protocols"
        sub="Evidence-based care pathways: track patient milestones, glycemic targets, blood pressure goals, and lifestyle interventions."
        action={
          <button className="primary" onClick={() => setShowNewModal(true)}>
            <Plus size={16} /> Enroll Patient in Protocol
          </button>
        }
      />

      <div className="careplan-grid">
        {plans.map(cp => (
          <div className="careplan-card" key={cp.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="pill" style={{ background: '#f6f7f3', color: '#14231f', marginBottom: 6 }}>
                  {cp.category}
                </span>
                <h3 style={{ fontSize: 16, margin: '4px 0', color: 'var(--navy)' }}>{cp.title}</h3>
                <span className="muted" style={{ fontSize: 12 }}>Patient: <b>{cp.patientName}</b></span>
              </div>
              <StatusBadge status={cp.status} />
            </div>

            <div>
              <b style={{ fontSize: 11, color: '#56655f', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Key Clinical Targets:
              </b>
              <div className="targets" style={{ marginTop: 8 }}>
                {cp.targets.map((t, idx) => (
                  <div className="target-row" key={idx}>
                    <span>{t.metric}: <b>{t.current}</b> (target: {t.target})</span>
                    <span className={`target-status ${t.status}`}>{t.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <b style={{ fontSize: 11, color: '#56655f', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Protocol Goals:
              </b>
              <ul style={{ margin: '6px 0 0 16px', padding: 0, fontSize: 12, color: 'var(--ink)' }}>
                {cp.goals.map((g, idx) => (
                  <li key={idx} style={{ marginBottom: 4 }}>{g}</li>
                ))}
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <span className="muted" style={{ fontSize: 11 }}>Next Review: {fmtDate(cp.nextReviewDate)}</span>
              <button
                className="secondary small-btn"
                onClick={() => notify(`Review scheduled for ${cp.patientName}`)}
              >
                Update Progress
              </button>
            </div>
          </div>
        ))}
      </div>

      {showNewModal && (
        <CreateCarePlanModal
          onClose={() => setShowNewModal(false)}
          onSaved={() => {
            setShowNewModal(false);
            notify('Care plan initiated');
            load();
          }}
        />
      )}
    </>
  );
}
