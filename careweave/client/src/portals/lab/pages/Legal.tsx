import { Link } from 'react-router-dom'

type Doc = { title: string; updated: string; sections: { h: string; p: string }[] }

const TERMS: Doc = {
  title: 'Terms of Service',
  updated: 'Draft for the hackathon demonstration',
  sections: [
    { h: 'What this is', p: 'CareWeave is a demonstration of a unified patient record workflow. It is not a certified medical device and is not approved for clinical use.' },
    { h: 'Demonstration data', p: 'All patients, orders and results shown in the demonstration are synthetic. Do not enter real patient information.' },
    { h: 'No clinical advice', p: 'Nothing in CareWeave is medical advice. Flags and summaries are prompts for review by a qualified professional, who remains responsible for every clinical decision.' },
    { h: 'Accounts', p: 'Demonstration accounts are shared test accounts. Anyone using one must follow the permissions of the role it represents.' },
    { h: 'Changes', p: 'These terms are a draft and will be replaced by reviewed terms before any real deployment. They are not legal advice.' },
  ],
}

const PRIVACY: Doc = {
  title: 'Privacy Policy',
  updated: 'Last updated: 24 November 2026',
  sections: [
    { h: 'Who we are', p: 'CareWeave is a hospital workflow application built by Saiprashanth T and Saveetha for the CodeQuest National Tech Hackathon 2026. This policy explains what the application and its WhatsApp service do with information.' },
    { h: 'What we collect', p: 'Patient name, date of birth, gender, phone number, appointments, prescriptions, lab orders and results entered by hospital staff or given by the patient on WhatsApp. For WhatsApp we also receive the phone number and the text of the messages a person sends to the CareWeave number. The demonstration uses synthetic records, and real patient information should not be entered.' },
    { h: 'How we use it', p: 'Only to run the hospital workflow: to give queue status, prescriptions and reports, to send appointment, prescription and video-consult messages, and to let the care team see the patient record. We do not use it for advertising and we do not sell it.' },
    { h: 'WhatsApp messages', p: 'Messages are sent and received through the WhatsApp Business Platform operated by Meta. A person receives a CareWeave message only after a hospital staff member records their number or the person messages the CareWeave number first. Replying CANCEL ends registration, and a person can ask the hospital to stop messaging them at any time.' },
    { h: 'How access is limited', p: 'Each staff role sees only what its work requires. The laboratory role sees patient identifiers and the clinical context of an order, not the full history. Passwords are stored hashed and sign-in attempts are rate limited.' },
    { h: 'Audit trail', p: 'Sensitive actions such as releasing or amending a result, or overriding a drug safety alert, are recorded with who did it and when.' },
    { h: 'Sharing', p: 'Records are not sold. They are processed by service providers that run the application: the hosting provider (Vercel), the database provider (MongoDB Atlas), Meta (WhatsApp messaging) and, when switched on, Google Gemini for AI summaries and translation, which receives only the record needed for that request.' },
    { h: 'Retention and deletion', p: 'Records are kept for as long as the hospital needs them for care. A person can ask us to correct or delete their information, including their WhatsApp data, using the contact below, and we will act on it within 30 days.' },
    { h: 'Contact', p: 'To ask a question or request deletion, open an issue at github.com/saiprashanth2410/Care-weave/issues.' },
  ],
}

function Legal({ doc }: { doc: Doc }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-rule bg-surface px-4 py-4 sm:px-8">
        <Link to="/login" className="text-sm font-bold tracking-tight text-ink">CareWeave</Link>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
        <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
        <p className="mt-1 text-sm text-ink-3">{doc.updated}</p>
        <div className="mt-8 space-y-6">
          {doc.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-base font-semibold">{s.h}</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.p}</p>
            </section>
          ))}
        </div>
        <p className="mt-10 text-sm">
          <Link to="/login" className="underline underline-offset-2">Back to sign in</Link>
        </p>
      </main>
    </div>
  )
}

export const Terms = () => <Legal doc={TERMS} />
export const Privacy = () => <Legal doc={PRIVACY} />
