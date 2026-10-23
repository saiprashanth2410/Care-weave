import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, ArrowUpRight, CheckCircle2, ClipboardList, Hourglass, ShieldCheck, TestTube2, type LucideIcon } from 'lucide-react'
import { getLabOrders } from '../api'
import StatusBadge from '../components/StatusBadge'
import { PIPELINE, STATUS_META } from '../status'
import type { LabOrder, LabOrderStatus } from '../types'

const CHART_COLORS: Record<string, string> = {
  requested: '#94a3b8',
  collection_pending: '#f59e0b',
  collected: '#0ea5e9',
  processing: '#6366f1',
  awaiting_verification: '#8b5cf6',
  verified: '#0f8b8d',
  released: '#2f9e6e',
}

export default function Overview() {
  const [orders, setOrders] = useState<LabOrder[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getLabOrders()
      .then(setOrders)
      .catch(() => {
        setOrders([])
        setError('Could not load laboratory orders. Is the backend running?')
      })
  }, [])

  const count = (...s: LabOrderStatus[]) => orders?.filter((o) => s.includes(o.status)).length ?? 0
  // A failed load must never read as "0 orders": show a dash instead.
  const shown = (...s: LabOrderStatus[]) => (error ? '–' : orders && count(...s))
  const chart = useMemo(
    () => PIPELINE.map((s) => ({ key: s, name: STATUS_META[s].label, value: count(s) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders],
  )
  const attention = useMemo(
    () =>
      (orders ?? [])
        .filter((o) => o.status === 'recollect_required' || (o.priority === 'urgent' && ['requested', 'collection_pending', 'processing', 'awaiting_verification'].includes(o.status)))
        .slice(0, 5),
    [orders],
  )
  const recent = useMemo(() => [...(orders ?? [])].sort((a, b) => b.orderedAt.localeCompare(a.orderedAt)).slice(0, 6), [orders])

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-navy-900 sm:text-2xl">Laboratory overview</h1>
        <p className="mt-1 text-sm text-slate-500">Where every test order stands, from request to release.</p>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6" aria-label="Order counts">
        <Stat icon={ClipboardList} label="Incoming requests" value={shown('requested')} to="/lab/orders" tone="slate" />
        <Stat icon={Hourglass} label="Awaiting collection" value={shown('collection_pending')} to="/lab/samples" tone="amber" />
        <Stat icon={TestTube2} label="In processing" value={shown('collected', 'processing')} to="/lab/samples" tone="indigo" />
        <Stat icon={ShieldCheck} label="Awaiting verification" value={shown('awaiting_verification')} to="/lab/verification" tone="violet" />
        <Stat icon={CheckCircle2} label="Completed reports" value={shown('verified', 'released')} to="/lab/orders" tone="green" />
        <Stat icon={AlertTriangle} label="Needs recollection" value={shown('recollect_required')} to="/lab/samples" tone="rose" />
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card title="Order pipeline" subtitle="Number of orders at each stage">
          {!orders ? (
            <Skeleton className="h-60" />
          ) : error ? (
            <Empty text="Order data is unavailable." />
          ) : (
            <div className="h-64" role="img" aria-label="Bar chart of orders per workflow stage">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis type="category" dataKey="name" width={138} tick={{ fontSize: 12 }} stroke="#94a3b8" tickLine={false} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="value" name="Orders" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                    {chart.map((d) => (
                      <Cell key={d.key} fill={CHART_COLORS[d.key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Needs attention" subtitle="Urgent orders and recollections">
          {!orders ? (
            <Skeleton className="h-60" />
          ) : error ? (
            <Empty text="Order data is unavailable." />
          ) : attention.length === 0 ? (
            <Empty text="Nothing urgent right now." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {attention.map((o) => (
                <li key={o.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{o.testName}</p>
                    {o.priority === 'urgent' && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700">Urgent</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{o.id} · {o.patientId}</p>
                  <div className="mt-1.5"><StatusBadge status={o.status} /></div>
                  {o.statusReason && <p className="mt-1.5 text-xs text-rose-700">{o.statusReason}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Latest orders"
        subtitle="Most recently requested tests"
        action={<Link to="/lab/orders" className="flex items-center gap-1 text-xs font-semibold text-teal-600 hover:underline">View all <ArrowUpRight size={12} /></Link>}
      >
        {!orders ? (
          <Skeleton className="h-48" />
        ) : error ? (
          <Empty text="Order data is unavailable." />
        ) : recent.length === 0 ? (
          <Empty text="No test orders yet." />
        ) : (
          <div className="-mx-5 overflow-x-auto sm:mx-0">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-5 pb-2 font-semibold sm:px-0">Order</th>
                  <th className="pb-2 font-semibold">Test</th>
                  <th className="pb-2 font-semibold">Patient</th>
                  <th className="pb-2 font-semibold">Ordered by</th>
                  <th className="pb-2 font-semibold">Requested</th>
                  <th className="pb-2 pr-5 font-semibold sm:pr-0">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td className="px-5 py-2.5 font-mono text-xs text-slate-600 sm:px-0">{o.id}</td>
                    <td className="py-2.5 font-medium text-slate-900">{o.testName}</td>
                    <td className="py-2.5 font-mono text-xs text-slate-600">{o.patientId}</td>
                    <td className="py-2.5 text-slate-600">{o.orderingDoctor}</td>
                    <td className="py-2.5 text-slate-500">{timeAgo(o.orderedAt)}</td>
                    <td className="py-2.5 pr-5 sm:pr-0"><StatusBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

const TONES = {
  slate: 'bg-slate-100 text-slate-600',
  amber: 'bg-amber-50 text-amber-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  violet: 'bg-violet-50 text-violet-600',
  green: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
}

function Stat({ icon: Icon, label, value, to, tone }: { icon: LucideIcon; label: string; value: number | string | null | undefined; to: string; tone: keyof typeof TONES }) {
  return (
    <Link to={to} className="group rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-teal-500/50 hover:shadow-sm">
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${TONES[tone]}`}>
        <Icon size={17} />
      </div>
      {value == null ? <div className="h-8 w-10 animate-pulse rounded bg-slate-100" /> : <p className="text-2xl font-bold tabular-nums text-navy-900">{value}</p>}
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </Link>
  )
}

function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-navy-900">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

const Skeleton = ({ className = '' }: { className?: string }) => <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} aria-busy="true" />

const Empty = ({ text }: { text: string }) => (
  <div className="flex h-40 items-center justify-center text-sm text-slate-500">{text}</div>
)

function timeAgo(iso: string) {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`
  if (h < 24) return `${Math.round(h)} h ago`
  return `${Math.round(h / 24)} d ago`
}
