# 📋 Portfolio Tracker

> Living roadmap + experiment log for **manil77/friendly-cli-portfolio**.
> _Last updated: 2026-06-15_

A two-mode personal portfolio (retro CLI entry → modern horizontal-scroll site).
Right now the **UI foundation is done**; next we add **visitor analytics** and a
**backend**, and we expect to **experiment a lot** — so this file is the source of
truth for what's planned, what's in flight, and what we learned.

---

## 🧭 Status at a glance

| Area            | State          | Notes                                                  |
| --------------- | -------------- | ------------------------------------------------------ |
| UI / front-end  | ✅ Done (base) | `index.html` (CLI) + `home-horizontal.html` (modern)   |
| Assets          | ✅ Consolidated | All under `assets/`                                     |
| Hosting         | 🟡 Static only | GitHub Pages from `main` (assumed) — no backend yet    |
| Visitor tracking| 🔴 Not started | **Current focus** — see Phase 1                         |
| Backend         | 🔴 Not started | Needed for analytics ingestion, contact form, etc.     |
| Experiments     | 🟢 Ongoing     | Log them below                                          |

Legend: ✅ done · 🟡 partial · 🟢 active · 🔴 not started

---

## ✅ Done — UI foundation

- [x] Retro CLI terminal entry (`index.html`) with inline styles + JS
- [x] Modern horizontal-scroll site (`home-horizontal.html` + `horizontal.js`)
- [x] Consolidated assets into `assets/`; removed legacy/duplicate files
- [x] `README.md`, `.gitignore`

---

## 🛠️ Roadmap

### Phase 1 — Visitor analytics & tracking  ⬅️ current focus
Goal: understand **who visits, where they come from, and what they do**.

- [ ] Decide tracking approach (see [comparison](#-analytics--visitor-tracking--options) below)
- [ ] Capture: page views, unique visitors, referrer/source, country, device, CLI-vs-modern mode usage
- [ ] Track key in-site events (e.g. `switch-modern`, command usage, project clicks, résumé download)
- [ ] Add a privacy note / cookie-less approach (keep it light + respectful)
- [ ] Decide where to view the data (hosted dashboard vs. self-hosted vs. custom)

### Phase 2 — Backend
Goal: a small backend to power dynamic bits.

- [ ] Pick a runtime/host (serverless preferred — see architecture notes)
- [ ] Analytics ingestion endpoint (if self-rolling instead of a SaaS)
- [ ] Contact form handler (replace `mailto:` with a real submit)
- [ ] Optional: store/serve dynamic content (projects, stats)

### Phase 3 — Polish & content
- [ ] Wire up a download link for `assets/souvenir.pdf` (currently orphaned)
- [ ] More CLI commands / easter eggs
- [ ] SEO / OpenGraph meta + social preview image
- [ ] Performance pass (font loading, image sizes)
- [ ] Accessibility pass

---

## 📊 Analytics & visitor tracking — options

Pick based on: privacy, cost, whether we want a backend, and how much data we want.

| Option                   | Backend? | Cost        | Privacy     | Notes                                              |
| ------------------------ | -------- | ----------- | ----------- | -------------------------------------------------- |
| Cloudflare Web Analytics | No       | Free        | ✅ cookieless | Easiest drop-in; basic referrer/geo               |
| Plausible / Umami (SaaS) | No       | $ / free-ish | ✅           | Clean dashboards, events; Umami self-hostable      |
| GoatCounter              | No       | Free        | ✅           | Tiny, simple, good for hobby sites                 |
| Google Analytics 4       | No       | Free        | ⚠️ cookies   | Most data, heaviest, privacy trade-offs            |
| **Custom** endpoint      | **Yes**  | infra cost  | ✅ full control | Aligns with Phase 2 backend; max experimentation |

> 💡 Given we **want a backend anyway** and **want to experiment**, a hybrid is
> attractive: start with a zero-effort cookieless tool now, then build a custom
> endpoint in Phase 2 to own the data and try our own ideas.

**Decision:** _TBD — record it in the Decisions log once chosen._

---

## 🧪 Experiment log

Track every experiment so we keep what works and kill what doesn't.

| Date       | Experiment | Hypothesis | Result | Keep? |
| ---------- | ---------- | ---------- | ------ | ----- |
| _2026-06-15_ | _(template row — copy me)_ | _what we expect_ | _what happened_ | _✅/❌_ |

---

## 🗃️ Backlog / ideas

- [ ] Visitor "live" counter or globe on the site itself
- [ ] A `stats` CLI command that shows visitor data in-terminal
- [ ] Dark/light + color themes beyond the current Noir switcher
- [ ] Blog / notes section
- [ ] _add ideas freely — this is the scratchpad_

---

## 🧱 Architecture notes (current → planned)

**Current:** Vanilla HTML/CSS/JS, no build step, static hosting (GitHub Pages from `main`).

**Planned considerations for a backend:**
- Static site can't run a server → backend must live elsewhere (serverless fits the
  no-build, low-cost ethos): e.g. Cloudflare Workers, Vercel/Netlify Functions.
- Keep the front-end deployable as-is; backend talks to it via small `fetch` calls.
- If self-hosting analytics, need a datastore (KV / SQLite / Postgres) — pick the
  smallest thing that works, scale later.

---

## 📌 Decisions log

| Date       | Decision | Why |
| ---------- | -------- | --- |
| 2026-06-15 | Keep committing portfolio directly to `main` | Solo project; live site deploys from `main` |
| 2026-06-15 | Created this tracker | Centralize roadmap + experiments before adding backend/analytics |

---

_How to use this file: update **Status at a glance** when a phase moves; log every
experiment in the **Experiment log**; record any non-obvious choice in the
**Decisions log**. Keep it short — delete stale lines._
