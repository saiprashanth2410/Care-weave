export type Role='receptionist'|'lab'|'doctor';
export type Status='Requested'|'Sample Collection Pending'|'Sample Collected'|'Processing'|'Awaiting Verification'|'Verified'|'Released to Doctor';
export type AppointmentStatus='Scheduled'|'Checked In'|'Waiting'|'In Consultation'|'Completed'|'Cancelled'|'No Show';

export type User={id:string;name:string;email:string;role:Role;facility:string};

export type Allergy={
  id:string;
  allergen:string;
  severity:'Mild'|'Moderate'|'Severe / Anaphylaxis';
  reaction:string;
};

export type ClinicalProblem={
  id:string;
  code:string;
  name:string;
  status:'Active'|'Resolved'|'Chronic';
  diagnosedDate:string;
};

export type VitalSign={
  id:string;
  patientId:string;
  date:string;
  bpSystolic:number;
  bpDiastolic:number;
  heartRate:number;
  tempF:number;
  respRate:number;
  spo2:number;
  bmi:number;
  recordedBy?:string;
};

export type Referral={
  id:string;
  patientId:string;
  patientName:string;
  patientIdCode?:string;
  specialty:string;
  providerName:string;
  priority:'Routine'|'Semi-urgent'|'Urgent';
  reason:string;
  clinicalSummary:string;
  date:string;
  status:'Drafted'|'Sent'|'Scheduled'|'Completed';
};

export type CarePlanTarget={
  metric:string;
  target:string;
  current:string;
  status:'on-track'|'needs-attention'|'achieved';
};

export type CarePlan={
  id:string;
  patientId:string;
  patientName:string;
  title:string;
  category:string;
  goals:string[];
  targets:CarePlanTarget[];
  nextReviewDate:string;
  status:'Active'|'Completed'|'Under Review';
};

export type Prescription={
  id:string;
  patientId:string;
  encounterId?:string;
  medicine:string;
  dosage:string;
  route:string;
  frequency:string;
  duration:string;
  instructions?:string;
  refills?:number;
  status?:'Active'|'Discontinued'|'Completed';
  date:string;
  source:string;
  prescribingClinician?:string;
  imported?:boolean;
  discontinueReason?:string;
};

export type Encounter={
  id:string;
  patientId:string;
  doctorId:string;
  date:string;
  notes:string;
  diagnosis:string;
  chiefComplaint?:string;
  subjective?:string;
  objective?:string;
  assessment?:string;
  plan?:string;
  vitals?:Partial<VitalSign>;
  source:string;
  imported?:boolean;
};

export type Patient={
  id:string;
  patientId:string;
  name:string;
  dob:string;
  phone:string;
  email?:string;
  emergencyContact?:string;
  createdAt:string;
  risk?:string;
  allergies?:Allergy[];
  problems?:ClinicalProblem[];
};

export type Doctor={id:string;name:string;facility:string};

export type Appointment={
  id:string;
  patientId:string;
  patientName:string;
  patientIdCode?:string;
  doctorId?:string;
  doctorName?:string;
  date:string;
  time:string;
  reason:string;
  status:string;
  checkedInAt?:string;
  rescheduledAt?:string;
};

export type LabResult={
  id:string;
  orderId:string;
  value:string;
  units:string;
  referenceRange:string;
  observedAt:string;
  comments?:string;
  verifiedBy?:string;
  verifiedAt?:string;
  releasedAt?:string;
  status:string;
};

export type LabOrder={
  id:string;
  orderId:string;
  patientId:string;
  patientName:string;
  patientIdCode?:string;
  encounterId:string;
  testName:string;
  orderingDoctor:string;
  requestedAt:string;
  sampleType:string;
  priority?:string;
  clinicalIndication?:string;
  status:Status;
  result?:LabResult;
};

export type TimelineEvent={
  id:string;
  type:string;
  date:string;
  title:string;
  detail:string;
  source:string;
  status?:string;
  reference?:string;
  imported?:boolean;
  meta?:any;
};

export type PatientRecord=Patient&{
  timeline:TimelineEvent[];
  chart:{date:string;value:number;units:string;range:string;test:string;status:string}[];
  appointments:Appointment[];
  labOrders:LabOrder[];
  prescriptions:Prescription[];
  vitals:VitalSign[];
  referrals:Referral[];
  carePlans:CarePlan[];
  allergies:Allergy[];
  problems:ClinicalProblem[];
};

export type AdminPatientRecord=Patient&{appointments:Appointment[]};

export type Dashboard={
  stats:Record<string,number>;
  appointments:Appointment[];
  labOrders:LabOrder[];
  cases:any[];
  recent:any[];
};

export type CollisionAlert = {
  severity: 'HIGH_COLLISION' | 'SAME_CLASS_WARNING';
  prescribedDrug: { name: string; brand: string; generic: string };
  conflictingDrug: {
    name: string; brand: string; generic: string;
    source: 'IN_HOUSE_ENCOUNTER' | 'EXTERNAL_RECONCILED_RECORD';
    prescribedDate: string; prescribingDoctor?: string; facility?: string;
  };
  matchedMolecules: string[];
  clinicalWarning: string;
};
export type DuplicateOverride = { overrideReason: string; acknowledgedRisks: boolean };
