/**
 * Seed the public "try the app" demo(s).
 *
 * Provisions a single shared demo-admin user and TWO is_demo organizations so
 * visitors can experience both landing themes from one login (the org switcher
 * toggles between them):
 *   • Harborview Lofts        — slug `demo`         — MODERN theme
 *   • The Beaumont Residences — slug `demo-classic` — CLASSIC theme (1033 re-skin)
 *
 * Each org gets: folder, block_settings (theme + landing config), block_hero,
 * amenities, a handful of resident members, and a small capped AI wallet. The
 * demo-admin user is linked to both as an HOA Admin.
 *
 * Idempotent — safe to re-run (this is also what the nightly reset cron calls).
 * Keyed by slug / email / organization, so re-running rewrites content in place
 * rather than duplicating. Fully self-contained (raw REST + admin token), same
 * shape as seed-605-content.ts.
 *
 * Target: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN (admin token).
 * Demo creds (optional): DEMO_USER_EMAIL / DEMO_USER_PASSWORD.
 * Run:    pnpm run seed:demo            (writes)
 *         pnpm run seed:demo -- --dry   (no writes; reports)
 */

const URL_BASE = process.env.DIRECTUS_URL;
const TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const DRY = process.argv.includes("--dry") || process.argv.includes("--dry-run");

if (!URL_BASE || !TOKEN) {
  console.error("❌ Missing DIRECTUS_URL / DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}

const DEMO_USER = {
  email: (process.env.DEMO_USER_EMAIL || "demo@hoaconnect.info").toLowerCase(),
  password: process.env.DEMO_USER_PASSWORD || "DemoTryItOut2026!",
  first_name: "Demo",
  last_name: "Admin",
};

/** A small capped AI allowance so demo AI works but real spend stays bounded. */
const DEMO_AI_CREDITS = 8000; // ~$8 at 1000 credits/$; refreshed by the reset cron.

// ── Demo definitions ─────────────────────────────────────────────────────────
type Amenity = { title: string; icon: string; description: string };
type Member = { first_name: string; last_name: string; email: string; member_type: string };
interface DemoDef {
  slug: string;
  name: string;
  theme: "modern" | "classic";
  street_address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  geo: { lat: number; lon: number };
  hero: { title: string; subtitle: string; cta_text?: string; cta_link?: string };
  description: string;
  amenities: Amenity[];
  members: Member[];
  landing: Record<string, any>;
}

const HARBORVIEW: DemoDef = {
  slug: "demo",
  name: "Harborview Lofts",
  theme: "modern",
  street_address: "800 Biscayne Blvd",
  city: "Miami",
  state: "FL",
  zip: "33132",
  phone: "(305) 555-0142",
  email: "board@harborviewlofts.demo",
  geo: { lat: 25.784, lon: -80.187 },
  description:
    "Harborview Lofts is a 96-residence waterfront community in Downtown Miami — floor-to-ceiling glass, a rooftop pool deck, and a walkable bayfront address. This is a live demo of HOA Connect; feel free to click around.",
  hero: {
    title: "Harborview Lofts",
    subtitle: "Waterfront loft living on Biscayne Bay.",
    cta_text: "Resident portal",
    cta_link: "/demo",
  },
  amenities: [
    { title: "Rooftop Pool Deck", icon: "waves", description: "A heated rooftop pool and sundeck with panoramic bay and skyline views." },
    { title: "Bayfront Fitness", icon: "dumbbell", description: "A 24/7 fitness studio overlooking the water, with Peloton bikes and free weights." },
    { title: "Resident Lounge", icon: "sofa", description: "A co-working and social lounge with fast Wi-Fi, a coffee bar, and private meeting rooms." },
    { title: "Secure Parking", icon: "car", description: "Gated, assigned garage parking with EV charging stations on every level." },
    { title: "24/7 Concierge", icon: "concierge-bell", description: "A staffed front desk handling packages, guests, and resident requests around the clock." },
    { title: "Pet Friendly", icon: "dog", description: "A pet-washing station and a landscaped dog run — leashed friends welcome throughout." },
  ],
  members: [
    { first_name: "Ava", last_name: "Bennett", email: "ava.bennett@harborviewlofts.demo", member_type: "owner" },
    { first_name: "Marcus", last_name: "Reyes", email: "marcus.reyes@harborviewlofts.demo", member_type: "owner" },
    { first_name: "Priya", last_name: "Nair", email: "priya.nair@harborviewlofts.demo", member_type: "owner" },
    { first_name: "Daniel", last_name: "Okafor", email: "daniel.okafor@harborviewlofts.demo", member_type: "tenant" },
    { first_name: "Sofia", last_name: "Marchetti", email: "sofia.marchetti@harborviewlofts.demo", member_type: "owner" },
  ],
  landing: {},
};

const BEAUMONT: DemoDef = {
  slug: "demo-classic",
  name: "The Beaumont Residences",
  theme: "classic",
  street_address: "1200 Ocean Drive",
  city: "Miami Beach",
  state: "FL",
  zip: "33139",
  phone: "(305) 555-0188",
  email: "board@thebeaumont.demo",
  geo: { lat: 25.7852, lon: -80.1301 },
  description:
    "The Beaumont Residences is a boutique collection of 24 Art Deco homes on Ocean Drive — a restored 1930s landmark reimagined for modern living. This is a live demo of HOA Connect; explore freely.",
  hero: {
    title: "The Beaumont Residences",
    subtitle: "Boutique Art Deco living on Ocean Drive.",
    cta_text: "Resident portal",
    cta_link: "/demo-classic",
  },
  amenities: [
    { title: "Oceanfront Terrace", icon: "sun", description: "A private terrace facing the Atlantic, set for morning coffee and evening gatherings." },
    { title: "Curated Concierge", icon: "concierge-bell", description: "A dedicated concierge for reservations, deliveries, and resident requests." },
    { title: "Wine Room", icon: "wine", description: "A climate-controlled private wine room with individual member storage." },
    { title: "Landmark Architecture", icon: "landmark", description: "A meticulously restored 1936 Streamline Moderne building on the Ocean Drive historic district." },
    { title: "Wellness Suite", icon: "flower", description: "A spa-inspired wellness suite with sauna, steam, and a treatment room." },
    { title: "Valet & Security", icon: "shield-check", description: "Round-the-clock valet and secured, credentialed building access." },
  ],
  members: [
    { first_name: "Eleanor", last_name: "Ashford", email: "eleanor.ashford@thebeaumont.demo", member_type: "owner" },
    { first_name: "James", last_name: "Whitmore", email: "james.whitmore@thebeaumont.demo", member_type: "owner" },
    { first_name: "Camille", last_name: "Laurent", email: "camille.laurent@thebeaumont.demo", member_type: "owner" },
    { first_name: "Theodore", last_name: "Haugh", email: "theodore.haugh@thebeaumont.demo", member_type: "owner" },
  ],
  landing: {},
};

/** Build a full landing config (normalizeLandingConfig fills the rest on load). */
function buildLanding(def: DemoDef): Record<string, any> {
  return {
    geo: def.geo,
    blocks: [
      { id: "b_about", type: "about", enabled: true },
      { id: "b_amenities", type: "amenities", enabled: true },
      {
        id: "b_life",
        type: "content",
        enabled: true,
        layout: "text-image",
        eyebrow: "Life here",
        title: def.theme === "modern" ? "Designed for the way you live" : "A rare address, thoughtfully kept",
        body:
          def.theme === "modern"
            ? "From the rooftop deck to the bayfront gym, every shared space is built for connection and calm. Harborview is a small, well-run community where neighbors actually know each other."
            : "The Beaumont pairs the romance of Ocean Drive with the discretion of a private club. Twenty-four homes, impeccably managed, with the character only a true landmark can offer.",
        features: [
          { icon: "lucide:sparkles", title: "Boutique scale", text: "A small community where the board and management know every resident." },
          { icon: "lucide:map-pin", title: "Prime location", text: "Steps from dining, culture, and the water." },
          { icon: "lucide:shield-check", title: "Professionally managed", text: "Attentive, transparent operations residents can trust." },
        ],
        feature_style: "cards",
        feature_columns: 3,
        show_in_menu: true,
      },
      { id: "b_faq", type: "faq", enabled: true },
      { id: "b_contact", type: "contact", enabled: true },
    ],
    faq: [
      { question: "Is this a real building?", answer: "No — this is a fully interactive demo of HOA Connect using a fictional community. Feel free to explore every feature." },
      { question: "How is the community managed?", answer: "By a resident board of directors alongside professional property management, all coordinated inside HOA Connect." },
      { question: "Can I try the resident features?", answer: "Yes. Sign in to the demo to browse the dashboard, announcements, documents, meetings, and more." },
    ],
    inquiry: { enabled: true, recipient_type: "email", email: def.email, user: null },
  };
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────
async function dx(endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${URL_BASE}${endpoint}`, {
    ...options,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}`, ...options.headers },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status} (${options.method || "GET"} ${endpoint}): ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const qs = (o: Record<string, any>) =>
  "?" +
  Object.entries(o)
    .map(([k, v]) => `${k}=${encodeURIComponent(typeof v === "string" ? v : JSON.stringify(v))}`)
    .join("&");

async function findOne(collection: string, filter: any, fields = "id"): Promise<any> {
  const r = await dx(`/items/${collection}${qs({ filter, fields, limit: 1 })}`);
  return r?.data?.[0] || null;
}

// ── Ensure the is_demo flag exists on hoa_organizations ──────────────────────
async function ensureDemoField() {
  try {
    await dx(`/fields/hoa_organizations/is_demo`);
    console.log("✓ is_demo field present");
  } catch {
    console.log(`+ creating hoa_organizations.is_demo${DRY ? " (skipped, dry)" : ""}`);
    if (DRY) return;
    await dx(`/fields/hoa_organizations`, {
      method: "POST",
      body: JSON.stringify({
        field: "is_demo",
        type: "boolean",
        meta: { interface: "boolean", special: ["cast-boolean"], note: "Public try-the-app demo org. Drives email/payment/AI guardrails.", width: "half" },
        schema: { default_value: false },
      }),
    });
  }
}

async function getHoaAdminRoleId(): Promise<string> {
  const r = await dx(`/roles${qs({ filter: { name: { _eq: "HOA Admin" } }, fields: "id,name", limit: 1 })}`);
  const role = r?.data?.[0];
  if (!role) throw new Error("HOA Admin role not found in Directus");
  return role.id;
}

async function ensureDemoUser(roleId: string): Promise<string> {
  const existing = await dx(`/users${qs({ filter: { email: { _eq: DEMO_USER.email } }, fields: "id,email", limit: 1 })}`).then((r) => r?.data?.[0]);
  if (existing) {
    console.log(`✓ demo user ${DEMO_USER.email} (${existing.id})`);
    return existing.id;
  }
  console.log(`+ creating demo user ${DEMO_USER.email}${DRY ? " (skipped, dry)" : ""}`);
  if (DRY) return "DRY_USER";
  const created = await dx(`/users`, {
    method: "POST",
    body: JSON.stringify({ ...DEMO_USER, role: roleId, status: "active" }),
  });
  return created?.data?.id;
}

async function ensureOrg(def: DemoDef): Promise<any> {
  const base = {
    name: def.name,
    slug: def.slug,
    street_address: def.street_address,
    city: def.city,
    state: def.state,
    zip: def.zip,
    phone: def.phone,
    email: def.email,
    type: "residential",
    show_board: true,
    status: "active",
    subscription_status: "trial",
    is_free_account: true,
    is_demo: true,
  };
  let org = await findOne("hoa_organizations", { slug: { _eq: def.slug } }, "id,name,folder,settings,hero");
  if (org) {
    console.log(`✓ org ${def.name} (${org.id}) — updating`);
    if (!DRY) await dx(`/items/hoa_organizations/${org.id}`, { method: "PATCH", body: JSON.stringify(base) });
    return org;
  }
  console.log(`+ creating org ${def.name} (${def.slug})${DRY ? " (skipped, dry)" : ""}`);
  if (DRY) return { id: "DRY_ORG", folder: null, settings: null, hero: null };
  const created = await dx(`/items/hoa_organizations`, { method: "POST", body: JSON.stringify(base) });
  return { ...created.data };
}

async function ensureFolder(org: any, def: DemoDef) {
  if (org.folder) return;
  console.log(`  + folder for ${def.name}${DRY ? " (skipped, dry)" : ""}`);
  if (DRY) return;
  const folder = await dx(`/folders`, { method: "POST", body: JSON.stringify({ name: def.name }) });
  await dx(`/items/hoa_organizations/${org.id}`, { method: "PATCH", body: JSON.stringify({ folder: folder.data.id }) });
}

async function ensureSettings(org: any, def: DemoDef) {
  const landing = buildLanding(def);
  const payload = { organization: org.id, theme: def.theme, description: def.description, landing, status: "published" };
  if (org.settings) {
    console.log(`  settings ${org.settings} → theme=${def.theme}`);
    if (!DRY) await dx(`/items/block_settings/${org.settings}`, { method: "PATCH", body: JSON.stringify(payload) });
    return;
  }
  console.log(`  + settings (theme=${def.theme})${DRY ? " (skipped, dry)" : ""}`);
  if (DRY) return;
  const created = await dx(`/items/block_settings`, { method: "POST", body: JSON.stringify(payload) });
  await dx(`/items/hoa_organizations/${org.id}`, { method: "PATCH", body: JSON.stringify({ settings: created.data.id }) });
}

async function ensureHero(org: any, def: DemoDef) {
  const payload = { title: def.hero.title, subtitle: def.hero.subtitle, cta_text: def.hero.cta_text || null, cta_link: def.hero.cta_link || null, status: "published" };
  if (org.hero) {
    console.log(`  hero ${org.hero} → "${def.hero.title}"`);
    if (!DRY) await dx(`/items/block_hero/${org.hero}`, { method: "PATCH", body: JSON.stringify(payload) });
    return;
  }
  console.log(`  + hero "${def.hero.title}"${DRY ? " (skipped, dry)" : ""}`);
  if (DRY) return;
  const created = await dx(`/items/block_hero`, { method: "POST", body: JSON.stringify(payload) });
  await dx(`/items/hoa_organizations/${org.id}`, { method: "PATCH", body: JSON.stringify({ hero: created.data.id }) });
}

async function ensureAmenities(org: any, def: DemoDef) {
  const existing = await dx(`/items/hoa_amenities${qs({ filter: { organization: { _eq: org.id } }, fields: "id", limit: 100 })}`).then((r) => r?.data || []);
  if (existing.length && !DRY) {
    await dx(`/items/hoa_amenities`, { method: "DELETE", body: JSON.stringify(existing.map((a: any) => a.id)) });
  }
  console.log(`  amenities: ${existing.length} old → ${def.amenities.length} new`);
  for (const [i, a] of def.amenities.entries()) {
    if (DRY) continue;
    await dx(`/items/hoa_amenities`, {
      method: "POST",
      body: JSON.stringify({ status: "published", sort: i + 1, organization: org.id, title: a.title, icon: a.icon, description: a.description }),
    });
  }
}

async function ensureMembers(org: any, def: DemoDef, roleId: string, demoUserId: string) {
  // Demo-admin membership (HOA Admin).
  const adminMember = await findOne("hoa_members", { user: { _eq: demoUserId }, organization: { _eq: org.id } }, "id");
  if (!adminMember) {
    console.log(`  + demo-admin membership${DRY ? " (skipped, dry)" : ""}`);
    if (!DRY)
      await dx(`/items/hoa_members`, {
        method: "POST",
        body: JSON.stringify({
          user: demoUserId, organization: org.id, role: roleId,
          first_name: DEMO_USER.first_name, last_name: DEMO_USER.last_name, email: DEMO_USER.email,
          member_type: "owner", status: "active",
        }),
      });
  } else console.log(`  ✓ demo-admin membership (${adminMember.id})`);

  // Resident members (no login users — directory entries).
  for (const m of def.members) {
    const exists = await findOne("hoa_members", { organization: { _eq: org.id }, email: { _eq: m.email } }, "id");
    if (exists) continue;
    console.log(`    + resident ${m.first_name} ${m.last_name}${DRY ? " (skipped, dry)" : ""}`);
    if (!DRY)
      await dx(`/items/hoa_members`, {
        method: "POST",
        body: JSON.stringify({
          organization: org.id, first_name: m.first_name, last_name: m.last_name, email: m.email,
          member_type: m.member_type, status: "active",
        }),
      });
  }
}

async function ensureWallet(org: any) {
  const existing = await findOne("ai_wallets", { organization: { _eq: org.id } }, "id");
  const payload = {
    organization: org.id,
    balance_credits: DEMO_AI_CREDITS,
    allowance_credits: DEMO_AI_CREDITS,
    purchased_credits: 0,
    included_credits: DEMO_AI_CREDITS,
    auto_refill_enabled: false,
  };
  if (existing) {
    console.log(`  wallet ${existing.id} → ${DEMO_AI_CREDITS} credits`);
    if (!DRY) await dx(`/items/ai_wallets/${existing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
    return;
  }
  console.log(`  + AI wallet (${DEMO_AI_CREDITS} credits)${DRY ? " (skipped, dry)" : ""}`);
  if (!DRY) await dx(`/items/ai_wallets`, { method: "POST", body: JSON.stringify(payload) });
}

async function main() {
  console.log(`\nSeed demo orgs ${DRY ? "(DRY RUN)" : ""}\n`);

  await ensureDemoField();
  const roleId = await getHoaAdminRoleId();
  console.log(`✓ HOA Admin role ${roleId}`);
  const demoUserId = await ensureDemoUser(roleId);

  for (const def of [HARBORVIEW, BEAUMONT]) {
    console.log(`\n── ${def.name} (${def.slug}, ${def.theme}) ──`);
    const org = await ensureOrg(def);
    await ensureFolder(org, def);
    // Re-read to pick up freshly-linked settings/hero ids on first create.
    const fresh = await findOne("hoa_organizations", { slug: { _eq: def.slug } }, "id,folder,settings,hero");
    const target = fresh || org;
    await ensureSettings(target, def);
    await ensureHero(target, def);
    await ensureAmenities(target, def);
    await ensureMembers(target, def, roleId, demoUserId);
    await ensureWallet(target);
  }

  console.log(`\n${DRY ? "Dry run complete — no writes." : "✓ Demo seed complete."}\n`);
  if (!DRY) {
    console.log(`Demo login: ${DEMO_USER.email}`);
    console.log(`Landings:  ${URL_BASE?.replace("admin.", "")}/demo  ·  /demo-classic\n`);
  }
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
