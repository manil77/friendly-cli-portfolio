# Manil Maharjan — Portfolio

A two-mode personal portfolio:

- **`index.html`** — a retro phosphor-green **terminal CLI** entry. Type `help`, `about`, `projects`, etc. Run **`switch-modern`** to enter the modern site.
- **`home-horizontal.html`** — a premium **horizontal-scroll** experience (Noir theme by default) with an animated flow-field background, an editorial history timeline, selected work, and a live color switcher. Includes an awwwards-style intro loader.

## Run locally

```bash
npm install
cp .env.example .env.local   # set ADMIN_PASSWORD at minimum
npm run dev                  # http://localhost:3000  ·  admin at /admin
```

Without `DATABASE_URL` the dev server uses an embedded Postgres (PGlite) in `.data/`, and uploads go to `public/uploads/`.

## Structure

- `public/` — the static site: `index.html` (experience picker), `cli.html` (terminal), `home-horizontal.html` (modern), `privacy.html`, `admin/`
- `public/js/` — `track.js` (consent banner + first-party tracking), `lead.js` (Work-with-me form), `content.js` / `modern-content.js` (CMS rendering)
- `api/` — Vercel functions: `collect` (tracking), `lead`, `content`, `admin`, `cron` (data retention)
- `lib/` — database, content model, integrations (ipinfo, Resend), auth, sanitizing

## Deploy (Vercel)

1. Vercel project **friendly-cli-portfolio** is linked to this repo; every push to `main` deploys (framework preset: Other; `vercel.json` sets `public/` as output).
2. **Storage** tab → connect **Neon Postgres** (adds `DATABASE_URL`) and **Blob** (adds `BLOB_READ_WRITE_TOKEN`).
3. **Settings → Environment Variables**: `ADMIN_PASSWORD`, `ADMIN_SECRET`, `SITE_URL`, `CRON_SECRET`, and optionally `IPINFO_TOKEN`, `RESEND_API_KEY`, `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM` (see `.env.example`).
4. Redeploy. Tables are created automatically on first request.

## Stack

Vanilla HTML / CSS / JS front-end, no build step. Vercel Functions (Node) + Neon Postgres + Vercel Blob. Fonts via Fontshare + Google Fonts.
