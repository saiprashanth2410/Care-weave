const RULES = [
    { name: /gluc|sugar|fbs|rbs|ppbs/i, unit: /mg\s*\/\s*dl/i, max: 2000 },
    { name: /gluc|sugar|fbs|rbs|ppbs/i, unit: /mmol\s*\/\s*l/i, max: 120 },
    { name: /h(a)?emoglobin|^hb$/i, unit: /g\s*\/\s*dl/i, max: 25 },
    { name: /hba1c|glycated|glycosylated/i, unit: /%/, max: 25 },
    { name: /creatinine/i, unit: /mg\s*\/\s*dl/i, max: 40 },
    { name: /potassium/i, unit: /mmol|meq/i, max: 12 },
    { name: /sodium/i, unit: /mmol|meq/i, max: 200 },
    { name: /cholesterol|ldl|hdl/i, unit: /mg\s*\/\s*dl/i, max: 1500 },
    { name: /triglyceride/i, unit: /mg\s*\/\s*dl/i, max: 10000 },
    { name: /bilirubin/i, unit: /mg\s*\/\s*dl/i, max: 60 },
    { name: /\bph\b/i, unit: /^$/, max: 14 }
];
// Analytes that can legitimately be negative.
const SIGNED = /base\s*(excess|deficit)|\bbe\b|delta|anion gap/i;
/** Returns why a value cannot be real, or '' when it is acceptable (text results such as "Positive" always are). */
export function implausibleValue(parameter, value, unit) {
    const m = value.replace(/,/g, '').trim().match(/^[<>≤≥=\s]*(-?\d+(?:\.\d+)?)/);
    if (!m)
        return '';
    const n = parseFloat(m[1]);
    if (n < 0 && !SIGNED.test(parameter))
        return `${parameter || 'A result'} cannot be negative (${value})`;
    for (const r of RULES) {
        if (r.name.test(parameter) && (unit ? r.unit.test(unit) : false) && n > r.max) {
            return `${parameter} of ${value} ${unit} is not a possible value (above ${r.max} ${unit})`;
        }
    }
    if (/^%$/.test(unit.trim()) && n > 100 && !/hba1c/i.test(parameter))
        return `${parameter} of ${value}% is above 100%`;
    return '';
}
