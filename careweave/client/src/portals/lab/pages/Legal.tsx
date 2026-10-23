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
  updated: 'Draft for the hackathon demonstration',
  sections: [
    { h: 'What we collect', p: 'In this demonstration, only synthetic records created for the demo. No real patient data should be entered.' },
    { h: 'How access is limited', p: 'Each role sees only what its work requires. The laboratory role sees patient identifiers and the clinical context of an order, not the full history.' },
    { h: 'Audit trail', p: 'Sensitive actions such as releasing a result or amending one are meant to be recorded with who did it and when.' },
    { h: 'Sharing', p: 'Records are not sold or shared. If an optional AI service is enabled later, only authorised records for that user are sent to it.' },
    { h: 'Before real use', p: 'A real deployment needs a reviewed privacy policy, a lawful basis for processing, and the retention and consent rules of the jurisdiction. This draft is not legal advice and makes no compliance claim.' },
  ],
}

function Legal({ doc }: { doc: Doc }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-rule bg-surface px-4 py-4 sm:px-8">
        <Link to="/lab/overview" className="text-sm font-bold tracking-tight text-ink">CareWeave</Link>
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
          <Link to="/lab/overview" className="underline underline-offset-2">Back to the laboratory</Link>
        </p>
      </main>
    </div>
  )
}

export const Terms = () => <Legal doc={TERMS} />
export const Privacy = () => <Legal doc={PRIVACY} />
