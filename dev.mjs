// Local dev server: serves public/ and routes /api/<name> to api/<name>.js (same Web handler signature Vercel uses).
// Run with `npm run dev`. Without DATABASE_URL it uses an embedded Postgres in .data/.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = +process.env.PORT || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.pdf': 'application/pdf', '.ico': 'image/x-icon' };

async function api(req, res, name) {
  const mod = await import(pathToFileURL(join(process.cwd(), 'api', `${name}.js`)).href);
  const handler = mod[req.method];
  if (!handler) { res.writeHead(405).end(); return; }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(`http://${req.headers.host}${req.url}`, {
    method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const response = await handler(request);
  const headers = Object.fromEntries(response.headers);
  res.writeHead(response.status, headers).end(Buffer.from(await response.arrayBuffer()));
}

async function file(res, path) {
  let p = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, '');
  let full = join('public', p);
  try {
    if ((await stat(full)).isDirectory()) full = join(full, 'index.html');
  } catch {
    if (!extname(full)) full += '.html'; // mimic cleanUrls
  }
  try {
    res.writeHead(200, { 'content-type': TYPES[extname(full)] || 'application/octet-stream' }).end(await readFile(full));
  } catch { res.writeHead(404).end('Not found'); }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    const m = pathname.match(/^\/api\/([\w-]+)$/);
    if (m) await api(req, res, m[1]); else await file(res, pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Server error: ' + e.message);
  }
}).listen(PORT, () => console.log(`dev server → http://localhost:${PORT}`));
