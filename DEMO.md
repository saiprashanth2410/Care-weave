# CareWeave: Demo Script, Video and Deck

> **Team:** Goofy Coders (Saiprashanth T, Saveetha G)  
> **Repository:** https://github.com/saiprashanth2410/Care-weave  
> **Live demo:** https://careweave-ten.vercel.app (synthetic data)  
> **Demo video:** [`CareWeave_Demo_5min.mp4`](CareWeave_Demo_5min.mp4), about 5 minutes, synthetic voice-over (Microsoft Edge TTS, `en-US-AriaNeural`)  
> **Slide deck:** [`CareWeave.pptx`](CareWeave.pptx), 14 slides

---

## Part 1: Slide deck outline

1. Title
2. The problem: three desks, three silos
3. The answer: one shared record for every desk
4. Architecture: React, Express, MongoDB, Exasol, Gemma vision, n8n and WhatsApp
5. Front desk: check-in, OP tokens, live queue
6. Laboratory: maker-checker release
7. Doctor: safety checks at the point of care
8. Reconciliation: outside records are never merged silently
9. Analytics: every figure traced to its query
10. Patients: WhatsApp through n8n
11. Engineering: data integrity and security
12. Stack
13. Honest status: limitations and next steps
14. Thank you

---

## Part 2: 5-minute video script

| Scene | On screen | Narration |
| :--- | :--- | :--- |
| Title card | Title card | CareWeave. One patient chart, every desk in sync. A unified clinical records platform that puts the front desk, the laboratory and the doctor on the same record. Built by team Goofy Coders: Saiprashanth T and Saveetha G. |
| Problem card | Problem card: four points appear one by one | In most community hospitals, the front desk, the lab and the doctor's room work in silos. Patients carry paper slips. Lab values are retyped by hand, so one slipped decimal can change a diagnosis. Doctors prescribe without seeing allergies, or what another hospital already gave. And administrators cannot see where patients are waiting. |
| Architecture card | Architecture card: MongoDB, Exasol, Gemma vision, WhatsApp + n8n | CareWeave answers with one shared record. MongoDB holds it, with version checks, transactions and a full audit log. An Exasol analytics layer powers hospital-wide metrics. Gemma vision reads photographed lab reports, and WhatsApp, through n8n, keeps patients informed. |
| Sign in | Login page, then sign in as the receptionist (`reception@careweave.test`) | Let's see it live. Staff sign in, and each role sees only what its job needs. We start as the receptionist. |
| Reception overview | Click **Load sample scenario**, then the overview with today's schedule and activity log | One click loads a clearly synthetic sample scenario: a patient, Priya Raman, with two appointments today. The overview shows the schedule, the waiting room, and an activity log of everything done at the desk. |
| Check-in and live queue | Live OPD Queue, click **Check In** on Priya Raman | When Priya arrives, one click checks her in. She gets an OP token and joins the live queue. Two receptionists can never book the same doctor slot, or issue the same token. |
| WhatsApp simulator | Open the WhatsApp simulator, send **QUEUE**, then **LANG TA** | Patients follow along on WhatsApp. Sending QUEUE returns the token and the wait time, and a patient can switch the replies to Tamil. |
| Laboratory | Sign in as `lab@careweave.test`: Test Orders, Sample Tracking, Result Entry | In the laboratory, the technician sees every order by stage, from collection to verification. Reports can be scanned from a photo with Gemma vision, and uploaded files are virus-checked and encrypted. |
| Pathologist verification | Sign in as `pathologist@careweave.test`: Verification Queue, **Review & Sign** | A technician cannot release their own results. A pathologist reviews them in the verification queue and signs. This is the maker-checker rule, and a critical value alerts the ordering doctor immediately. |
| Doctor chart | Sign in as `doctor@careweave.test`: Patient Records & EHR, open the chart tabs | Now the doctor. Dr. Anirban Laha opens Priya's chart: vitals, a timeline of encounters, lab trends, prescriptions, problems and allergies, all in one place. |
| SOAP encounter | Encounters & SOAP: Diabetes template, sign | He records the visit as a SOAP encounter from a template, and signs it. |
| Allergy safety check | E-Prescriptions: New E-Prescription, Amoxicillin, **Sign & Transmit** shows the allergy alert | Now the safety net. He tries to prescribe amoxicillin. Priya has a documented penicillin allergy, so CareWeave stops the order. To continue, the doctor must give a written reason, and the override is audited. The same engine catches duplicate drugs across brand names, and known drug interactions. |
| Outside records | External Records Review: duplicate and conflict cards | Records from other hospitals are never merged silently. CareWeave flags possible duplicates and conflicting values, here two HbA1c results that disagree, and leaves the decision to the doctor. |
| Analytics | `/analytics`: Load 30-day sample history, trends, Lab TAT tab, SQL Inspector | Finally, the analytics view for administrators: visit trends, department wait times, lab turnaround and prescribing volume. Every figure can be traced to the SQL behind it. In this recording Exasol is not running, so the page says so, and shows figures computed by the application instead. It never passes those off as Exasol results. |
| Recap card | Recap card | To recap: one shared record, safety checks at the point of care, maker-checker lab verification, honest analytics, and a WhatsApp channel for patients. All data here is synthetic, and this is a prototype, not medical software. The code is open source on GitHub. Thank you, from team Goofy Coders. |

---

## Part 3: Run the demo yourself

1. Start MongoDB, then the server and client (see the setup section of the [README](README.md)). Set `ALLOW_LOCAL_LOGIN=true` to use the demo accounts (password `demo123`).
2. Sign in as the receptionist and press **Load sample scenario (synthetic)**. It creates Priya Raman, a penicillin allergy, lab orders and conflicting outside records.
3. Follow the table above role by role: receptionist, lab technician, pathologist, doctor.
4. Analytics (`/analytics`): press **Load 30-day sample history**. With Exasol running, press **Sync to Exasol**; without it the page says so and labels the figures as computed by the application. The **SQL Inspector** tab shows the exact SQL, rows and time per query.
5. Optional proofs: `cd careweave/server && npm test` (server tests), `npm run test:exasol` (needs Exasol; SQL results equal the same metrics computed in code), `npm run demo:scale` (needs Exasol; no result is recorded in this repository yet).
