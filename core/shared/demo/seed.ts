/**
 * Demo provisioning — the single source of truth for the "try the app" demo
 * orgs, shared by the CLI seed (apps/app/scripts/seed-demo.ts) and the nightly
 * reset route (/api/demo/reset). Pure of any framework/env coupling: all IO goes
 * through a caller-supplied Directus base URL + admin token, so it runs the same
 * under tsx (script) and Nitro (route).
 *
 *   seedDemos()        — idempotent create/update of both demo orgs + content.
 *   purgeDemoContent() — delete visitor-added rows so the reset returns a clean
 *                        baseline (seedDemos already rewrites the org's own
 *                        landing/hero/amenities/wallet).
 */

export interface DemoUser {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

/** Small capped AI allowance — demo AI works but real spend stays bounded. */
export const DEMO_AI_CREDITS = 8000; // ~$8 at 1000 credits/$; restored each reset.

export const DEMO_SLUGS = ["demo", "demo-classic"] as const;

type Amenity = { title: string; icon: string; description: string };
type Member = { first_name: string; last_name: string; email: string; member_type: string };
export interface DemoDef {
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
  hero: { title: string; subtitle: string; cta_text?: string; cta_link?: string; imageId?: string };
  description: string;
  amenities: Amenity[];
  members: Member[];
}

export const DEMO_DEFS: DemoDef[] = [
  {
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
    hero: { title: "Harborview Lofts", subtitle: "Waterfront loft living on Biscayne Bay.", cta_text: "Resident portal", cta_link: "/demo", imageId: "0effbba2-dd61-4d8e-abdd-d8f31e404e22" },
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
  },
  {
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
    hero: { title: "The Beaumont Residences", subtitle: "Boutique Art Deco living on Ocean Drive.", cta_text: "Resident portal", cta_link: "/demo-classic", imageId: "e9993e1c-3a9b-4cc0-9c3e-7cdfd2fcf07e" },
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
  },
];

/** Full landing config (normalizeLandingConfig fills the rest on load). */
export function buildLanding(def: DemoDef): Record<string, any> {
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

// ── IO ───────────────────────────────────────────────────────────────────────
export interface SeedIO {
  baseUrl: string;
  token: string;
  dry?: boolean;
  log?: (msg: string) => void;
}

function makeClient({ baseUrl, token }: SeedIO) {
  return async function dx(endpoint: string, options: RequestInit = {}): Promise<any> {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`HTTP ${res.status} (${options.method || "GET"} ${endpoint}): ${err}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };
}
const qs = (o: Record<string, any>) =>
  "?" + Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(typeof v === "string" ? v : JSON.stringify(v))}`).join("&");

/**
 * Provision (idempotently) both demo orgs + the shared demo-admin user.
 * Safe to re-run — this is exactly what the nightly reset calls.
 */
export async function seedDemos(io: SeedIO, user: DemoUser): Promise<void> {
  const dx = makeClient(io);
  const dry = !!io.dry;
  const log = io.log || (() => {});
  const findOne = async (collection: string, filter: any, fields = "id") =>
    (await dx(`/items/${collection}${qs({ filter, fields, limit: 1 })}`))?.data?.[0] || null;

  // is_demo field.
  try {
    await dx(`/fields/hoa_organizations/is_demo`);
  } catch {
    log(`+ creating hoa_organizations.is_demo${dry ? " (dry)" : ""}`);
    if (!dry)
      await dx(`/fields/hoa_organizations`, {
        method: "POST",
        body: JSON.stringify({
          field: "is_demo",
          type: "boolean",
          meta: { interface: "boolean", special: ["cast-boolean"], note: "Public try-the-app demo org.", width: "half" },
          schema: { default_value: false },
        }),
      });
  }

  // HOA Admin role + demo user.
  const role = (await dx(`/roles${qs({ filter: { name: { _eq: "HOA Admin" } }, fields: "id", limit: 1 })}`))?.data?.[0];
  if (!role) throw new Error("HOA Admin role not found");
  const roleId = role.id;

  let demoUserId: string;
  const existingUser = (await dx(`/users${qs({ filter: { email: { _eq: user.email } }, fields: "id", limit: 1 })}`))?.data?.[0];
  if (existingUser) demoUserId = existingUser.id;
  else {
    log(`+ demo user ${user.email}${dry ? " (dry)" : ""}`);
    demoUserId = dry ? "DRY_USER" : (await dx(`/users`, { method: "POST", body: JSON.stringify({ ...user, role: roleId, status: "active" }) }))?.data?.id;
  }

  for (const def of DEMO_DEFS) {
    log(`── ${def.name} (${def.slug}, ${def.theme}) ──`);
    const base = {
      name: def.name, slug: def.slug, street_address: def.street_address, city: def.city, state: def.state, zip: def.zip,
      phone: def.phone, email: def.email, type: "residential", show_board: true, status: "active",
      subscription_status: "trial", is_free_account: true, is_demo: true,
    };
    let org = await findOne("hoa_organizations", { slug: { _eq: def.slug } }, "id,folder,settings,hero");
    if (org) {
      if (!dry) await dx(`/items/hoa_organizations/${org.id}`, { method: "PATCH", body: JSON.stringify(base) });
    } else {
      log(`+ org ${def.name}${dry ? " (dry)" : ""}`);
      if (dry) org = { id: "DRY_ORG" };
      else org = (await dx(`/items/hoa_organizations`, { method: "POST", body: JSON.stringify(base) }))?.data;
    }
    if (dry) continue;

    // Folder.
    if (!org.folder) {
      const folder = await dx(`/folders`, { method: "POST", body: JSON.stringify({ name: def.name }) });
      await dx(`/items/hoa_organizations/${org.id}`, { method: "PATCH", body: JSON.stringify({ folder: folder.data.id }) });
    }
    org = await findOne("hoa_organizations", { slug: { _eq: def.slug } }, "id,folder,settings,hero");

    // Settings (theme + landing).
    const settingsPayload = { organization: org.id, theme: def.theme, description: def.description, landing: buildLanding(def), status: "published" };
    if (org.settings) await dx(`/items/block_settings/${org.settings}`, { method: "PATCH", body: JSON.stringify(settingsPayload) });
    else {
      const created = await dx(`/items/block_settings`, { method: "POST", body: JSON.stringify(settingsPayload) });
      await dx(`/items/hoa_organizations/${org.id}`, { method: "PATCH", body: JSON.stringify({ settings: created.data.id }) });
    }

    // Hero (background_image only when we have a demo asset id, so a re-seed
    // never clears a manually-set photo).
    const heroPayload: Record<string, any> = { title: def.hero.title, subtitle: def.hero.subtitle, cta_text: def.hero.cta_text || null, cta_link: def.hero.cta_link || null, status: "published" };
    if (def.hero.imageId) heroPayload.background_image = def.hero.imageId;
    if (org.hero) await dx(`/items/block_hero/${org.hero}`, { method: "PATCH", body: JSON.stringify(heroPayload) });
    else {
      const created = await dx(`/items/block_hero`, { method: "POST", body: JSON.stringify(heroPayload) });
      await dx(`/items/hoa_organizations/${org.id}`, { method: "PATCH", body: JSON.stringify({ hero: created.data.id }) });
    }

    // Amenities (replace).
    const existingAmenities = (await dx(`/items/hoa_amenities${qs({ filter: { organization: { _eq: org.id } }, fields: "id", limit: 100 })}`))?.data || [];
    if (existingAmenities.length) await dx(`/items/hoa_amenities`, { method: "DELETE", body: JSON.stringify(existingAmenities.map((a: any) => a.id)) });
    for (const [i, a] of def.amenities.entries())
      await dx(`/items/hoa_amenities`, { method: "POST", body: JSON.stringify({ status: "published", sort: i + 1, organization: org.id, title: a.title, icon: a.icon, description: a.description }) });

    // Demo-admin membership.
    if (!(await findOne("hoa_members", { user: { _eq: demoUserId }, organization: { _eq: org.id } })))
      await dx(`/items/hoa_members`, { method: "POST", body: JSON.stringify({ user: demoUserId, organization: org.id, role: roleId, first_name: user.first_name, last_name: user.last_name, email: user.email, member_type: "owner", status: "active" }) });

    // Resident directory members.
    for (const m of def.members) {
      if (await findOne("hoa_members", { organization: { _eq: org.id }, email: { _eq: m.email } })) continue;
      await dx(`/items/hoa_members`, { method: "POST", body: JSON.stringify({ organization: org.id, first_name: m.first_name, last_name: m.last_name, email: m.email, member_type: m.member_type, status: "active" }) });
    }

    // AI wallet (capped).
    const walletPayload = { organization: org.id, balance_credits: DEMO_AI_CREDITS, allowance_credits: DEMO_AI_CREDITS, purchased_credits: 0, included_credits: DEMO_AI_CREDITS, auto_refill_enabled: false };
    const wallet = await findOne("ai_wallets", { organization: { _eq: org.id } });
    if (wallet) await dx(`/items/ai_wallets/${wallet.id}`, { method: "PATCH", body: JSON.stringify(walletPayload) });
    else await dx(`/items/ai_wallets`, { method: "POST", body: JSON.stringify(walletPayload) });
  }
}

/**
 * Delete visitor-added rows in each demo org so a reset returns to baseline.
 * Additive collections only — the org's own landing/hero/amenities/members/wallet
 * are rewritten by seedDemos(). Each collection is best-effort (a missing one is
 * skipped) and strictly scoped to the demo org id (tenant-safe).
 */
export async function purgeDemoContent(io: SeedIO): Promise<Record<string, number>> {
  const dx = makeClient(io);
  const log = io.log || (() => {});
  const removed: Record<string, number> = {};
  const COLLECTIONS = ["hoa_invitations", "hoa_announcements", "hoa_documents", "hoa_emails", "hoa_projects", "hoa_meetings", "hoa_requests"];

  for (const def of DEMO_DEFS) {
    const org = (await dx(`/items/hoa_organizations${qs({ filter: { slug: { _eq: def.slug } }, fields: "id", limit: 1 })}`))?.data?.[0];
    if (!org) continue;
    for (const col of COLLECTIONS) {
      try {
        const rows = (await dx(`/items/${col}${qs({ filter: { organization: { _eq: org.id } }, fields: "id", limit: 500 })}`))?.data || [];
        if (rows.length && !io.dry) await dx(`/items/${col}`, { method: "DELETE", body: JSON.stringify(rows.map((r: any) => r.id)) });
        removed[col] = (removed[col] || 0) + rows.length;
      } catch {
        /* collection may not exist / not have organization — skip */
      }
    }
  }
  log(`purged: ${JSON.stringify(removed)}`);
  return removed;
}
