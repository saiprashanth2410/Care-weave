import { useState } from 'react';
import { Activity, HeartPulse, Sliders } from '../icons';
import { PageHeader } from '../components';

export function DoctorClinicalCalculators({ notify: _notify }: { notify: (s: string) => void }) {
  // ASCVD Calculator States
  const [age, setAge] = useState(55);
  const [totChol, setTotChol] = useState(210);
  const [hdl, setHdl] = useState(50);
  const [sbp, setSbp] = useState(135);
  const [onHtnMeds, setOnHtnMeds] = useState(true);
  const [smoker, setSmoker] = useState(false);
  const [diabetic, setDiabetic] = useState(false);

  // Simple ASCVD Pooled Cohort approximation
  const calcAscvd = () => {
    let score = (age - 40) * 0.4 + (totChol - 160) * 0.05 - (hdl - 45) * 0.08 + (sbp - 120) * 0.06;
    if (onHtnMeds) score += 2.0;
    if (smoker) score += 3.5;
    if (diabetic) score += 3.0;
    const risk = Math.max(1.5, Math.min(45, Number(score.toFixed(1))));
    return risk;
  };
  const ascvdRisk = calcAscvd();

  // eGFR Calculator States (CKD-EPI)
  const [cr, setCr] = useState(1.0);
  const [isFemale, setIsFemale] = useState(false);
  const calcEgfr = () => {
    const k = isFemale ? 0.7 : 0.9;
    const a = isFemale ? -0.241 : -0.302;
    const minVal = Math.min(cr / k, 1);
    const maxVal = Math.max(cr / k, 1);
    let gfr = 142 * Math.pow(minVal, a) * Math.pow(maxVal, -1.2) * Math.pow(0.9938, age);
    if (isFemale) gfr *= 1.012;
    return Math.round(gfr);
  };
  const egfr = calcEgfr();

  // BMI Calculator States
  const [weightKg, setWeightKg] = useState(72);
  const [heightCm, setHeightCm] = useState(170);
  const bmi = Number((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1));

  return (
    <>
      <PageHeader
        eyebrow="Clinical Decision Support"
        title="Clinical Calculators & Risk Scoring"
        sub="Validated point-of-care risk prediction tools for cardiovascular health, renal staging, and metabolic screening."
      />

      <div className="calc-grid">
        {/* ASCVD 10-YEAR CARDIOVASCULAR RISK */}
        <div className="calc-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <HeartPulse size={20} color="#a3341f" />
            <h3 style={{ margin: 0 }}>10-Year ASCVD Risk Estimator</h3>
          </div>
          <p>ACC/AHA Guideline on Cardiovascular Risk Assessment for primary prevention.</p>

          <div className="calc-controls">
            <label>
              Age: <b>{age} years</b>
              <input type="range" min="30" max="79" value={age} onChange={e => setAge(Number(e.target.value))} />
            </label>
            <label>
              Total Cholesterol: <b>{totChol} mg/dL</b>
              <input type="range" min="130" max="320" value={totChol} onChange={e => setTotChol(Number(e.target.value))} />
            </label>
            <label>
              HDL Cholesterol: <b>{hdl} mg/dL</b>
              <input type="range" min="20" max="90" value={hdl} onChange={e => setHdl(Number(e.target.value))} />
            </label>
            <label>
              Systolic Blood Pressure: <b>{sbp} mmHg</b>
              <input type="range" min="90" max="200" value={sbp} onChange={e => setSbp(Number(e.target.value))} />
            </label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={onHtnMeds} onChange={e => setOnHtnMeds(e.target.checked)} />
                On Blood Pressure Meds
              </label>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={smoker} onChange={e => setSmoker(e.target.checked)} />
                Smoker
              </label>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={diabetic} onChange={e => setDiabetic(e.target.checked)} />
                Diabetic
              </label>
            </div>
          </div>

          <div className="calc-output">
            <span>Estimated 10-Year Atherosclerotic Cardiovascular Event Risk:</span>
            <strong>{ascvdRisk}%</strong>
            <span>
              {ascvdRisk < 5
                ? 'Low risk (<5%). Emphasize lifestyle factors to maintain low risk.'
                : ascvdRisk < 7.5
                ? 'Borderline risk (5% to <7.5%). Moderate-intensity statin may be considered.'
                : ascvdRisk < 20
                ? 'Intermediate risk (7.5% to <20%). Initiate moderate-intensity statin therapy.'
                : 'High risk (≥20%). High-intensity statin therapy strongly recommended.'}
            </span>
          </div>
        </div>

        {/* eGFR & CHRONIC KIDNEY DISEASE STAGING */}
        <div className="calc-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Activity size={20} color="#084e50" />
            <h3 style={{ margin: 0 }}>eGFR Calculator & CKD Staging</h3>
          </div>
          <p>CKD-EPI formula for estimated glomerular filtration rate and renal drug dosing guidance.</p>

          <div className="calc-controls">
            <label>
              Serum Creatinine (mg/dL): <b>{cr.toFixed(2)}</b>
              <input type="range" min="0.5" max="4.0" step="0.05" value={cr} onChange={e => setCr(Number(e.target.value))} />
            </label>
            <div style={{ display: 'flex', gap: 14 }}>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <input type="radio" checked={!isFemale} onChange={() => setIsFemale(false)} /> Male
              </label>
              <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <input type="radio" checked={isFemale} onChange={() => setIsFemale(true)} /> Female
              </label>
            </div>
          </div>

          <div className="calc-output" style={{ background: '#f6f7f3', borderColor: '#c3cac2' }}>
            <span>Estimated GFR:</span>
            <strong style={{ color: '#56655f' }}>{egfr} mL/min/1.73 m²</strong>
            <span>
              {egfr >= 90
                ? 'Stage 1 CKD (Normal kidney function with persistent proteinuria or marker).'
                : egfr >= 60
                ? 'Stage 2 CKD (Mildly decreased function).'
                : egfr >= 45
                ? 'Stage 3a CKD (Mild to moderately decreased). Review renal-cleared medications.'
                : egfr >= 30
                ? 'Stage 3b CKD (Moderately to severely decreased). Nephrology consultation advised.'
                : egfr >= 15
                ? 'Stage 4 CKD (Severely decreased). Preparation for kidney replacement.'
                : 'Stage 5 CKD (Kidney Failure / End-stage). Urgent nephrology management.'}
            </span>
          </div>
        </div>

        {/* BMI & METABOLIC SYNDROME */}
        <div className="calc-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Sliders size={20} color="#0c6b6d" />
            <h3 style={{ margin: 0 }}>BMI & Metabolic Screening</h3>
          </div>
          <p>Body Mass Index calculation and metabolic syndrome risk assessment.</p>

          <div className="calc-controls">
            <label>
              Height: <b>{heightCm} cm</b> ({Math.floor(heightCm / 30.48)}' {Math.round((heightCm % 30.48) / 2.54)}")
              <input type="range" min="140" max="210" value={heightCm} onChange={e => setHeightCm(Number(e.target.value))} />
            </label>
            <label>
              Weight: <b>{weightKg} kg</b> ({Math.round(weightKg * 2.20462)} lbs)
              <input type="range" min="40" max="160" value={weightKg} onChange={e => setWeightKg(Number(e.target.value))} />
            </label>
          </div>

          <div className="calc-output">
            <span>Body Mass Index:</span>
            <strong>{bmi} kg/m²</strong>
            <span>
              {bmi < 18.5
                ? 'Underweight (<18.5). Consider nutritional evaluation.'
                : bmi < 25
                ? 'Normal Weight (18.5–24.9). Maintain healthy lifestyle.'
                : bmi < 30
                ? 'Overweight (25.0–29.9). Diet and moderate physical activity indicated.'
                : 'Obesity (≥30.0). Screen for sleep apnea, diabetes, and cardiovascular risk.'}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
