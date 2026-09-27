// Visitor tracking ingest. Two tiers:
//  - no consent: anonymous aggregate event (country, device, referrer host, daily-rotating hash for unique counts; IP never stored)
//  - consent (c=1 + vid): visitor profile with city, company network, session history and lead score
import { createHash, randomBytes } from 'node:crypto';
import { db } from '../lib/db.js';
import { json, readJson, str, clientIp, geo, isBot, parseUA, hostOf, ID_RE, SLUG_RE } from '../lib/http.js';
import { lookupOrg, sendAlert, visitorRows, siteUrl } from '../lib/services.js';

const TYPES = new Set(['pageview', 'click', 'command', 'download', 'theme', 'engage', 'outbound', 'choice', 'consent', 'withdraw']);
const POINTS = { pageview: 1, consent: 1, click: 3, command: 1, download: 10, theme: 1, outbound: 2 };
const HOT_SCORE = 25;
const LINK_ALERT_GAP_MS = 6 * 3600 * 1000;

let saltCache = { day: null, salt: null };
async function dailyHash(sql, input) {
  const day = new Date().toISOString().slice(0, 10);
  if (saltCache.day !== day) {
    const fresh = randomBytes(16).toString('hex');
    const [row] = await sql`INSERT INTO salts (day, salt) VALUES (${day}, ${fresh})
                            ON CONFLICT (day) DO UPDATE SET day = EXCLUDED.day RETURNING salt`;
    saltCache = { day, salt: row.salt };
  }
  return createHash('sha256').update(saltCache.salt + input).digest('hex').slice(0, 16);
}

export async function POST(request) {
  const b = await readJson(request, 4096);
  const ua = request.headers.get('user-agent') || '';
  if (!b || !TYPES.has(b.t) || isBot(ua)) return json({ ok: true });

  const sql = await db();
  const consent = b.c === 1 && ID_RE.test(b.vid || '');
  const vid = consent ? b.vid : null;

  if (b.t === 'withdraw') {
    // consent withdrawn: erase everything tied to this visitor id
    if (ID_RE.test(b.vid || '')) {
      await sql`DELETE FROM events WHERE visitor_id = ${b.vid}`;
      await sql`DELETE FROM visitors WHERE id = ${b.vid}`;
      await sql`UPDATE leads SET visitor_id = NULL WHERE visitor_id = ${b.vid}`;
    }
    return json({ ok: true });
  }

  const sid = consent && ID_RE.test(b.sid || '') ? b.sid : null;
  const own = new URL(request.url).hostname.replace(/^www\./, '');
  const g = geo(request);
  const ua3 = parseUA(ua);
  const ev = {
    path: str(b.p, 200), name: str(b.n, 120), value: str(b.v, 200),
    ref: hostOf(b.r, own), slug: SLUG_RE.test(b.via || '') ? b.via : null,
  };
  const out = { ok: true };

  // tracked personal link — counted on the landing page load, even without consent (count + country only)
  let link = null;
  if (ev.slug) {
    [link] = await sql`SELECT slug, label, greeting, last_alert FROM links WHERE slug = ${ev.slug}`;
    if (!link) ev.slug = null;
    else {
      out.greeting = link.greeting || null;
      if (b.t === 'pageview' && b.land === 1) {
        await sql`UPDATE links SET opens = opens + 1, first_open = COALESCE(first_open, now()), last_open = now() WHERE slug = ${link.slug}`;
        if (!link.last_alert || Date.now() - new Date(link.last_alert).getTime() > LINK_ALERT_GAP_MS) {
          await sql`UPDATE links SET last_alert = now() WHERE slug = ${link.slug}`;
          await sendAlert(`🔗 ${link.label} opened your link`, [
            ['Link', link.label], ['Country', g.country], ['Device', `${ua3.device} · ${ua3.browser}`], ['Landing page', ev.path],
            ['Consent', 'Not yet — details appear if they accept tracking'],
          ], `${siteUrl()}/admin#links`);
        }
      }
    }
  }

  if (!consent) {
    const anon = await dailyHash(sql, clientIp(request) + ua);
    await sql`INSERT INTO events (consent, anon_id, type, path, name, value, ref_host, country, device, link_slug)
              VALUES (false, ${anon}, ${b.t}, ${ev.path}, ${ev.name}, ${ev.value}, ${ev.ref}, ${g.country}, ${ua3.device}, ${ev.slug})`;
    return json(out);
  }

  // ---- consented visitor ----
  const newSession = sid ? (await sql`SELECT 1 FROM events WHERE session_id = ${sid} LIMIT 1`).length === 0 : false;
  let pts = POINTS[b.t] || 0;
  if (b.t === 'engage') pts = Math.min(10, Math.floor((+b.v || 0) / 30));
  const isView = b.t === 'pageview' || b.t === 'consent' ? 1 : 0;
  const theme = b.t === 'theme' ? ev.name : null;
  const utm = str(b.utm, 200);

  const [v] = await sql`
    INSERT INTO visitors (id, country, region, city, lat, lon, device, browser, os, referrer, utm, link_slug, theme, pageviews, score)
    VALUES (${vid}, ${g.country}, ${g.region}, ${g.city}, ${g.lat}, ${g.lon}, ${ua3.device}, ${ua3.browser}, ${ua3.os},
            ${ev.ref}, ${utm}, ${ev.slug}, ${theme}, ${isView}, ${pts + (ev.slug ? 10 : 0)})
    ON CONFLICT (id) DO UPDATE SET
      last_seen = now(),
      country = COALESCE(EXCLUDED.country, visitors.country), region = COALESCE(EXCLUDED.region, visitors.region),
      city = COALESCE(EXCLUDED.city, visitors.city), lat = COALESCE(EXCLUDED.lat, visitors.lat), lon = COALESCE(EXCLUDED.lon, visitors.lon),
      referrer = COALESCE(visitors.referrer, EXCLUDED.referrer), utm = COALESCE(visitors.utm, EXCLUDED.utm),
      link_slug = COALESCE(visitors.link_slug, EXCLUDED.link_slug), theme = COALESCE(EXCLUDED.theme, visitors.theme),
      visits = visitors.visits + ${newSession ? 1 : 0},
      pageviews = visitors.pageviews + ${isView},
      score = visitors.score + ${pts + (newSession ? 5 : 0)} + (CASE WHEN visitors.link_slug IS NULL AND EXCLUDED.link_slug IS NOT NULL THEN 10 ELSE 0 END)
    RETURNING *, (xmax = 0) AS inserted`;

  await sql`INSERT INTO events (consent, visitor_id, session_id, type, path, name, value, ref_host, country, device, link_slug)
            VALUES (true, ${vid}, ${sid}, ${b.t}, ${ev.path}, ${ev.name}, ${ev.value}, ${ev.ref}, ${g.country}, ${ua3.device}, ${ev.slug})`;

  // company lookup once per visitor (IP is used for the lookup only, never stored)
  if (v.inserted || v.org == null) {
    const org = await lookupOrg(clientIp(request));
    if (org) {
      Object.assign(v, { org: org.org, org_domain: org.domain, org_is_isp: org.isp });
      await sql`UPDATE visitors SET org = ${org.org}, org_domain = ${org.domain}, org_is_isp = ${org.isp} WHERE id = ${vid}`;
    }
  }

  await maybeAlert(sql, v, b.t, ev, link);
  return json(out);
}

// one alert per reason per visitor
async function maybeAlert(sql, v, type, ev, link) {
  const done = v.alerted || {};
  const reasons = [];
  if (v.org && !v.org_is_isp && !done.org) reasons.push(['org', `🏢 Visitor from ${v.org}`]);
  if (type === 'download' && !done.download) reasons.push(['download', `📄 Someone downloaded your résumé`]);
  if (v.score >= HOT_SCORE && !done.hot) reasons.push(['hot', `🔥 Hot visitor (score ${v.score})`]);
  if (link && type === 'consent' && !done.link) reasons.push(['link', `🔗 ${link.label} is browsing your portfolio`]);
  if (!reasons.length) return;

  const flags = Object.fromEntries(reasons.map(([k]) => [k, true]));
  await sql`UPDATE visitors SET alerted = alerted || ${JSON.stringify(flags)}::jsonb WHERE id = ${v.id}`;
  const recent = await sql`SELECT type, path, name FROM events WHERE visitor_id = ${v.id} ORDER BY ts DESC LIMIT 8`;
  const trail = recent.reverse().map((e) => e.name ? `${e.type}: ${e.name}` : `${e.type} ${e.path || ''}`).join(' → ');
  await sendAlert(reasons.map((r) => r[1]).join(' · '), [...visitorRows(v), ['Recent activity', trail]],
    `${siteUrl()}/admin#visitor=${v.id}`);
}
