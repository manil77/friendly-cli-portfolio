// Daily retention job (scheduled in vercel.json). Keeps storage aligned with the privacy policy.
import { db } from '../lib/db.js';
import { json } from '../lib/http.js';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'unauthorized' }, 401);
  const sql = await db();
  const anon = await sql`DELETE FROM events WHERE consent = false AND ts < now() - interval '13 months' RETURNING 1`;
  const detailed = await sql`DELETE FROM events WHERE consent = true AND ts < now() - interval '12 months' RETURNING 1`;
  const visitors = await sql`DELETE FROM visitors WHERE last_seen < now() - interval '12 months' RETURNING 1`;
  await sql`DELETE FROM salts WHERE day < current_date`;
  return json({ ok: true, deleted: { anon: anon.length, detailed: detailed.length, visitors: visitors.length } });
}
