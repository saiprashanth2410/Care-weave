import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Database,
  Flame,
  Pill,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  PieChart,
  Pie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getToken } from '@/auth/session';

interface AnalyticsData {
  status: {
    connected: boolean;
    engine: string;
    host?: string;
    port?: number;
    schema?: string;
    lastSyncAt?: string;
    totalRecordsSynced?: number;
    rowCounts?: { visits: number; labOrders: number; prescriptions: number };
    message?: string;
  };
  source: { live: boolean; engine: string; fallbackReason?: string; syntheticRecords?: number };
  summary: {
    totalPatients: number;
    totalVisits: number;
    avgLabTatMinutes: number | null;
    criticalAlertsCount: number;
    topPrescribedMedicine: string | null;
  };
  visitsTrend: Array<{ date: string; totalVisits: number; completed: number; inClinic: number; scheduled: number; cancelled: number; movingAvg7: number }>;
  departmentWorkload: Array<{ department: string; visitCount: number; avgWaitMinutes: number | null; waitSamples: number; activeDoctors: number }>;
  labTat: Array<{
    testName: string; department: string; priority: string; totalOrders: number; completedOrders: number; pendingOrders: number;
    avgTatMinutes: number | null; p90TatMinutes: number | null; slaTargetMinutes: number; withinSlaPercent: number | null; criticalCount: number;
  }>;
  labStages: { orderToCollectMinutes: number | null; orderToCollectSamples: number; collectToVerifyMinutes: number | null; collectToVerifySamples: number };
  pharmacyConsumption: Array<{
    medicineName: string; genericName: string; form: string; totalQuantityPrescribed: number | null; prescriptionCount: number;
    unknownQuantityCount: number; avgDailyUnits: number | null; projectedDemand30d: number | null; observationDays: number;
  }>;
  safety: {
    totalPrescriptions: number; allergyBlocks: number; allergyOverrides: number; duplicateTherapyBlocks: number;
    duplicateTherapyOverrides: number; makerCheckerBlocks: number; criticalLabResults: number;
  };
  dataQuality: { visitsWithoutWaitTime: number; labOrdersPending: number; prescriptionsWithoutQuantity: number };
  queries: Array<{ id: string; title: string; sql: string; engine: 'exasol' | 'application-store'; rows: number; ms: number; note?: string }>;
  generatedAt: string;
}

const fmt = (v: number | null | undefined, unit = '') => (v === null || v === undefined ? '—' : `${v}${unit}`);

const DEPT_COLORS = ['#0c6b6d', '#56655f', '#7d5200', '#a3341f', '#3a4a44'];

export default function AnalyticsApp() {
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'operations' | 'lab' | 'pharmacy' | 'sql'>('operations');
  const [notification, setNotification] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getToken();
      const res = await fetch('/api/analytics/overview', {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to load analytics: ${res.statusText}`);
      }
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Could not connect to Analytics Engine');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setNotification(null);
      const token = getToken();
      const res = await fetch('/api/analytics/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) throw new Error(result.error || 'Sync failed');
      setNotification({
        ok: true,
        text: `Loaded into Exasol and counted back: ${result.verified.visits} visits, ${result.verified.labOrders} lab orders, ${result.verified.prescriptions} prescriptions (${result.durationMs} ms).`,
      });
      fetchAnalytics();
      setTimeout(() => setNotification(null), 8000);
    } catch (err: any) {
      setNotification({ ok: false, text: `Nothing was synced. ${err?.message || ''}` });
    } finally {
      setSyncing(false);
    }
  };

  const handleSampleHistory = async (remove: boolean) => {
    try {
      setSyncing(true);
      const token = getToken();
      const res = await fetch('/api/analytics/sample-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ remove }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Request failed');
      setNotification({ ok: true, text: remove ? `Removed ${result.removed} synthetic records. Press Sync to Exasol to update it.` : `Loaded ${result.total} synthetic records (30 days). Press Sync to Exasol to analyse them.` });
      fetchAnalytics();
    } catch (err: any) {
      setNotification({ ok: false, text: err?.message || 'Could not change the sample history' });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  return (
    <div className="min-h-screen bg-paper text-ink font-sans antialiased selection:bg-accent selection:text-surface">
      {/* Top Banner & Exasol Engine Status */}
      <header className="sticky top-0 z-30 border-b border-rule bg-surface px-6 py-3.5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-sm border border-rule bg-paper text-ink-2 transition hover:bg-rule hover:text-ink"
              title="Return to Hospital Portal"
           >
              <ArrowLeft size={16} />
            </button>
            <img src="/careweave-mark.png" alt="" className="h-9 w-9 rounded-sm" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-ink">CareWeave</h1>
              </div>
              
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Engine Status Pill */}
            <div
              className={`flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs font-medium transition ${
                data?.status.connected
                  ? 'border-accent bg-accent/10 text-accent-ink '
                  : 'border-warn bg-warn/10 text-warn'
              }`}
           >
              <Database size={14} className={data?.status.connected ? 'text-accent-ink animate-pulse' : 'text-warn'} />
              <span>{data?.status.engine || 'Connecting Engine...'}</span>
              <span className="text-[10px] opacity-70">
                {data?.status.connected ? `(:${data?.status.port || 8563})` : '(Port 8563)'}
              </span>
            </div>

            <button
              onClick={() => handleSampleHistory(Boolean(data?.source.syntheticRecords))}
              disabled={syncing}
              className="flex h-9 items-center gap-2 rounded-sm border border-rule bg-surface px-3.5 text-xs font-semibold text-ink-2 transition hover:bg-paper disabled:opacity-50"
              title="Adds a reproducible, clearly synthetic 30-day history to the analytics only"
            >
              {data?.source.syntheticRecords ? 'Remove sample history' : 'Load 30-day sample history'}
            </button>

            {/* Sync Pipeline Button */}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex h-9 items-center gap-2 rounded-sm bg-accent px-3.5 text-xs font-semibold text-surface transition hover:bg-accent-ink disabled:opacity-50"
           >
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              <span>{syncing ? 'Synchronizing...' : 'Sync to Exasol'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Notification Toast */}
      {notification && (
        <div
          role="status"
          className={`border-b px-6 py-2 text-center text-xs font-medium ${notification.ok ? 'border-accent bg-accent/10 text-accent-ink' : 'border-alert bg-alert/10 text-alert'}`}
        >
          {notification.text}
        </div>
      )}

      {/* Where the figures come from */}
      {data && (
        <div
          className={`border-b px-6 py-2 text-xs ${data.source.live ? 'border-rule bg-surface text-ink-2' : 'border-warn bg-warn/10 text-warn'}`}
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <span>
              {data.source.live ? (
                <>
                  <strong>Computed by Exasol.</strong> {data.status.rowCounts ? `${data.status.rowCounts.visits} visits, ${data.status.rowCounts.labOrders} lab orders, ${data.status.rowCounts.prescriptions} prescriptions in the analytics tables.` : ''}{' '}
                  {data.status.lastSyncAt ? `Last synced ${new Date(data.status.lastSyncAt).toLocaleTimeString()}.` : 'Not synced since this server started; press Sync to Exasol to refresh.'}
                </>
              ) : (
                <>
                  <strong>Not computed by Exasol.</strong> {data.source.fallbackReason} The figures below come from the application&apos;s own records.
                </>
              )}
            </span>
            <span className="font-mono text-[10px] opacity-80">
              {data.source.syntheticRecords ? `Includes ${data.source.syntheticRecords} synthetic sample-history records.` : 'Synthetic demo data only.'}
            </span>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-6 py-8">
        {loading && !data ? (
          <div className="flex h-80 flex-col items-center justify-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-rule border-t-accent" />
            <p className="text-sm text-ink-3 font-medium">Executing columnar aggregations in Exasol...</p>
          </div>
        ) : error ? (
          <div className="rounded-sm border border-alert bg-surface p-6 text-center text-alert">
            <AlertTriangle size={32} className="mx-auto mb-2 text-alert" />
            <p className="font-semibold">{error}</p>
            <button
              onClick={fetchAnalytics}
              className="mt-4 rounded-sm bg-alert px-4 py-2 text-xs font-semibold text-surface hover:opacity-90"
           >
              Retry Connection
            </button>
          </div>
        ) : data ? (
          <div className="space-y-8">
            {/* Row 1: Executive KPI Summary Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-sm border border-rule bg-surface p-5">
                <div className="flex items-center justify-between text-ink-3">
                  <span className="text-xs font-medium uppercase tracking-wider">Outpatient Visits</span>
                  <Users size={18} className="text-accent-ink" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-ink">{data.summary.totalVisits}</span>
                  <span className="text-xs font-medium text-ink-3">{data.visitsTrend.length ? `${data.visitsTrend[data.visitsTrend.length - 1].movingAvg7}/day, 7-day avg` : 'no visits yet'}</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-3">Across {data.departmentWorkload.length} departments (department inferred from visit reason)</p>
              </div>

              <div className="rounded-sm border border-rule bg-surface p-5">
                <div className="flex items-center justify-between text-ink-3">
                  <span className="text-xs font-medium uppercase tracking-wider">Diagnostic Lab TAT</span>
                  <Clock size={18} className="text-accent-ink" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-ink">{fmt(data.summary.avgLabTatMinutes, 'm')}</span>
                  <span className="text-xs font-medium text-ink-3">ordered to verified</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-3">
                  {data.labTat.reduce((n, l) => n + l.completedOrders, 0)} verified orders measured · {data.dataQuality.labOrdersPending} still in progress, not counted
                </p>
              </div>

              <div className="rounded-sm border border-rule bg-surface p-5">
                <div className="flex items-center justify-between text-ink-3">
                  <span className="text-xs font-medium uppercase tracking-wider">Clinical Alerts</span>
                  <ShieldAlert size={18} className="text-alert" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-alert">{data.summary.criticalAlertsCount}</span>
                  <span className="text-xs font-medium text-ink-3">from the audit trail</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-3">
                  {data.safety.allergyBlocks} allergy blocks · {data.safety.duplicateTherapyBlocks} duplicate-therapy blocks · {data.safety.criticalLabResults} critical lab results
                </p>
              </div>

              <div className="rounded-sm border border-rule bg-surface p-5">
                <div className="flex items-center justify-between text-ink-3">
                  <span className="text-xs font-medium uppercase tracking-wider">Most Prescribed</span>
                  <Pill size={18} className="text-accent-ink" />
                </div>
                <div className="mt-2 truncate text-xl font-bold text-ink">
                  {data.summary.topPrescribedMedicine ?? '—'}
                </div>
                <p className="mt-1 text-[11px] text-ink-3">
                  {data.pharmacyConsumption[0]?.totalQuantityPrescribed != null ? `about ${data.pharmacyConsumption[0].totalQuantityPrescribed} units prescribed (estimate)` : 'no prescription with a known course length'}
                </p>
              </div>
            </div>

            {/* View Navigation Tabs */}
            <div className="flex border-b border-rule gap-6 text-sm font-medium">
              <button
                onClick={() => setActiveTab('operations')}
                className={`pb-3 transition flex items-center gap-2 ${
                  activeTab === 'operations'
                    ? 'border-b-2 border-accent text-accent-ink font-semibold'
                    : 'text-ink-3 hover:text-ink'
                }`}
             >
                <TrendingUp size={16} />
                <span>Hospital Operations</span>
              </button>
              <button
                onClick={() => setActiveTab('lab')}
                className={`pb-3 transition flex items-center gap-2 ${
                  activeTab === 'lab'
                    ? 'border-b-2 border-accent text-accent-ink font-semibold'
                    : 'text-ink-3 hover:text-ink'
                }`}
             >
                <Clock size={16} />
                <span>Lab Turnaround Time (TAT)</span>
              </button>
              <button
                onClick={() => setActiveTab('pharmacy')}
                className={`pb-3 transition flex items-center gap-2 ${
                  activeTab === 'pharmacy'
                    ? 'border-b-2 border-accent text-accent-ink font-semibold'
                    : 'text-ink-3 hover:text-ink'
                }`}
             >
                <Pill size={16} />
                <span>Pharmacy</span>
              </button>
              <button
                onClick={() => setActiveTab('sql')}
                className={`pb-3 transition flex items-center gap-2 ${
                  activeTab === 'sql'
                    ? 'border-b-2 border-accent text-accent-ink font-semibold'
                    : 'text-ink-3 hover:text-ink'
                }`}
             >
                <Database size={16} />
                <span>Exasol SQL Inspector</span>
              </button>
            </div>

            {/* TAB 1: Hospital Operations & Department Workload */}
            {activeTab === 'operations' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 rounded-sm border border-rule bg-surface p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold text-ink">Daily Outpatient Volume Trends</h2>
                        <p className="text-xs text-ink-3">Visits per day, completed visits, and the 7-day moving average (an Exasol window function)</p>
                      </div>
                      <span className="rounded bg-paper px-2.5 py-1 text-[11px] font-mono text-ink-2">
                        FACT_PATIENT_VISITS
                      </span>
                    </div>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.visitsTrend}>
                          <defs>
                            <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0c6b6d" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#0c6b6d" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#c3cac2" />
                          <XAxis dataKey="date" stroke="#56655f" tick={{ fontSize: 11 }} />
                          <YAxis stroke="#56655f" tick={{ fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#f6f7f3', borderColor: '#c3cac2', borderRadius: 0, color: '#14231f' }}
                          />
                          <Area type="monotone" dataKey="totalVisits" stroke="#0c6b6d" fillOpacity={1} fill="url(#colorVisits)" name="Total Visits" />
                          <Area type="monotone" dataKey="completed" stroke="#56655f" fillOpacity={0.2} fill="#56655f" name="Completed" />
                          <Area type="monotone" dataKey="movingAvg7" stroke="#7d5200" strokeDasharray="5 4" fillOpacity={0} fill="none" name="7-day average" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-sm border border-rule bg-surface p-6">
                    <div className="mb-4">
                      <h2 className="text-sm font-bold text-ink">Department Workload Distribution</h2>
                      <p className="text-xs text-ink-3">Patient allocation across clinical units</p>
                    </div>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={data.departmentWorkload}
                            dataKey="visitCount"
                            nameKey="department"
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={4}
                         >
                            {data.departmentWorkload.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={DEPT_COLORS[index % DEPT_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{ backgroundColor: '#f6f7f3', borderColor: '#c3cac2', borderRadius: 0, color: '#14231f' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Operations Insights Table */}
                <div className="rounded-sm border border-rule bg-surface overflow-hidden">
                  <div className="border-b border-rule bg-paper px-6 py-3.5 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2">
                      Department Wait-Time & Staffing Analysis
                    </h3>
                    <span className="text-[11px] text-ink-3">{data.source.live ? "Computed by Exasol" : "Computed by the application (Exasol offline)"}</span>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-rule bg-paper text-ink-3">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Department</th>
                        <th className="px-6 py-3 font-semibold">Consultations</th>
                        <th className="px-6 py-3 font-semibold">Avg Wait Time</th>
                        <th className="px-6 py-3 font-semibold">Active Doctors</th>
                        <th className="px-6 py-3 font-semibold">Wait measured on</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule text-ink-2">
                      {data.departmentWorkload.map((dept, i) => (
                        <tr key={i} className="hover:bg-paper transition">
                          <td className="px-6 py-3.5 font-medium text-ink">{dept.department}</td>
                          <td className="px-6 py-3.5">{dept.visitCount} patients</td>
                          <td className="px-6 py-3.5">
                            <span className={dept.avgWaitMinutes !== null && dept.avgWaitMinutes > 20 ? 'text-warn font-semibold' : 'text-ink-2'}>
                              {fmt(dept.avgWaitMinutes, ' mins')}
                            </span>
                          </td>
                          <td className="px-6 py-3.5">{dept.activeDoctors} doctor{dept.activeDoctors === 1 ? '' : 's'}</td>
                          <td className="px-6 py-3.5 text-ink-3">{dept.waitSamples} of {dept.visitCount} visits</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: Laboratory Turnaround Time (TAT) */}
            {activeTab === 'lab' && (
              <div className="space-y-6">
                <div className="rounded-sm border border-rule bg-surface p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-ink">Diagnostic Turnaround Time vs SLA Targets</h2>
                      <p className="text-xs text-ink-3">
                        Ordered to verified, for verified orders only. Targets are configurable assumptions (default routine 120 m, urgent 45 m). Orders still in progress have no turnaround yet and are not counted.
                      </p>
                    </div>
                    <span className="rounded bg-paper px-2.5 py-1 text-[11px] font-mono text-ink-2">
                      FACT_LAB_ORDERS_TAT
                    </span>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.labTat.filter((l) => l.avgTatMinutes !== null).map((l) => ({ ...l, label: l.priority === 'urgent' ? `${l.testName} (urgent)` : l.testName }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#c3cac2" />
                        <XAxis dataKey="label" stroke="#56655f" tick={{ fontSize: 10 }} interval={0} />
                        <YAxis stroke="#56655f" tick={{ fontSize: 11 }} label={{ value: 'Minutes', angle: -90, position: 'insideLeft', fill: '#56655f' }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#f6f7f3', borderColor: '#c3cac2', borderRadius: 0, color: '#14231f' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="avgTatMinutes" fill="#0c6b6d" name="Average (mins)"  />
                        <Bar dataKey="p90TatMinutes" fill="#7d5200" name="90th percentile (mins)"  />
                        <Bar dataKey="slaTargetMinutes" fill="#c3cac2" name="SLA target (mins)"  />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {data.labTat.every((l) => l.avgTatMinutes === null) && (
                    <p className="mt-3 text-xs text-ink-3">No order has been verified yet, so there is no turnaround to chart.</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-sm border border-rule bg-surface p-5">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Order to specimen collected</p>
                    <p className="mt-1 text-2xl font-bold text-ink">{fmt(data.labStages.orderToCollectMinutes, ' min')}</p>
                    <p className="text-[11px] text-ink-3">average over {data.labStages.orderToCollectSamples} collected orders</p>
                  </div>
                  <div className="rounded-sm border border-rule bg-surface p-5">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-ink-3">Collected to verified result</p>
                    <p className="mt-1 text-2xl font-bold text-ink">{fmt(data.labStages.collectToVerifyMinutes, ' min')}</p>
                    <p className="text-[11px] text-ink-3">average over {data.labStages.collectToVerifySamples} verified orders: where the time goes</p>
                  </div>
                </div>

                <div className="rounded-sm border border-rule bg-surface overflow-hidden">
                  <div className="border-b border-rule bg-paper px-6 py-3.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2">
                      Pathology Panels & SLA Compliance Matrix
                    </h3>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-rule bg-paper text-ink-3">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Test Panel</th>
                        <th className="px-6 py-3 font-semibold">Department</th>
                        <th className="px-6 py-3 font-semibold">Priority</th>
                        <th className="px-6 py-3 font-semibold">Orders (verified / pending)</th>
                        <th className="px-6 py-3 font-semibold">Avg TAT</th>
                        <th className="px-6 py-3 font-semibold">p90 TAT</th>
                        <th className="px-6 py-3 font-semibold">SLA Compliance</th>
                        <th className="px-6 py-3 font-semibold">Critical Flags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule text-ink-2">
                      {data.labTat.map((panel, idx) => (
                        <tr key={idx} className="hover:bg-paper transition">
                          <td className="px-6 py-3.5 font-medium text-ink">{panel.testName}</td>
                          <td className="px-6 py-3.5">{panel.department}</td>
                          <td className="px-6 py-3.5">
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                                panel.priority === 'urgent'
                                  ? 'bg-alert/10 text-alert border border-alert'
                                  : 'bg-paper text-ink-3'
                              }`}
                           >
                              {panel.priority}
                            </span>
                          </td>
                          <td className="px-6 py-3.5">{panel.totalOrders} ({panel.completedOrders} / {panel.pendingOrders})</td>
                          <td className="px-6 py-3.5 font-semibold text-accent-ink">{fmt(panel.avgTatMinutes, ' mins')}</td>
                          <td className="px-6 py-3.5">{fmt(panel.p90TatMinutes, ' mins')}</td>
                          <td className="px-6 py-3.5">
                            <span className="text-accent-ink font-semibold">{panel.withinSlaPercent === null ? 'not measured yet' : `${panel.withinSlaPercent}% within ${panel.slaTargetMinutes} m`}</span>
                          </td>
                          <td className="px-6 py-3.5">
                            {panel.criticalCount > 0 ? (
                              <span className="rounded bg-alert/10 px-2 py-0.5 text-[10px] font-bold text-alert">
                                {panel.criticalCount} Critical
                              </span>
                            ) : (
                              <span className="text-ink-3">None</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: Pharmacy Intelligence & Stock Runout */}
            {activeTab === 'pharmacy' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 rounded-sm border border-rule bg-surface p-6">
                    <div className="mb-4">
                      <h2 className="text-sm font-bold text-ink">Most Prescribed Medications (estimated units)</h2>
                      <p className="text-xs text-ink-3">Units are estimated per prescription as doses per day times days of the course. Dispensed quantities are not recorded.</p>
                    </div>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.pharmacyConsumption} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#c3cac2" />
                          <XAxis type="number" stroke="#56655f" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="medicineName" type="category" stroke="#56655f" tick={{ fontSize: 10 }} width={140} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#f6f7f3', borderColor: '#c3cac2', borderRadius: 0, color: '#14231f' }}
                          />
                          <Bar dataKey="totalQuantityPrescribed" fill="#0c6b6d" name="Estimated units"  />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-sm border border-rule bg-surface p-6 flex flex-col justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                        <Flame size={16} className="text-alert" />
                        Antimicrobial & Allergy Safety
                      </h2>
                      <p className="mt-1 text-xs text-ink-3">Safety gate intercepts recorded in audit trail</p>

                      <div className="mt-6 space-y-4">
                        <div className="rounded-sm border border-rule bg-paper p-4">
                          <div className="text-[11px] font-medium text-ink-3">Allergy conflicts blocked</div>
                          <div className="mt-1 text-2xl font-bold text-alert">{data.safety.allergyBlocks}</div>
                          <p className="mt-1 text-[11px] text-ink-3">{data.safety.allergyOverrides} prescribed anyway with a documented reason</p>
                        </div>

                        <div className="rounded-sm border border-rule bg-paper p-4">
                          <div className="text-[11px] font-medium text-ink-3">Duplicate-therapy blocks (same molecule, other brand)</div>
                          <div className="mt-1 text-2xl font-bold text-alert">{data.safety.duplicateTherapyBlocks}</div>
                          <p className="mt-1 text-[11px] text-ink-3">{data.safety.duplicateTherapyOverrides} overridden with a documented reason</p>
                        </div>
                      </div>
                    </div>

                    <p className="mt-6 border border-rule bg-paper p-3.5 text-xs text-ink-2">
                      <strong>Demand estimate, not a stock level.</strong> Stock on hand is not recorded, so no stock-out is predicted. The 30-day figure
                      carries the observed daily rate forward over the same period.
                    </p>
                  </div>
                </div>

                <div className="rounded-sm border border-rule bg-surface overflow-hidden">
                  <div className="border-b border-rule bg-paper px-6 py-3.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2">
                      Prescribing Volume & 30-Day Demand Estimate
                    </h3>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-rule bg-paper text-ink-3">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Medicine Name</th>
                        <th className="px-6 py-3 font-semibold">Active Generic Formulation</th>
                        <th className="px-6 py-3 font-semibold">Form</th>
                        <th className="px-6 py-3 font-semibold">Prescriptions</th>
                        <th className="px-6 py-3 font-semibold">Estimated units</th>
                        <th className="px-6 py-3 font-semibold">Avg per day</th>
                        <th className="px-6 py-3 font-semibold">30-day demand (estimate)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rule text-ink-2">
                      {data.pharmacyConsumption.map((med, idx) => (
                        <tr key={idx} className="hover:bg-paper transition">
                          <td className="px-6 py-3.5 font-medium text-ink">{med.medicineName}</td>
                          <td className="px-6 py-3.5 text-ink-3">{med.genericName}</td>
                          <td className="px-6 py-3.5">{med.form}</td>
                          <td className="px-6 py-3.5">{med.prescriptionCount}{med.unknownQuantityCount ? ` (${med.unknownQuantityCount} without a course length)` : ''}</td>
                          <td className="px-6 py-3.5 font-semibold text-ink">{fmt(med.totalQuantityPrescribed)}</td>
                          <td className="px-6 py-3.5">{fmt(med.avgDailyUnits)} <span className="text-ink-3">over {med.observationDays} days</span></td>
                          <td className="px-6 py-3.5 font-semibold text-accent-ink">{fmt(med.projectedDemand30d, ' units')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: Exasol SQL Inspector */}
            {activeTab === 'sql' && (
              <div className="space-y-6">
                <div className="rounded-sm border border-rule bg-surface p-6">
                  <div className="mb-4">
                    <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
                      <Database size={16} className="text-accent-ink" />
                      {data.source.live ? 'Queries that just ran on Exasol' : 'Queries that would run on Exasol'}
                    </h2>
                    <p className="text-xs text-ink-3">
                      {data.source.live
                        ? 'This is the exact SQL behind the dashboard, with the rows returned and the time Exasol took, from the request that loaded this page.'
                        : 'Exasol is offline, so none of these ran. They are shown so you can see what the dashboard asks Exasol for.'}
                    </p>
                  </div>
                  <div className="space-y-4">
                    {data.queries.map((q, i) => (
                      <div key={q.id} className="rounded-sm border border-rule bg-paper p-4">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-ink-2">
                          <span>{i + 1}. {q.title}</span>
                          <span className={`font-mono text-[10px] ${q.engine === 'exasol' ? 'text-accent-ink' : 'text-warn'}`}>
                            {q.engine === 'exasol' ? `Exasol · ${q.rows} rows · ${q.ms} ms` : 'not run on Exasol'}
                          </span>
                        </div>
                        <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-accent-ink">{q.sql}</pre>
                        {q.note && <p className="mt-2 text-[11px] text-warn">{q.note}</p>}
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-[11px] text-ink-3">
                    Data quality: {data.dataQuality.visitsWithoutWaitTime} visits have no recorded wait, {data.dataQuality.labOrdersPending} lab orders are not verified yet,
                    and {data.dataQuality.prescriptionsWithoutQuantity} prescriptions have no course length. They are left out of averages, not filled in.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
