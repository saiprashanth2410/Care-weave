import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock, Database, Pill, RefreshCw, ShieldAlert, TrendingUp, Users } from 'lucide-react';

import { fmt, type AnalyticsData } from './types';
import { OperationsTab } from './OperationsTab';
import { LabTab } from './LabTab';
import { PharmacyTab } from './PharmacyTab';
import { SqlTab } from './SqlTab';

export default function AnalyticsApp() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'operations' | 'lab' | 'pharmacy' | 'sql'>('operations');
  const [notification, setNotification] = useState<{ ok: boolean; text: string } | null>(null);

  const loadAnalytics = useCallback(() =>
    fetch('/api/analytics/overview', { headers: { 'Content-Type': 'application/json' } })
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load analytics: ${res.statusText}`);
        return res.json();
      })
      .then(json => setData(json))
      .catch((err: any) => setError(err?.message || 'Could not connect to Analytics Engine'))
      .finally(() => setLoading(false)),
  []);

  const fetchAnalytics = () => {
    setLoading(true);
    setError(null);
    return loadAnalytics();
  };

  const handleSync = async (full = false) => {
    try {
      setSyncing(true);
      setNotification(null);
      const res = await fetch('/api/analytics/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) throw new Error(result.error || 'Sync failed');
      setNotification({
        ok: true,
        text: `${result.mode === 'full' ? 'Full sync' : 'Changes only'}: loaded ${result.syncedVisits} visits, ${result.syncedLabOrders} lab orders, ${result.syncedPrescriptions} prescriptions and found them in Exasol, which now holds ${result.verified.visits} / ${result.verified.labOrders} / ${result.verified.prescriptions} (${result.durationMs} ms).`,
      });
      fetchAnalytics();
      setTimeout(() => setNotification(null), 8000);
    } catch (err: any) {
      setNotification({ ok: false, text: `Nothing was synced. ${err?.message || ''}` });
    } finally {
      setSyncing(false);
    }
  };

  // Sample history can no longer be loaded from here. If synthetic records were loaded earlier they can still be taken out.
  const removeSampleHistory = async () => {
    try {
      setSyncing(true);
      const res = await fetch('/api/analytics/sample-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remove: true }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(result.error || 'Request failed');
      setNotification({ ok: true, text: `Removed ${result.removed} synthetic records. Press Sync to Exasol to update it.` });
      fetchAnalytics();
    } catch (err: any) {
      setNotification({ ok: false, text: err?.message || 'Could not remove the sample history' });
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  return (
    <div className="min-h-screen bg-paper text-ink font-sans antialiased selection:bg-accent selection:text-surface">
      {/* Top Banner & Exasol Engine Status */}
      <header className="sticky top-0 z-30 border-b border-rule bg-surface px-6 py-3.5">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <img src="/careweave-mark-transparent.png" alt="" className="h-9 w-9 rounded-sm" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-ink">CareWeave</h1>
              </div>
              
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
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

            {Boolean(data?.source.syntheticRecords) && (
              <button
                onClick={removeSampleHistory}
                disabled={syncing}
                className="flex h-9 items-center gap-2 rounded-sm border border-rule bg-surface px-3.5 text-xs font-semibold text-ink-2 transition hover:bg-paper disabled:opacity-50"
                title="Removes the synthetic sample-history records from the analytics"
              >
                Remove sample history
              </button>
            )}

            {/* Sync Pipeline Button */}
            <button
              onClick={() => handleSync(false)}
              disabled={syncing}
              className="flex h-9 items-center gap-2 rounded-sm bg-accent px-3.5 text-xs font-semibold text-surface transition hover:bg-accent-ink disabled:opacity-50"
           >
              <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
              <span>{syncing ? 'Synchronizing...' : 'Sync to Exasol'}</span>
            </button>
            <button
              onClick={() => handleSync(true)}
              disabled={syncing}
              title="Reads every record again and removes Exasol rows whose source is gone. Use it after resetting Exasol."
              className="flex h-9 items-center gap-2 rounded-sm border border-line px-3 text-xs font-semibold transition disabled:opacity-50"
            >
              Full resync
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
            <div className="flex gap-6 overflow-x-auto whitespace-nowrap border-b border-rule text-sm font-medium [&>button]:shrink-0">
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

            {activeTab === 'operations' && <OperationsTab data={data} />}

            {activeTab === 'lab' && <LabTab data={data} />}

            {activeTab === 'pharmacy' && <PharmacyTab data={data} />}

            {activeTab === 'sql' && <SqlTab data={data} />}
          </div>
        ) : null}
      </main>
    </div>
  );
}
