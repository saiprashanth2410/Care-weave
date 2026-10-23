"use client";

import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  Brain,
  ClipboardList,
  Copy,
  FlaskConical,
  Pill,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { activeMedications, labSeries } from "@/lib/insights";
import type { Alert, HealthRecord, Patient } from "@/lib/types";

const TONES = {
  sky: "bg-sky-50 dark:bg-sky-950/40 text-[#0284c7] dark:text-sky-400",
  rose: "bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400",
  violet: "bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-400",
  emerald: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
};

export function Card({ title, subtitle, icon: Icon, tone = "sky", action, children }: {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  tone?: keyof typeof TONES;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 shadow-2xs">
      <div className="flex items-center justify-between gap-3 mb-4 sm:mb-5 flex-wrap">
        <div className="flex items-center gap-2">
          {Icon && (
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${TONES[tone]}`}>
              <Icon size={16} />
            </div>
          )}
          <div>
            <h2 className="font-bold text-sm sm:text-[15px] text-slate-900 dark:text-slate-100">{title}</h2>
            {subtitle && <p className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatCard({ icon: Icon, label, value, badge, tone = "sky" }: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  badge?: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs hover:shadow-xs transition">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-11 h-11 rounded-lg border border-current/10 flex items-center justify-center ${TONES[tone]}`}>
          <Icon size={18} />
        </div>
        {badge && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border-slate-200/60 dark:border-slate-700">
            {badge}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{label}</p>
    </div>
  );
}

export function PatientHeader({ patient }: { patient: Patient }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-2xs flex flex-wrap items-center gap-4">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0284c7] to-[#0369a1] text-white flex items-center justify-center text-base font-bold shadow-md ring-2 ring-[#0284c7]/20">
        {patient.name ? patient.name.split(" ").map((n) => n[0]).join("").slice(0, 2) : "?"}
      </div>
      <div className="flex-1 min-w-[200px]">
        <p className="font-bold text-slate-900 dark:text-slate-100">{patient.name || "Unnamed patient"}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {[patient.age ? `${patient.age} yrs` : "", patient.gender, patient.bloodGroup ? `Blood ${patient.bloodGroup}` : "", patient.abha ? `ABHA ${patient.abha}` : ""]
            .filter(Boolean)
            .join(" · ") || "Profile not filled in yet"}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(patient?.conditions || []).map((c) => (
          <span key={c} className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700">
            {c}
          </span>
        ))}
        {(patient?.allergies || []).map((a) => (
          <span key={a} className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/40 flex items-center gap-1">
            <ShieldAlert size={10} /> Allergy: {a}
          </span>
        ))}
      </div>
    </div>
  );
}

export function AIBrief({ patient, records }: { patient: Patient; records: HealthRecord[] }) {
  const [brief, setBrief] = useState("");
  const [engine, setEngine] = useState("");
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patient, records }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setBrief(d.brief);
        setEngine(d.engine);
      })
      .catch(() => !cancelled && setBrief("Could not generate summary."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [patient, records, nonce]);

  return (
    <Card
      title="60-second pre-consult brief"
      subtitle="AI summary grounded in the record, with sources"
      icon={Brain}
      tone="violet"
      action={
        <div className="flex items-center gap-2">
          {engine && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300">
              {engine === "gemini" ? "Gemini" : "Rule engine"}
            </span>
          )}
          <button onClick={() => navigator.clipboard?.writeText(brief)} aria-label="Copy brief" className="text-slate-400 hover:text-slate-700">
            <Copy size={13} />
          </button>
          <button onClick={() => setNonce((n) => n + 1)} aria-label="Regenerate" className="text-slate-400 hover:text-slate-700">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      }
    >
      {loading && !brief ? (
        <div className="space-y-2 animate-pulse">
          {[90, 75, 85, 60].map((w) => (
            <div key={w} className="h-3 rounded bg-slate-100 dark:bg-slate-800" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : (
        <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-line">{brief}</div>
      )}
    </Card>
  );
}

const SEVERITY_STYLE = {
  high: "border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300",
  medium: "border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300",
  low: "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300",
};

const CATEGORY_ICON = {
  interaction: Pill,
  allergy: ShieldAlert,
  trend: TrendingUp,
  lab: FlaskConical,
  duplicate: Copy,
};

export function AlertsPanel({ alerts, onOpenRecord }: { alerts: Alert[]; onOpenRecord?: (id: string) => void }) {
  return (
    <Card title={`Clinical alerts (${alerts.length})`} subtitle="Interactions, allergies, trends, repeats" icon={AlertTriangle} tone="rose">
      {alerts.length === 0 ? (
        <p className="text-sm text-slate-500">No alerts. Records look consistent.</p>
      ) : (
        <ul className="space-y-2.5">
          {alerts.map((a) => {
            const Icon = CATEGORY_ICON[a.category];
            return (
              <li key={a.id} className={`rounded-lg border p-3 ${SEVERITY_STYLE[a.severity]}`}>
                <div className="flex items-start gap-2">
                  <Icon size={14} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold">{a.title}</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{a.detail}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {a.sourceIds.map((id) => (
                        <button
                          key={id}
                          onClick={() => onOpenRecord?.(id)}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/70 dark:bg-slate-900/60 border border-current/20 hover:underline"
                        >
                          {id}
                        </button>
                      ))}
                    </div>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider shrink-0">{a.severity}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function ActiveMeds({ records }: { records: HealthRecord[] }) {
  const meds = activeMedications(records);
  return (
    <Card title={`Current medications (${meds.length})`} subtitle="Across all prescribers" icon={Pill} tone="emerald">
      {meds.length === 0 && <p className="text-sm text-slate-500">No active medications.</p>}
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {meds.map((m) => (
          <li key={`${m.recordId}-${m.name}`} className="py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{m.name}</p>
              <p className="text-[11px] text-slate-500">
                {m.frequency} · {m.duration} · {m.instructions}
              </p>
            </div>
            <span className="text-[10px] text-slate-500 text-right shrink-0">{m.source}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function LabTrends({ records }: { records: HealthRecord[] }) {
  const series = useMemo(() => labSeries(records), [records]);
  const names = Object.keys(series).filter((n) => series[n].length > 1);
  const [selected, setSelected] = useState(names[0] ?? "");
  const active = names.includes(selected) ? selected : names[0];
  const points = active ? series[active] : [];
  const last = points[points.length - 1];

  return (
    <Card
      title="Lab trends"
      subtitle="Same test across every lab"
      icon={TrendingUp}
      action={
        <div className="flex flex-wrap gap-1">
          {names.map((n) => (
            <button
              key={n}
              onClick={() => setSelected(n)}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition ${
                n === active
                  ? "bg-[#0284c7] text-white border-[#0284c7]"
                  : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      }
    >
      {points.length === 0 ? (
        <p className="text-sm text-slate-500">Need at least two results of the same test to show a trend.</p>
      ) : (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-slate-200 dark:text-slate-800" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 10 }} stroke="#94a3b8" domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v) => [`${v} ${last?.unit ?? ""}`, active]}
                labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.source ?? ""}`}
              />
              {last?.refHigh !== undefined && (
                <ReferenceLine y={last.refHigh} stroke="#e11d48" strokeDasharray="4 4" label={{ value: "upper limit", fontSize: 10, fill: "#e11d48" }} />
              )}
              <Line type="monotone" dataKey="value" stroke="#0284c7" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

const KIND_ICON = { prescription: Pill, lab: FlaskConical, discharge: ClipboardList };

export function Timeline({ records, onOpen }: { records: HealthRecord[]; onOpen: (r: HealthRecord) => void }) {
  const [source, setSource] = useState("All");
  const sources = ["All", ...new Set(records.map((r) => r.source))];
  const sorted = [...records]
    .filter((r) => source === "All" || r.source === source)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Card
      title="Unified timeline"
      subtitle="Every record from every source"
      icon={ClipboardList}
      tone="amber"
      action={
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          className="text-[11px] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1"
        >
          {sources.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      }
    >
      {sorted.length === 0 && (
        <p className="text-sm text-slate-500">No records yet. Add a prescription or scan a lab report.</p>
      )}
      <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-2 space-y-4">
        {sorted.map((r) => {
          const Icon = KIND_ICON[r.kind];
          return (
            <li key={r.id} className="ml-5">
              <span className="absolute -left-3 w-6 h-6 rounded-full bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-center">
                <Icon size={11} className="text-[#0284c7]" />
              </span>
              <button
                onClick={() => onOpen(r)}
                className="w-full text-left rounded-lg p-2 -m-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{r.title}</p>
                  {r.aiAssisted && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300">
                      AI extracted
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  {r.date} · {r.source} · <span className="font-mono">{r.id}</span>
                </p>
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
