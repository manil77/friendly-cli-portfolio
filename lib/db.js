// Postgres access. Neon over HTTP in production; embedded PGlite locally when DATABASE_URL is unset.
// `sql` works as a tagged template (sql`... ${v}`) and as sql.query(text, params); both resolve to rows.

const SCHEMA = `
DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS visitors (
    id text PRIMARY KEY,
    first_seen timestamptz NOT NULL DEFAULT now(),
    last_seen timestamptz NOT NULL DEFAULT now(),
    visits int NOT NULL DEFAULT 1,
    pageviews int NOT NULL DEFAULT 0,
    score int NOT NULL DEFAULT 0,
    country text, region text, city text, lat double precision, lon double precision,
    org text, org_domain text, org_is_isp boolean,
    device text, browser text, os text,
    referrer text, utm text, link_slug text, theme text,
    alerted jsonb NOT NULL DEFAULT '{}'::jsonb
  );
  CREATE TABLE IF NOT EXISTS events (
    id bigserial PRIMARY KEY,
    ts timestamptz NOT NULL DEFAULT now(),
    consent boolean NOT NULL,
    visitor_id text, session_id text, anon_id text,
    type text NOT NULL, path text, name text, value text,
    ref_host text, country text, device text, link_slug text
  );
  CREATE INDEX IF NOT EXISTS events_ts ON events (ts);
  CREATE INDEX IF NOT EXISTS events_visitor ON events (visitor_id, ts);
  CREATE INDEX IF NOT EXISTS events_session ON events (session_id);
  CREATE TABLE IF NOT EXISTS links (
    slug text PRIMARY KEY,
    label text NOT NULL, greeting text, note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    opens int NOT NULL DEFAULT 0,
    first_open timestamptz, last_open timestamptz, last_alert timestamptz
  );
  CREATE TABLE IF NOT EXISTS leads (
    id serial PRIMARY KEY,
    ts timestamptz NOT NULL DEFAULT now(),
    name text NOT NULL, email text NOT NULL, company text, message text NOT NULL,
    visitor_id text, status text NOT NULL DEFAULT 'new'
  );
  CREATE TABLE IF NOT EXISTS content (
    key text PRIMARY KEY,
    value jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS salts (day date PRIMARY KEY, salt text NOT NULL);
  ALTER TABLE visitors ADD COLUMN IF NOT EXISTS starred boolean NOT NULL DEFAULT false;
  ALTER TABLE visitors ADD COLUMN IF NOT EXISTS note text;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS note text;
END $$;`;

function tagged(query) {
  const sql = (strings, ...vals) => {
    let text = strings[0];
    for (let i = 1; i < strings.length; i++) text += '$' + i + strings[i];
    return query(text, vals);
  };
  sql.query = query;
  return sql;
}

async function connect() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  let query;
  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const client = neon(url);
    query = (text, params = []) => client.query(text, params);
  } else {
    // variable specifier keeps the dev-only dependency out of the deployed bundle
    const mod = '@electric-sql/pglite';
    const { PGlite } = await import(mod);
    const dir = process.env.PGLITE_DIR || '.data/pglite';
    (await import('node:fs')).mkdirSync(dir, { recursive: true });
    const pg = new PGlite(dir);
    query = async (text, params = []) => (await pg.query(text, params)).rows;
  }
  await query(SCHEMA);
  return tagged(query);
}

let pending;
export function db() {
  return (pending ||= connect().catch((e) => { pending = null; throw e; }));
}
