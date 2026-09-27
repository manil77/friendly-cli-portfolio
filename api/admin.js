// Admin API: /api/admin?action=...  (session cookie auth; POSTs also need the X-Admin header as a CSRF guard)
import { randomBytes } from 'node:crypto';
import { db } from '../lib/db.js';
import { json, readJson, str, ID_RE, SLUG_RE } from '../lib/http.js';
import { checkPassword, sessionCookie, clearCookie, isAdmin, cleanText, sendAlert, siteUrl } from '../lib/services.js';
import { getContent, saveContent } from '../lib/content.js';

const DAYS = (u) => Math.min(365, Math.max(1, parseInt(u.searchParams.get('days')) || 30));

const GET_ACTIONS = {
  async me() { return { ok: true }; },

  async stats(sql, u) {
    const d = DAYS(u);
    const since = new Date(Date.now() - d * 864e5).toISOString();
    const top = (col, type, limit = 8) => sql.query(
      `SELECT ${col} AS k, count(*)::int AS n FROM events WHERE ts > $1 AND type = $2 AND ${col} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT ${limit}`,
      [since, type]);
    const [totals] = await sql`
      SELECT count(*) FILTER (WHERE type = 'pageview')::int AS pageviews,
             count(DISTINCT COALESCE(visitor_id, anon_id)) FILTER (WHERE type = 'pageview')::int AS uniques,
             count(DISTINCT visitor_id)::int AS identified,
             count(*) FILTER (WHERE type = 'consent')::int AS accepts,
             count(*) FILTER (WHERE type = 'choice' AND name = 'reject')::int AS rejects
      FROM events WHERE ts > ${since}`;
    const [leads] = await sql`SELECT count(*)::int AS n FROM leads WHERE ts > ${since}`;
    const daily = await sql`
      SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD') AS day,
             count(*) FILTER (WHERE type = 'pageview')::int AS pageviews,
             count(DISTINCT COALESCE(visitor_id, anon_id)) FILTER (WHERE type = 'pageview')::int AS uniques
      FROM events WHERE ts > ${since} GROUP BY 1 ORDER BY 1`;
    const commands = await sql`
      SELECT name AS k, value AS status, count(*)::int AS n FROM events
      WHERE ts > ${since} AND type = 'command' AND name IS NOT NULL GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 15`;
    const map = await sql`SELECT lat, lon, city, country, org, score FROM visitors WHERE lat IS NOT NULL AND last_seen > ${since} LIMIT 500`;
    const geo = await sql`SELECT country AS k, count(*)::int AS n FROM events
                          WHERE ts > ${since} AND type = 'pageview' AND country IS NOT NULL GROUP BY 1`;
    const prevSince = new Date(Date.now() - 2 * d * 864e5).toISOString();
    const [prev] = await sql`
      SELECT count(*) FILTER (WHERE type = 'pageview')::int AS pageviews,
             count(DISTINCT COALESCE(visitor_id, anon_id)) FILTER (WHERE type = 'pageview')::int AS uniques,
             count(DISTINCT visitor_id)::int AS identified
      FROM events WHERE ts > ${prevSince} AND ts <= ${since}`;
    const [prevLeads] = await sql`SELECT count(*)::int AS n FROM leads WHERE ts > ${prevSince} AND ts <= ${since}`;
    const [funnel] = await sql`SELECT count(*) FILTER (WHERE score >= 10)::int AS engaged, count(*) FILTER (WHERE score >= 25)::int AS hot
                               FROM visitors WHERE last_seen > ${since}`;
    const companies = await sql`
      SELECT org AS k, max(org_domain) AS domain, count(*)::int AS n, max(score)::int AS score FROM visitors
      WHERE last_seen > ${since} AND org IS NOT NULL AND org_is_isp = false GROUP BY 1 ORDER BY 3 DESC, 4 DESC LIMIT 8`;
    const recent = await sql`
      SELECT e.ts, e.type, e.path, e.name, e.value, e.consent, e.country, e.visitor_id, v.org, v.org_is_isp, v.city
      FROM events e LEFT JOIN visitors v ON v.id = e.visitor_id WHERE e.type <> 'engage' ORDER BY e.ts DESC LIMIT 30`;
    return {
      days: d, totals: { ...totals, leads: leads.n }, previous: { ...prev, leads: prevLeads.n }, funnel, companies, recent,
      daily, commands, map, geo,
      countries: await top('country', 'pageview'), referrers: await top('ref_host', 'pageview'),
      pages: await top('path', 'pageview'), devices: await top('device', 'pageview'),
      themes: await top('name', 'theme'), clicks: await top('name', 'click', 10),
      downloads: await top('name', 'download'), outbound: await top('name', 'outbound'),
    };
  },

  async visitors(sql) {
    return sql`SELECT v.*, l.label AS link_label, (SELECT count(*)::int FROM leads WHERE visitor_id = v.id) AS leads
               FROM visitors v LEFT JOIN links l ON l.slug = v.link_slug ORDER BY v.starred DESC, v.score DESC, v.last_seen DESC LIMIT 500`;
  },

  async live(sql) {
    const [a] = await sql`SELECT count(DISTINCT COALESCE(visitor_id, anon_id))::int AS n FROM events WHERE ts > now() - interval '5 minutes'`;
    const visitors = await sql`
      SELECT DISTINCT ON (v.id) v.id, v.org, v.org_is_isp, v.city, v.country, v.score, e.path, e.ts
      FROM events e JOIN visitors v ON v.id = e.visitor_id
      WHERE e.ts > now() - interval '5 minutes' ORDER BY v.id, e.ts DESC`;
    const [l] = await sql`SELECT count(*)::int AS n FROM leads WHERE status = 'new'`;
    return { count: a.n, visitors, newLeads: l.n };
  },

  async system(sql) {
    const has = (k) => !!process.env[k];
    const [c] = await sql`SELECT (SELECT count(*) FROM events)::int AS events, (SELECT count(*) FROM visitors)::int AS visitors,
                                 (SELECT count(*) FROM leads)::int AS leads, (SELECT count(*) FROM links)::int AS links,
                                 (SELECT min(ts) FROM events) AS since`;
    const neon = has('DATABASE_URL') || has('POSTGRES_URL');
    const to = process.env.ALERT_EMAIL_TO;
    return {
      env: process.env.VERCEL_ENV || 'development', region: process.env.VERCEL_REGION || 'local', counts: c,
      checks: [
        { label: 'Database', ok: neon, required: true, env: 'DATABASE_URL', detail: neon ? 'Neon Postgres' : 'Embedded dev database; data stays on this machine' },
        { label: 'Admin password', ok: has('ADMIN_PASSWORD'), required: true, env: 'ADMIN_PASSWORD' },
        { label: 'Session secret', ok: has('ADMIN_SECRET'), required: true, env: 'ADMIN_SECRET', detail: 'Signs admin logins' },
        { label: 'Site URL', ok: has('SITE_URL'), required: true, env: 'SITE_URL', detail: process.env.SITE_URL || 'Used in tracked links and alert emails' },
        { label: 'Image & résumé uploads', ok: has('BLOB_READ_WRITE_TOKEN'), env: 'BLOB_READ_WRITE_TOKEN', detail: has('BLOB_READ_WRITE_TOKEN') ? 'Vercel Blob' : 'Local folder (dev only)' },
        { label: 'Company lookup', ok: has('IPINFO_TOKEN'), env: 'IPINFO_TOKEN', detail: 'ipinfo.io Lite' },
        { label: 'Email alerts', ok: has('RESEND_API_KEY') && !!to, env: 'RESEND_API_KEY, ALERT_EMAIL_TO', detail: to ? 'Sends to ' + to : 'Resend' },
        { label: 'Cleanup job protection', ok: has('CRON_SECRET'), env: 'CRON_SECRET', detail: 'Daily data-retention job' },
      ],
    };
  },

  async visitor(sql, u) {
    const id = u.searchParams.get('id');
    if (!ID_RE.test(id || '')) return null;
    const [v] = await sql`SELECT v.*, l.label AS link_label FROM visitors v LEFT JOIN links l ON l.slug = v.link_slug WHERE v.id = ${id}`;
    if (!v) return null;
    const events = await sql`SELECT ts, session_id, type, path, name, value FROM events WHERE visitor_id = ${id} ORDER BY ts DESC LIMIT 300`;
    const leads = await sql`SELECT * FROM leads WHERE visitor_id = ${id} ORDER BY ts DESC`;
    return { visitor: v, events, leads };
  },

  async leads(sql) {
    return sql`SELECT l.*, v.org, v.city, v.country, v.score FROM leads l LEFT JOIN visitors v ON v.id = l.visitor_id ORDER BY l.ts DESC LIMIT 500`;
  },

  async links(sql) {
    return sql`SELECT k.*, (SELECT count(*)::int FROM visitors v WHERE v.link_slug = k.slug) AS visitors,
                      (SELECT count(*)::int FROM leads l JOIN visitors v ON v.id = l.visitor_id WHERE v.link_slug = k.slug) AS leads
               FROM links k ORDER BY k.created_at DESC`;
  },

  async content() { return getContent(); },

  // paginated, filterable event log
  async activity(sql, u) {
    const per = 50, page = Math.max(1, parseInt(u.searchParams.get('page')) || 1);
    const since = new Date(Date.now() - DAYS(u) * 864e5).toISOString();
    const type = u.searchParams.get('type') || '', who = u.searchParams.get('who') || '';
    const q = (u.searchParams.get('q') || '').trim().slice(0, 80);
    const params = [since], conds = ['e.ts > $1'];
    if (/^[a-z]{3,12}$/.test(type)) { params.push(type); conds.push(`e.type = $${params.length}`); }
    if (who === 'identified') conds.push('e.visitor_id IS NOT NULL');
    if (who === 'anonymous') conds.push('e.visitor_id IS NULL');
    if (q) {
      params.push('%' + q.replace(/[\\%_]/g, '\\$&') + '%');
      const n = params.length;
      conds.push(`(e.path ILIKE $${n} OR e.name ILIKE $${n} OR e.ref_host ILIKE $${n} OR v.org ILIKE $${n} OR v.city ILIKE $${n})`);
    }
    const where = conds.join(' AND ');
    const from = 'FROM events e LEFT JOIN visitors v ON v.id = e.visitor_id WHERE ' + where;
    const [{ n: total }] = await sql.query(`SELECT count(*)::int AS n ${from}`, params);
    const rows = await sql.query(
      `SELECT e.id, e.ts, e.type, e.path, e.name, e.value, e.country, e.region, e.device, e.ref_host, e.link_slug, e.visitor_id,
              v.org, v.org_is_isp, v.city ${from} ORDER BY e.ts DESC, e.id DESC LIMIT ${per} OFFSET ${(page - 1) * per}`, params);
    const types = await sql`SELECT type AS k, count(*)::int AS n FROM events WHERE ts > ${since} GROUP BY 1 ORDER BY 2 DESC`;
    return { rows, total, page, per, pages: Math.max(1, Math.ceil(total / per)), types };
  },

  // drill-down for one country on the overview map
  async 'geo-country'(sql, u) {
    const cc = (u.searchParams.get('cc') || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return null;
    const since = new Date(Date.now() - DAYS(u) * 864e5).toISOString();
    const [totals] = await sql`
      SELECT count(*) FILTER (WHERE type = 'pageview')::int AS pageviews,
             count(DISTINCT COALESCE(visitor_id, anon_id)) FILTER (WHERE type = 'pageview')::int AS uniques,
             count(DISTINCT visitor_id)::int AS identified
      FROM events WHERE ts > ${since} AND country = ${cc}`;
    const regions = await sql`SELECT region AS k, count(*)::int AS n FROM events
                              WHERE ts > ${since} AND country = ${cc} AND type = 'pageview' AND region IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 25`;
    const referrers = await sql`SELECT ref_host AS k, count(*)::int AS n FROM events
                                WHERE ts > ${since} AND country = ${cc} AND type = 'pageview' AND ref_host IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 6`;
    const cities = await sql`
      SELECT city AS k, max(region) AS region, avg(lat) AS lat, avg(lon) AS lon, count(*)::int AS n, max(score)::int AS score
      FROM visitors WHERE last_seen > ${since} AND country = ${cc} AND city IS NOT NULL GROUP BY city ORDER BY n DESC, score DESC LIMIT 40`;
    const people = await sql`SELECT id, org, org_is_isp, city, region, country, score, last_seen FROM visitors
                             WHERE last_seen > ${since} AND country = ${cc} ORDER BY score DESC, last_seen DESC LIMIT 8`;
    return { cc, totals, regions, referrers, cities, people };
  },
};

const POST_ACTIONS = {
  async 'lead-update'(sql, b) {
    if ('status' in b) {
      const status = ['new', 'contacted', 'won', 'lost'].includes(b.status) ? b.status : 'new';
      await sql`UPDATE leads SET status = ${status} WHERE id = ${+b.id}`;
    }
    if ('note' in b) await sql`UPDATE leads SET note = ${cleanText(b.note, 2000) || null} WHERE id = ${+b.id}`;
    return { ok: true };
  },

  async 'visitor-update'(sql, b) {
    if (!ID_RE.test(b.id || '')) return { error: 'bad id' };
    if ('starred' in b) await sql`UPDATE visitors SET starred = ${!!b.starred} WHERE id = ${b.id}`;
    if ('note' in b) await sql`UPDATE visitors SET note = ${cleanText(b.note, 2000) || null} WHERE id = ${b.id}`;
    return { ok: true };
  },

  async 'test-alert'() {
    const r = await sendAlert('Test alert from your portfolio', [['Sent at', new Date().toUTCString()], ['Dashboard', siteUrl() + '/admin']]);
    return r.ok ? { ok: true, to: process.env.ALERT_EMAIL_TO } : { error: r.error };
  },
  async 'lead-delete'(sql, b) { await sql`DELETE FROM leads WHERE id = ${+b.id}`; return { ok: true }; },

  async 'visitor-delete'(sql, b) {
    if (!ID_RE.test(b.id || '')) return { error: 'bad id' };
    await sql`DELETE FROM events WHERE visitor_id = ${b.id}`;
    await sql`DELETE FROM visitors WHERE id = ${b.id}`;
    await sql`UPDATE leads SET visitor_id = NULL WHERE visitor_id = ${b.id}`;
    return { ok: true };
  },

  async 'link-create'(sql, b) {
    const label = cleanText(b.label, 80);
    if (!label) return { error: 'Give the link a label, e.g. "Jane @ Acme".' };
    let slug = str(b.slug, 40)?.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
    if (slug && !SLUG_RE.test(slug)) return { error: 'Slug must be 3–40 letters, numbers or dashes.' };
    slug ||= randomBytes(4).toString('hex');
    const rows = await sql`INSERT INTO links (slug, label, greeting, note) VALUES (${slug}, ${label}, ${cleanText(b.greeting, 120) || null}, ${cleanText(b.note, 500) || null})
                           ON CONFLICT (slug) DO NOTHING RETURNING *`;
    return rows[0] || { error: 'That slug is taken.' };
  },
  async 'link-delete'(sql, b) { await sql`DELETE FROM links WHERE slug = ${String(b.slug)}`; return { ok: true }; },

  async content(sql, b) { return { ok: true, content: await saveContent(b.content) }; },
};

async function upload(request, u) {
  const name = (u.searchParams.get('filename') || 'file').replace(/[^\w.-]+/g, '_').slice(-80);
  const type = request.headers.get('content-type') || 'application/octet-stream';
  if (!/^(image\/(png|jpe?g|webp|gif|avif|svg\+xml)|application\/pdf)$/.test(type)) return json({ error: 'Only images or PDF.' }, 415);
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length > 4 * 1024 * 1024) return json({ error: 'Max 4 MB.' }, 413);
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import('@vercel/blob');
    const blob = await put(`uploads/${name}`, buf, { access: 'public', contentType: type, addRandomSuffix: true });
    return json({ url: blob.url });
  }
  // local dev fallback
  const { mkdir, writeFile } = await import('node:fs/promises');
  const file = `${Date.now().toString(36)}-${name}`;
  await mkdir('public/uploads', { recursive: true });
  await writeFile(`public/uploads/${file}`, buf);
  return json({ url: `/uploads/${file}` });
}

export async function GET(request) {
  const u = new URL(request.url);
  const fn = GET_ACTIONS[u.searchParams.get('action')];
  if (!fn) return json({ error: 'unknown action' }, 404);
  if (!isAdmin(request)) return json({ error: 'unauthorized' }, 401);
  const data = await fn(await db(), u);
  return data == null ? json({ error: 'not found' }, 404) : json(data);
}

export async function POST(request) {
  const u = new URL(request.url);
  const action = u.searchParams.get('action');

  if (action === 'login') {
    const b = await readJson(request);
    if (!process.env.ADMIN_PASSWORD) return json({ error: 'Set ADMIN_PASSWORD in your environment first.' }, 500);
    if (!checkPassword(b?.password)) {
      await new Promise((r) => setTimeout(r, 800));
      return json({ error: 'Wrong password.' }, 401);
    }
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(request) });
  }
  if (action === 'logout') return json({ ok: true }, 200, { 'set-cookie': clearCookie() });

  if (!isAdmin(request) || request.headers.get('x-admin') !== '1') return json({ error: 'unauthorized' }, 401);
  if (action === 'upload') return upload(request, u);
  const fn = POST_ACTIONS[action];
  if (!fn) return json({ error: 'unknown action' }, 404);
  const b = await readJson(request, 512 * 1024);
  if (!b) return json({ error: 'Invalid JSON' }, 400);
  const res = await fn(await db(), b);
  return json(res, res?.error ? 400 : 200);
}
