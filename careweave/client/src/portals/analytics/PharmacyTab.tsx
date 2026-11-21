import type { AnalyticsData } from './types';
import { fmt } from './types';
import { Flame } from 'lucide-react';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function PharmacyTab({ data }: { data: AnalyticsData }) {
  return (
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
  );
}
