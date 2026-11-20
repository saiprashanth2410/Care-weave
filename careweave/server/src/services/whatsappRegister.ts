import crypto from 'node:crypto';
import type { Repos } from '../repo/index.js';
import { DuplicateError } from '../repo/index.js';
import { id, now } from '../util.js';

type Lang = 'en' | 'ta';
export type RegisterReply = { command: string; reply: string; language?: Lang };

const T = {
  notRegistered: {
    en: '👋 Welcome to CareWeave!\nThis WhatsApp number is not registered with us yet, so QUEUE, REPORT and MEDS are locked.\nReply *REGISTER* to register in about a minute (name, date of birth, gender).',
    ta: '👋 CareWeave-க்கு வரவேற்கிறோம்!\nஇந்த வாட்ஸ்அப் எண் இன்னும் பதிவு செய்யப்படவில்லை, அதனால் QUEUE, REPORT, MEDS பயன்படுத்த முடியாது.\nஒரு நிமிடத்தில் பதிவு செய்ய *REGISTER* என அனுப்பவும் (பெயர், பிறந்த தேதி, பாலினம்).'
  },
  askName: { en: 'Step 1 of 3: What is your full name?\n(Send *CANCEL* to stop.)', ta: 'படி 1/3: உங்கள் முழு பெயர் என்ன?\n(நிறுத்த *CANCEL* என அனுப்பவும்.)' },
  badName: { en: 'Please send your full name using letters only (2 to 80 characters).', ta: 'உங்கள் முழு பெயரை எழுத்துகளில் மட்டும் அனுப்பவும் (2 முதல் 80 எழுத்துகள்).' },
  askDob: { en: 'Step 2 of 3: What is your date of birth? Send it as DD-MM-YYYY, for example 27-08-1995.', ta: 'படி 2/3: உங்கள் பிறந்த தேதி என்ன? DD-MM-YYYY வடிவில் அனுப்பவும், எ.கா. 27-08-1995.' },
  badDob: { en: 'That date does not look right. Please send it as DD-MM-YYYY, for example 27-08-1995.', ta: 'தேதி சரியாக இல்லை. DD-MM-YYYY வடிவில் அனுப்பவும், எ.கா. 27-08-1995.' },
  askGender: { en: 'Step 3 of 3: Gender? Reply *1* for Male, *2* for Female, *3* for Other.', ta: 'படி 3/3: பாலினம்? ஆண் எனில் *1*, பெண் எனில் *2*, மற்றவை எனில் *3* என அனுப்பவும்.' },
  badGender: { en: 'Please reply *1* (Male), *2* (Female) or *3* (Other).', ta: '*1* (ஆண்), *2* (பெண்) அல்லது *3* (மற்றவை) என அனுப்பவும்.' },
  cancelled: { en: 'Registration cancelled. Reply *REGISTER* any time to start again.', ta: 'பதிவு ரத்து செய்யப்பட்டது. மீண்டும் தொடங்க *REGISTER* என அனுப்பவும்.' },
  similar: {
    en: 'We already have a record with this name and date of birth under another phone number. To protect that record, please meet the front desk and they will link this number for you.',
    ta: 'இந்த பெயர் மற்றும் பிறந்த தேதியில் வேறு தொலைபேசி எண்ணுடன் ஏற்கனவே பதிவு உள்ளது. அந்த பதிவைப் பாதுகாக்க, தயவுசெய்து வரவேற்பறையை அணுகவும்; அவர்கள் இந்த எண்ணை இணைப்பார்கள்.'
  },
  busy: { en: 'We could not finish your registration right now. Please try again in a minute or meet the front desk.', ta: 'இப்போது பதிவை முடிக்க முடியவில்லை. ஒரு நிமிடம் கழித்து முயற்சிக்கவும் அல்லது வரவேற்பறையை அணுகவும்.' },
  done: (name: string, uhid: string): Record<Lang, string> => ({
    en: `✅ Registered, ${name}!\nYour UHID is *${uhid}*.\nPlease show it at the front desk to get your token. After check-in, reply *QUEUE* for your live wait, *MEDS ${uhid}* for medicines and *REPORT ${uhid}* for lab results.`,
    ta: `✅ பதிவு முடிந்தது, ${name}!\nஉங்கள் UHID: *${uhid}*.\nடோக்கன் பெற வரவேற்பறையில் இதைக் காட்டவும். பதிவுக்குப் பின் *QUEUE*, *MEDS ${uhid}*, *REPORT ${uhid}* அனுப்பலாம்.`
  })
};

/** DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD to YYYY-MM-DD; null when it is not a real past date within 120 years. */
export function parseDob(text: string): string | null {
  const s = text.trim();
  let y: number, m: number, d: number;
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else if (ymd) [y, m, d] = [Number(ymd[1]), Number(ymd[2]), Number(ymd[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  const age = (Date.now() - date.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (age < 0 || age > 120) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const GENDERS: Record<string, 'M' | 'F' | 'O'> = { '1': 'M', m: 'M', male: 'M', '2': 'F', f: 'F', female: 'F', '3': 'O', o: 'O', other: 'O' };

/**
 * Handles a message from a phone number that no patient owns. Nothing but registration works until it has finished:
 * QUEUE, REPORT and MEDS are never answered for an unregistered number. The number itself is Meta-verified, so the person writing
 * is the person holding that number. The new record is flagged `source: 'whatsapp'`, `idVerified: false` for the front desk to confirm.
 */
export async function unregisteredReply(repos: Repos, phone: string, key: string, body: string, lang: Lang): Promise<RegisterReply> {
  const text = String(body || '').trim();
  const word = text.split(/\s+/)[0]?.toUpperCase() || '';
  const pick = (m: Record<Lang, string>) => m[lang];

  if (word === 'CANCEL') {
    await repos.whatsappSignups.clear(key);
    return { command: 'REGISTER', reply: pick(T.cancelled) };
  }
  if (word === 'REGISTER') {
    await repos.whatsappSignups.save(key, 'name', {});
    return { command: 'REGISTER', reply: pick(T.askName) };
  }

  const signup = await repos.whatsappSignups.get(key);
  if (!signup) return { command: 'REGISTER', reply: `${T.notRegistered.en}\n\n${T.notRegistered.ta}` };

  if (signup.step === 'name') {
    const name = text.replace(/\s+/g, ' ');
    if (!/^[\p{L}][\p{L}\p{M} .'-]{1,79}$/u.test(name)) return { command: 'REGISTER', reply: pick(T.badName) };
    await repos.whatsappSignups.save(key, 'dob', { name });
    return { command: 'REGISTER', reply: pick(T.askDob) };
  }
  if (signup.step === 'dob') {
    const dob = parseDob(text);
    if (!dob) return { command: 'REGISTER', reply: pick(T.badDob) };
    await repos.whatsappSignups.save(key, 'gender', { ...signup.data, dob });
    return { command: 'REGISTER', reply: pick(T.askGender) };
  }

  const gender = GENDERS[text.toLowerCase()];
  if (!gender) return { command: 'REGISTER', reply: pick(T.badGender) };
  const { name, dob } = signup.data;

  if ((await repos.patients.duplicatesOf(name, dob)).length) {
    await repos.whatsappSignups.clear(key);
    return { command: 'REGISTER', reply: pick(T.similar) };
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const p = {
      id: id('p'), patientId: `CW-${crypto.randomInt(10000, 100000)}`, name, dob, gender,
      phone: `+${String(phone).replace(/\D/g, '')}`, createdAt: now(), source: 'whatsapp', idVerified: false
    };
    try {
      const saved = await repos.patients.insert(p);
      await repos.audit.insert({
        id: id('audit'), actorId: 'whatsapp', actorName: 'WhatsApp self-registration', actorRole: 'patient', action: 'create', entity: 'patient',
        entityId: saved.id, detail: 'Registered by the patient on WhatsApp (identity not yet checked at the front desk)', timestamp: now()
      });
      await repos.whatsappSignups.clear(key);
      return { command: 'REGISTER', reply: pick(T.done(name, p.patientId)) };
    } catch (err) {
      if (!(err instanceof DuplicateError)) throw err;
    }
  }
  return { command: 'REGISTER', reply: pick(T.busy) };
}
