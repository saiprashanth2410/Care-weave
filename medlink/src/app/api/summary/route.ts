import { NextResponse } from "next/server";
import { geminiGenerate, hasGemini } from "@/lib/gemini";
import { computeAlerts, ruleBasedBrief } from "@/lib/insights";
import type { HealthRecord, Patient } from "@/lib/types";

export async function POST(req: Request) {
  const { patient, records } = (await req.json()) as { patient: Patient; records: HealthRecord[] };
  const alerts = computeAlerts(patient, records);
  const facts = ruleBasedBrief(patient, records, alerts);

  if (!hasGemini() || records.length === 0) {
    return NextResponse.json({ brief: facts, engine: "rules" });
  }

  try {
    const brief = await geminiGenerate([
      {
        text: `You are writing a 60-second pre-consultation brief for a busy doctor.
Use ONLY the facts and records below. Do not add diagnoses or advice not supported by them.
Cite record IDs in square brackets, e.g. [LB-5004]. Max 6 short bullet lines, most urgent first. Plain text, no markdown headings.

FACTS:
${facts}

ALERTS:
${alerts.map((a) => `- (${a.severity}) ${a.title}: ${a.detail} [${a.sourceIds.join(", ")}]`).join("\n")}

RECORDS:
${JSON.stringify(records)}`,
      },
    ]);
    return NextResponse.json({ brief, engine: "gemini" });
  } catch {
    return NextResponse.json({ brief: facts, engine: "rules" });
  }
}
