import { NextResponse } from "next/server";
import { geminiGenerate, hasGemini } from "@/lib/gemini";

const PROMPTS = {
  prescription: `You read medical prescriptions (printed or handwritten, often Indian).
Return JSON only with this shape:
{"patient":{"name":"","age":"","gender":"male|female|other"},
 "doctor":{"name":"","registration":"","specialization":"","hospital":""},
 "prescription":{"date":"YYYY-MM-DD","diagnosis":"","notes":"",
   "medicines":[{"name":"","dosage":"","frequency":"1-0-1 style","duration":"","instructions":""}]}}
Use "" for anything unreadable. Never invent medicines.`,
  lab: `You read laboratory reports. Return JSON only with this shape:
{"lab":{"source":"lab name","date":"YYYY-MM-DD","orderedBy":"","title":"short panel name",
  "tests":[{"name":"","value":0,"unit":"","refLow":null,"refHigh":null}]}}
Use standard test names (e.g. HbA1c, Creatinine, LDL cholesterol). Only numeric results.`,
};

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const kind = form.get("kind") === "lab" ? "lab" : "prescription";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Image must be smaller than 10MB" }, { status: 400 });
  }

  if (!hasGemini()) {
    return NextResponse.json(
      { error: "AI extraction is not configured. Set GEMINI_API_KEY in .env.local." },
      { status: 503 }
    );
  }

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const text = await geminiGenerate(
      [{ text: PROMPTS[kind] }, { inline_data: { mime_type: file.type || "image/jpeg", data: base64 } }],
      true
    );
    return NextResponse.json({ data: JSON.parse(text), engine: "gemini" });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Failed to read document" }, { status: 502 });
  }
}
