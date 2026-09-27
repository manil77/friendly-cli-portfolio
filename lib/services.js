// Outbound integrations: company lookup (ipinfo), email alerts (Resend), admin auth, HTML sanitizing.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';

/* ---------- company lookup ---------- */

const ISP = /telecom|communication|broadband|internet|mobile|cable|wireless|network|\bnet\b|isp|telekom|vodafone|airtel|jio|verizon|comcast|at&t|t-mobile|charter|cox|ncell|worldlink|vianet|subisu|classic tech|dishhome|nepal telecom|amazon|google|microsoft|cloudflare|digitalocean|ovh|hetzner|akamai|oracle|linode|vultr|choopa|m247|datacamp/i;

export async function lookupOrg(ip) {
  const token = process.env.IPINFO_TOKEN;
  if (!token || !ip || ip === '0.0.0.0' || ip.startsWith('127.') || ip === '::1') return null;
  try {
    const r = await fetch(`https://api.ipinfo.io/lite/${encodeURIComponent(ip)}?token=${token}`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.as_name) return null;
    return { org: d.as_name, domain: d.as_domain || null, isp: ISP.test(d.as_name) };
  } catch { return null; }
}

/* ---------- email alerts ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function sendAlert(subject, rows, link) {
  const key = process.env.RESEND_API_KEY, to = process.env.ALERT_EMAIL_TO;
  const lines = rows.filter(([, v]) => v != null && v !== '');
  if (!key || !to) { console.log('[alert]', subject, Object.fromEntries(lines)); return; }
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#222">
    <h2 style="font-size:17px;margin:0 0 12px">${esc(subject)}</h2>
    <table style="border-collapse:collapse">${lines.map(([k, v]) =>
      `<tr><td style="padding:3px 14px 3px 0;color:#888;vertical-align:top">${esc(k)}</td><td style="padding:3px 0">${esc(v)}</td></tr>`).join('')}</table>
    ${link ? `<p style="margin-top:16px"><a href="${esc(link)}">Open in dashboard →</a></p>` : ''}</div>`;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.ALERT_EMAIL_FROM || 'Portfolio <onboarding@resend.dev>', to: to.split(','), subject, html }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) { console.error('alert failed', e.message); }
}

export function visitorRows(v) {
  if (!v) return [];
  const where = [v.city, v.region, v.country].filter(Boolean).join(', ');
  return [
    ['Company / network', v.org ? `${v.org}${v.org_is_isp ? ' (ISP)' : ''}` : null],
    ['Location', where],
    ['Device', [v.device, v.browser, v.os].filter(Boolean).join(' · ')],
    ['Came from', v.referrer || v.utm],
    ['Tracked link', v.link_slug],
    ['Visits', v.visits],
    ['Lead score', v.score],
  ];
}

export const siteUrl = () => (process.env.SITE_URL || '').replace(/\/$/, '');

/* ---------- admin auth ---------- */

const secret = () => process.env.ADMIN_SECRET || `pw:${process.env.ADMIN_PASSWORD || ''}`;
const sign = (payload) => createHmac('sha256', secret()).update(payload).digest('base64url');
const COOKIE = 'mm_admin';
const WEEK = 7 * 24 * 3600;

export function checkPassword(input) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || typeof input !== 'string') return false;
  const a = createHash('sha256').update(input).digest(), b = createHash('sha256').update(pw).digest();
  return timingSafeEqual(a, b);
}

export function sessionCookie(request) {
  const exp = Math.floor(Date.now() / 1000) + WEEK;
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE}=${exp}.${sign(String(exp))}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${WEEK}${secure}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0`;

export function isAdmin(request) {
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)mm_admin=(\d+)\.([\w-]+)/);
  if (!m || +m[1] < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(m[1])), got = Buffer.from(m[2]);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

/* ---------- sanitizing CMS input ---------- */

export function cleanRich(html) {
  // block elements from pasted/edited HTML become line breaks; everything else outside the allowlist is dropped
  const flat = String(html || '').replace(/<\/(p|div|li|h\d)>/gi, '<br>');
  return sanitizeHtml(flat, {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 'a', 'br'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      strong: 'b',
      a: (tag, attribs) => ({ tagName: 'a', attribs: { href: attribs.href, target: '_blank', rel: 'noreferrer' } }),
    },
  }).replace(/(<br\s*\/?>\s*)+$/, '').trim();
}

export function cleanUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^(https?:|mailto:|tel:)/i.test(s) || /^\/(?!\/)/.test(s)) return s.slice(0, 500);
  return '';
}

export const cleanText = (s, max = 300) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
