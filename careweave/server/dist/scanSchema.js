import { z } from 'zod';
// Shape of a scanned laboratory report.
export const Report = z.object({
    patientName: z.string(),
    patientUhid: z.string(),
    visitNo: z.string(),
    labNo: z.string(),
    patientAge: z.number(),
    patientGender: z.enum(['M', 'F', 'O']),
    opIp: z.enum(['OP', 'IP']),
    referralDoctor: z.string(),
    orderingDoctor: z.string(),
    testName: z.string(),
    department: z.string(),
    priority: z.enum(['routine', 'urgent']),
    impression: z.string(),
    results: z.array(z.object({
        parameter: z.string(),
        value: z.string(),
        unit: z.string(),
        referenceRange: z.string(),
        methodology: z.string(),
        subGroup: z.string(),
        flag: z.enum(['normal', 'abnormal', 'critical']),
        unclear: z.boolean()
    }))
});
export const PROMPT = `You are a clinical laboratory document parser.
Read this laboratory report and extract only what is printed on it.
Use "" or 0 for anything that is not printed. Never invent a value, name or reference range, and never calculate one.
Copy values and units exactly as printed, one row per analyte, in the order printed. Keep "<", ">" and decimals in the value.
Set "flag" from the report's own markers (H, L, *, bold, "critical"); use "normal" when the report shows no marker.
Set "unclear" to true for any row where you could not read the value, unit or range with certainty (blurred, cut off, handwritten, overlapping).
Patient gender: M, F or O. Age in years (0 if not printed). opIp is "IP" only if the report says inpatient/IP.`;
export const GEMINI_PROMPT = `${PROMPT}
Return JSON only, of exactly this shape:
{"patientName":"","patientUhid":"","visitNo":"","labNo":"","patientAge":0,"patientGender":"M|F|O","opIp":"OP|IP",
 "referralDoctor":"","orderingDoctor":"","testName":"","department":"","priority":"routine|urgent","impression":"",
 "results":[{"parameter":"","value":"","unit":"","referenceRange":"","methodology":"","subGroup":"","flag":"normal|abnormal|critical","unclear":false}]}`;
/** Compares a value with its printed reference range ("< 200", "> 40", "70 - 110", "≥ 5"). */
export function checkRange(value, range) {
    const v = parseFloat(value.replace(/,/g, '').match(/-?\d+(\.\d+)?/)?.[0] ?? '');
    if (Number.isNaN(v))
        return 'unknown';
    const r = range.replace(/,/g, '');
    let m = r.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/);
    if (m)
        return v < +m[1] ? 'low' : v > +m[2] ? 'high' : 'in';
    m = r.match(/(?:<|≤|up to|upto)\s*=?\s*(\d+(?:\.\d+)?)/i);
    if (m)
        return v > +m[1] ? 'high' : 'in';
    m = r.match(/(?:>|≥)\s*=?\s*(\d+(?:\.\d+)?)/);
    if (m)
        return v < +m[1] ? 'low' : 'in';
    return 'unknown';
}
/**
 * Marks rows a person must check: the model was unsure, no value was read, or the report's own
 * flag contradicts its reference range.
 */
export function normalize(parsed) {
    const warnings = [];
    const results = parsed.results
        .filter((r) => r.parameter.trim() || r.value.trim())
        .map(({ unclear, ...r }) => {
        let reason = '';
        if (unclear)
            reason = 'The scanner was not sure it read this row correctly';
        else if (!r.value.trim())
            reason = 'No value was read';
        else {
            const inside = checkRange(r.value, r.referenceRange);
            if (inside === 'in' && r.flag !== 'normal')
                reason = 'Flagged, but the value is inside the printed range';
            else if ((inside === 'low' || inside === 'high') && r.flag === 'normal')
                reason = 'Marked normal, but the value is outside the printed range';
        }
        return { ...r, needsCheck: !!reason, checkReason: reason };
    });
    if (!results.length)
        warnings.push('No results could be read from this file.');
    if (!parsed.patientName.trim())
        warnings.push('No patient name was found on the report.');
    const n = results.filter((r) => r.needsCheck).length;
    if (n)
        warnings.push(n === 1 ? '1 row needs a careful check against the original.' : `${n} rows need a careful check against the original.`);
    return { ...parsed, results, warnings };
}
export class ScanError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
