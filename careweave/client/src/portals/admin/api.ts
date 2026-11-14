export type AuditRow = { id: string; actorId: string; actorName?: string; actorRole: string; action: string; entity: string; entityId: string; detail: string; timestamp: string };
export type InboxItem = {
  id: string; kind: 'help' | 'issue'; fromEmail: string; fromName: string; fromRole: string; knownStaff: boolean;
  staffId: string; staffActive: boolean; subject: string; message: string; page?: string; status: 'new' | 'read' | 'resolved';
  count: number; createdAt: string; lastAt?: string; readAt?: string; resolvedAt?: string; resolvedBy?: string; note?: string;
};
export type StaffRole = 'receptionist' | 'lab' | 'doctor' | 'admin';
export type Staff = {
  id: string; name: string; email: string; role: StaffRole; facility: string; permissions: string[];
  active: boolean; localLogin: boolean; firebaseLinked: boolean; version: number;
  room: string; shiftStart: string; shiftEnd: string;
};
export type Catalog = { roles: StaffRole[]; permissions: Record<StaffRole, string[]>; defaults: Record<StaffRole, string[]>; firebase: boolean };
export type Created = Staff & { firebase: 'created' | 'existing' | 'not-configured'; temporaryPassword?: string };
export type NewStaff = { name: string; email: string; role: StaffRole; facility: string; permissions: string[]; password?: string; room?: string; shiftStart?: string; shiftEnd?: string };

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) window.location.assign('/login');
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body as T;
}

export const adminApi = {
  catalog: () => request<Catalog>('/api/staff/catalog'),
  staff: () => request<Staff[]>('/api/staff'),
  createStaff: (body: NewStaff) => request<Created>('/api/staff', { method: 'POST', body: JSON.stringify(body) }),
  updateStaff: (id: string, body: Partial<NewStaff> & { active?: boolean; version?: number }) =>
    request<Staff>(`/api/staff/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  resetLink: (id: string) => request<{ link: string }>(`/api/staff/${id}/reset-link`, { method: 'POST' }),
  inbox: (status: 'open' | 'resolved' | 'all') =>
    request<{ items: InboxItem[]; counts: { new: number; read: number; resolved: number } }>(`/api/inbox?status=${status}`),
  inboxSummary: () => request<{ new: number }>('/api/inbox/summary'),
  updateInbox: (id: string, body: { status?: InboxItem['status']; note?: string }) =>
    request<InboxItem>(`/api/inbox/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  auditLog: (q: { action?: string; patient?: string; before?: string }) => {
    const p = new URLSearchParams();
    if (q.action) p.set('action', q.action);
    if (q.before) p.set('before', q.before);
    p.set('limit', '50');
    const url = q.patient ? `/api/patients/${encodeURIComponent(q.patient)}/access-log?${p}` : `/api/audit?${p}`;
    return request<{ rows: AuditRow[]; nextBefore: string | null; patient?: { id: string; patientId: string; name: string } }>(url);
  },
};
