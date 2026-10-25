# Three-minute demo

All data in the demo is synthetic. Start the API and the client (see README), then use the accounts below
(local sign-in is on when `ALLOW_LOCAL_LOGIN=true` or Firebase is not configured). Password for the `.test` accounts: `demo123`.

| Role | Email |
|---|---|
| Front desk | reception@careweave.test |
| Laboratory assistant (enters results) | lab@careweave.test |
| Laboratory verifier (second pair of eyes) | pathologist@careweave.test |
| Doctor | doctor@careweave.test |

## Prepare (before the audience arrives)

Sign in as any role and press **Load sample scenario (synthetic)** in the top bar. It runs the real API as each role and creates:

- patient Priya Raman, registered at the front desk and booked with the doctor
- a documented penicillin allergy, and one encounter written by the doctor
- an HbA1c result, entered by one lab user and released by a different one
- a lipid profile waiting for a verifier
- an outside-hospital HbA1c report, imported three times: first clean, then as a duplicate, then with a different value (a conflict)

It runs once. Set `ALLOW_SAMPLE_DATA=false` on a real deployment.

## Script

1. **Front desk (30 s).** Register a new patient. Point out that the same name and date of birth is stopped as a possible duplicate.
2. **Doctor (40 s).** Open Priya Raman. Show the unified timeline: appointment, encounter, released HbA1c. Order a lab test: it needs an encounter, and a doctor sees lab values only after release. Save a short SOAP note, then try to prescribe amoxicillin: the allergy guard (penicillin family) blocks it until an override reason is given.
3. **Lab (40 s).** Sign in as the lab assistant. Open the lipid profile that is waiting. Try to release it: refused, because the person who entered the values cannot verify them.
4. **Lab, second pair of eyes (20 s).** Sign in as the verifier and release it. Back as the doctor, the result is on the timeline.
5. **Reconciliation (30 s).** As the doctor open External Records Review. Show the duplicate and the conflict side by side. Nothing was overwritten or deleted. Explain the matching rule: identifier plus one more field, a name and date of birth alone never link.
6. **Exasol Healthcare Analytics (45 s).** Click **Exasol Analytics** in the top header. Show the real-time engine status pill (`Exasol In-Memory Columnar`). Demonstrate:
   - Hospital Operations: Outpatient visit volume trends and department workload distribution.
   - Lab Turnaround Time (TAT): SLA compliance comparing actual processing minutes against 45m urgent / 120m routine SLAs.
   - Pharmacy Intelligence: Drug consumption velocity and stock runout forecasting.
   - Click **Exasol SQL Inspector** tab to show judges the exact in-memory columnar SQL queries executing on Exasol.
7. **Audit (10 s).** Every clinical and sync action is tracked in the immutable audit log with actor ID, timestamp, and entity details.

## Say plainly

Not built: PDF import, FHIR or HL7, scale beyond a demo (the server keeps its data in memory and writes it back to MongoDB).
