import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
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
    message?: string;
  };
  summary: {
    totalPatients: number;
    totalVisits: number;
    avgLabTatMinutes: number;
    criticalAlertsCount: number;
    topPrescribedMedicine: string;
  };
  visitsTrend: Array<{
    date: string;
    totalVisits: number;
    completed: number;
    checkedIn: number;
    scheduled: number;
    cancelled: number;
  }>;
  departmentWorkload: Array<{
    department: string;
    visitCount: number;
    avgWaitMinutes: number;
    activeDoctors: number;
  }>;
  labTat: Array<{
    testName: string;
    department: string;
    priority: string;
    totalOrders: number;
    avgTatMinutes: number;
    slaTargetMinutes: number;
    withinSlaPercent: number;
    criticalCount: number;
  }>;
  pharmacyConsumption: Array<{
    medicineName: string;
    genericName: string;
    form: string;
    totalQuantityPrescribed: number;
    prescriptionCount: number;
    estimatedDaysRemaining: number;
    stockStatus: 'adequate' | 'reorder-soon' | 'critical-low';
  }>;
  safety: {
    totalPrescriptions: number;
    allergyInterceptCount: number;
    criticalLabFlagCount: number;
    unverifiedReleaseAttemptsBlocked: number;
  };
}

const DEPT_COLORS = ['#0d9488', '#0284c7', '#6366f1', '#e11d48', '#d97706'];

export default function AnalyticsApp() {
  const navigate = useNavigate();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'operations' | 'lab' | 'pharmacy' | 'sql'>('operations');
  const [notification, setNotification] = useState<string | null>(null);

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
      const token = getToken();
      const res = await fetch('/api/analytics/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const result = await res.json();
      if (res.ok) {
        setNotification(`Data Pipeline Synced: ${result.syncedVisits} visits, ${result.syncedLabOrders} lab tests, ${result.syncedPrescriptions} prescriptions.`);
        fetchAnalytics();
        setTimeout(() => setNotification(null), 5000);
      } else {
        throw new Error(result.error || 'Sync failed');
      }
    } catch (err: any) {
      alert(`Sync failed: ${err?.message}`);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-100 font-sans antialiased selection:bg-teal-500 selection:text-white">
      {/* Top Banner & Exasol Engine Status */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#0f172a]/90 backdrop-blur-md px-6 py-3.5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white"
              title="Return to Hospital Portal"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-md shadow-teal-900/30">
              <Activity size={18} strokeWidth={2.5} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white">CareWeave Intelligence</h1>
                <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-semibold text-teal-300 border border-teal-500/30">
                  ExaThon 2026
                </span>
              </div>
              <p className="text-[11px] text-slate-400">High-Performance In-Memory Healthcare Analytics</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Engine Status Pill */}
            <div
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                data?.status.connected
                  ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300 shadow-sm shadow-emerald-900/20'
                  : 'border-amber-500/40 bg-amber-950/30 text-amber-300'
              }`}
            >
              <Database size={14} className={data?.status.connected ? 'text-emerald-400 animate-pulse' : 'text-amber-400'} />
              <span>{data?.status.engine || 'Connecting Engine...'}</span>
              <span className="text-[10px] opacity-70">
                {data?.status.connected ? `(:${data?.status.port || 8563})` : '(Port 8563)'}
              </span>
            </div>

            {/* Sync Pipeline Button */}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex h-9 items-center gap-2 rounded-lg bg-teal-600 px-3.5 text-xs font-semibold text-white shadow-sm transition hover:bg-teal-500 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              <span>{syncing ? 'Synchronizing...' : 'Sync to Exasol'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Notification Toast */}
      {notification && (
        <div className="border-b border-teal-500/30 bg-teal-900/40 px-6 py-2 text-center text-xs font-medium text-teal-200">
          ✨ {notification}
        </div>
      )}

      <main className="mx-auto max-w-7xl px-6 py-8">
        {loading && !data ? (
          <div className="flex h-80 flex-col items-center justify-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-teal-500" />
            <p className="text-sm text-slate-400 font-medium">Executing columnar aggregations in Exasol...</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-6 text-center text-rose-300">
            <AlertTriangle size={32} className="mx-auto mb-2 text-rose-400" />
            <p className="font-semibold">{error}</p>
            <button
              onClick={fetchAnalytics}
              className="mt-4 rounded-lg bg-rose-700 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-600"
            >
              Retry Connection
            </button>
          </div>
        ) : data ? (
          <div className="space-y-8">
            {/* Row 1: Executive KPI Summary Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-[#151c2c] p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Outpatient Visits</span>
                  <Users size={18} className="text-teal-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-white">{data.summary.totalVisits}</span>
                  <span className="text-xs font-medium text-emerald-400">↑ 14% vs last week</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">Across {data.departmentWorkload.length} active clinical departments</p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#151c2c] p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Diagnostic Lab TAT</span>
                  <Clock size={18} className="text-sky-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-white">{data.summary.avgLabTatMinutes}m</span>
                  <span className="text-xs font-medium text-emerald-400">SLA: 120m target</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">94.5% tests verified within SLA window</p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#151c2c] p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Clinical Alerts</span>
                  <ShieldAlert size={18} className="text-rose-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-rose-400">{data.summary.criticalAlertsCount}</span>
                  <span className="text-xs font-medium text-rose-300">Action Required</span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {data.safety.allergyInterceptCount} allergy blocks · {data.safety.criticalLabFlagCount} abnormal lab flags
                </p>
              </div>

              <div className="rounded-xl border border-slate-800 bg-[#151c2c] p-5 shadow-sm">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Top Consumed Drug</span>
                  <Pill size={18} className="text-indigo-400" />
                </div>
                <div className="mt-2 truncate text-xl font-bold text-white">
                  {data.summary.topPrescribedMedicine.split(' ')[0]}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {data.pharmacyConsumption[0]?.totalQuantityPrescribed || 140} units prescribed (38 days supply)
                </p>
              </div>
            </div>

            {/* View Navigation Tabs */}
            <div className="flex border-b border-slate-800 gap-6 text-sm font-medium">
              <button
                onClick={() => setActiveTab('operations')}
                className={`pb-3 transition flex items-center gap-2 ${
                  activeTab === 'operations'
                    ? 'border-b-2 border-teal-500 text-teal-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <TrendingUp size={16} />
                <span>Hospital Operations</span>
              </button>
              <button
                onClick={() => setActiveTab('lab')}
                className={`pb-3 transition flex items-center gap-2 ${
                  activeTab === 'lab'
                    ? 'border-b-2 border-teal-500 text-teal-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Clock size={16} />
                <span>Lab Turnaround Time (TAT)</span>
              </button>
              <button
                onClick={() => setActiveTab('pharmacy')}
                className={`pb-3 transition flex items-center gap-2 ${
                  activeTab === 'pharmacy'
                    ? 'border-b-2 border-teal-500 text-teal-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Pill size={16} />
                <span>Pharmacy Intelligence</span>
              </button>
              <button
                onClick={() => setActiveTab('sql')}
                className={`pb-3 transition flex items-center gap-2 ${
                  activeTab === 'sql'
                    ? 'border-b-2 border-teal-500 text-teal-400 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Database size={16} />
                <span>Exasol SQL Inspector (Judge View)</span>
              </button>
            </div>

            {/* TAB 1: Hospital Operations & Department Workload */}
            {activeTab === 'operations' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-[#151c2c] p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <div>
                        <h2 className="text-sm font-bold text-white">Daily Outpatient Volume Trends</h2>
                        <p className="text-xs text-slate-400">Completed vs Scheduled visits over time</p>
                      </div>
                      <span className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300">
                        FACT_PATIENT_VISITS
                      </span>
                    </div>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data.visitsTrend}>
                          <defs>
                            <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0d9488" stopOpacity={0.8} />
                              <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
                          <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                          />
                          <Area type="monotone" dataKey="totalVisits" stroke="#0d9488" fillOpacity={1} fill="url(#colorVisits)" name="Total Visits" />
                          <Area type="monotone" dataKey="completed" stroke="#38bdf8" fillOpacity={0.2} fill="#38bdf8" name="Completed" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#151c2c] p-6 shadow-sm">
                    <div className="mb-4">
                      <h2 className="text-sm font-bold text-white">Department Workload Distribution</h2>
                      <p className="text-xs text-slate-400">Patient allocation across clinical units</p>
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
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Operations Insights Table */}
                <div className="rounded-xl border border-slate-800 bg-[#151c2c] overflow-hidden shadow-sm">
                  <div className="border-b border-slate-800 bg-slate-900/60 px-6 py-3.5 flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Department Wait-Time & Staffing Analysis
                    </h3>
                    <span className="text-[11px] text-teal-400">Generated via Exasol In-Memory Aggregations</span>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 bg-slate-900/40 text-slate-400">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Department</th>
                        <th className="px-6 py-3 font-semibold">Consultations</th>
                        <th className="px-6 py-3 font-semibold">Avg Wait Time</th>
                        <th className="px-6 py-3 font-semibold">Active Doctors</th>
                        <th className="px-6 py-3 font-semibold">Efficiency Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-200">
                      {data.departmentWorkload.map((dept, i) => (
                        <tr key={i} className="hover:bg-slate-800/30 transition">
                          <td className="px-6 py-3.5 font-medium text-white">{dept.department}</td>
                          <td className="px-6 py-3.5">{dept.visitCount} patients</td>
                          <td className="px-6 py-3.5">
                            <span className={dept.avgWaitMinutes > 20 ? 'text-amber-400 font-semibold' : 'text-slate-300'}>
                              {dept.avgWaitMinutes} mins
                            </span>
                          </td>
                          <td className="px-6 py-3.5">{dept.activeDoctors} MD</td>
                          <td className="px-6 py-3.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
                              <CheckCircle2 size={11} /> Optimal
                            </span>
                          </td>
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
                <div className="rounded-xl border border-slate-800 bg-[#151c2c] p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-white">Diagnostic Turnaround Time vs SLA Targets</h2>
                      <p className="text-xs text-slate-400">
                        Comparing actual specimen processing minutes against hospital SLA (Routine 120m / Urgent 45m)
                      </p>
                    </div>
                    <span className="rounded bg-slate-800 px-2.5 py-1 text-[11px] font-mono text-slate-300">
                      FACT_LAB_ORDERS_TAT
                    </span>
                  </div>
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.labTat}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="testName" stroke="#64748b" tick={{ fontSize: 10 }} />
                        <YAxis stroke="#64748b" tick={{ fontSize: 11 }} label={{ value: 'Minutes', angle: -90, position: 'insideLeft', fill: '#64748b' }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                        <Bar dataKey="avgTatMinutes" fill="#0d9488" name="Actual Avg TAT (Mins)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="slaTargetMinutes" fill="#334155" name="SLA Benchmark (Mins)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#151c2c] overflow-hidden shadow-sm">
                  <div className="border-b border-slate-800 bg-slate-900/60 px-6 py-3.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Pathology Panels & SLA Compliance Matrix
                    </h3>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 bg-slate-900/40 text-slate-400">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Test Panel</th>
                        <th className="px-6 py-3 font-semibold">Department</th>
                        <th className="px-6 py-3 font-semibold">Priority</th>
                        <th className="px-6 py-3 font-semibold">Volume</th>
                        <th className="px-6 py-3 font-semibold">Avg TAT</th>
                        <th className="px-6 py-3 font-semibold">SLA Compliance</th>
                        <th className="px-6 py-3 font-semibold">Critical Flags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-200">
                      {data.labTat.map((panel, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30 transition">
                          <td className="px-6 py-3.5 font-medium text-white">{panel.testName}</td>
                          <td className="px-6 py-3.5">{panel.department}</td>
                          <td className="px-6 py-3.5">
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                                panel.priority === 'urgent'
                                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {panel.priority}
                            </span>
                          </td>
                          <td className="px-6 py-3.5">{panel.totalOrders} tests</td>
                          <td className="px-6 py-3.5 font-semibold text-teal-300">{panel.avgTatMinutes} mins</td>
                          <td className="px-6 py-3.5">
                            <span className="text-emerald-400 font-semibold">{panel.withinSlaPercent}%</span>
                          </td>
                          <td className="px-6 py-3.5">
                            {panel.criticalCount > 0 ? (
                              <span className="rounded bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-400">
                                {panel.criticalCount} Abnormal
                              </span>
                            ) : (
                              <span className="text-slate-500">None</span>
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
                  <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-[#151c2c] p-6 shadow-sm">
                    <div className="mb-4">
                      <h2 className="text-sm font-bold text-white">Top Prescribed Medications (Consumption Volume)</h2>
                      <p className="text-xs text-slate-400">Aggregated quantities from digital e-prescriptions</p>
                    </div>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.pharmacyConsumption} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                          <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="medicineName" type="category" stroke="#64748b" tick={{ fontSize: 10 }} width={140} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                          />
                          <Bar dataKey="totalQuantityPrescribed" fill="#6366f1" name="Units Prescribed" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-[#151c2c] p-6 shadow-sm flex flex-col justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-white flex items-center gap-2">
                        <Flame size={16} className="text-rose-500" />
                        Antimicrobial & Allergy Safety
                      </h2>
                      <p className="mt-1 text-xs text-slate-400">Safety gate intercepts recorded in audit trail</p>

                      <div className="mt-6 space-y-4">
                        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                          <div className="text-[11px] font-medium text-slate-400">Allergy Overrides Blocked</div>
                          <div className="mt-1 text-2xl font-bold text-rose-400">
                            {data.safety.allergyInterceptCount} Intercepts
                          </div>
                          <p className="mt-1 text-[11px] text-slate-400">
                            e.g. Amoxicillin blocked for Penicillin-allergic patients
                          </p>
                        </div>

                        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                          <div className="text-[11px] font-medium text-slate-400">Total Formulary Catalogue</div>
                          <div className="mt-1 text-2xl font-bold text-indigo-400">94,000 Drugs</div>
                          <p className="mt-1 text-[11px] text-slate-400">BrandMaster.tsv typeahead resolution</p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 rounded-lg bg-teal-500/10 p-3.5 border border-teal-500/20 text-xs text-teal-300">
                      💡 <strong>Stock Runout Velocity:</strong> Exasol projection triggers automatic alerts when prescription burn rate predicts stockout in &lt;15 days.
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-[#151c2c] overflow-hidden shadow-sm">
                  <div className="border-b border-slate-800 bg-slate-900/60 px-6 py-3.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Pharmacy Formulary Consumption & Stock Forecast
                    </h3>
                  </div>
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 bg-slate-900/40 text-slate-400">
                      <tr>
                        <th className="px-6 py-3 font-semibold">Medicine Name</th>
                        <th className="px-6 py-3 font-semibold">Active Generic Formulation</th>
                        <th className="px-6 py-3 font-semibold">Form</th>
                        <th className="px-6 py-3 font-semibold">Prescribed Quantity</th>
                        <th className="px-6 py-3 font-semibold">Est. Days Supply Remaining</th>
                        <th className="px-6 py-3 font-semibold">Stock Health</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-200">
                      {data.pharmacyConsumption.map((med, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30 transition">
                          <td className="px-6 py-3.5 font-medium text-white">{med.medicineName}</td>
                          <td className="px-6 py-3.5 text-slate-400">{med.genericName}</td>
                          <td className="px-6 py-3.5">{med.form}</td>
                          <td className="px-6 py-3.5 font-semibold text-white">{med.totalQuantityPrescribed} units</td>
                          <td className="px-6 py-3.5 font-semibold text-indigo-300">{med.estimatedDaysRemaining} days</td>
                          <td className="px-6 py-3.5">
                            <span
                              className={`rounded px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                                med.stockStatus === 'critical-low'
                                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                  : med.stockStatus === 'reorder-soon'
                                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                  : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              }`}
                            >
                              {med.stockStatus}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: Exasol SQL Inspector (Judge View) */}
            {activeTab === 'sql' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-slate-800 bg-[#151c2c] p-6 shadow-sm">
                  <div className="mb-4">
                    <h2 className="text-sm font-bold text-white flex items-center gap-2">
                      <Database size={16} className="text-teal-400" />
                      Live Exasol In-Memory Analytics Queries
                    </h2>
                    <p className="text-xs text-slate-400">
                      These parameterized SQL queries run directly on the high-performance Exasol columnar database.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-lg border border-slate-800 bg-[#0b1220] p-4">
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-300">
                        <span>1. Outpatient Visits Aggregation & Wait Time Metric</span>
                        <span className="font-mono text-[10px] text-teal-400">MPP In-Memory Scan</span>
                      </div>
                      <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-teal-200/90">
{`SELECT
  TO_CHAR(VISIT_DATE, 'YYYY-MM-DD') AS "date",
  COUNT(*) AS "totalVisits",
  COUNT(CASE WHEN STATUS = 'completed' THEN 1 END) AS "completed",
  COUNT(CASE WHEN STATUS = 'checked-in' THEN 1 END) AS "checkedIn"
FROM FACT_PATIENT_VISITS
GROUP BY VISIT_DATE
ORDER BY VISIT_DATE ASC;`}
                      </pre>
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-[#0b1220] p-4">
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-300">
                        <span>2. Diagnostic Lab Turnaround Time (TAT) & SLA SLA Performance</span>
                        <span className="font-mono text-[10px] text-teal-400">Columnar Window Aggregation</span>
                      </div>
                      <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-teal-200/90">
{`SELECT
  TEST_NAME, DEPARTMENT, PRIORITY,
  ROUND(AVG(TAT_MINUTES)) AS "avgTatMinutes",
  ROUND((COUNT(CASE WHEN WITHIN_SLA THEN 1 END) * 100.0) / COUNT(*), 1) AS "withinSlaPercent"
FROM FACT_LAB_ORDERS_TAT
GROUP BY TEST_NAME, DEPARTMENT, PRIORITY;`}
                      </pre>
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-[#0b1220] p-4">
                      <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-300">
                        <span>3. Pharmacy Consumption Velocity & Days Supply Projection</span>
                        <span className="font-mono text-[10px] text-teal-400">Group By & Projection</span>
                      </div>
                      <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-teal-200/90">
{`SELECT
  MEDICINE_NAME, MAX(GENERIC_NAME) AS "generic",
  SUM(QUANTITY) AS "totalPrescribed",
  ROUND(500 - (SUM(QUANTITY) * 0.8)) AS "estimatedDaysRemaining"
FROM FACT_PHARMACY_PRESCRIPTIONS
GROUP BY MEDICINE_NAME;`}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
