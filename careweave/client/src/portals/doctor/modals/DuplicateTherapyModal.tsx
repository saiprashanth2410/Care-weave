import { useState } from 'react';
import type { CollisionAlert, DuplicateOverride } from '../types';
import { Modal } from '../components';

const provenance = (a: CollisionAlert['conflictingDrug']) =>
  a.source === 'IN_HOUSE_ENCOUNTER'
    ? `In-House Encounter · ${a.facility || 'CareWeave Clinic'}`
    : `Outside Record · ${a.facility ? `${a.facility} (reconciled)` : 'Reconciled slip'}`;

const day = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export const MIN_OVERRIDE_REASON = 15;

// Blocks a prescription that repeats an active molecule under another brand. The clinician can cancel, or document an override.
export function DuplicateTherapyModal({ alerts, dosage, onCancel, onOverride }: {
  alerts: CollisionAlert[];
  dosage: string;
  onCancel: () => void;
  onOverride: (o: DuplicateOverride) => void;
}) {
  const [reason, setReason] = useState('');
  const [ack, setAck] = useState(false);
  const ready = ack && reason.trim().length >= MIN_OVERRIDE_REASON;

  return (
    <Modal title="High-Risk Molecular Duplicate Detected" sub="The patient is already taking the same active ingredient under a different brand." onClose={onCancel}>
      <div className="dup">
        {alerts.map((a, i) => (
          <section key={i} className="dup-case">
            <p className="dup-banner" role="alert">
              {a.severity === 'HIGH_COLLISION'
                ? <>Patient is already receiving <b>{a.matchedMolecules.join(' and ')}</b> via <b>{a.conflictingDrug.brand}</b>. Prescribing <b>{a.prescribedDrug.brand}</b> leads to severe duplicate dosage.</>
                : <>Same drug class as an active medicine: <b>{a.conflictingDrug.brand}</b>.</>}
            </p>
            <div className="dup-compare">
              <article className="dup-card existing">
                <p className="dup-tag">Existing active medication</p>
                <h3>{a.conflictingDrug.brand}</h3>
                <p className="dup-generic">{a.conflictingDrug.generic}</p>
                <span className="dup-badge">{provenance(a.conflictingDrug)}</span>
                <dl>
                  <dt>Prescribed</dt><dd>{day(a.conflictingDrug.prescribedDate)}</dd>
                  {a.conflictingDrug.prescribingDoctor && <><dt>By</dt><dd>{a.conflictingDrug.prescribingDoctor}</dd></>}
                </dl>
              </article>
              <article className="dup-card attempted">
                <p className="dup-tag">Attempted new medication</p>
                <h3>{a.prescribedDrug.brand}</h3>
                <p className="dup-generic">{a.prescribedDrug.generic}</p>
                <dl><dt>Selected dosage</dt><dd>{dosage || 'Not entered'}</dd></dl>
              </article>
            </div>
            <p className="dup-warning">{a.clinicalWarning}</p>
          </section>
        ))}

        <label className="dup-reason">
          Clinical justification for override <span className="muted">(at least {MIN_OVERRIDE_REASON} characters)</span>
          <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Switching patient from Augmentin due to GI intolerance" />
          <small className={reason.trim().length >= MIN_OVERRIDE_REASON ? 'ok' : ''}>{reason.trim().length} / {MIN_OVERRIDE_REASON}</small>
        </label>
        <label className="dup-ack">
          <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />
          I have reviewed the duplicate exposure and accept the risks. This override is recorded in the audit log.
        </label>

        <div className="modal-actions">
          <button type="button" className="primary" onClick={onCancel}>Cancel Order</button>
          <button type="button" className="secondary" disabled={!ready} onClick={() => onOverride({ overrideReason: reason.trim(), acknowledgedRisks: true })}>
            Document Override &amp; Proceed
          </button>
        </div>
      </div>
    </Modal>
  );
}
