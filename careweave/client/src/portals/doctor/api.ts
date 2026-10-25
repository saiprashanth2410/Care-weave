import type {
  AdminPatientRecord,
  CollisionAlert,
  Allergy,
  Appointment,
  CarePlan,
  ClinicalProblem,
  Dashboard,
  Doctor,
  LabOrder,
  Patient,
  PatientRecord,
  Prescription,
  Referral,
  User,
  VitalSign
} from './types';

const json=async<T>(res:Response):Promise<T>=>{
  const body=await res.json().catch(()=>({}));
  if(res.status===401){localStorage.removeItem('cw_token');window.location.assign('/login');}
  if(!res.ok)throw Object.assign(new Error(body.error||'Request failed'),{body,status:res.status});
  return body;
};

const request=async<T>(url:string,init:RequestInit={}):Promise<T>=>
  json<T>(
    await fetch(url,{
      ...init,
      headers:{
        'Content-Type':'application/json',
        ...(init.headers||{}),
        ...(localStorage.getItem('cw_token')?{Authorization:`Bearer ${localStorage.getItem('cw_token')}`}:{})
      }
    })
  );

export const api={
  login:(email:string,password:string)=>request<{token:string;user:User}>('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})}),
  me:()=>request<User>('/api/me'),
  dashboard:()=>request<Dashboard>('/api/dashboard'),

  // Patient endpoints
  patients:(q='')=>request<Patient[]>(`/api/patients?query=${encodeURIComponent(q)}`),
  patient:(id:string)=>request<PatientRecord>(`/api/patients/${id}/record`),
  openPatient:(patientId:string,reason:string)=>request<Patient>('/api/patients/open',{method:'POST',body:JSON.stringify({patientId,reason})}),
  patientAdmin:(id:string)=>request<AdminPatientRecord>(`/api/patients/${id}/admin`),
  createPatient:(body:Partial<Patient>)=>request<Patient>('/api/patients',{method:'POST',body:JSON.stringify(body)}),
  updatePatient:(id:string,body:Partial<Patient>)=>request<Patient>(`/api/patients/${id}`,{method:'PATCH',body:JSON.stringify(body)}),

  // Doctor list
  doctors:()=>request<Doctor[]>('/api/doctors'),

  // Appointment endpoints
  appointments:(params?:{date?:string;status?:string;patientId?:string})=>
    request<Appointment[]>(
      `/api/appointments${
        params
          ?'?'+new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v])=>v)) as Record<string,string>)
          :''
      }`
    ),
  createAppointment:(body:any)=>request<Appointment>('/api/appointments',{method:'POST',body:JSON.stringify(body)}),
  updateAppointment:(id:string,body:{status?:string;date?:string;time?:string;reason?:string})=>
    request<Appointment>(`/api/appointments/${id}`,{method:'PATCH',body:JSON.stringify(body)}),

  // Clinical Encounters & Notes (SOAP)
  createEncounter:(body:any)=>request<any>('/api/encounters',{method:'POST',body:JSON.stringify(body)}),
  updateEncounter:(id:string,body:any)=>request<any>(`/api/encounters/${id}`,{method:'PATCH',body:JSON.stringify(body)}),

  // Clinical Vitals, Allergies & Problems
  addVitals:(patientId:string,body:Partial<VitalSign>)=>
    request<VitalSign>(`/api/patients/${patientId}/vitals`,{method:'POST',body:JSON.stringify(body)}),
  addAllergy:(patientId:string,body:Partial<Allergy>)=>
    request<Allergy>(`/api/patients/${patientId}/allergies`,{method:'POST',body:JSON.stringify(body)}),
  addProblem:(patientId:string,body:Partial<ClinicalProblem>)=>
    request<ClinicalProblem>(`/api/patients/${patientId}/problems`,{method:'POST',body:JSON.stringify(body)}),

  // Diagnostic Lab Orders
  labOrders:()=>request<LabOrder[]>('/api/lab-orders'),
  createLabOrder:(body:{patientId:string;testName:string;sampleType?:string;priority?:string;clinicalIndication?:string;encounterId?:string})=>
    request<LabOrder>('/api/lab-orders',{method:'POST',body:JSON.stringify(body)}),
  updateLabStatus:(id:string,status:string,reason?:string)=>
    request<any>(`/api/lab-orders/${id}/status`,{method:'PATCH',body:JSON.stringify({status,reason})}),
  addLabResult:(body:any)=>request<any>('/api/lab-results',{method:'POST',body:JSON.stringify(body)}),
  verifyLabResult:(id:string)=>request<any>(`/api/lab-results/${id}/verify`,{method:'POST'}),

  // Prescriptions & E-Prescribing
  searchMedicines:(q:string)=>request<{id:string;name:string;brand:string;generic:string;strength:string;form:string;route:string}[]>(`/api/medicines/search?q=${encodeURIComponent(q)}`),
  validatePrescription:(body:{patientId:string;medicine:string;dosage?:string;frequency?:string})=>request<{alerts:CollisionAlert[];blocking:boolean}>('/api/encounters/validate-prescription',{method:'POST',body:JSON.stringify(body)}),
  createPrescription:(body:any)=>request<Prescription>('/api/prescriptions',{method:'POST',body:JSON.stringify(body)}),
  updatePrescription:(id:string,body:{status?:string;refills?:number;discontinueReason?:string})=>
    request<Prescription>(`/api/prescriptions/${id}`,{method:'PATCH',body:JSON.stringify(body)}),

  // Referrals
  referrals:()=>request<Referral[]>('/api/referrals'),
  createReferral:(body:Partial<Referral>)=>request<Referral>('/api/referrals',{method:'POST',body:JSON.stringify(body)}),
  updateReferral:(id:string,status:string)=>request<Referral>(`/api/referrals/${id}`,{method:'PATCH',body:JSON.stringify({status})}),

  // Care Plans
  carePlans:()=>request<CarePlan[]>('/api/care-plans'),
  createCarePlan:(body:Partial<CarePlan>)=>request<CarePlan>('/api/care-plans',{method:'POST',body:JSON.stringify(body)}),
  updateCarePlan:(id:string,body:any)=>request<CarePlan>(`/api/care-plans/${id}`,{method:'PATCH',body:JSON.stringify(body)}),

  // Reconciliation
  cases:()=>request<any[]>('/api/reconciliation/cases'),
  resolveCase:(id:string,decision:string,linkPatientId?:string)=>request<any>(`/api/reconciliation/cases/${id}`,{method:'PATCH',body:JSON.stringify({decision,linkPatientId})}),
  importRecord:(body:any)=>request<any>('/api/external-records/import',{method:'POST',body:JSON.stringify(body)})
};
