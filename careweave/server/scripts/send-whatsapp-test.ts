import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(SERVER_DIR, '.env') });

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_WHATSAPP_FROM || '+14155238886';

const rawPhone = process.argv[2] || process.env.TEST_PHONE;

if (!rawPhone) {
  console.error('❌ Please provide a phone number:');
  console.error('   npx tsx scripts/send-whatsapp-test.ts <phone_number>');
  console.error('   Example: npx tsx scripts/send-whatsapp-test.ts +919876543210');
  process.exit(1);
}

if (!sid || !token) {
  console.error('❌ Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in server/.env');
  process.exit(1);
}

const digits = rawPhone.replace(/\D/g, '');
const to = digits.length === 10 ? `+91${digits}` : `+${digits}`;
const fromFormatted = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;

console.log(`📡 Sending test WhatsApp message via Twilio...`);
console.log(`   From: ${fromFormatted}`);
console.log(`   To:   whatsapp:${to}`);

const sampleMessage = `🏥 *Welcome to CareWeave!*\n\nHello! Your OPD Token is *A-002* with *Dr. ANIRBAN LAHA* (Room 4).\n\n• Patients ahead: 1\n• Estimated wait: ~10 mins\n\nReply *QUEUE* to track live status, *MEDS* for prescriptions, or *REPORT* for lab results.`;

async function main() {
  const params = new URLSearchParams({
    To: `whatsapp:${to}`,
    From: fromFormatted,
    Body: sampleMessage
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('❌ Twilio Error Details:', JSON.stringify(data, null, 2));
    if (data.code === 63015 || data.code === 21608) {
      console.log('\n💡 Tip: Your WhatsApp number must join the Twilio Sandbox first!');
      console.log('   Send the sandbox join code from your WhatsApp to +1 415 523 8886');
    }
    process.exit(1);
  }

  console.log('✅ WhatsApp message queued successfully!');
  console.log(`   Message SID: ${data.sid}`);
  console.log(`   Status:      ${data.status}`);
}

main().catch(err => {
  console.error('❌ Network error:', err.message);
  process.exit(1);
});

