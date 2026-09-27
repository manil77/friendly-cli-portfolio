// Small helpers shared by the API routes (Web Request/Response handlers).

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export async function readJson(request, limit = 8192) {
  const text = await request.text();
  if (text.length > limit) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export function str(v, max = 200) {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

export function clientIp(request) {
  const h = request.headers;
  return h.get('x-real-ip') || (h.get('x-forwarded-for') || '').split(',')[0].trim() || '0.0.0.0';
}

// Vercel adds these headers on every request; they are absent locally.
export function geo(request) {
  const h = request.headers;
  const dec = (v) => { try { return v ? decodeURIComponent(v) : null; } catch { return v; } };
  const num = (v) => (v && !isNaN(+v) ? +v : null);
  return {
    country: h.get('x-vercel-ip-country') || process.env.DEV_COUNTRY || null,
    region: dec(h.get('x-vercel-ip-country-region')) || process.env.DEV_REGION || null,
    city: dec(h.get('x-vercel-ip-city')) || process.env.DEV_CITY || null,
    lat: num(h.get('x-vercel-ip-latitude')) ?? num(process.env.DEV_LAT),
    lon: num(h.get('x-vercel-ip-longitude')) ?? num(process.env.DEV_LON),
  };
}

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|embedly|monitor|curl|wget|python|axios|node-fetch/i;
export const isBot = (ua) => !ua || BOT.test(ua);

export function parseUA(ua = '') {
  const device = /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|android|iphone/i.test(ua) ? 'mobile' : 'desktop';
  const browser = /edg\//i.test(ua) ? 'Edge' : /opr\/|opera/i.test(ua) ? 'Opera' : /firefox|fxios/i.test(ua) ? 'Firefox'
    : /chrome|crios/i.test(ua) ? 'Chrome' : /safari/i.test(ua) ? 'Safari' : 'Other';
  const os = /windows/i.test(ua) ? 'Windows' : /iphone|ipad|ios/i.test(ua) ? 'iOS' : /mac os/i.test(ua) ? 'macOS'
    : /android/i.test(ua) ? 'Android' : /linux/i.test(ua) ? 'Linux' : 'Other';
  return { device, browser, os };
}

export function hostOf(url, ownHost) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    return h && h !== ownHost ? h : null;
  } catch { return null; }
}

export const ID_RE = /^[a-z0-9-]{8,40}$/i;
export const SLUG_RE = /^[a-z0-9-]{3,40}$/;
