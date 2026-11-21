import type { AnalyticsData } from './types';
import { fmt, DEPT_COLORS } from './types';
import { TrendingUp } from 'lucide-react';
import { AreaChart, Area, CartesianGrid, Cell, Legend, PieChart, Pie, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function OperationsTab({ data }: { data: AnalyticsData }) {
  return (
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

      {/* Exasol In-Memory Predictive Surge & Staffing Model */}
      {data.predictions && data.predictions.length > 0 && (
        <div className="rounded-sm border border-indigo-500/30 bg-surface overflow-hidden shadow-sm">
          <div className="border-b border-indigo-500/20 bg-indigo-50/50 dark:bg-indigo-950/20 px-6 py-3.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                Exasol Predictive OPD Surge Forecast (Tomorrow: {data.predictions[0]?.dayOfWeek})
              </h3>
            </div>
            <span className="rounded bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-[10px] font-mono font-bold text-indigo-700 dark:text-indigo-300">
              In-Memory Linear Trend & Capacity Model
            </span>
          </div>
          <div className="p-4 bg-paper/50 text-xs text-ink-3 border-b border-rule">
            Forecasts patient volume for tomorrow by evaluating historical day-of-week arrival density, projecting doctor staffing demand and bottleneck risks in advance.
          </div>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-rule bg-paper text-ink-3">
              <tr>
                <th className="px-6 py-3 font-semibold">Department</th>
                <th className="px-6 py-3 font-semibold">Daily Baseline</th>
                <th className="px-6 py-3 font-semibold">Predicted Volume (Tomorrow)</th>
                <th className="px-6 py-3 font-semibold">Recommended Staffing</th>
                <th className="px-6 py-3 font-semibold">Projected Avg Wait</th>
                <th className="px-6 py-3 font-semibold">Surge Risk Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule text-ink-2">
              {data.predictions.map((p, i) => (
                <tr key={i} className="hover:bg-paper transition">
                  <td className="px-6 py-3.5 font-bold text-ink">{p.department}</td>
                  <td className="px-6 py-3.5 text-ink-3">~{p.historicalDailyAvg} pts/day</td>
                  <td className="px-6 py-3.5 font-bold text-ink text-sm">
                    {p.predictedVisitsTomorrow} patients
                  </td>
                  <td className="px-6 py-3.5">
                    <span className="rounded bg-surface px-2 py-1 font-semibold border border-rule">
                      👨‍⚕️ {p.recommendedStaffingDoctors} doctors
                    </span>
                  </td>
                  <td className="px-6 py-3.5 font-mono text-ink-2">
                    ~{p.expectedWaitMinutes} mins
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      p.riskLevel === 'High Capacity Surge'
                        ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                        : p.riskLevel === 'Moderate'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                    }`}>
                      {p.riskLevel}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
