export const IMPORT_EXAMPLE = `{
  "facility": "Example Diagnostics",
  "records": [
    {
      "sourceRecordId": "EX-1001",
      "kind": "lab",
      "eventDate": "2026-01-10",
      "patient": { "identifier": "CW-12345", "name": "Full Name", "dob": "1980-05-05", "phone": "+1 555 0100" },
      "content": { "testName": "HbA1c", "value": "6.2", "units": "%", "referenceRange": "4.0-5.6" }
    }
  ]
}`;


// A small CSV reader (quoted fields supported). Columns are named in the first row.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(c => c.trim())) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some(c => c.trim())) rows.push(row);
  const head = (rows.shift() ?? []).map(h => h.trim());
  return rows.map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}


export function toRecords(raw: string, fileName: string, facility: string): any[] {
  const t = raw.trim();
  if (!t) throw new Error('Choose a file or paste the records first');
  if (fileName.toLowerCase().endsWith('.csv') || !/^[[{]/.test(t)) {
    return parseCsv(t).map(r => ({
      facility,
      sourceRecordId: r.sourceRecordId, kind: r.kind, eventDate: r.eventDate,
      documentRef: fileName || undefined,
      patient: { identifier: r.identifier, name: r.name, dob: r.dob, phone: r.phone },
      content: r.kind === 'medication'
        ? { medicine: r.medicine, dosage: r.dosage, frequency: r.frequency, route: r.route }
        : r.kind === 'consultation'
          ? { diagnosis: r.diagnosis, notes: r.notes }
          : { testName: r.testName, value: r.value, units: r.units, referenceRange: r.referenceRange }
    }));
  }
  const j = JSON.parse(t);
  const list = Array.isArray(j) ? j : Array.isArray(j.records) ? j.records : [j];
  return list.map((r: any) => ({ ...r, facility: r.facility || j.facility || facility, documentRef: r.documentRef || fileName || undefined }));
}
