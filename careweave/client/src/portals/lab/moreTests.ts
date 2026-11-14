import type { TestResultItem } from './types'

export type TestTemplate = {
  category: string
  department: string
  sampleType: string
  container: string
  params: TestResultItem[]
}

/** One result row. Reference ranges are typical adult values; a laboratory confirms them against its own analyser and method. */
const r = (parameter: string, unit: string, referenceRange: string, subGroup?: string): TestResultItem => ({
  parameter, value: '', unit, referenceRange, ...(subGroup ? { subGroup } : {}),
})

/** Imaging and procedure results are a written report: what was done, what was seen, and the conclusion. */
const report = (extra: TestResultItem[] = []): TestResultItem[] => [
  r('Technique / Protocol', '', 'As performed'),
  ...extra,
  r('Findings', '', 'Radiologist report'),
  r('Impression', '', 'Radiologist report'),
]

const SERUM = { sampleType: 'Serum', container: 'Gold Top (SST / Gel separator)' }
const EDTA = { sampleType: 'Whole Blood (EDTA)', container: 'Lavender Top (K2 EDTA)' }
const NO_SPECIMEN = { sampleType: 'Imaging (no specimen)', container: 'Not applicable' }
const SERO = { department: 'Serology', ...SERUM }

/** Tests beyond the core panels in testCatalog.ts. The category is what the doctor's and the laboratory's pickers group by. */
export const MORE_TESTS: Record<string, TestTemplate> = {
  // ── Hematology ─────────────────────────────────────────────────────────────
  'Peripheral Blood Smear': {
    category: 'Hematology', department: 'Hematology', ...EDTA,
    params: [
      r('RBC Morphology', '', 'Normocytic, normochromic'),
      r('WBC Morphology', '', 'Normal'),
      r('Platelets', '', 'Adequate'),
      r('Parasites', '', 'Not seen'),
      r('Impression', '', 'Pathologist opinion'),
    ],
  },
  'ESR (Erythrocyte Sedimentation Rate)': {
    category: 'Hematology', department: 'Hematology', ...EDTA,
    params: [r('ESR (1st hour)', 'mm/hr', '0 - 20')],
  },
  'Prothrombin Time (PT / INR)': {
    category: 'Hematology', department: 'Coagulation', sampleType: 'Plasma (Citrate)', container: 'Light Blue Top (Sodium Citrate)',
    params: [r('Prothrombin Time (PT)', 'sec', '11.0 - 13.5'), r('INR', '', '0.8 - 1.2')],
  },
  'aPTT (Activated Partial Thromboplastin Time)': {
    category: 'Hematology', department: 'Coagulation', sampleType: 'Plasma (Citrate)', container: 'Light Blue Top (Sodium Citrate)',
    params: [r('aPTT', 'sec', '25 - 35')],
  },
  'D-Dimer': {
    category: 'Hematology', department: 'Coagulation', sampleType: 'Plasma (Citrate)', container: 'Light Blue Top (Sodium Citrate)',
    params: [r('D-Dimer', 'ng/mL FEU', '< 500')],
  },
  'Blood Grouping & Rh Typing': {
    category: 'Hematology', department: 'Blood Bank', ...EDTA,
    params: [r('ABO Group', '', 'A / B / AB / O'), r('Rh (D) Type', '', 'Positive / Negative')],
  },

  // ── Biochemistry ───────────────────────────────────────────────────────────
  'Comprehensive Metabolic Panel (CMP)': {
    category: 'Biochemistry', department: 'Biochemistry', ...SERUM,
    params: [
      r('Glucose (Fasting)', 'mg/dL', '70 - 99', 'COMPREHENSIVE METABOLIC PANEL'),
      r('Urea Nitrogen (BUN)', 'mg/dL', '7 - 20', 'COMPREHENSIVE METABOLIC PANEL'),
      r('Creatinine', 'mg/dL', '0.6 - 1.3', 'COMPREHENSIVE METABOLIC PANEL'),
      r('Sodium', 'mmol/L', '135 - 145', 'COMPREHENSIVE METABOLIC PANEL'),
      r('Potassium', 'mmol/L', '3.5 - 5.1', 'COMPREHENSIVE METABOLIC PANEL'),
      r('Chloride', 'mmol/L', '98 - 107', 'COMPREHENSIVE METABOLIC PANEL'),
      r('Bicarbonate (CO2)', 'mmol/L', '22 - 29', 'COMPREHENSIVE METABOLIC PANEL'),
      r('Calcium', 'mg/dL', '8.6 - 10.2', 'COMPREHENSIVE METABOLIC PANEL'),
      r('Total Protein', 'g/dL', '6.0 - 8.3', 'COMPREHENSIVE METABOLIC PANEL'),
      r('Albumin', 'g/dL', '3.5 - 5.0', 'COMPREHENSIVE METABOLIC PANEL'),
      r('Total Bilirubin', 'mg/dL', '0.2 - 1.2', 'COMPREHENSIVE METABOLIC PANEL'),
      r('Alkaline Phosphatase (ALP)', 'U/L', '44 - 147', 'COMPREHENSIVE METABOLIC PANEL'),
      r('SGOT / AST', 'U/L', '10 - 40', 'COMPREHENSIVE METABOLIC PANEL'),
      r('SGPT / ALT', 'U/L', '7 - 56', 'COMPREHENSIVE METABOLIC PANEL'),
    ],
  },
  'Fasting Blood Glucose (FBS)': {
    category: 'Biochemistry', department: 'Biochemistry', sampleType: 'Plasma (Fluoride)', container: 'Grey Top (Sodium Fluoride)',
    params: [r('Fasting Blood Sugar (FBS)', 'mg/dL', '70 - 99')],
  },
  'Post-Prandial Blood Glucose (PPBS)': {
    category: 'Biochemistry', department: 'Biochemistry', sampleType: 'Plasma (Fluoride)', container: 'Grey Top (Sodium Fluoride)',
    params: [r('Post-Prandial Blood Sugar (2 h)', 'mg/dL', '< 140')],
  },
  'Random Blood Glucose (RBS)': {
    category: 'Biochemistry', department: 'Biochemistry', sampleType: 'Plasma (Fluoride)', container: 'Grey Top (Sodium Fluoride)',
    params: [r('Random Blood Sugar (RBS)', 'mg/dL', '< 140')],
  },
  'HbA1c (Glycated Hemoglobin)': {
    category: 'Biochemistry', department: 'Biochemistry', ...EDTA,
    params: [r('Glycated Hemoglobin (HbA1c)', '%', '< 5.7'), r('Estimated Avg Glucose (eAG)', 'mg/dL', '< 117')],
  },
  'Serum Electrolytes': {
    category: 'Biochemistry', department: 'Biochemistry', ...SERUM,
    params: [
      r('Sodium', 'mmol/L', '135 - 145'), r('Potassium', 'mmol/L', '3.5 - 5.1'),
      r('Chloride', 'mmol/L', '98 - 107'), r('Bicarbonate', 'mmol/L', '22 - 29'),
    ],
  },
  'Serum Calcium': { category: 'Biochemistry', department: 'Biochemistry', ...SERUM, params: [r('Calcium (Total)', 'mg/dL', '8.6 - 10.2')] },
  'Serum Magnesium': { category: 'Biochemistry', department: 'Biochemistry', ...SERUM, params: [r('Magnesium', 'mg/dL', '1.7 - 2.2')] },
  'Serum Uric Acid': { category: 'Biochemistry', department: 'Biochemistry', ...SERUM, params: [r('Uric Acid', 'mg/dL', 'M: 3.5 - 7.2, F: 2.6 - 6.0')] },
  'Amylase & Lipase': {
    category: 'Biochemistry', department: 'Biochemistry', ...SERUM,
    params: [r('Amylase', 'U/L', '28 - 100'), r('Lipase', 'U/L', '0 - 160')],
  },
  'C-Reactive Protein (CRP)': { category: 'Biochemistry', department: 'Biochemistry', ...SERUM, params: [r('C-Reactive Protein (CRP)', 'mg/L', '< 5')] },
  'Iron Studies': {
    category: 'Biochemistry', department: 'Biochemistry', ...SERUM,
    params: [
      r('Serum Iron', 'µg/dL', '60 - 170'), r('TIBC', 'µg/dL', '240 - 450'),
      r('Transferrin Saturation', '%', '20 - 50'), r('Ferritin', 'ng/mL', '12 - 300'),
    ],
  },
  'Vitamin D (25-OH)': { category: 'Biochemistry', department: 'Immunoassay', ...SERUM, params: [r('25-OH Vitamin D', 'ng/mL', '30 - 100')] },
  'Vitamin B12': { category: 'Biochemistry', department: 'Immunoassay', ...SERUM, params: [r('Vitamin B12', 'pg/mL', '200 - 900')] },

  // ── Thyroid & hormones ─────────────────────────────────────────────────────
  'Thyroid Stimulating Hormone (TSH)': {
    category: 'Thyroid & Hormones', department: 'Immunoassay', ...SERUM,
    params: [r('TSH', 'µIU/mL', '0.4 - 4.0')],
  },
  'Thyroid Profile (T3, T4, TSH)': {
    category: 'Thyroid & Hormones', department: 'Immunoassay', ...SERUM,
    params: [r('Total T3', 'ng/dL', '80 - 200'), r('Total T4', 'µg/dL', '5.1 - 14.1'), r('TSH', 'µIU/mL', '0.4 - 4.0')],
  },
  'Serum Beta hCG (Quantitative)': {
    category: 'Thyroid & Hormones', department: 'Immunoassay', ...SERUM,
    params: [r('Beta hCG', 'mIU/mL', 'Non-pregnant: < 5')],
  },
  'PSA (Total)': { category: 'Thyroid & Hormones', department: 'Immunoassay', ...SERUM, params: [r('Total PSA', 'ng/mL', '< 4.0')] },

  // ── Cardiac & critical care ────────────────────────────────────────────────
  'NT-proBNP': {
    category: 'Cardiac & Critical Care', department: 'Immunoassay', sampleType: 'Plasma (Lithium Heparin)', container: 'Green Top (Heparin)',
    params: [r('NT-proBNP', 'pg/mL', '< 125')],
  },
  'Lactate': {
    category: 'Cardiac & Critical Care', department: 'Critical Care Lab', sampleType: 'Plasma (Fluoride)', container: 'Grey Top (Sodium Fluoride), on ice',
    params: [r('Lactate', 'mmol/L', '0.5 - 2.2')],
  },

  // ── Urine & stool ──────────────────────────────────────────────────────────
  'Urine Albumin-Creatinine Ratio (ACR)': {
    category: 'Urine & Stool', department: 'Clinical Pathology', sampleType: 'Spot Urine', container: 'Sterile Urine Container (Yellow cap)',
    params: [r('Urine Albumin', 'mg/L', '< 20'), r('Urine Creatinine', 'mg/dL', '20 - 320'), r('Albumin / Creatinine Ratio', 'mg/g', '< 30')],
  },
  'Urine Pregnancy Test (UPT)': {
    category: 'Urine & Stool', department: 'Clinical Pathology', sampleType: 'Early Morning Urine', container: 'Sterile Urine Container (Yellow cap)',
    params: [r('Urine hCG', '', 'Negative')],
  },
  'Stool Routine & Microscopic': {
    category: 'Urine & Stool', department: 'Clinical Pathology', sampleType: 'Stool', container: 'Clean Stool Container',
    params: [
      r('Colour & Consistency', '', 'Brown, formed'), r('Mucus', '', 'Absent'), r('Blood', '', 'Absent'),
      r('Pus Cells', '/hpf', '0 - 2'), r('Ova / Cysts', '', 'Not seen'),
    ],
  },
  'Stool Occult Blood': {
    category: 'Urine & Stool', department: 'Clinical Pathology', sampleType: 'Stool', container: 'Clean Stool Container',
    params: [r('Occult Blood', '', 'Negative')],
  },

  // ── Microbiology ───────────────────────────────────────────────────────────
  'Blood Culture & Sensitivity': {
    category: 'Microbiology', department: 'Microbiology', sampleType: 'Blood (2 sets, aseptic)', container: 'Blood Culture Bottles (aerobic + anaerobic)',
    params: [r('Organism Isolated', '', 'No growth after 5 days'), r('Antibiotic Sensitivity', '', 'As per isolate')],
  },
  'Urine Culture & Sensitivity': {
    category: 'Microbiology', department: 'Microbiology', sampleType: 'Midstream Urine', container: 'Sterile Urine Container (Yellow cap)',
    params: [r('Colony Count', 'CFU/mL', '< 10,000'), r('Organism Isolated', '', 'No growth'), r('Antibiotic Sensitivity', '', 'As per isolate')],
  },
  'Pus / Wound Swab Culture & Sensitivity': {
    category: 'Microbiology', department: 'Microbiology', sampleType: 'Swab / Pus', container: 'Sterile Swab in Transport Medium',
    params: [r('Organism Isolated', '', 'No pathogenic growth'), r('Antibiotic Sensitivity', '', 'As per isolate')],
  },
  'Sputum AFB (TB Smear)': {
    category: 'Microbiology', department: 'Microbiology', sampleType: 'Sputum (early morning)', container: 'Sterile Sputum Container',
    params: [r('AFB Smear (Ziehl-Neelsen)', '', 'Negative')],
  },

  // ── Serology & infectious disease ──────────────────────────────────────────
  'Dengue (NS1 Antigen, IgM, IgG)': {
    category: 'Serology & Infectious Disease', ...SERO,
    params: [r('Dengue NS1 Antigen', '', 'Negative'), r('Dengue IgM', '', 'Negative'), r('Dengue IgG', '', 'Negative')],
  },
  'Malaria Parasite (Smear / Rapid Antigen)': {
    category: 'Serology & Infectious Disease', department: 'Hematology', ...EDTA,
    params: [r('P. falciparum', '', 'Not seen'), r('P. vivax', '', 'Not seen')],
  },
  'Typhoid (Widal / Typhidot)': {
    category: 'Serology & Infectious Disease', ...SERO,
    params: [r('Widal "O" Titre', '', '< 1:80'), r('Widal "H" Titre', '', '< 1:80'), r('Typhidot IgM', '', 'Negative')],
  },
  'Viral Screening (HIV, HBsAg, HCV)': {
    category: 'Serology & Infectious Disease', ...SERO,
    params: [r('HIV I & II Antibody', '', 'Non-reactive'), r('HBsAg', '', 'Non-reactive'), r('Anti-HCV Antibody', '', 'Non-reactive')],
  },
  'COVID-19 (RT-PCR / Rapid Antigen)': {
    category: 'Serology & Infectious Disease', department: 'Molecular Biology', sampleType: 'Nasopharyngeal Swab', container: 'Viral Transport Medium',
    params: [r('SARS-CoV-2', '', 'Not detected')],
  },

  // ── Imaging: X-ray ─────────────────────────────────────────────────────────
  'X-Ray Chest (PA / Lateral)': { category: 'Imaging: X-Ray', department: 'Radiology', ...NO_SPECIMEN, params: report() },
  'X-Ray Abdomen': { category: 'Imaging: X-Ray', department: 'Radiology', ...NO_SPECIMEN, params: report() },
  'X-Ray Spine': { category: 'Imaging: X-Ray', department: 'Radiology', ...NO_SPECIMEN, params: report([r('Region', '', 'Cervical / Dorsal / Lumbosacral')]) },
  'X-Ray Limb / Joint': { category: 'Imaging: X-Ray', department: 'Radiology', ...NO_SPECIMEN, params: report([r('Region / Side', '', 'As requested')]) },
  'Mammography': { category: 'Imaging: X-Ray', department: 'Radiology', ...NO_SPECIMEN, params: report([r('BI-RADS Category', '', '0 - 6')]) },
  'DEXA Scan (Bone Density)': {
    category: 'Imaging: X-Ray', department: 'Radiology', ...NO_SPECIMEN,
    params: [r('Lumbar Spine T-score', '', '> -1.0'), r('Femoral Neck T-score', '', '> -1.0'), r('Impression', '', 'Normal / Osteopenia / Osteoporosis')],
  },

  // ── Imaging: ultrasound ────────────────────────────────────────────────────
  'USG Abdomen & Pelvis': { category: 'Imaging: Ultrasound', department: 'Radiology', ...NO_SPECIMEN, params: report() },
  'USG KUB (Kidneys, Ureters, Bladder)': { category: 'Imaging: Ultrasound', department: 'Radiology', ...NO_SPECIMEN, params: report() },
  'USG Obstetric': { category: 'Imaging: Ultrasound', department: 'Radiology', ...NO_SPECIMEN, params: report([r('Gestational Age', 'weeks', 'As per scan'), r('Fetal Heart Rate', 'bpm', '110 - 160')]) },
  'USG Neck / Thyroid': { category: 'Imaging: Ultrasound', department: 'Radiology', ...NO_SPECIMEN, params: report() },

  // ── Imaging: CT ────────────────────────────────────────────────────────────
  'CT Brain (Plain)': { category: 'Imaging: CT Scan', department: 'Radiology', ...NO_SPECIMEN, params: report() },
  'CT Chest (HRCT)': { category: 'Imaging: CT Scan', department: 'Radiology', ...NO_SPECIMEN, params: report() },
  'CT Abdomen & Pelvis': { category: 'Imaging: CT Scan', department: 'Radiology', ...NO_SPECIMEN, params: report([r('Contrast', '', 'Plain / Contrast-enhanced')]) },
  'CT Spine': { category: 'Imaging: CT Scan', department: 'Radiology', ...NO_SPECIMEN, params: report([r('Region', '', 'Cervical / Dorsal / Lumbosacral')]) },
  'CT Pulmonary Angiogram (CTPA)': { category: 'Imaging: CT Scan', department: 'Radiology', ...NO_SPECIMEN, params: report() },

  // ── Imaging: MRI ───────────────────────────────────────────────────────────
  'MRI Brain': { category: 'Imaging: MRI', department: 'Radiology', ...NO_SPECIMEN, params: report([r('Contrast', '', 'Plain / Contrast-enhanced')]) },
  'MRI Spine (Lumbosacral)': { category: 'Imaging: MRI', department: 'Radiology', ...NO_SPECIMEN, params: report() },
  'MRI Knee': { category: 'Imaging: MRI', department: 'Radiology', ...NO_SPECIMEN, params: report([r('Side', '', 'Right / Left')]) },

  // ── Heart & lung function ──────────────────────────────────────────────────
  'ECG (12-Lead)': {
    category: 'Heart & Lung Function', department: 'Cardiology', ...NO_SPECIMEN,
    params: [r('Heart Rate', 'bpm', '60 - 100'), r('Rhythm', '', 'Normal sinus rhythm'), r('Axis', '', 'Normal'), r('Impression', '', 'Cardiologist opinion')],
  },
  '2D Echocardiogram': {
    category: 'Heart & Lung Function', department: 'Cardiology', ...NO_SPECIMEN,
    params: [
      r('LV Ejection Fraction (LVEF)', '%', '55 - 70'), r('LV Wall Motion', '', 'Normal'),
      r('Valves', '', 'Normal'), r('Pericardium', '', 'No effusion'), r('Impression', '', 'Cardiologist opinion'),
    ],
  },
  'TMT (Treadmill Stress Test)': {
    category: 'Heart & Lung Function', department: 'Cardiology', ...NO_SPECIMEN,
    params: [r('Protocol', '', 'Bruce'), r('Max Heart Rate Achieved', 'bpm', '> 85% of age-predicted'), r('ST-Segment Response', '', 'No significant change'), r('Impression', '', 'Negative / Positive for inducible ischemia')],
  },
  'PFT (Spirometry)': {
    category: 'Heart & Lung Function', department: 'Pulmonology', ...NO_SPECIMEN,
    params: [r('FVC', '% predicted', '> 80'), r('FEV1', '% predicted', '> 80'), r('FEV1 / FVC', '%', '> 70'), r('Impression', '', 'Normal / Obstructive / Restrictive')],
  },
}
