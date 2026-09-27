// Site content model: defaults (what the site shipped with) + normalizer used when the CMS saves.
import { db } from './db.js';
import { cleanRich, cleanText, cleanUrl } from './services.js';

export const DEFAULT_CONTENT = {
  profile: {
    name: 'Manil Maharjan',
    role: 'Software Engineer',
    location: 'Nepal',
    avatar: '/assets/avatar.jpg',
    email: 'manil.maharjan07@gmail.com',
    phone: '+977 9863777960',
    status: 'Available for freelance work',
    resume: '',
  },
  socials: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/in/iammanil' }],
  skills: ['JavaScript', 'TypeScript', '.NET', 'NestJS', 'PostgreSQL', 'SQL Server', 'Entity Framework', 'Dapper', 'Tailwind', 'Azure DevOps', 'Git'],
  hero: {
    lead: "I'm <b>Manil Maharjan</b> — four years building full-stack web apps with <b>.NET</b>, <b>NestJS</b> &amp; <b>PostgreSQL</b>, obsessed with the details that make software feel effortless.",
  },
  about: {
    quote: 'Happiest between the database and the interface — shaping clean APIs on one side, <em>obsessing</em> over the experience on the other.',
    p1: "I've worked across demanding domains — cross-border <b>fintech</b>, <b>real estate</b>, and <b>NGO / social-impact</b> tooling — which taught me to treat accuracy, compliance and real workflows as the design, not afterthoughts.",
    p2: "Right now I'm <b>freelancing</b>, helping teams ship web apps, while building <b>something new</b> of my own. Outside of code, you'll find me sketching ideas or gaming with friends. Based in <b>Nepal</b>.",
  },
  timeline: [
    { period: 'JAN — APR 2022', role: 'Frontend Intern', company: 'EKbana Solutions', badge: 'Internship', current: false,
      description: 'Learned Git, QA and SQL, took JavaScript to an intermediate level, and built a food e-commerce site in React on top of EKbana’s APIs.',
      stack: 'React · JavaScript\nGit · MySQL' },
    { period: 'APR 2022 — FEB 2024', role: 'Web Developer', company: 'Team Next I.C.T Solutions', badge: 'Intern → Mid', current: false,
      description: 'Grew from intern to mid-level developer. Led Heifer Cambodia’s PME system end to end, ran client demos and training, mentored juniors, spearheaded Heifer VCC and helped redesign HRDC.',
      stack: 'ASP.NET MVC · PostgreSQL\nEntity Framework · React' },
    { period: 'FEB 2024 — JUN 2026', role: 'Software Developer', company: 'Inficare', badge: '', current: false,
      description: 'Integrated partner Send/Pull APIs for a remittance platform and led the upgrade from .NET Framework 4.7.2 to .NET 8 with Clean Architecture and the Repository + Unit of Work patterns.',
      stack: 'ASP.NET 4.7 / 6 / 8 · SQL Server\nDapper · Azure DevOps · IIS' },
    { period: 'JAN — AUG 2025', role: 'NestJS Developer', company: 'HUKU', badge: 'Freelance', current: false,
      description: 'Built a full real-estate platform end to end: listings, property uploads, galleries, auth, visit scheduling and agent dashboards.',
      stack: 'NestJS · Nunjucks\nTypeORM · SQLite' },
    { period: 'JUN 2026 — NOW', role: 'Freelance Engineer', company: 'Independent', badge: 'Freelance', current: true,
      description: 'Building web apps and APIs for clients: .NET and NestJS back ends, PostgreSQL, and fast, considered front ends.',
      stack: '.NET · NestJS · PostgreSQL\nTypeScript · Azure' },
    { period: '2026 — NOW', role: 'Something new', company: 'In stealth', badge: 'Stealth', current: true,
      description: 'Building a product of my own that I can’t talk about yet. Launching soon.',
      stack: 'Details soon' },
  ],
  projects: [
    { name: 'RemitX', category: 'Fintech · .NET', stack: '.NET · SQL Server · Azure', image: '/assets/remitx.png', url: '',
      summary: 'White-label remittance platform for secure cross-border transfers.',
      description: 'A white-label remittance platform banks use to move money across borders — I led the .NET 8 migration and built posting that reconciles to the cent.' },
    { name: 'HUKU', category: 'Real estate · NestJS', stack: 'NestJS · Nunjucks · SQLite', image: '/assets/huku.png', url: '',
      summary: 'A slick real-estate platform built end to end.',
      description: 'A real-estate platform I built end to end — listings, galleries, auth, visit scheduling and agent dashboards.' },
    { name: 'Heifer PMIS', category: 'NGO · .NET', stack: '.NET · PostgreSQL', image: '/assets/heifer.png', url: '',
      summary: 'Project management &amp; PMER for NGOs.',
      description: 'Project &amp; budget tracking for NGO programs, with a PMER reporting system used across country offices.' },
  ],
  cli: {
    about: "Hey there! I'm a <b>software engineer</b> who loves turning coffee into code.<br><br>I've spent the last 4 years building web apps with <b>.NET</b>, <b>NestJS</b> and PostgreSQL. I'm obsessed with clean UIs, smooth UX, and making things intuitive.<br><br><i>Outside of coding, you'll find me sketching ideas or gaming with friends.</i>",
    commands: [],
  },
};

const RESERVED = new Set(['help', 'about', 'skills', 'projects', 'experience', 'contact', 'clear', 'cls', 'switch-modern', 'modern', 'switch', 'hire', 'resume', 'privacy', 'home', 'exit']);
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

// Whitelists every field, strips unsafe HTML/URLs. Anything unknown is dropped.
export function normalize(input) {
  const c = input || {};
  const p = c.profile || {};
  return {
    profile: {
      name: cleanText(p.name, 80), role: cleanText(p.role, 80), location: cleanText(p.location, 80),
      avatar: cleanUrl(p.avatar), email: cleanText(p.email, 120), phone: cleanText(p.phone, 40),
      status: cleanText(p.status, 80), resume: cleanUrl(p.resume),
    },
    socials: list(c.socials, 20).map((s) => ({ label: cleanText(s.label, 40), url: cleanUrl(s.url) })).filter((s) => s.label && s.url),
    skills: list(c.skills, 40).map((s) => cleanText(s, 40)).filter(Boolean),
    hero: { lead: cleanRich(c.hero?.lead) },
    about: { quote: cleanRich(c.about?.quote), p1: cleanRich(c.about?.p1), p2: cleanRich(c.about?.p2) },
    timeline: list(c.timeline, 20).map((t) => ({
      period: cleanText(t.period, 60), role: cleanText(t.role, 80), company: cleanText(t.company, 80),
      badge: cleanText(t.badge, 30), current: !!t.current, description: cleanRich(t.description), stack: String(t.stack || '').split('\n').map((l) => cleanText(l, 80)).filter(Boolean).slice(0, 4).join('\n'),
    })).filter((t) => t.role),
    projects: list(c.projects, 30).map((x) => ({
      name: cleanText(x.name, 60), category: cleanText(x.category, 60), stack: cleanText(x.stack, 120),
      image: cleanUrl(x.image), url: cleanUrl(x.url), summary: cleanRich(x.summary), description: cleanRich(x.description),
    })).filter((x) => x.name),
    cli: {
      about: cleanRich(c.cli?.about),
      commands: list(c.cli?.commands, 30).map((k) => ({
        name: cleanText(k.name, 30).toLowerCase().replace(/[^a-z0-9-]/g, ''), description: cleanText(k.description, 80), output: cleanRich(k.output),
      })).filter((k) => k.name && !RESERVED.has(k.name)),
    },
  };
}

export async function getContent() {
  const sql = await db();
  const [row] = await sql`SELECT value, updated_at FROM content WHERE key = 'site'`;
  return row ? { ...DEFAULT_CONTENT, ...row.value, updatedAt: row.updated_at } : { ...DEFAULT_CONTENT, updatedAt: null };
}

export async function saveContent(input) {
  const sql = await db();
  const value = normalize(input);
  await sql`INSERT INTO content (key, value, updated_at) VALUES ('site', ${JSON.stringify(value)}::jsonb, now())
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`;
  return value;
}
