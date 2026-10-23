import type { LabOrder, LabOrderStatus, Priority, TestResultItem } from './types'

const STORAGE_KEY = 'careweave_lab_orders_v4'

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

const DEFAULT_ORDERS: LabOrder[] = [
  {
    id: 'ORD-2057808',
    patientId: 'PT-618135',
    patientUhid: '618135',
    patientNo: '618135',
    visitNo: '3882620',
    labNo: '2057808, 2058027',
    opIp: 'IP',
    patientName: 'Mrs. DEEPA.S',
    patientAge: 43,
    patientGender: 'F',
    encounterId: 'ENC-2026-3882620',
    testName: 'Complete Hemogram, RFT & Lipid Profile',
    department: 'HAEMATOLOGY & BIOCHEMISTRY',
    orderingDoctor: 'Dr. ANIRBAN LAHA',
    referralDoctor: 'Dr. ANIRBAN LAHA',
    orderedAt: '2026-08-03T12:13:00.000Z',
    registrationAt: '2026-08-03T12:13:00.000Z',
    collectedAt: '2026-08-03T17:36:00.000Z',
    reportedAt: '2026-08-04T09:17:00.000Z',
    approvedAt: '2026-08-04T19:03:00.000Z',
    status: 'released',
    priority: 'routine',
    sampleType: 'Whole Blood (EDTA) & Serum',
    sampleContainer: 'Lavender Top (K2 EDTA) & SST Gold',
    sampleBarcode: 'SMP-2026-618135',
    collectedBy: 'Phleb. Sarah V.',
    processedBy: 'Dr. Asekkumar, M.Sc., PhD',
    verifiedBy: 'Dr. KALA.K MD., DNB., DipRCPath',
    consultantPathologist: 'DR. U.S. MANEESHA., MBBS, DCP., DNB',
    headOfDepartment: 'Dr. KALA.K MD., DNB., DipRCPath',
    results: [
      { parameter: 'TOTAL WBC COUNT', value: '11,510', unit: '/µL', referenceRange: '4000-10000', methodology: 'Whole Blood / Automated Flow Cytometry Method', subGroup: 'COMPLETE HEMOGRAM (AUTOMATED)', flag: 'abnormal' },
      { parameter: 'NEUTROPHILS', value: '79.7', unit: '%', referenceRange: '40-80', methodology: 'Whole Blood / Automated Flow Cytometry Method', subGroup: 'DIFFERENTIAL CELL COUNT', flag: 'normal' },
      { parameter: 'LYMPHOCYTES', value: '16.0', unit: '%', referenceRange: '20-40', methodology: 'Whole Blood / Automated Flow Cytometry Method', subGroup: 'DIFFERENTIAL CELL COUNT', flag: 'abnormal' },
      { parameter: 'EOSINOPHILS', value: '0.7', unit: '%', referenceRange: '1-6', methodology: 'Whole Blood / Automated Flow Cytometry Method', subGroup: 'DIFFERENTIAL CELL COUNT', flag: 'abnormal' },
      { parameter: 'MONOCYTES', value: '3.3', unit: '%', referenceRange: '2-10', methodology: 'Whole Blood / Automated Flow Cytometry Method', subGroup: 'DIFFERENTIAL CELL COUNT', flag: 'normal' },
      { parameter: 'BASOPHILS', value: '0.3', unit: '%', referenceRange: '1-2', methodology: 'Whole Blood / Automated Flow Cytometry Method', subGroup: 'DIFFERENTIAL CELL COUNT', flag: 'abnormal' },
      { parameter: 'HEMOGLOBIN', value: '11.3', unit: 'g/dl', referenceRange: '12-15', methodology: 'SLS Method', subGroup: 'COMPLETE HEMOGRAM (AUTOMATED)', flag: 'abnormal' },
      { parameter: 'PCV', value: '35.8', unit: '%', referenceRange: '36-46', methodology: 'Cumulative Pulse Height Detection Method', subGroup: 'COMPLETE HEMOGRAM (AUTOMATED)', flag: 'abnormal' },
      { parameter: 'RBC COUNT', value: '4.07', unit: 'x10^6/µL', referenceRange: '3.8-4.8', methodology: 'Whole Blood / Automated Impedance Method', subGroup: 'COMPLETE HEMOGRAM (AUTOMATED)', flag: 'normal' },
      { parameter: 'PLATELET COUNT', value: '257,000', unit: '/µL', referenceRange: '150000-410000', methodology: 'Whole Blood / Automated Impedance Method', subGroup: 'COMPLETE HEMOGRAM (AUTOMATED)', flag: 'normal' },
      { parameter: 'ESR', value: '40', unit: 'mm', referenceRange: '0-20', methodology: 'Whole Blood / Quantitative Capillary Photometry', subGroup: 'COMPLETE HEMOGRAM (AUTOMATED)', flag: 'abnormal' },
      { parameter: 'UREA', value: '28', unit: 'mg/dl', referenceRange: '16.6-48.5', methodology: 'Serum / Urease-GLDH Method', subGroup: 'RENAL FUNCTION TEST [SERUM]', flag: 'normal' },
      { parameter: 'CREATININE', value: '0.8', unit: 'mg/dl', referenceRange: '0.51-0.95', methodology: 'Enzymatic Colorimetric', subGroup: 'RENAL FUNCTION TEST [SERUM]', flag: 'normal' },
      { parameter: 'SODIUM', value: '144', unit: 'mmol/L', referenceRange: '135-145', methodology: 'Serum / ISE - Direct', subGroup: 'RENAL FUNCTION TEST [SERUM]', flag: 'normal' },
      { parameter: 'POTASSIUM', value: '4.2', unit: 'mmol/L', referenceRange: '3.5-5.1', methodology: 'Serum / ISE - Direct', subGroup: 'RENAL FUNCTION TEST [SERUM]', flag: 'normal' },
      { parameter: 'CHLORIDE', value: '103', unit: 'mmol/L', referenceRange: '98-106', methodology: 'Serum / ISE - Direct', subGroup: 'RENAL FUNCTION TEST [SERUM]', flag: 'normal' },
      { parameter: 'BICARBONATE', value: '24.7', unit: 'mmol/L', referenceRange: '21-28', methodology: 'End Point PEP', subGroup: 'RENAL FUNCTION TEST [SERUM]', flag: 'normal' },
      { parameter: 'HOMOCYSTEINE', value: '18.90', unit: 'µmol/L', referenceRange: '0-15', methodology: 'Enzymatic', subGroup: 'RENAL FUNCTION TEST [SERUM]', flag: 'abnormal' },
      { parameter: 'TROPONIN I', value: '<0.01', unit: 'ng/mL', referenceRange: '0.00-0.10', methodology: 'ECLIA', subGroup: 'RENAL FUNCTION TEST [SERUM]', flag: 'normal' },
      { parameter: 'TOTAL CHOLESTEROL', value: '204', unit: 'mg/dl', referenceRange: 'Desirable: < 200, Borderline: 200-239', methodology: 'Endpoint-CHOD/POD', subGroup: 'LIPID PROFILE [SERUM]', flag: 'abnormal' },
      { parameter: 'TRIGLYCERIDES', value: '113', unit: 'mg/dl', referenceRange: '< 150', methodology: 'Enzymatic-GPOD / POD Method', subGroup: 'LIPID PROFILE [SERUM]', flag: 'normal' },
      { parameter: 'HDL CHOLESTEROL', value: '60', unit: 'mg/dl', referenceRange: 'Low: < 40, High: >= 60', methodology: 'Direct Homogeneous Enzymatic', subGroup: 'LIPID PROFILE [SERUM]', flag: 'normal' },
      { parameter: 'LDL CHOLESTEROL', value: '135.0', unit: 'mg/dl', referenceRange: 'Optimal: < 100, Borderline: 130-159', methodology: 'Direct Homogeneous Enzymatic', subGroup: 'LIPID PROFILE [SERUM]', flag: 'abnormal' },
      { parameter: 'HBA1C', value: '5.6', unit: '%', referenceRange: 'Normal: Less than 5.7%', methodology: 'High-Performance Liquid Chromatography (HPLC)', subGroup: 'BIOCHEMISTRY - GLYCEMIC', flag: 'normal' },
      { parameter: 'TSH', value: '1.97', unit: 'µIU/ml', referenceRange: '0.27-4.2', methodology: 'Serum / ECLIA', subGroup: 'THYROID FUNCTION TEST [SERUM]', flag: 'normal' },
      { parameter: 'TOTAL T3', value: '75.23', unit: 'ng/dl', referenceRange: '80-200', methodology: 'Serum / ECLIA', subGroup: 'THYROID FUNCTION TEST [SERUM]', flag: 'abnormal' },
      { parameter: 'TOTAL T4', value: '6.34', unit: 'µg/dl', referenceRange: '5.1-14.1', methodology: 'Serum / ECLIA', subGroup: 'THYROID FUNCTION TEST [SERUM]', flag: 'normal' },
    ],
  },
  {
    id: 'ORD-8821',
    patientId: 'PT-9042',
    patientName: 'Ramesh Kumar',
    patientAge: 58,
    patientGender: 'M',
    encounterId: 'ENC-2026-4401',
    testName: 'Troponin I - Quantitative',
    department: 'Cardiology / Emergency',
    orderingDoctor: 'Dr. Rajesh Iyer',
    orderedAt: new Date(Date.now() - 25 * 60_000).toISOString(),
    status: 'requested',
    priority: 'urgent',
    sampleType: 'Plasma (Lithium Heparin)',
    sampleContainer: 'Green Top (Heparin)',
    handlingNote: 'Patient presenting with severe retrosternal chest pain. STAT turnaround required.',
  },
  {
    id: 'ORD-8820',
    patientId: 'PT-9043',
    patientName: 'Sunita Menon',
    patientAge: 46,
    patientGender: 'F',
    encounterId: 'ENC-2026-4398',
    testName: 'Lipid Profile',
    department: 'Biochemistry',
    orderingDoctor: 'Dr. Priya Sharma',
    orderedAt: new Date(Date.now() - 55 * 60_000).toISOString(),
    status: 'collection_pending',
    priority: 'routine',
    sampleType: 'Serum (Fasting 12h)',
    sampleContainer: 'Gold Top (SST / Gel separator)',
    handlingNote: 'Fasting confirmed by patient since 9:00 PM yesterday.',
  },
  {
    id: 'ORD-8819',
    patientId: 'PT-9039',
    patientName: 'Karthik Balan',
    patientAge: 32,
    patientGender: 'M',
    encounterId: 'ENC-2026-4389',
    testName: 'Complete Blood Count (CBC)',
    department: 'Hematology',
    orderingDoctor: 'Dr. Ananya Das',
    orderedAt: new Date(Date.now() - 110 * 60_000).toISOString(),
    status: 'collected',
    priority: 'urgent',
    sampleType: 'Whole Blood',
    sampleContainer: 'Lavender Top (K2 EDTA)',
    sampleBarcode: 'SMP-2026-7731',
    collectedAt: new Date(Date.now() - 40 * 60_000).toISOString(),
    collectedBy: 'Phleb. Sarah V.',
    handlingNote: 'Suspected dengue fever. Check platelet count with manual smear confirmation if < 100,000.',
  },
  {
    id: 'ORD-8818',
    patientId: 'PT-9031',
    patientName: 'Mohamed Rafiq',
    patientAge: 62,
    patientGender: 'M',
    encounterId: 'ENC-2026-4375',
    testName: 'Renal Function Panel',
    department: 'Biochemistry',
    orderingDoctor: 'Dr. Sundaram K',
    orderedAt: new Date(Date.now() - 180 * 60_000).toISOString(),
    status: 'processing',
    priority: 'routine',
    sampleType: 'Serum',
    sampleContainer: 'Gold Top (SST / Gel separator)',
    sampleBarcode: 'SMP-2026-7720',
    collectedAt: new Date(Date.now() - 120 * 60_000).toISOString(),
    collectedBy: 'Phleb. Vimal R.',
    processedBy: 'Tech. Geetha N.',
    handlingNote: 'Known hypertensive patient on telmisartan.',
    results: [
      { parameter: 'Serum Creatinine', value: '1.45', unit: 'mg/dL', referenceRange: '0.7 - 1.2', flag: 'abnormal' },
      { parameter: 'Blood Urea Nitrogen (BUN)', value: '26', unit: 'mg/dL', referenceRange: '7 - 20', flag: 'abnormal' },
      { parameter: 'Serum Sodium', value: '138', unit: 'mEq/L', referenceRange: '135 - 145', flag: 'normal' },
      { parameter: 'Serum Potassium', value: '4.8', unit: 'mEq/L', referenceRange: '3.5 - 5.0', flag: 'normal' },
      { parameter: 'Serum Chloride', value: '101', unit: 'mEq/L', referenceRange: '96 - 106', flag: 'normal' },
    ],
  },
  {
    id: 'ORD-8817',
    patientId: 'PT-9018',
    patientName: 'Devika Krishnan',
    patientAge: 69,
    patientGender: 'F',
    encounterId: 'ENC-2026-4360',
    testName: 'Arterial Blood Gas (ABG)',
    department: 'Critical Care Lab',
    orderingDoctor: 'Dr. Vikram Seth',
    orderedAt: new Date(Date.now() - 240 * 60_000).toISOString(),
    status: 'awaiting_verification',
    priority: 'urgent',
    sampleType: 'Arterial Blood (Heparinized Syringe)',
    sampleContainer: 'Heparinized Blood Gas Syringe',
    sampleBarcode: 'SMP-2026-7712',
    collectedAt: new Date(Date.now() - 90 * 60_000).toISOString(),
    collectedBy: 'Dr. Rahul (ICU Registrar)',
    processedBy: 'Tech. Arun P.',
    technicianNotes: 'Direct arterial puncture. Analyzed immediately on Radiometer ABL90.',
    results: [
      { parameter: 'pH (Arterial)', value: '7.28', unit: 'pH', referenceRange: '7.35 - 7.45', flag: 'critical' },
      { parameter: 'pCO2', value: '54.0', unit: 'mmHg', referenceRange: '35 - 45', flag: 'abnormal' },
      { parameter: 'pO2', value: '72.0', unit: 'mmHg', referenceRange: '80 - 100', flag: 'abnormal' },
      { parameter: 'HCO3 (Bicarbonate)', value: '24.8', unit: 'mEq/L', referenceRange: '22 - 26', flag: 'normal' },
      { parameter: 'Base Excess', value: '-1.8', unit: 'mEq/L', referenceRange: '-2 to +2', flag: 'normal' },
      { parameter: 'Oxygen Saturation (sO2)', value: '91.5', unit: '%', referenceRange: '95 - 100', flag: 'critical' },
    ],
  },
  {
    id: 'ORD-8816',
    patientId: 'PT-9022',
    patientName: 'Anita Jacob',
    patientAge: 51,
    patientGender: 'F',
    encounterId: 'ENC-2026-4355',
    testName: 'HbA1c & Fasting Glucose',
    department: 'Biochemistry',
    orderingDoctor: 'Dr. Meenakshi Sundaram',
    orderedAt: new Date(Date.now() - 320 * 60_000).toISOString(),
    status: 'awaiting_verification',
    priority: 'routine',
    sampleType: 'Whole Blood EDTA + Fluoride',
    sampleContainer: 'Lavender & Grey Tops',
    sampleBarcode: 'SMP-2026-7705',
    collectedAt: new Date(Date.now() - 210 * 60_000).toISOString(),
    collectedBy: 'Phleb. Sarah V.',
    processedBy: 'Tech. Geetha N.',
    technicianNotes: 'HPLC Bio-Rad D-10 analyzer. Calibrator within acceptable CV (< 1.5%).',
    results: [
      { parameter: 'Fasting Blood Sugar (FBS)', value: '142', unit: 'mg/dL', referenceRange: '70 - 99', flag: 'abnormal' },
      { parameter: 'Glycated Hemoglobin (HbA1c)', value: '8.1', unit: '%', referenceRange: '< 5.7', flag: 'abnormal' },
      { parameter: 'Estimated Avg Glucose (eAG)', value: '186', unit: 'mg/dL', referenceRange: '90 - 120', flag: 'abnormal' },
    ],
  },
  {
    id: 'ORD-8815',
    patientId: 'PT-9011',
    patientName: 'Subramanian G',
    patientAge: 74,
    patientGender: 'M',
    encounterId: 'ENC-2026-4340',
    testName: 'Renal Function Panel',
    department: 'Biochemistry',
    orderingDoctor: 'Dr. Rajesh Iyer',
    orderedAt: new Date(Date.now() - 400 * 60_000).toISOString(),
    status: 'recollect_required',
    priority: 'urgent',
    sampleType: 'Serum',
    sampleContainer: 'Gold Top (SST / Gel separator)',
    sampleBarcode: 'SMP-2026-7690',
    collectedAt: new Date(Date.now() - 330 * 60_000).toISOString(),
    collectedBy: 'Ward Phleb.',
    statusReason: 'Grossly hemolyzed serum (4+ hemoglobin index). Potassium and enzymes cannot be accurately quantified.',
    handlingNote: 'Ward 4 Bed 12. Please use butterfly needle 21G with slow draw to prevent hemolysis.',
  },
  {
    id: 'ORD-8814',
    patientId: 'PT-8994',
    patientName: 'Lakshmi Narayanan',
    patientAge: 43,
    patientGender: 'M',
    encounterId: 'ENC-2026-4322',
    testName: 'Liver Function Profile (LFT)',
    department: 'Biochemistry',
    orderingDoctor: 'Dr. Sneha Patil',
    orderedAt: new Date(Date.now() - 600 * 60_000).toISOString(),
    status: 'verified',
    priority: 'routine',
    sampleType: 'Serum',
    sampleContainer: 'Gold Top (SST / Gel separator)',
    sampleBarcode: 'SMP-2026-7650',
    collectedAt: new Date(Date.now() - 510 * 60_000).toISOString(),
    collectedBy: 'Phleb. Vimal R.',
    processedBy: 'Tech. Arun P.',
    verifiedBy: 'Dr. S. Mukherjee, MD Path',
    verifiedAt: new Date(Date.now() - 150 * 60_000).toISOString(),
    pathologistNotes: 'Mild transaminitis consistent with clinical presentation. Repeat advised in 4 weeks.',
    results: [
      { parameter: 'Total Bilirubin', value: '0.9', unit: 'mg/dL', referenceRange: '0.2 - 1.2', flag: 'normal' },
      { parameter: 'Direct Bilirubin', value: '0.2', unit: 'mg/dL', referenceRange: '0.0 - 0.3', flag: 'normal' },
      { parameter: 'SGOT / AST', value: '62', unit: 'U/L', referenceRange: '10 - 40', flag: 'abnormal' },
      { parameter: 'SGPT / ALT', value: '78', unit: 'U/L', referenceRange: '7 - 56', flag: 'abnormal' },
      { parameter: 'Alkaline Phosphatase (ALP)', value: '112', unit: 'U/L', referenceRange: '44 - 147', flag: 'normal' },
      { parameter: 'Total Protein', value: '7.1', unit: 'g/dL', referenceRange: '6.0 - 8.3', flag: 'normal' },
    ],
  },
  {
    id: 'ORD-8813',
    patientId: 'PT-8982',
    patientName: 'Fatima Zehra',
    patientAge: 38,
    patientGender: 'F',
    encounterId: 'ENC-2026-4301',
    testName: 'Complete Blood Count (CBC)',
    department: 'Hematology',
    orderingDoctor: 'Dr. K. Ramanathan',
    orderedAt: new Date(Date.now() - 800 * 60_000).toISOString(),
    status: 'released',
    priority: 'routine',
    sampleType: 'Whole Blood',
    sampleContainer: 'Lavender Top (K2 EDTA)',
    sampleBarcode: 'SMP-2026-7610',
    collectedAt: new Date(Date.now() - 720 * 60_000).toISOString(),
    collectedBy: 'Phleb. Sarah V.',
    processedBy: 'Tech. Geetha N.',
    verifiedBy: 'Dr. S. Mukherjee, MD Path',
    verifiedAt: new Date(Date.now() - 360 * 60_000).toISOString(),
    results: [
      { parameter: 'Hemoglobin', value: '11.2', unit: 'g/dL', referenceRange: '12.0 - 15.5', flag: 'abnormal' },
      { parameter: 'Total Leukocyte Count (WBC)', value: '7,400', unit: '/µL', referenceRange: '4,000 - 11,000', flag: 'normal' },
      { parameter: 'Platelet Count', value: '240,000', unit: '/µL', referenceRange: '150,000 - 450,000', flag: 'normal' },
      { parameter: 'Packed Cell Volume (PCV)', value: '35.2', unit: '%', referenceRange: '36.0 - 46.0', flag: 'abnormal' },
      { parameter: 'Mean Corpuscular Volume (MCV)', value: '76.4', unit: 'fL', referenceRange: '80.0 - 100.0', flag: 'abnormal' },
    ],
  },
  {
    id: 'ORD-8812',
    patientId: 'PT-8975',
    patientName: 'Gopalakrishnan V',
    patientAge: 65,
    patientGender: 'M',
    encounterId: 'ENC-2026-4290',
    testName: 'Urine Routine & Microscopic',
    department: 'Clinical Pathology',
    orderingDoctor: 'Dr. Arvind Swamy',
    orderedAt: new Date(Date.now() - 950 * 60_000).toISOString(),
    status: 'processing',
    priority: 'routine',
    sampleType: 'Midstream Urine',
    sampleContainer: 'Sterile Urine Container (Yellow cap)',
    sampleBarcode: 'SMP-2026-7580',
    collectedAt: new Date(Date.now() - 600 * 60_000).toISOString(),
    collectedBy: 'OPD Reception',
    processedBy: 'Tech. Arun P.',
  },
  {
    id: 'ORD-8811',
    patientId: 'PT-8960',
    patientName: 'Master Aarav',
    patientAge: 6,
    patientGender: 'M',
    encounterId: 'ENC-2026-4277',
    testName: 'Complete Blood Count (CBC)',
    department: 'Hematology',
    orderingDoctor: 'Dr. Shalini Nair',
    orderedAt: new Date(Date.now() - 1200 * 60_000).toISOString(),
    status: 'cancelled',
    priority: 'routine',
    statusReason: 'Duplicate test requisition ordered by junior resident. Order cancelled after doctor confirmation.',
  },
]

function readStoredOrders(): LabOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  saveStoredOrders(DEFAULT_ORDERS)
  return DEFAULT_ORDERS
}

function saveStoredOrders(orders: LabOrder[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders))
  } catch {}
}

export async function getLabOrders(): Promise<LabOrder[]> {
  try {
    const res = await fetch('/api/lab/orders', { credentials: 'include' })
    if (res.ok) {
      const body = await res.json()
      if (Array.isArray(body?.data) && body.data.length > 0) return body.data
    }
  } catch {
    // Backend offline: seamlessly fallback to local persistent store
  }
  return readStoredOrders()
}

export async function getLabOrder(id: string): Promise<LabOrder | null> {
  const orders = await getLabOrders()
  return orders.find((o) => o.id === id) ?? null
}

export async function updateOrderStatus(
  id: string,
  status: LabOrderStatus,
  extra: Partial<LabOrder> = {},
): Promise<LabOrder> {
  const orders = readStoredOrders()
  const idx = orders.findIndex((o) => o.id === id)
  if (idx === -1) throw new Error(`Order ${id} not found`)

  const updated: LabOrder = {
    ...orders[idx],
    ...extra,
    status,
  }
  orders[idx] = updated
  saveStoredOrders(orders)
  return updated
}

export async function recordSampleCollection(
  id: string,
  data: { sampleType: string; container: string; barcode: string; collector: string },
): Promise<LabOrder> {
  return updateOrderStatus(id, 'collected', {
    sampleType: data.sampleType,
    sampleContainer: data.container,
    sampleBarcode: data.barcode,
    collectedBy: data.collector,
    collectedAt: new Date().toISOString(),
  })
}

export async function recordTestResults(
  id: string,
  data: { results: TestResultItem[]; notes?: string; submitForVerification?: boolean },
): Promise<LabOrder> {
  return updateOrderStatus(id, data.submitForVerification ? 'awaiting_verification' : 'processing', {
    results: data.results,
    technicianNotes: data.notes,
    processedBy: 'Lab Technician on Duty',
  })
}

export async function verifyAndReleaseOrder(
  id: string,
  data: { verifiedBy: string; notes?: string },
): Promise<LabOrder> {
  return updateOrderStatus(id, 'released', {
    verifiedBy: data.verifiedBy,
    pathologistNotes: data.notes,
    verifiedAt: new Date().toISOString(),
  })
}

export async function requestOrderRecollection(id: string, reason: string): Promise<LabOrder> {
  return updateOrderStatus(id, 'recollect_required', {
    statusReason: reason,
  })
}

export async function createLabOrder(data: {
  patientName: string
  patientId?: string
  patientAge: number
  patientGender: 'M' | 'F' | 'O'
  testName: string
  orderingDoctor: string
  priority: Priority
  handlingNote?: string
  patientUhid?: string
  visitNo?: string
  opIp?: 'OP' | 'IP'
  referralDoctor?: string
}): Promise<LabOrder> {
  const orders = readStoredOrders()
  const template = TEST_TEMPLATES[data.testName]
  const nextNum = Math.floor(8822 + Math.random() * 900)
  const uhid = data.patientUhid || String(Math.floor(618100 + Math.random() * 900))
  const newOrder: LabOrder = {
    id: `ORD-${nextNum}`,
    patientId: data.patientId || `PT-${uhid}`,
    patientUhid: uhid,
    patientNo: uhid,
    visitNo: data.visitNo || `388${Math.floor(2600 + Math.random() * 100)}`,
    labNo: String(2057800 + Math.floor(Math.random() * 500)),
    opIp: data.opIp || 'OP',
    referralDoctor: data.referralDoctor || data.orderingDoctor,
    registrationAt: new Date().toISOString(),
    patientName: data.patientName,
    patientAge: data.patientAge,
    patientGender: data.patientGender,
    encounterId: `ENC-2026-${Math.floor(4420 + Math.random() * 100)}`,
    testName: data.testName,
    department: template?.department || 'Diagnostic Laboratory',
    orderingDoctor: data.orderingDoctor,
    orderedAt: new Date().toISOString(),
    status: 'requested',
    priority: data.priority,
    sampleType: template?.sampleType || 'Whole Blood / Serum',
    sampleContainer: template?.container || 'Standard Specimen Container',
    handlingNote: data.handlingNote || undefined,
  }

  const updated = [newOrder, ...orders]
  saveStoredOrders(updated)
  return newOrder
}

export function resetLabOrders(): LabOrder[] {
  saveStoredOrders(DEFAULT_ORDERS)
  return DEFAULT_ORDERS
}
