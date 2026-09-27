// "Work with me" form submissions.
import { db } from '../lib/db.js';
import { json, readJson, str, ID_RE } from '../lib/http.js';
import { sendAlert, visitorRows, siteUrl } from '../lib/services.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i;

export async function POST(request) {
  const b = await readJson(request, 8192);
  if (!b) return json({ error: 'Invalid request' }, 400);
  if (b.website) return json({ ok: true }); // honeypot filled → bot
  const name = str(b.name, 100), email = str(b.email, 200), company = str(b.company, 120), message = str(b.message, 3000);
  if (!name || !email || !EMAIL.test(email) || !message) return json({ error: 'Please add your name, a valid email and a message.' }, 400);
  if (b.agree !== true) return json({ error: 'Please tick the box so I can store your message and reply.' }, 400);

  const sql = await db();
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM leads WHERE email = ${email} AND ts > now() - interval '1 hour'`;
  if (n >= 3) return json({ error: 'Thanks — I already have your message and will reply soon.' }, 429);

  const vid = ID_RE.test(b.vid || '') ? b.vid : null;
  const [visitor] = vid ? await sql`UPDATE visitors SET score = score + 50 WHERE id = ${vid} RETURNING *` : [];
  const [lead] = await sql`INSERT INTO leads (name, email, company, message, visitor_id)
                           VALUES (${name}, ${email}, ${company}, ${message}, ${visitor ? vid : null}) RETURNING id`;

  await sendAlert(`New message from ${name}${company ? ` (${company})` : ''}`, [
    ['Name', name], ['Email', email], ['Company', company], ['Message', message],
    ...(visitor ? visitorRows(visitor) : [['Tracking', 'Visitor did not opt in to analytics']]),
  ], `${siteUrl()}/admin#leads`, email); // Reply in your mail app goes straight to the lead
  return json({ ok: true, id: lead.id });
}
