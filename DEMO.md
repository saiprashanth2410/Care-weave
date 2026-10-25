# CareWeave — 3-Minute Demo Script & Pitch Deck Outline

> **ExaThon India 2026 Submission Deliverable**  
> **Project:** CareWeave — Unified Clinical Hospital Records & In-Memory Analytics Engine  
> **Team:** Saiprashanth T, Suriya Sudhakar, Dhivya Dharshini C S  
> **Repository:** https://github.com/saiprashanth2410/Care-weave  

---

## Part 1: Pitch Deck Outline (Slide-by-Slide)

### Slide 1: Title & Brand
* **Title:** CareWeave
* **Tagline:** One clinical platform where the front desk, the lab, and the doctor work from the same source of truth — powered by In-Memory Healthcare Analytics.
* **Presenters:** Saiprashanth T, Suriya Sudhakar, Dhivya Dharshini C S
* **Visual:** CareWeave official brand emblem (interwoven medical cross & ECG strand).

### Slide 2: The Core Problem (The Reality of Indian Hospitals)
* **Fragmented Desks:** Outpatient reception, diagnostic laboratories, and physician consultation rooms operate in disconnected silos.
* **Paper-Based Errors:** Patients carry crumpled paper slips; manual data re-entry introduces critical decimal-shift errors.
* **Blind Prescribing:** Doctors prescribe without real-time allergy cross-checks or knowledge of external medication histories.
* **Analytics Lag:** Traditional hospital databases crawl under multi-table aggregations, leaving hospital administrators blind to turnaround bottlenecks.

### Slide 3: The Solution — CareWeave HTAP Architecture
* **Unified Clinical Records:** Three role-based portals (Receptionist, Pathologist, Physician) sharing a synchronized backbone.
* **Gemma 4 Multimodal Scanner:** AI vision scans messy paper reports into structured lab values with strict **Maker-Checker** human verification.
* **Safety Guardrails:** 94,000-drug formulary with automated allergy family conflict blocks (e.g., blocking Amoxicillin for Penicillin-allergic patients).
* **Exasol Personal In-Memory Engine:** Columnar analytical store running window functions and percentiles over diagnostic turnaround times (TAT), outpatient waiting times and prescribing volume. Every figure is labelled as measured or estimated.

### Slide 4: Dual-Database Strategy (HTAP)
* **MongoDB Atlas (OLTP):** High-throughput transactional writes for admissions, token queuing, encounters, and audit logs.
* **Exasol Personal (OLAP):** Columnar in-memory analytical engine for real-time aggregation across thousands of visits and lab tests.
* **Idempotent Data Pipeline:** Safe SQL `MERGE` data replication that prevents duplicate records and handles network retry seamlessly.
* **Honest fallback:** if Exasol is offline the page says so and shows figures computed by the application, and a failed sync is reported as failed. Nothing is passed off as Exasol output.

### Slide 5: What the Analytics Show
* **Waiting time by department:** the sample history is built so Cardiology patients wait noticeably longer than General Medicine; the table shows the measured averages.
* **Diagnostic SLA auditing:** turnaround is measured from order to verification, with the 90th percentile next to the average. Orders still in progress are not counted.
* **Where lab time goes:** order to collection versus collection to verification, so a bottleneck has a location.
* **Prescribing demand:** estimated units per medicine and a labelled 30-day demand estimate. Stock levels are not recorded, so no stock-out is claimed.

### Slide 6: Live Product Demo Walkthrough
* *Refer to 3-minute demo script below.*

### Slide 7: Tech Stack & Security Posture
* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Recharts.
* **Backend:** Node.js, Express, TypeScript, Zod Schema Validation.
* **Databases:** Exasol Personal (port 8563 via `@exasol/exasol-driver-ts`), MongoDB Atlas.
* **Security & Privacy:** Synthetic data only, role-based JWT authentication, tamper-evident audit logs, zero client-side credential exposure.

### Slide 8: Impact & Future Roadmap
* **What we can show today:** two safety gates (allergy and same-molecule duplicate prescriptions), maker-checker lab verification, and analytics whose every number can be traced to a query.
* **What we have not measured:** we make no claim about reduced turnaround or fewer incidents; this is a demo build on synthetic data.
* **Next Milestones:** stock and dispensing data so demand can become a real stock forecast, FHIR R4 interoperability for ABDM, scheduled ETL instead of a manual sync button.

---

## Part 2: 3-Minute Video Demo Script

### **[0:00 - 0:35] Scene 1: The Problem & Introduction**
* **Visual:** Speaker introduction / CareWeave Landing Page.
* **Script:**
  > "Namaste! In almost every community hospital and clinic, patient data is trapped in paper slips and isolated desktop software. When a patient arrives with a paper lab report, receptionists re-type values manually, doctors prescribe without seeing outside records, and hospital directors wait days for basic operational reports.
  > Today, we present **CareWeave** — a unified clinical EHR combining multimodal AI report intake with **Exasol Personal** in-memory analytics to power real-time hospital intelligence."

### **[0:35 - 1:15] Scene 2: Front Desk & Multimodal AI Lab Intake**
* **Visual:** Navigate to Receptionist Portal (`/receptionist`) -> Click "Load sample scenario" -> Navigate to Laboratory Portal (`/lab`).
* **Script:**
  > "Let's log in as a front-desk receptionist. With one click, we admit our synthetic patient, Priya Raman. 
  > Now let's switch to the Laboratory. Priya brings in a crumpled lipid profile paper slip. Instead of manual transcription, our technician uploads the document. Google Gemma 4 scans the image, extracts the numeric parameters, and applies physiological guardrails to reject impossible values.
  > Notice our Maker-Checker principle: the technician cannot publish alone. A supervising pathologist must verify the critical values before they are released into the legal health record."

### **[1:15 - 1:55] Scene 3: Doctor Consultation & Prescription Guard**
* **Visual:** Open Doctor Portal (`/doctor`) -> Select Priya Raman -> Open E-Prescription tab -> Try prescribing 'Amoxicillin'.
* **Script:**
  > "Now Dr. Arun opens Priya's chart. Notice how Priya's verified lipid results and allergy history are instantly visible.
  > Let's try to prescribe Amoxicillin. Instantly, CareWeave's safety engine blocks the order with an audible warning: Priya has a documented Penicillin allergy! The doctor cannot prescribe without explicitly documenting an override justification. Every blocked attempt is permanently audit-logged for patient safety."

### **[1:55 - 2:40] Scene 4: Exasol Analytics (the strongest moment)**
* **Visual:** Click "Exasol Analytics" in the top navigation. Click **Load 30-day sample history**, then **Sync to Exasol**. Open the Lab tab, then the SQL Inspector.
* **Script:**
  > "Everything we just did is data. One click loads a clearly synthetic thirty-day history, and the sync loads it into **Exasol Personal** with an idempotent SQL MERGE, then counts the rows back from Exasol before it says it succeeded.
  > The banner tells us these figures are computed by Exasol. Under Operations, the department table shows Cardiology patients waiting much longer than General Medicine. That gap is a staffing question.
  > In the lab tab, turnaround runs from order to verification. Compare the average with the 90th percentile and the SLA compliance column, and look at the stage cards: most of the time sits between collection and verification. Orders still in progress are not counted as if they were done.
  > Now the SQL Inspector: this is the exact SQL that just ran, with rows returned and milliseconds. Window functions for the moving average, PERCENTILE_CONT for the p90. We also ran the same kinds of queries on five million synthetic rows: on my laptop each answered in under half a second."

### **[2:40 - 3:00] Scene 5: Conclusion & Vision**
* **Visual:** CareWeave Architecture Slide / GitHub Repository.
* **Script:**
  > "CareWeave bridges the gap between atomic clinical safety and ultra-fast hospital operational intelligence. By pairing transactional MongoDB safety with Exasol's in-memory columnar horsepower, we make healthcare faster, safer, and data-driven.
  > Our code is open source under the MIT License on GitHub. Thank you, Exasol team and ExaThon 2026!"

---

## Part 3: Live Demo Checklist for Judges

1. **Start Exasol, then the server and client** (see `EXASOL_SETUP.md`). Optional: `ALLOW_LOCAL_LOGIN=true` for the demo accounts.
2. **Verify the connection:** `curl http://localhost:4000/api/analytics/health` returns `"connected": true` and the engine `Exasol In-Memory Columnar (Live)`. If Exasol is down it says `Application Store (Exasol offline)`, and the analytics page shows an amber banner saying the figures are not from Exasol.
3. **Load the data:** in `/analytics` press **Load 30-day sample history** (synthetic, fixed seed) and then **Sync to Exasol**. The confirmation shows row counts read back from Exasol.
4. **Inspect:** the **Exasol SQL Inspector** tab lists the exact SQL that ran, the rows it returned and the time it took.
5. **Prove it:** `cd careweave/server && npm run test:exasol` checks that Exasol's SQL results equal the same metrics computed in code, and that sync is idempotent and mirrors deletions. `npm run demo:scale` times the same kinds of queries over 5 million synthetic rows generated inside Exasol.
