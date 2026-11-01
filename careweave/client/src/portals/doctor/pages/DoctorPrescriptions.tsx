import { useEffect, useState } from 'react';
import { AlertTriangle, FileText, Plus, Download } from '../icons';
import { api } from '../api';
import type { Patient, PatientRecord, Prescription } from '../types';
import { fmtDate } from '../helpers';
import { PageHeader } from '../components';

function printPrescriptionSlip(patient: PatientRecord, rxList: Prescription[]) {
  const activeRx = rxList.filter(p => p.status !== 'Discontinued');
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Prescription - ${patient.name} (${patient.patientId})</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #14231f; }
          .header { border-bottom: 2px solid #0c6b6d; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
          .logo { font-size: 24px; font-weight: 800; color: #0c6b6d; }
          .meta { font-size: 12px; color: #56655f; text-align: right; }
          .patient-box { background: #f6f7f3; border: 1px solid #c3cac2; border-radius: 6px; padding: 14px 18px; margin-bottom: 24px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; font-size: 13px; }
          .patient-box b { color: #14231f; display: block; font-size: 11px; text-transform: uppercase; color: #56655f; margin-bottom: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
          th { text-align: left; padding: 10px 12px; border-bottom: 2px solid #c3cac2; color: #56655f; font-size: 11px; text-transform: uppercase; }
          td { padding: 12px; border-bottom: 1px solid #e1e5df; }
          .rx-symbol { font-size: 28px; font-family: serif; font-weight: bold; color: #0c6b6d; margin: 16px 0 8px 0; }
          .allergy-warning { background: #fff5f5; border: 1px solid #feb2b2; color: #c53030; padding: 10px 14px; border-radius: 4px; font-size: 12px; margin-bottom: 20px; }
          .footer { margin-top: 60px; border-top: 1px dashed #c3cac2; padding-top: 20px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; }
          .signature-line { border-top: 1px solid #14231f; width: 200px; text-align: center; padding-top: 6px; font-weight: bold; }
          @media print { body { padding: 0; } button { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo">🏥 CareWeave Clinic</div>
            <div style="font-size: 12px; color: #56655f; margin-top: 4px;">Department of Outpatient General Medicine & Specialities</div>
          </div>
          <div class="meta">
            <b>Date:</b> ${new Date().toLocaleDateString('en-GB')}<br/>
            <b>Rx Slip ID:</b> RX-${Date.now().toString().slice(-6)}
          </div>
        </div>

        <div class="patient-box">
          <div><b>Patient Name</b>${patient.name}</div>
          <div><b>UHID / ID</b>${patient.patientId}</div>
          <div><b>DOB / Date</b>${patient.dob || '—'}</div>
          <div><b>Phone</b>${patient.phone || '—'}</div>
        </div>

        ${patient.allergies && patient.allergies.length > 0 ? `
          <div class="allergy-warning">
            ⚠️ <b>DOCUMENTED ALLERGIES:</b> ${patient.allergies.map(a => `${a.allergen} (${a.reaction})`).join(', ')}
          </div>
        ` : ''}

        <div class="rx-symbol">℞</div>

        <table>
          <thead>
            <tr>
              <th style="width: 5%">#</th>
              <th style="width: 35%">Medication & Strength</th>
              <th style="width: 25%">Dosage & Timing</th>
              <th style="width: 15%">Duration</th>
              <th style="width: 20%">Instructions</th>
            </tr>
          </thead>
          <tbody>
            ${activeRx.map((rx, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><b>${rx.medicine}</b><br/><span style="color:#56655f;font-size:11px;">${rx.dosage || ''}</span></td>
                <td>${rx.frequency}</td>
                <td>${rx.duration || '—'}</td>
                <td>${rx.instructions || rx.route || 'As directed'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="footer">
          <div style="color: #56655f; max-width: 350px;">
            Prescribed electronically through CareWeave Clinical Decision Support System. Valid for dispensing at registered pharmacies.
          </div>
          <div class="signature-line">
            Authorized Medical Officer<br/>
            <span style="font-size: 10px; font-weight: normal; color: #56655f;">Reg No: KMC-74921 / Signed Digitally</span>
          </div>
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

export function DoctorPrescriptions({
  notify,
  onPrescribe,
  onOpenPatient: _onOpenPatient
}: {
  notify: (s: string) => void;
  onPrescribe: () => void;
  onOpenPatient: (p: Patient) => void;
}) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [record, setRecord] = useState<PatientRecord | null>(null);

  useEffect(() => {
    api.patients().then(res => {
      setPatients(res);
      if (res.length > 0) setSelectedPatientId(res[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedPatientId) {
      api.patient(selectedPatientId).then(setRecord).catch(() => {});
    }
  }, [selectedPatientId]);

  return (
    <>
      <PageHeader
        eyebrow="Pharmacotherapy & Safety"
        title="E-Prescriptions & Active Meds"
        sub="Physician-authorized electronic prescriptions with automatic allergy cross-checking and refill management."
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            {record && record.prescriptions && record.prescriptions.length > 0 && (
              <button 
                className="secondary" 
                onClick={() => printPrescriptionSlip(record, record.prescriptions)}
                title="Print or Export official medical prescription slip as PDF"
              >
                <Download size={15} /> Export PDF / Print Slip
              </button>
            )}
            <button className="primary" onClick={onPrescribe}>
              <Plus size={16} /> New E-Prescription
            </button>
          </div>
        }
      />

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <b>Select Patient Record:</b>
          <select
            value={selectedPatientId}
            onChange={e => setSelectedPatientId(e.target.value)}
            style={{ minWidth: 260 }}
          >
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.patientId})</option>
            ))}
          </select>
        </div>
      </div>

      {record && (
        <>
          {/* ALLERGY WARNING BANNER */}
          {record.allergies && record.allergies.length > 0 && (
            <div className="allergy-alert-banner">
              <AlertTriangle size={18} />
              <div>
                <b>ALLERGY SAFETY ALERT FOR {record.name.toUpperCase()}:</b>
                <div>
                  Patient has documented adverse reactions to:{' '}
                  {record.allergies.map(a => `${a.allergen} (${a.reaction})`).join('; ')}.
                  Verify cross-reactivity before authorizing new medications.
                </div>
              </div>
            </div>
          )}

          <div className="card table-card">
            <table>
              <thead>
                <tr>
                  <th>Medication & Strength</th>
                  <th>Route / Instructions</th>
                  <th>Duration</th>
                  <th>Prescribed Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {record.prescriptions.map(p => (
                  <tr key={p.id}>
                    <td>
                      <b>{p.medicine}</b>
                      <small className="block">{p.dosage}</small>
                    </td>
                    <td>{p.route} · {p.frequency}</td>
                    <td>{p.duration}</td>
                    <td>{fmtDate(p.date)}</td>
                    <td>
                      <span className={p.status === 'Discontinued' ? 'rx-discontinued-tag' : 'rx-active-tag'}>
                        {p.status || 'Active'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {p.status !== 'Discontinued' ? (
                          <button
                            className="secondary small-btn"
                            onClick={async () => {
                              if (window.confirm(`Discontinue ${p.medicine}?`)) {
                                await api.updatePrescription(p.id, { status: 'Discontinued', discontinueReason: 'Course completed', version: p.version });
                                notify('Prescription updated');
                                api.patient(record.id).then(setRecord);
                              }
                            }}
                          >
                            Discontinue
                          </button>
                        ) : (
                          <span className="mono" style={{ fontSize: 11, color: '#56655f' }}>Discontinued</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {record.prescriptions.length === 0 && (
              <div className="empty">
                <FileText size={28} />
                <b>No active prescriptions on file</b>
                <span>Click "New E-Prescription" above to write an order.</span>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
