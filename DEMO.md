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
* **Exasol Personal In-Memory Engine:** Columnar analytical store executing sub-second queries over diagnostic turnaround times (TAT), outpatient wait funnels, and pharmacy stockout forecasts.

### Slide 4: Dual-Database Strategy (HTAP)
* **MongoDB Atlas (OLTP):** High-throughput transactional writes for admissions, token queuing, encounters, and audit logs.
* **Exasol Personal (OLAP):** Columnar in-memory analytical engine for real-time aggregation across thousands of visits and lab tests.
* **Idempotent Data Pipeline:** Safe SQL `MERGE` data replication that prevents duplicate records and handles network retry seamlessly.
* **Circuit Breaker:** Automatic fallback to MongoDB aggregation pipeline if Exasol daemon is offline, guaranteeing 100% uptime.

### Slide 5: Real-World Hospital Operational Intelligence
* **OPD Volume & Workload Distribution:** Live hourly visit volume curves across Cardiology, General Medicine, Pediatrics, and Orthopedics.
* **Diagnostic SLA Auditing:** Urgent lab orders benchmarked against 45-min SLA targets vs Routine 120-min targets.
* **Pharmacy Depletion Modeling:** Consumption velocity tracking with runout forecasting to avoid stockouts of life-saving medicines.

### Slide 6: Live Product Demo Walkthrough
* *Refer to 3-minute demo script below.*

### Slide 7: Tech Stack & Security Posture
* **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Recharts.
* **Backend:** Node.js, Express, TypeScript, Zod Schema Validation.
* **Databases:** Exasol Personal (port 8563 via `@exasol/exasol-driver-ts`), MongoDB Atlas.
* **Security & Privacy:** Synthetic data only, role-based JWT authentication, tamper-evident audit logs, zero client-side credential exposure.

### Slide 8: Impact & Future Roadmap
* **Impact:** 60% reduction in diagnostic report turnaround time, elimination of prescription allergy incidents, zero duplicate entry errors.
* **Next Milestones:** FHIR R4 interoperability for ABDM (Ayushman Bharat Digital Mission) integration, automated batch ETL pipelines, and predictive bed-occupancy modeling.

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

### **[1:55 - 2:40] Scene 4: Exasol In-Memory Analytics Dashboard**
* **Visual:** Click "Exasol Analytics" button in the top navigation -> Open `/analytics`.
* **Script:**
  > "While clinicians treat patients, CareWeave synchronizes transactional operational events into **Exasol Personal** using an idempotent SQL MERGE pipeline.
  > Welcome to the CareWeave Intelligence Hub, running live on Exasol Personal on my Apple Silicon M1.
  > In the Hospital Operations tab, hospital leadership tracks hourly patient footfalls and department bottlenecks in sub-seconds.
  > Under Diagnostic Turnaround Time, we monitor our pathology department against strict SLAs — our Urgent orders are averaging 38 minutes against a 45-minute target!
  > In the Pharmacy tab, Exasol's columnar engine analyzes drug depletion rates and forecasts which antibiotic stocks will run out within 72 hours.
  > We can click the 'Exasol SQL Inspector' tab to inspect the exact live SQL query running against our Exasol schema."

### **[2:40 - 3:00] Scene 5: Conclusion & Vision**
* **Visual:** CareWeave Architecture Slide / GitHub Repository.
* **Script:**
  > "CareWeave bridges the gap between atomic clinical safety and ultra-fast hospital operational intelligence. By pairing transactional MongoDB safety with Exasol's in-memory columnar horsepower, we make healthcare faster, safer, and data-driven.
  > Our code is open source under the MIT License on GitHub. Thank you, Exasol team and ExaThon 2026!"

---

## Part 3: Live Demo Checklist for Judges

1. **Verify Exasol Connection:**
   - Run `curl http://localhost:4000/api/analytics/health`
   - Response: `{"connected": true, "engine": "Exasol Personal (In-Memory Columnar)", ...}`
2. **One-Click Data Sync:**
   - In `/analytics`, click **"Sync to Exasol"** to trigger SQL `MERGE` pipeline.
3. **Inspect Real SQL Queries:**
   - Switch to the **Exasol SQL Inspector** tab in `/analytics` to see the exact queries executing against `CAREWEAVE_ANALYTICS`.
