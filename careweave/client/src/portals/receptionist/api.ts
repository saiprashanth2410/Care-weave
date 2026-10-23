import type { AdminPatientRecord, Appointment, Dashboard, Doctor, Patient, User } from './types';

const json = async <T>(res: Response): Promise<T> => {
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.removeItem('cw_token');
    window.location.assign('/login');
  }
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
};

const request = async <T>(url: string, init: RequestInit = {}): Promise<T> =>
  json<T>(
    await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {}),
        ...(localStorage.getItem('cw_token') ? { Authorization: `Bearer ${localStorage.getItem('cw_token')}` } : {})
      }
    })
  );

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<User>('/api/me'),
  dashboard: () => request<Dashboard>('/api/dashboard'),
  patients: (q = '') => request<Patient[]>(`/api/patients?query=${encodeURIComponent(q)}`),
  patientAdmin: (id: string) => request<AdminPatientRecord>(`/api/patients/${id}/admin`),
  createPatient: (body: Partial<Patient>) => request<Patient>('/api/patients', { method: 'POST', body: JSON.stringify(body) }),
  updatePatient: (id: string, body: Partial<Patient>) => request<Patient>(`/api/patients/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  doctors: () => request<Doctor[]>('/api/doctors'),
  appointments: (params?: { date?: string; status?: string; patientId?: string }) =>
    request<Appointment[]>(
      `/api/appointments${
        params ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>) : ''
      }`
    ),
  createAppointment: (body: any) => request<Appointment>('/api/appointments', { method: 'POST', body: JSON.stringify(body) }),
  updateAppointment: (id: string, body: { status?: string; date?: string; time?: string; reason?: string }) =>
    request<Appointment>(`/api/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
};
