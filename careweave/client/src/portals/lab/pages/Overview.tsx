import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getLabOrders } from '../api'
import StatusBadge from '../components/StatusBadge'
import { PIPELINE, STATUS_META } from '../status'
import type { LabOrder, LabOrderStatus } from '../types'

export default function Overview() {
  const [orders, setOrders] = useState<LabOrder[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getLabOrders()
      .then(setOrders)
      .catch(() => {
        setOrders([])
        setError('load failed')
      })
  }, [])

  const count = (...s: LabOrderStatus[]) => orders?.filter((o) => s.includes(o.status)).length ?? 0
  // A failed load must never read as "0 orders".
  const shown = (...s: LabOrderStatus[]) => (error ? 'n/a' : orders && count(...s))

  const chart = useMemo(
    () => PIPELINE.map((s) => ({ key: s, name: STATUS_META[s].label, value: orders?.filter((o) => o.status === s).length ?? 0 })),
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
    <div className="min-w-0 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Laboratory overview</h1>
        <p className="mt-1 text-sm text-ink-2">Where every test order stands, from request to release.</p>
      </div>

      <section aria-label="Order counts" className="grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-3 xl:grid-cols-6">
        <Figure label="Incoming requests" value={shown('requested')} to="/lab/orders" />
        <Figure label="Awaiting collection" value={shown('collection_pending')} to="/lab/samples" />
        <Figure label="In processing" value={shown('collected', 'processing')} to="/lab/samples" />
        <Figure label="Awaiting verification" value={shown('awaiting_verification')} to="/lab/verification" />
        <Figure label="Completed reports" value={shown('verified', 'released')} to="/lab/orders" />
        <Figure label="Needs recollection" value={shown('recollect_required')} to="/lab/samples" alarm />
      </section>

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <Section title="Order pipeline" note="Orders at each stage">
          {!orders ? (
            <Skeleton className="h-72" />
          ) : error ? (
            <Empty text="Order data is unavailable." />
          ) : (
            <div className="h-72" role="img" aria-label="Bar chart of orders per workflow stage">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} stroke="#56655f" />
                  <YAxis type="category" dataKey="name" width={138} tick={{ fontSize: 12 }} stroke="#56655f" tickLine={false} />
                  <Tooltip cursor={{ fill: '#e9ece7' }} wrapperStyle={{ boxShadow: 'none' }} contentStyle={{ fontSize: 12, borderRadius: 0, border: '1px solid #c3cac2', background: '#f6f7f3', boxShadow: 'none' }} />
                  <Bar dataKey="value" name="Orders" fill="#0c6b6d" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>

        <Section title="Needs attention" note="Urgent orders and recollections">
          {!orders ? (
            <Skeleton className="h-72" />
          ) : error ? (
            <Empty text="Order data is unavailable." />
          ) : attention.length === 0 ? (
            <Empty text="Nothing urgent right now." />
          ) : (
            <ul className="divide-y divide-rule">
              {attention.map((o) => (
                <li key={o.id} className="py-3 first:pt-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold">{o.testName}</p>
                    {o.priority === 'urgent' && <span className="text-[11px] font-bold uppercase tracking-wide text-alert">Urgent</span>}
                  </div>
                  <p className="mt-0.5 font-mono text-xs text-ink-3">{o.id} · {o.patientId}</p>
                  <div className="mt-2"><StatusBadge status={o.status} /></div>
                  {o.statusReason && <p className="mt-2 text-xs text-alert">{o.statusReason}</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section
        title="Latest orders"
        note="Most recently requested tests"
        action={<Link to="/lab/orders" className="-my-3 block py-3 pl-3 text-xs font-semibold text-accent-ink underline underline-offset-2">View all orders</Link>}
      >
        {!orders ? (
          <Skeleton className="h-48" />
        ) : error ? (
          <Empty text="Order data is unavailable." />
        ) : recent.length === 0 ? (
          <Empty text="No test orders yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-rule text-[11px] uppercase tracking-wide text-ink-3">
                  <th className="pb-2 pr-4 font-semibold">Order</th>
                  <th className="pb-2 pr-4 font-semibold">Test</th>
                  <th className="pb-2 pr-4 font-semibold">Patient</th>
                  <th className="pb-2 pr-4 font-semibold">Ordered by</th>
                  <th className="pb-2 pr-4 font-semibold">Requested</th>
                  <th className="pb-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {recent.map((o) => (
                  <tr key={o.id}>
                    <td className="py-3 pr-4 font-mono text-xs text-ink-2">{o.id}</td>
                    <td className="py-3 pr-4 font-medium">{o.testName}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-ink-2">{o.patientId}</td>
                    <td className="py-3 pr-4 text-ink-2">{o.orderingDoctor}</td>
                    <td className="py-3 pr-4 text-ink-3">{timeAgo(o.orderedAt)}</td>
                    <td className="py-3"><StatusBadge status={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}

function Figure({ label, value, to, alarm = false }: { label: string; value: number | string | null | undefined; to: string; alarm?: boolean }) {
  const hot = alarm && typeof value === 'number' && value > 0
  return (
    <Link to={to} className="block bg-surface p-4 hover:bg-paper">
      {value == null ? (
        <div className="h-9 w-10 animate-pulse bg-rule" aria-busy="true" />
      ) : (
        <p className={`text-3xl font-semibold tabular-nums ${hot ? 'text-alert' : 'text-ink'}`}>{value}</p>
      )}
      <p className="mt-1 text-xs text-ink-2">{label}</p>
    </Link>
  )
}

function Section({ title, note, action, children }: { title: string; note?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="min-w-0">
      <div className="mb-4 flex items-end justify-between gap-3 border-b border-ink pb-2">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {note && <p className="text-xs text-ink-3">{note}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

const Skeleton = ({ className = '' }: { className?: string }) => <div className={`animate-pulse bg-rule/60 ${className}`} aria-busy="true" />

const Empty = ({ text }: { text: string }) => <div className="flex h-40 items-center text-sm text-ink-3">{text}</div>

function timeAgo(iso: string) {
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`
  if (h < 24) return `${Math.round(h)} h ago`
  return `${Math.round(h / 24)} d ago`
}
