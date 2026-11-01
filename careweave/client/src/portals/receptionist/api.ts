import type { AdminPatientRecord, Appointment, Dashboard, Doctor, Patient, User } from './types';

// The server answers 409 with this text when a record changed after this screen read it.
const CONFLICT = 'Record was changed by someone else, reload and retry';
const RELOAD = 'Someone else changed this record while you had it open. Reload the page to see the latest version, then try again.';

const json = async <T>(res: Response): Promise<T> => {
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    window.location.assign('/login');
  }
  if (res.status === 409 && body.error === CONFLICT) throw new Error(RELOAD);
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
};

const request = async <T>(url: string, init: RequestInit = {}): Promise<T> =>
  json<T>(
    await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers || {})
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
  updateAppointment: (id: string, body: { status?: string; date?: string; time?: string; reason?: string; version?: number }) =>
    request<Appointment>(`/api/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
};
