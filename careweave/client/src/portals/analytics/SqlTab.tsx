import type { AnalyticsData } from './types';
import { Database } from 'lucide-react';

export function SqlTab({ data }: { data: AnalyticsData }) {
  return (
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
  );
}
