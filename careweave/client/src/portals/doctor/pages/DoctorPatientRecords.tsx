import { useEffect, useState, useCallback } from 'react';
import { Activity, AlertTriangle, Check, ChevronRight, ClipboardList, Clock3, FileText, FlaskConical, Plus, Search, Stethoscope, TestTube2, AlertCircle } from '../icons';
import { api } from '../api';
import type { Patient, PatientRecord } from '../types';
import { fmtDate, initials } from '../helpers';
import { PageHeader, StatusBadge } from '../components';
import { TimelineView, LabReview } from './PatientTimeline';
import { RecordVitalsModal } from '../modals/RecordVitalsModal';
import { AddAllergyModal } from '../modals/AddAllergyModal';
import { AddProblemModal } from '../modals/AddProblemModal';

export function DoctorPatientRecords({
  notify,
  preSelectedPatient,
  onStartSOAP,
  onOrderLab,
  onPrescribe,
  onReferral
}: {
  notify: (s: string) => void;
  preSelectedPatient?: Patient | null;
  onStartSOAP: (p: Patient) => void;
  onOrderLab: (p: Patient) => void;
  onPrescribe: (p: Patient) => void;
  onReferral: (p: Patient) => void;
}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<PatientRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'timeline' | 'labs' | 'vitals' | 'rx' | 'problems'>('summary');
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [showProblemModal, setShowProblemModal] = useState(false);
  const [showAllergyModal, setShowAllergyModal] = useState(false);

  const loadPatients = useCallback(() => {
    api.patients(q).then(setPatients).catch(e => notify(e.message));
  }, [q]);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  useEffect(() => {
    if (preSelectedPatient) {
      api.patient(preSelectedPatient.id).then(setSelected).catch(() => {});
    } else if (patients.length > 0 && !selected) {
      api.patient(patients[0].id).then(setSelected).catch(() => {});
    }
  }, [preSelectedPatient, patients]);

  const refreshCurrentRecord = () => {
    if (selected) {
      api.patient(selected.id).then(setSelected).catch(() => {});
    }
  };

  const latestVital = selected?.vitals?.[0];

  return (
    <>
      <PageHeader
        eyebrow="Clinical Workspace · Electronic Health Records"
        title="Patient Records & Unified Charts"
        sub="Authoritative health record repository: longitudinal timeline, vitals trends, chronic conditions, and allergy guardrails."
        action={
          selected ? (
            <div className="header-actions">
              <button className="secondary" onClick={() => onOrderLab(selected)}>
                <TestTube2 size={16} /> Order Lab
              </button>
              <button className="secondary" onClick={() => onPrescribe(selected)}>
                <FileText size={16} /> Prescribe
              </button>
              <button className="primary" onClick={() => onStartSOAP(selected)}>
                <Stethoscope size={16} /> SOAP Encounter
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="doctor-layout">
        {/* PATIENT SEARCH COLUMN */}
        <div className="card patient-search-card">
          <div className="search">
            <Search size={17} />
            <input
              placeholder="Search patient name or ID"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <form
            className="open-by-id"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const f = new FormData(form);
              try {
                const p = await api.openPatient(String(f.get('pid') || '').trim(), String(f.get('why') || '').trim());
                setSelected(await api.patient(p.id));
                setQ(p.patientId);
                form.reset();
              } catch (err) {
                notify((err as Error).message);
              }
            }}
          >
            <p><b>Patient not in your list?</b> Open a walk-in by exact patient ID. This is logged.</p>
            <input name="pid" placeholder="Patient ID, for example CW-12345" aria-label="Patient ID" />
            <input name="why" placeholder="Reason for opening this chart" aria-label="Reason" />
            <button className="secondary" type="submit">Open chart</button>
          </form>
          <div className="patient-results">
            {patients.map(p => (
              <button
                key={p.id}
                className={`patient-result ${selected?.id === p.id ? 'selected' : ''}`}
                onClick={() => api.patient(p.id).then(setSelected)}
              >
                <div className="avatar small">{initials(p.name)}</div>
                <span>
                  <b>{p.name}</b>
                  <small>{p.patientId} · DOB {fmtDate(p.dob)}</small>
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </div>

        {/* PATIENT CHART PANEL */}
        <div className="card record-panel">
          {selected ? (
            <>
              {/* PATIENT HERO BANNER */}
              <div className="record-header">
                <div className="person">
                  <div className="avatar large" style={{ background: '#0c6b6d', color: '#f6f7f3' }}>
                    {initials(selected.name)}
                  </div>
                  <div>
                    <p className="eyebrow">{selected.patientId}</p>
                    <h2>{selected.name}</h2>
                    <span className="muted">
                      Born {fmtDate(selected.dob)} · Phone: {selected.phone} · Email: {selected.email || 'None on file'}
                    </span>
                  </div>
                </div>

                <div className="row-actions">
                  <button className="action-pill amber" onClick={() => onReferral(selected)}>
                    <ClipboardList size={14} /> Specialist Referral
                  </button>
                </div>
              </div>

              {/* ALLERGIES & CHRONIC PROBLEMS CHIPS */}
              <div className="patient-tags">
                <span style={{ fontSize: 11, fontWeight: 800, color: '#56655f', alignSelf: 'center' }}>
                  CLINICAL TAGS:
                </span>
                {selected.allergies && selected.allergies.length > 0 ? (
                  selected.allergies.map(a => (
                    <span key={a.id} className="tag-pill allergy" title={`Reaction: ${a.reaction}`}>
                      <AlertCircle size={12} /> Allergy: {a.allergen} ({a.severity})
                    </span>
                  ))
                ) : (
                  <span className="tag-pill" style={{ background: '#f6f7f3', color: '#14231f' }}>
                    <Check size={12} /> No Known Drug Allergies (NKDA)
                  </span>
                )}

                {selected.problems && selected.problems.map(pr => (
                  <span key={pr.id} className="tag-pill problem">
                    <Activity size={12} /> {pr.name} ({pr.code})
                  </span>
                ))}
              </div>

              {/* SUB-TABS NAVIGATION */}
              <div className="sub-tabs" style={{ marginTop: 18 }}>
                <button
                  className={`sub-tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
                  onClick={() => setActiveTab('summary')}
                >
                  <Activity size={15} /> Clinical Snapshot & Vitals
                </button>
                <button
                  className={`sub-tab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
                  onClick={() => setActiveTab('timeline')}
                >
                  <Clock3 size={15} /> Health Timeline ({selected.timeline.length})
                </button>
                <button
                  className={`sub-tab-btn ${activeTab === 'labs' ? 'active' : ''}`}
                  onClick={() => setActiveTab('labs')}
                >
                  <FlaskConical size={15} /> Lab Trends & Tests ({selected.labOrders.length})
                </button>
                <button
                  className={`sub-tab-btn ${activeTab === 'rx' ? 'active' : ''}`}
                  onClick={() => setActiveTab('rx')}
                >
                  <FileText size={15} /> Prescriptions ({selected.prescriptions.length})
                </button>
                <button
                  className={`sub-tab-btn ${activeTab === 'problems' ? 'active' : ''}`}
                  onClick={() => setActiveTab('problems')}
                >
                  <AlertCircle size={15} /> Problems & Allergies
                </button>
              </div>

              {/* TAB 1: CLINICAL SNAPSHOT & VITALS */}
              {activeTab === 'summary' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 14, color: 'var(--navy)' }}>Most Recent Vitals Examination</h3>
                    <button className="primary small-btn" onClick={() => setShowVitalsModal(true)}>
                      <Plus size={14} /> Record New Vitals
                    </button>
                  </div>

                  {latestVital ? (
                    <div className="vitals-grid">
                      {([
                        ['Blood Pressure', latestVital.bpSystolic != null && latestVital.bpDiastolic != null ? `${latestVital.bpSystolic}/${latestVital.bpDiastolic}` : null, 'mmHg'],
                        ['Heart Rate', latestVital.heartRate, 'bpm'],
                        ['Oxygen Saturation', latestVital.spo2 != null ? `${latestVital.spo2}%` : null, 'SpO2'],
                        ['Temperature', latestVital.tempF, '\u00b0F'],
                        ['Body Mass Index', latestVital.bmi, 'kg/m\u00b2']
                      ] as [string, string | number | null | undefined, string][]).map(([label, value, unit]) => (
                        <div className="vital-tile" key={label}>
                          <span>{label}</span>
                          <strong>{value != null && value !== '' ? value : 'Not recorded'}</strong>
                          {value != null && value !== '' && <small>{unit}</small>}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="notice" style={{ marginBottom: 16 }}>
                      <AlertCircle size={16} /> No vitals recorded yet. Use the "Record New Vitals" button above.
                    </div>
                  )}

                  {/* ACTIVE CARE PLANS SNAPSHOT */}
                  <h3 style={{ fontSize: 14, color: 'var(--navy)', marginTop: 24, marginBottom: 12 }}>
                    Active Chronic Care Plans
                  </h3>
                  {selected.carePlans && selected.carePlans.length > 0 ? (
                    <div className="careplan-grid">
                      {selected.carePlans.map(cp => (
                        <div className="careplan-card" key={cp.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <b style={{ fontSize: 13, color: 'var(--navy)' }}>{cp.title}</b>
                            <span className="pill" style={{ background: '#f6f7f3', color: '#56655f' }}>{cp.category}</span>
                          </div>
                          <div className="targets">
                            {cp.targets.map((tg, i) => (
                              <div className="target-row" key={i}>
                                <span>{tg.metric}: <b>{tg.current}</b> (target {tg.target})</span>
                                <span className={`target-status ${tg.status}`}>{tg.status}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted" style={{ fontSize: 12 }}>No active chronic disease protocols enrolled for this patient.</p>
                  )}
                </div>
              )}

              {/* TAB 2: HEALTH TIMELINE */}
              {activeTab === 'timeline' && <TimelineView record={selected} />}

              {/* TAB 3: LABS & COMPARABLE TRENDS */}
              {activeTab === 'labs' && <LabReview record={selected} />}

              {/* TAB 4: PRESCRIPTIONS */}
              {activeTab === 'rx' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <h3 style={{ fontSize: 14, color: 'var(--navy)' }}>Current Medications & Regimens</h3>
                    <button className="primary small-btn" onClick={() => onPrescribe(selected)}>
                      <Plus size={14} /> New E-Prescription
                    </button>
                  </div>
                  <div className="card table-card">
                    <table>
                      <thead>
                        <tr>
                          <th>Medication & Dosage</th>
                          <th>Route / Frequency</th>
                          <th>Duration</th>
                          <th>Prescribing Source</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.prescriptions.map(p => (
                          <tr key={p.id}>
                            <td>
                              <b>{p.medicine}</b>
                              <small className="block">{p.dosage}</small>
                            </td>
                            <td>{p.route} · {p.frequency}</td>
                            <td>{p.duration}</td>
                            <td>
                              <span className="mono">{p.source}</span>
                              {p.imported && <span className="imported-label" style={{ marginLeft: 6 }}>Imported</span>}
                            </td>
                            <td>
                              <span className={p.status === 'Discontinued' ? 'rx-discontinued-tag' : 'rx-active-tag'}>
                                {p.status || 'Active'}
                              </span>
                            </td>
                            <td>
                              {p.status !== 'Discontinued' && (
                                <button
                                  className="secondary small-btn"
                                  onClick={async () => {
                                    if (window.confirm(`Discontinue ${p.medicine}?`)) {
                                      await api.updatePrescription(p.id, { status: 'Discontinued', discontinueReason: 'Clinician stopped' });
                                      notify(`Medication discontinued`);
                                      refreshCurrentRecord();
                                    }
                                  }}
                                >
                                  Discontinue
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 5: PROBLEMS & ALLERGIES */}
              {activeTab === 'problems' && (
                <div className="soap-grid">
                  <div className="soap-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4><AlertCircle size={16} /> Known Drug & Environmental Allergies</h4>
                      <button className="primary small-btn" onClick={() => setShowAllergyModal(true)}>
                        <Plus size={13} /> Add Allergy
                      </button>
                    </div>
                    {selected.allergies && selected.allergies.length > 0 ? (
                      selected.allergies.map(a => (
                        <div key={a.id} className="allergy-alert-banner" style={{ margin: '6px 0' }}>
                          <AlertTriangle size={16} />
                          <div>
                            <b>{a.allergen} ({a.severity})</b>
                            <div style={{ fontSize: 11 }}>Reaction: {a.reaction}</div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="muted" style={{ fontSize: 12 }}>No documented drug allergies.</p>
                    )}
                  </div>

                  <div className="soap-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4><Activity size={16} /> Problem List & ICD-10 Diagnoses</h4>
                      <button className="primary small-btn" onClick={() => setShowProblemModal(true)}>
                        <Plus size={13} /> Add Diagnosis
                      </button>
                    </div>
                    {selected.problems && selected.problems.map(pr => (
                      <div key={pr.id} className="appt-row" style={{ margin: '6px 0' }}>
                        <div>
                          <b>{pr.name}</b>
                          <span>ICD-10: {pr.code} · Diagnosed: {fmtDate(pr.diagnosedDate)}</span>
                        </div>
                        <StatusBadge status={pr.status} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="record-empty">
              <div className="empty-orb"><Stethoscope size={27} /></div>
              <h3>Select a Patient Record</h3>
              <p>Choose a patient from the authorized directory on the left to inspect their unified chart.</p>
            </div>
          )}
        </div>
      </div>

      {/* RECORD VITALS MODAL */}
      {showVitalsModal && selected && (
        <RecordVitalsModal
          patient={selected}
          onClose={() => setShowVitalsModal(false)}
          onSaved={() => {
            setShowVitalsModal(false);
            notify('Vitals signs recorded');
            refreshCurrentRecord();
          }}
        />
      )}

      {/* ADD ALLERGY MODAL */}
      {showAllergyModal && selected && (
        <AddAllergyModal
          patient={selected}
          onClose={() => setShowAllergyModal(false)}
          onSaved={() => {
            setShowAllergyModal(false);
            notify('Allergy documented');
            refreshCurrentRecord();
          }}
        />
      )}

      {/* ADD PROBLEM MODAL */}
      {showProblemModal && selected && (
        <AddProblemModal
          patient={selected}
          onClose={() => setShowProblemModal(false)}
          onSaved={() => {
            setShowProblemModal(false);
            notify('Problem added to patient chart');
            refreshCurrentRecord();
          }}
        />
      )}
    </>
  );
}
