"use client";

import {
  X,
  User,
  Stethoscope,
  Pill,
  Printer,
  Trash2,
  FileText,
  FlaskConical,
  Building2,
  ShieldCheck,
  Info,
  AlertTriangle,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";
import { isAbnormal } from "@/lib/insights";

const KIND_META = {
  prescription: { icon: Pill, label: "Prescription" },
  lab: { icon: FlaskConical, label: "Lab Report" },
  discharge: { icon: ClipboardList, label: "Discharge Summary" },
};

/* =====================================================
   MAIN MODAL COMPONENT
===================================================== */

/** @param {{ record: any, alerts?: any[], readOnly?: boolean, onClose: () => void, onDelete?: (id: string) => void }} props */
export default function RecordDetailModal({ record, alerts, readOnly = false, onClose, onDelete }) {
  if (!record) return null;

  const meta = KIND_META[record.kind];
  const KindIcon = meta.icon;
  const related = (alerts || []).filter((a) => a.sourceIds.includes(record.id));

  const handleDelete = () => {
    if (window.confirm("Delete this record?")) {
      toast.success("Record deleted");
      onDelete?.(record.id);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8 bg-black/50 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-4xl border border-slate-200/80 dark:border-slate-800 overflow-hidden my-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[#0284c7] flex items-center justify-center shrink-0 shadow-2xs">
              <KindIcon size={20} className="text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{record.title}</h2>
                {record.aiAssisted && (
                  <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 border border-violet-200/60 dark:border-violet-800/40 flex items-center gap-1">
                    <ShieldCheck size={11} />
                    AI extracted
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {meta.label} · {record.id} · {record.date}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* ACTION BAR */}
        {!readOnly && (
          <div className="px-6 py-3 flex items-center gap-2 flex-wrap border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition"
            >
              <Printer size={13} />
              Print
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/50 px-3.5 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 transition ml-auto"
            >
              <Trash2 size={13} />
              Delete
            </button>
          </div>
        )}

        {/* BODY */}
        <div className="p-6 max-h-[65vh] overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              {related.length > 0 && (
                <Section icon={AlertTriangle} title="Alerts involving this record">
                  <ul className="space-y-2">
                    {related.map((a) => (
                      <li key={a.id} className="text-xs">
                        <p className="font-semibold text-rose-700 dark:text-rose-300">{a.title}</p>
                        <p className="text-slate-600 dark:text-slate-400">{a.detail}</p>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {record.kind !== "lab" && (
                <Section icon={Stethoscope} title="Clinician">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <InfoRow icon={Stethoscope} label="Doctor" value={record.doctorName} />
                    <InfoRow icon={Info} label="Specialization" value={record.doctorSpecialization || "—"} />
                    <InfoRow icon={ShieldCheck} label="Registration" value={record.doctorReg || "—"} />
                    <InfoRow icon={Info} label="Diagnosis" value={record.diagnosis || "—"} />
                  </div>
                </Section>
              )}

              {record.kind === "prescription" && (
                <Section icon={Pill} title="Prescribed Medicines" badge={`${record.medicines.length} items`}>
                  <div className="space-y-3">
                    {record.medicines.map((med, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <div className="w-9 h-9 rounded-lg bg-sky-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          <Pill size={15} className="text-[#0284c7]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{med.name}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {[med.frequency, med.duration, med.instructions].filter(Boolean).map((t) => (
                              <span
                                key={t}
                                className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {record.kind === "lab" && (
                <Section icon={FlaskConical} title="Results" badge={`${record.tests.length} tests`}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-slate-500 text-left">
                        <th className="pb-2 font-semibold">Test</th>
                        <th className="pb-2 font-semibold">Result</th>
                        <th className="pb-2 font-semibold">Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {record.tests.map((t) => (
                        <tr key={t.name} className="border-t border-slate-100 dark:border-slate-800">
                          <td className="py-2 text-slate-700 dark:text-slate-200">{t.name}</td>
                          <td
                            className={`py-2 font-semibold tabular-nums ${
                              isAbnormal(t) ? "text-rose-600 dark:text-rose-400" : "text-slate-800 dark:text-slate-100"
                            }`}
                          >
                            {t.value} {t.unit}
                          </td>
                          <td className="py-2 text-xs text-slate-500 tabular-nums">
                            {t.refLow ?? "–"} to {t.refHigh ?? "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>
              )}

              {record.kind === "discharge" && (
                <Section icon={FileText} title="Summary">
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{record.summary}</p>
                </Section>
              )}

              {record.notes && (
                <Section icon={FileText} title="Doctor's Notes">
                  <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{record.notes}</p>
                </Section>
              )}
            </div>

            {/* RIGHT — Provenance */}
            <div className="space-y-5">
              <Section title="Source">
                <div className="space-y-3">
                  <SummaryRow label="Provider" value={record.source} />
                  <SummaryRow label="Date" value={record.date} />
                  <SummaryRow label="Record ID" value={record.id} />
                  {record.orderedBy && <SummaryRow label="Ordered by" value={record.orderedBy} />}
                </div>
              </Section>

              <Section title="Verification">
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                  {record.aiAssisted ? (
                    <User size={13} className="text-violet-500" />
                  ) : (
                    <Building2 size={13} className="text-emerald-500" />
                  )}
                  <span>
                    {record.aiAssisted
                      ? "Extracted by AI from an uploaded document and reviewed by the patient"
                      : "Received from the provider's system"}
                  </span>
                </div>
              </Section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, badge, children }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          {Icon && <Icon size={14} className="text-[#0284c7] dark:text-sky-400" />}
          {title}
        </h3>
        {badge && (
          <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/40 text-[#0284c7] dark:text-sky-400 border border-sky-200/60 dark:border-sky-800/40">
            {badge}
          </span>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, className = "" }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={11} className="text-slate-400" />
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{value}</p>
    </div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 text-right">{value}</span>
    </div>
  );
}
