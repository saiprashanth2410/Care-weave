import React, { useEffect, useState } from 'react';
import { Activity, Check, FileText, CheckCircle2, Pencil } from '../icons';
import { api } from '../api';
import type { Patient } from '../types';
import { PageHeader } from '../components';

export function DoctorConsultations({
  notify,
  preSelectedPatient,
  onOpenPatient: _onOpenPatient
}: {
  notify: (s: string) => void;
  preSelectedPatient?: Patient | null;
  onOpenPatient: (p: Patient) => void;
}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(preSelectedPatient || null);
  const [template, setTemplate] = useState('general');

  // SOAP Form Fields
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [diagnosis, setDiagnosis] = useState('');

  // Vitals during encounter
  const [bpSystolic, setBpSystolic] = useState('120');
  const [bpDiastolic, setBpDiastolic] = useState('80');
  const [heartRate, setHeartRate] = useState('72');
  const [tempF, setTempF] = useState('98.6');
  const [spo2, setSpo2] = useState('99');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.patients().then(res => {
      setPatients(res);
      if (!selectedPatient && res.length > 0) setSelectedPatient(res[0]);
    }).catch(() => {});
  }, []);

  const applyTemplate = (tmpl: string) => {
    setTemplate(tmpl);
    if (tmpl === 'htn') {
      setChiefComplaint('Follow-up for essential hypertension management.');
      setSubjective('Patient reports good compliance with daily medications. Denies headaches, visual disturbances, or chest pain. Salt intake moderate.');
      setObjective('Physical Exam: Alert, oriented x 4. Heart regular rate and rhythm, no murmurs. Lungs clear to auscultation bilaterally. No peripheral edema.');
      setAssessment('Essential primary hypertension (I10) - stable on current regimen.');
      setPlan('Continue current antihypertensive therapy. Reinforce DASH dietary guidelines. Check home BP log. Follow up in 3 months with basic metabolic panel.');
      setDiagnosis('Essential Hypertension (I10)');
    } else if (tmpl === 'diabetes') {
      setChiefComplaint('Routine Type 2 Diabetes follow-up and glycemic check.');
      setSubjective('Reports consistent fasting blood glucose 110–130 mg/dL. Denies hypoglycemic episodes, polyuria, polydipsia, or neuropathic foot tingling.');
      setObjective('Foot Exam: Bilateral pedal pulses 2+, monofilament sensation intact bilaterally. No calluses or skin breakdown. Eyes: visual acuity preserved.');
      setAssessment('Type 2 Diabetes Mellitus without complications (E11.9) - good glycemic control.');
      setPlan('Continue Metformin as prescribed. Order repeat HbA1c in 3 months. Annual dilated funduscopic eye exam scheduled. Nutritional review provided.');
      setDiagnosis('Type 2 Diabetes Mellitus (E11.9)');
    } else if (tmpl === 'wellness') {
      setChiefComplaint('Annual adult preventive wellness examination.');
      setSubjective('Feels well overall. Normal appetite and sleep. Exercises 3 times weekly. No tobacco or illicit drug use.');
      setObjective('HEENT normal. Neck supple, no thyromegaly. Heart S1/S2 normal. Lungs clear. Abdomen soft, non-tender. Full range of motion in all joints.');
      setAssessment('Routine general medical examination without abnormal findings (Z00.00).');
      setPlan('Vaccines updated. Fasting lipid panel and routine CBC ordered. Reassurance and lifestyle counseling provided.');
      setDiagnosis('General Adult Medical Examination (Z00.00)');
    } else {
      setChiefComplaint('');
      setSubjective('');
      setObjective('');
      setAssessment('');
      setPlan('');
      setDiagnosis('');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatient) return;
    setBusy(true);
    try {
      const fullNotes = `CHIEF COMPLAINT:\n${chiefComplaint}\n\nSUBJECTIVE:\n${subjective}\n\nOBJECTIVE:\n${objective}\n\nASSESSMENT:\n${assessment}\n\nPLAN:\n${plan}`;
      await api.createEncounter({
        patientId: selectedPatient.id,
        diagnosis: diagnosis || assessment.slice(0, 60),
        notes: fullNotes,
        chiefComplaint,
        subjective,
        objective,
        assessment,
        plan,
        vitals: {
          bpSystolic: Number(bpSystolic),
          bpDiastolic: Number(bpDiastolic),
          heartRate: Number(heartRate),
          tempF: Number(tempF),
          spo2: Number(spo2)
        }
      });
      notify('SOAP Consultation recorded directly to patient timeline');
      applyTemplate('general');
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Clinical Charting"
        title="Clinical Encounters & SOAP Notes"
        sub="Document clinician-authored encounter notes with Subjective, Objective, Assessment, Plan, and real-time vitals."
      />

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ margin: 0, fontWeight: 700 }}>Select Patient:</label>
            <select
              value={selectedPatient?.id || ''}
              onChange={e => {
                const found = patients.find(p => p.id === e.target.value);
                if (found) setSelectedPatient(found);
              }}
              style={{ minWidth: 260 }}
            >
              {patients.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.patientId})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>Clinical Template:</span>
            <button
              type="button"
              className={`action-pill ${template === 'general' ? 'amber' : ''}`}
              onClick={() => applyTemplate('general')}
            >
              Blank SOAP
            </button>
            <button
              type="button"
              className={`action-pill ${template === 'htn' ? 'amber' : ''}`}
              onClick={() => applyTemplate('htn')}
            >
              Hypertension
            </button>
            <button
              type="button"
              className={`action-pill ${template === 'diabetes' ? 'amber' : ''}`}
              onClick={() => applyTemplate('diabetes')}
            >
              Diabetes
            </button>
            <button
              type="button"
              className={`action-pill ${template === 'wellness' ? 'amber' : ''}`}
              onClick={() => applyTemplate('wellness')}
            >
              Annual Wellness
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="soap-form">
        {/* VITALS SECTION FOR CURRENT ENCOUNTER */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-head" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, color: 'var(--navy)' }}>Encounter Vital Signs</h3>
            <span className="muted">Recorded during exam</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 14 }}>
            <label>
              BP Systolic (mmHg)
              <input value={bpSystolic} onChange={e => setBpSystolic(e.target.value)} type="number" required />
            </label>
            <label>
              BP Diastolic (mmHg)
              <input value={bpDiastolic} onChange={e => setBpDiastolic(e.target.value)} type="number" required />
            </label>
            <label>
              Heart Rate (bpm)
              <input value={heartRate} onChange={e => setHeartRate(e.target.value)} type="number" required />
            </label>
            <label>
              Temp (°F)
              <input value={tempF} onChange={e => setTempF(e.target.value)} type="number" step="0.1" required />
            </label>
            <label>
              SpO2 (%)
              <input value={spo2} onChange={e => setSpo2(e.target.value)} type="number" required />
            </label>
          </div>
        </div>

        {/* CHIEF COMPLAINT & DIAGNOSIS */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="form-grid">
            <label>
              Chief Complaint (Reason for Visit)
              <input
                required
                value={chiefComplaint}
                onChange={e => setChiefComplaint(e.target.value)}
                placeholder="e.g. 3-day history of productive cough and fatigue"
              />
            </label>
            <label>
              Primary Diagnosis / ICD-10
              <input
                required
                value={diagnosis}
                onChange={e => setDiagnosis(e.target.value)}
                placeholder="e.g. Acute Bronchitis (J20.9)"
              />
            </label>
          </div>
        </div>

        {/* 4 SOAP QUADRANTS */}
        <div className="soap-grid" style={{ marginBottom: 20 }}>
          <div className="soap-box">
            <h4><Pencil size={15} /> [S] Subjective</h4>
            <p className="muted" style={{ fontSize: 11, margin: 0 }}>
              History of present illness (HPI), patient symptoms, review of systems, medication compliance.
            </p>
            <textarea
              required
              rows={4}
              value={subjective}
              onChange={e => setSubjective(e.target.value)}
              placeholder="Document patient statements, symptoms, onset, aggravating factors…"
            />
          </div>

          <div className="soap-box">
            <h4><Activity size={15} /> [O] Objective</h4>
            <p className="muted" style={{ fontSize: 11, margin: 0 }}>
              Physical examination findings, clinical observations, diagnostic readings.
            </p>
            <textarea
              required
              rows={4}
              value={objective}
              onChange={e => setObjective(e.target.value)}
              placeholder="Document physical exam: HEENT, cardiovascular, respiratory, abdomen, neuro…"
            />
          </div>

          <div className="soap-box">
            <h4><CheckCircle2 size={15} /> [A] Assessment</h4>
            <p className="muted" style={{ fontSize: 11, margin: 0 }}>
              Clinical evaluation, differential diagnosis, progress of chronic conditions.
            </p>
            <textarea
              required
              rows={4}
              value={assessment}
              onChange={e => setAssessment(e.target.value)}
              placeholder="Clinical impression, diagnosis status (improved, stable, exacerbated)…"
            />
          </div>

          <div className="soap-box">
            <h4><FileText size={15} /> [P] Plan</h4>
            <p className="muted" style={{ fontSize: 11, margin: 0 }}>
              Diagnostic tests ordered, pharmacotherapy regimen, lifestyle recommendations, follow-up timeline.
            </p>
            <textarea
              required
              rows={4}
              value={plan}
              onChange={e => setPlan(e.target.value)}
              placeholder="Medications prescribed, tests requested, patient education, next visit schedule…"
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="secondary" onClick={() => applyTemplate('general')}>
            Clear Form
          </button>
          <button className="primary" disabled={busy}>
            {busy ? 'Saving SOAP Note…' : 'Sign & Complete Encounter'}
            <Check size={16} />
          </button>
        </div>
      </form>
    </>
  );
}
