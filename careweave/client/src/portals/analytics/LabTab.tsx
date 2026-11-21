import type { AnalyticsData } from './types';
import { fmt } from './types';
import { BarChart, Bar, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function LabTab({ data }: { data: AnalyticsData }) {
  return (
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
  );
}
