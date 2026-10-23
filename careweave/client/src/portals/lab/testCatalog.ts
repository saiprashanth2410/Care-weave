import type { TestResultItem } from './types'

// Reference catalogue: departments, specimen types, containers, parameters and reference ranges per test.
// Order and result data lives in the database, never here.
export const TEST_TEMPLATES: Record<string, { department: string; sampleType: string; container: string; params: TestResultItem[] }> = {
  'Complete Blood Count (CBC)': {
    department: 'Hematology',
    sampleType: 'Whole Blood',
    container: 'Lavender Top (K2 EDTA)',
    params: [
      { parameter: 'TOTAL WBC COUNT', value: '', unit: '/µL', referenceRange: '4,000 - 10,000', methodology: 'Whole Blood / Automated Flow Cytometry Method', subGroup: 'COMPLETE HEMOGRAM (AUTOMATED)' },
      { parameter: 'NEUTROPHILS', value: '', unit: '%', referenceRange: '40 - 80', methodology: 'Whole Blood / Automated Flow Cytometry Method', subGroup: 'DIFFERENTIAL CELL COUNT' },
      { parameter: 'LYMPHOCYTES', value: '', unit: '%', referenceRange: '20 - 40', methodology: 'Whole Blood / Automated Flow Cytometry Method', subGroup: 'DIFFERENTIAL CELL COUNT' },
      { parameter: 'EOSINOPHILS', value: '', unit: '%', referenceRange: '1 - 6', methodology: 'Whole Blood / Automated Flow Cytometry Method', subGroup: 'DIFFERENTIAL CELL COUNT' },
      { parameter: 'MONOCYTES', value: '', unit: '%', referenceRange: '2 - 10', methodology: 'Whole Blood / Automated Flow Cytometry Method', subGroup: 'DIFFERENTIAL CELL COUNT' },
      { parameter: 'BASOPHILS', value: '', unit: '%', referenceRange: '1 - 2', methodology: 'Whole Blood / Automated Flow Cytometry Method', subGroup: 'DIFFERENTIAL CELL COUNT' },
      { parameter: 'HEMOGLOBIN', value: '', unit: 'g/dl', referenceRange: '12.0 - 15.0', methodology: 'SLS Method', subGroup: 'COMPLETE HEMOGRAM (AUTOMATED)' },
      { parameter: 'PCV', value: '', unit: '%', referenceRange: '36.0 - 46.0', methodology: 'Cumulative Pulse Height Detection Method', subGroup: 'COMPLETE HEMOGRAM (AUTOMATED)' },
      { parameter: 'RBC COUNT', value: '', unit: 'x10^6/µL', referenceRange: '3.8 - 4.8', methodology: 'Whole Blood / Automated Impedance Method', subGroup: 'COMPLETE HEMOGRAM (AUTOMATED)' },
      { parameter: 'PLATELET COUNT', value: '', unit: '/µL', referenceRange: '150,000 - 410,000', methodology: 'Whole Blood / Automated Impedance Method', subGroup: 'COMPLETE HEMOGRAM (AUTOMATED)' },
      { parameter: 'ESR', value: '', unit: 'mm', referenceRange: '0 - 20', methodology: 'Whole Blood / Quantitative Capillary Photometry', subGroup: 'COMPLETE HEMOGRAM (AUTOMATED)' },
    ],
  },
  'Renal Function Panel': {
    department: 'Biochemistry',
    sampleType: 'Serum',
    container: 'Gold Top (SST / Gel separator)',
    params: [
      { parameter: 'UREA', value: '', unit: 'mg/dl', referenceRange: '16.6 - 48.5', methodology: 'Serum / Urease-GLDH Method', subGroup: 'RENAL FUNCTION TEST [SERUM]' },
      { parameter: 'CREATININE', value: '', unit: 'mg/dl', referenceRange: '0.51 - 0.95', methodology: 'Enzymatic Colorimetric', subGroup: 'RENAL FUNCTION TEST [SERUM]' },
      { parameter: 'SODIUM', value: '', unit: 'mmol/L', referenceRange: '135 - 145', methodology: 'Serum / ISE - Direct', subGroup: 'RENAL FUNCTION TEST [SERUM]' },
      { parameter: 'POTASSIUM', value: '', unit: 'mmol/L', referenceRange: '3.5 - 5.1', methodology: 'Serum / ISE - Direct', subGroup: 'RENAL FUNCTION TEST [SERUM]' },
      { parameter: 'CHLORIDE', value: '', unit: 'mmol/L', referenceRange: '96 - 106', methodology: 'Serum / ISE - Direct', subGroup: 'RENAL FUNCTION TEST [SERUM]' },
      { parameter: 'BICARBONATE', value: '', unit: 'mmol/L', referenceRange: '21 - 28', methodology: 'End Point PEP', subGroup: 'RENAL FUNCTION TEST [SERUM]' },
      { parameter: 'HOMOCYSTEINE', value: '', unit: 'µmol/L', referenceRange: '0 - 15', methodology: 'Enzymatic', subGroup: 'RENAL FUNCTION TEST [SERUM]' },
    ],
  },
  'Lipid Profile': {
    department: 'Biochemistry',
    sampleType: 'Serum (Fasting 12h)',
    container: 'Gold Top (SST / Gel separator)',
    params: [
      { parameter: 'TOTAL CHOLESTEROL', value: '', unit: 'mg/dl', referenceRange: 'Desirable: < 200, Borderline: 200-239', methodology: 'Endpoint-CHOD/POD', subGroup: 'LIPID PROFILE [SERUM]' },
      { parameter: 'TRIGLYCERIDES', value: '', unit: 'mg/dl', referenceRange: '< 150', methodology: 'Enzymatic-GPOD / POD Method', subGroup: 'LIPID PROFILE [SERUM]' },
      { parameter: 'HDL CHOLESTEROL', value: '', unit: 'mg/dl', referenceRange: 'Low: < 40, High: >= 60', methodology: 'Direct Homogeneous Enzymatic', subGroup: 'LIPID PROFILE [SERUM]' },
      { parameter: 'LDL CHOLESTEROL', value: '', unit: 'mg/dl', referenceRange: 'Optimal: < 100, Borderline: 130-159', methodology: 'Direct Homogeneous Enzymatic', subGroup: 'LIPID PROFILE [SERUM]' },
      { parameter: 'VLDL CHOLESTEROL', value: '', unit: 'mg/dl', referenceRange: '< 40', methodology: 'Calculation', subGroup: 'LIPID PROFILE [SERUM]' },
    ],
  },
  'HbA1c & Fasting Glucose': {
    department: 'Biochemistry',
    sampleType: 'Whole Blood EDTA + Fluoride',
    container: 'Lavender & Grey Tops',
    params: [
      { parameter: 'Fasting Blood Sugar (FBS)', value: '', unit: 'mg/dL', referenceRange: '70 - 99' },
      { parameter: 'Glycated Hemoglobin (HbA1c)', value: '', unit: '%', referenceRange: '< 5.7' },
      { parameter: 'Estimated Avg Glucose (eAG)', value: '', unit: 'mg/dL', referenceRange: '90 - 120' },
    ],
  },
  'Liver Function Profile (LFT)': {
    department: 'Biochemistry',
    sampleType: 'Serum',
    container: 'Gold Top (SST / Gel separator)',
    params: [
      { parameter: 'Total Bilirubin', value: '', unit: 'mg/dL', referenceRange: '0.2 - 1.2' },
      { parameter: 'Direct Bilirubin', value: '', unit: 'mg/dL', referenceRange: '0.0 - 0.3' },
      { parameter: 'SGOT / AST', value: '', unit: 'U/L', referenceRange: '10 - 40' },
      { parameter: 'SGPT / ALT', value: '', unit: 'U/L', referenceRange: '7 - 56' },
      { parameter: 'Alkaline Phosphatase (ALP)', value: '', unit: 'U/L', referenceRange: '44 - 147' },
      { parameter: 'Total Protein', value: '', unit: 'g/dL', referenceRange: '6.0 - 8.3' },
    ],
  },
  'Troponin I - Quantitative': {
    department: 'Cardiology / Emergency',
    sampleType: 'Plasma (Lithium Heparin)',
    container: 'Green Top (Heparin)',
    params: [
      { parameter: 'Cardiac Troponin I (cTnI)', value: '', unit: 'ng/mL', referenceRange: '< 0.04' },
      { parameter: 'CK-MB Isoenzyme', value: '', unit: 'ng/mL', referenceRange: '< 5.0' },
    ],
  },
  'Arterial Blood Gas (ABG)': {
    department: 'Critical Care Lab',
    sampleType: 'Arterial Blood (Heparinized Syringe)',
    container: 'Heparinized Blood Gas Syringe',
    params: [
      { parameter: 'pH (Arterial)', value: '', unit: 'pH', referenceRange: '7.35 - 7.45' },
      { parameter: 'pCO2', value: '', unit: 'mmHg', referenceRange: '35 - 45' },
      { parameter: 'pO2', value: '', unit: 'mmHg', referenceRange: '80 - 100' },
      { parameter: 'HCO3 (Bicarbonate)', value: '', unit: 'mEq/L', referenceRange: '22 - 26' },
      { parameter: 'Base Excess', value: '', unit: 'mEq/L', referenceRange: '-2 to +2' },
      { parameter: 'Oxygen Saturation (sO2)', value: '', unit: '%', referenceRange: '95 - 100' },
    ],
  },
  'Urine Routine & Microscopic': {
    department: 'Clinical Pathology',
    sampleType: 'Midstream Urine',
    container: 'Sterile Urine Container (Yellow cap)',
    params: [
      { parameter: 'Color & Appearance', value: '', unit: '', referenceRange: 'Pale Yellow, Clear' },
      { parameter: 'Specific Gravity', value: '', unit: '', referenceRange: '1.005 - 1.030' },
      { parameter: 'pH', value: '', unit: '', referenceRange: '4.5 - 8.0' },
      { parameter: 'Urine Protein', value: '', unit: '', referenceRange: 'Nil / Negative' },
      { parameter: 'Urine Glucose', value: '', unit: '', referenceRange: 'Nil / Negative' },
      { parameter: 'Pus Cells (WBCs)', value: '', unit: '/hpf', referenceRange: '0 - 5' },
      { parameter: 'Red Blood Cells (RBCs)', value: '', unit: '/hpf', referenceRange: '0 - 2' },
    ],
  },
}
