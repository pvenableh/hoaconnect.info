/**
 * Demo provisioning — the single source of truth for the "try the app" demo
 * orgs, shared by the CLI seed (scripts/seed-demo.ts) and the nightly
 * reset route (/api/demo/reset). Pure of any framework/env coupling: all IO goes
 * through a caller-supplied Directus base URL + admin token, so it runs the same
 * under tsx (script) and Nitro (route).
 *
 *   seedDemos()        — idempotent create/update of both demo orgs + content.
 *   purgeDemoContent() — delete visitor-added rows so the reset returns a clean
 *                        baseline (seedDemos already rewrites the org's own
 *                        landing/hero/amenities/wallet).
 *
 * Round 3 (reminders, a recurring email, a channel with a DM, a year of paid
 * history for Reports) is written by seedDemos() too — and has to be: the
 * nightly reset purges every demo hoa_emails row, so anything added by hand is
 * gone by morning. The content and arithmetic are in ./round3.ts; the writing
 * is seedRound3() below. Each step checks that its schema has been migrated
 * and says so when it skips, so a database that has not run a Round 3 script
 * still gets the rest of the demo.
 */
import { dmSlug } from "../channels/rules";
import { resolveReminderSettings } from "../reminders/settings";
import {
  buildDemoLedger,
  DEMO_ROUND3,
  DEMO_SEED_NOTE,
  DEMO_TIME_ZONE,
  demoReminderSettings,
  expenseKey,
  ledgerWindowStart,
  nextRecurringRun,
  occupiedKey,
  requestKey,
  sameRows,
  type DemoRound3Def,
} from "./round3";

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
  /** The moment the seed treats as now (dates it writes are relative to it). Tests set it. */
  now?: Date;
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
  const ctx: Round3Ctx = { dx, findOne, dry, log, now: io.now ?? new Date(), fields: new Map() };

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
    if (dry) {
      // Round 3 reads what is there and says what it would write; every write
      // it makes goes through mut(), which logs instead of sending on a dry run.
      if (!String(org.id).startsWith("DRY_")) {
        await seedRound3(ctx, def, { orgId: org.id, settingsId: org.settings ?? null, adminUserId: demoUserId, roleId });
      }
      continue;
    }

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

    // Round 3. Last, so the rest of the demo is already restored if it fails; the
    // org is read again because its settings row may have been made above.
    const fresh = await findOne("hoa_organizations", { id: { _eq: org.id } }, "id,settings");
    await seedRound3(ctx, def, { orgId: org.id, settingsId: fresh?.settings ?? null, adminUserId: demoUserId, roleId });
  }
}

// ── Round 3 ──────────────────────────────────────────────────────────────────

interface Round3Ctx {
  dx: (endpoint: string, options?: RequestInit) => Promise<any>;
  findOne: (collection: string, filter: any, fields?: string) => Promise<any>;
  dry: boolean;
  log: (msg: string) => void;
  now: Date;
  /** `collection.field` → does it exist? One probe per field per run. */
  fields: Map<string, boolean>;
}

interface Round3Target {
  orgId: string;
  /** The org's block_settings row (reminders live on it); null when it has none. */
  settingsId: string | null;
  adminUserId: string;
  /** The HOA Admin role id. */
  roleId: string;
}

const idOf = (v: any): string | null => (v == null ? null : typeof v === "string" ? v : (v.id ?? null));

/**
 * The ONLY way Round 3 writes. On a dry run it logs what it would have done and
 * returns null; otherwise it sends the request. Keeping every write behind one
 * function is what makes "--dry never writes" a property of the code rather than
 * of each call site remembering to check.
 */
async function mut(c: Round3Ctx, label: string, method: "POST" | "PATCH" | "DELETE", endpoint: string, body?: unknown): Promise<any> {
  if (c.dry) {
    c.log(`  (dry) ${label}`);
    return null;
  }
  c.log(`  ${label}`);
  return c.dx(endpoint, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

/** Has this field been migrated? Cached for the run. */
async function hasField(c: Round3Ctx, collection: string, field: string): Promise<boolean> {
  const key = `${collection}.${field}`;
  const known = c.fields.get(key);
  if (known !== undefined) return known;
  let ok = true;
  try {
    await c.dx(`/fields/${collection}/${field}`);
  } catch {
    ok = false;
  }
  c.fields.set(key, ok);
  return ok;
}

/** Make the demo show reminders, a recurring email, a channel with a DM, and a year of Reports. */
async function seedRound3(c: Round3Ctx, def: DemoDef, t: Round3Target): Promise<void> {
  const cfg = DEMO_ROUND3[def.slug as keyof typeof DEMO_ROUND3];
  if (!cfg) return;
  c.log(`  Round 3:`);
  await seedReminders(c, t);
  await seedChannels(c, cfg, t);
  await seedRecurringEmail(c, cfg, t);
  await seedLedger(c, def, cfg, t);
}

/** Every reminder rule on, as the board would leave it after approving each one's copy. */
async function seedReminders(c: Round3Ctx, t: Round3Target): Promise<void> {
  if (!(await hasField(c, "block_settings", "reminders"))) {
    c.log("  – reminders: block_settings.reminders is not there (pnpm create:reminder-log) — skipped");
    return;
  }
  if (!t.settingsId) {
    c.log("  – reminders: the org has no settings row — skipped");
    return;
  }
  const want = demoReminderSettings(t.adminUserId, c.now);
  const have = (await c.dx(`/items/block_settings/${t.settingsId}${qs({ fields: "reminders" })}`))?.data?.reminders;
  // Compare what the tick would read, not the approval stamps — those change every night.
  if (JSON.stringify(resolveReminderSettings(have)) === JSON.stringify(resolveReminderSettings(want))) {
    c.log("  = reminders already on");
    return;
  }
  await mut(c, "reminders: every rule ON", "PATCH", `/items/block_settings/${t.settingsId}`, { reminders: want });
}

/** Create `channel`/`user`'s membership row unless it is there. */
async function ensureChannelMember(c: Round3Ctx, channelId: string, userId: string, hoaMemberId: string | null, role: "admin" | "member", invitedBy: string): Promise<void> {
  if (await c.findOne("hoa_channel_members", { channel: { _eq: channelId }, user: { _eq: userId } })) return;
  await mut(c, `+ channel member ${userId.slice(0, 8)} (${role})`, "POST", "/items/hoa_channel_members", {
    channel: channelId,
    user: userId,
    hoa_member: hoaMemberId,
    role,
    invited_by: invitedBy,
  });
}

/** Find the channel by slug and make it published, or create it. Returns its id (null on a dry run that would create it). */
async function ensureChannel(c: Round3Ctx, orgId: string, slug: string, create: Record<string, any>, label: string): Promise<string | null> {
  const found = await c.findOne("hoa_channels", { organization: { _eq: orgId }, slug: { _eq: slug } }, "id,status");
  if (!found) return idOf((await mut(c, `+ ${label}`, "POST", "/items/hoa_channels", { ...create, slug, organization: orgId, status: "published" }))?.data);
  // A visitor can archive or delete it; the reset puts it back.
  if (found.status !== "published") await mut(c, `${label}: back to published`, "PATCH", `/items/hoa_channels/${found.id}`, { status: "published" });
  return found.id;
}

/**
 * A community channel and a direct message between the demo admin and one
 * directory member.
 *
 * A DM needs two USERS, and the directory members are only rows. So the chosen
 * member gets a Directus user (HOA Admin, like the demo admin — a DM is between
 * people who can use channels, dm.post.ts) with a random password nobody holds:
 * the demo login is the one fixed account, so this one can be messaged but never
 * signed into. It is linked to the member's row.
 */
async function seedChannels(c: Round3Ctx, cfg: DemoRound3Def, t: Round3Target): Promise<void> {
  if (t.adminUserId.startsWith("DRY_")) {
    c.log("  – channels: the demo user does not exist yet — skipped");
    return;
  }
  const adminMember = await c.findOne("hoa_members", { user: { _eq: t.adminUserId }, organization: { _eq: t.orgId } });
  const adminMemberId: string | null = adminMember?.id ?? null;

  // The DM's other person.
  const peer = await c.findOne("hoa_members", { organization: { _eq: t.orgId }, email: { _eq: cfg.dmPeerEmail } }, "id,first_name,last_name,user,role");
  let peerUserId: string | null = null;
  if (peer) {
    peerUserId = idOf(peer.user);
    if (!peerUserId) {
      const existing = (await c.dx(`/users${qs({ filter: { email: { _eq: cfg.dmPeerEmail } }, fields: "id", limit: 1 })}`))?.data?.[0];
      peerUserId = existing?.id ?? null;
    }
    if (!peerUserId) {
      const made = await mut(c, `+ user ${cfg.dmPeerEmail} (no one holds the password)`, "POST", "/users", {
        email: cfg.dmPeerEmail,
        first_name: peer.first_name,
        last_name: peer.last_name,
        password: `${globalThis.crypto.randomUUID()}${globalThis.crypto.randomUUID()}`,
        role: t.roleId,
        status: "active",
      });
      peerUserId = idOf(made?.data);
    }
    if (peerUserId && (idOf(peer.user) !== peerUserId || idOf(peer.role) !== t.roleId)) {
      await mut(c, `${peer.first_name} ${peer.last_name}: linked to their user, HOA Admin`, "PATCH", `/items/hoa_members/${peer.id}`, { user: peerUserId, role: t.roleId });
    }
  } else {
    c.log(`  – channels: ${cfg.dmPeerEmail} is not in the directory yet — only the channel`);
  }

  // The community channel.
  const channelId = await ensureChannel(
    c,
    t.orgId,
    cfg.channel.slug,
    { name: cfg.channel.name, description: cfg.channel.description, is_private: false, is_default: false },
    `channel #${cfg.channel.slug}`
  );
  if (channelId) {
    await ensureChannelMember(c, channelId, t.adminUserId, adminMemberId, "admin", t.adminUserId);
    if (peerUserId) await ensureChannelMember(c, channelId, peerUserId, peer?.id ?? null, "member", t.adminUserId);
  }

  // The direct message.
  if (!peerUserId) {
    if (peer) c.log("  – DM: follows once the user above exists");
    return;
  }
  if (!(await hasField(c, "hoa_channels", "is_dm"))) {
    c.log("  – DM: hoa_channels.is_dm is not there (pnpm add:channel-phase7) — skipped");
    return;
  }
  const dmId = await ensureChannel(
    c,
    t.orgId,
    dmSlug(t.adminUserId, peerUserId),
    { name: "Direct message", description: null, is_private: true, is_dm: true, is_default: false },
    "direct message"
  );
  if (dmId) {
    // Plain members, as dm.post.ts writes them: nobody in a DM can add or remove anyone.
    await ensureChannelMember(c, dmId, t.adminUserId, adminMemberId, "member", t.adminUserId);
    await ensureChannelMember(c, dmId, peerUserId, peer?.id ?? null, "member", t.adminUserId);
  }
}

/**
 * One recurring newsletter, scheduled for the next first Monday at 9:00. It has
 * to come from here: purgeDemoContent() deletes every demo hoa_emails row each
 * night, and the seed runs right after it.
 *
 * Nothing real goes out. When the series comes due the send path refuses a
 * demo org's mail (shouldBlockDemoEmail in sendgrid.ts) and reports success, so
 * the occurrence completes and rolls forward like any other.
 */
async function seedRecurringEmail(c: Round3Ctx, cfg: DemoRound3Def, t: Round3Target): Promise<void> {
  if (!(await hasField(c, "hoa_emails", "recurrence_rule"))) {
    c.log("  – email: hoa_emails.recurrence_rule is not there — skipped");
    return;
  }
  const phase4 = await hasField(c, "hoa_emails", "recurrence_timezone");
  const hasClass = await hasField(c, "hoa_emails", "email_class");
  const at = nextRecurringRun(c.now, DEMO_TIME_ZONE).toISOString();
  const payload: Record<string, any> = {
    organization: t.orgId,
    subject: cfg.email.subject,
    content: cfg.email.content,
    email_type: "newsletter",
    content_mode: "visual",
    greeting: cfg.email.greeting,
    salutation: cfg.email.salutation,
    include_board_footer: true,
    status: "scheduled",
    scheduled_at: at,
    next_run_at: at,
    // The first Monday, every month. Before Phase 4 there is no nth-weekday rule, so a plain monthly.
    recurrence_rule: phase4 ? "monthly_nth_weekday" : "monthly",
    recipient_filter: "all",
    recipient_ids: null,
    web_slug: cfg.email.webSlug,
    ...(phase4 ? { recurrence_timezone: DEMO_TIME_ZONE } : {}),
    ...(hasClass ? { email_class: "community" } : {}),
  };

  const existing = await c.findOne("hoa_emails", { organization: { _eq: t.orgId }, web_slug: { _eq: cfg.email.webSlug } }, "id,status,scheduled_at,recurrence_rule");
  if (!existing) {
    await mut(c, `+ recurring email "${cfg.email.subject}" (next ${at})`, "POST", "/items/hoa_emails", payload);
    return;
  }
  // A send in flight is delivering from this row; leave it be.
  if (existing.status === "sending" || existing.status === "paused") {
    c.log(`  – email: ${existing.status}, left alone`);
    return;
  }
  if (existing.status === "scheduled" && existing.recurrence_rule === payload.recurrence_rule && Date.parse(existing.scheduled_at) === Date.parse(at)) {
    c.log("  = recurring email already scheduled");
    return;
  }
  await mut(c, `recurring email: rescheduled for ${at}`, "PATCH", `/items/hoa_emails/${existing.id}`, payload);
}

/**
 * Twelve months of paid dues and paid expenses, so Reports has a year to draw.
 *
 * The seed owns ONLY the rows it stamped (DEMO_SEED_NOTE in `notes`). Anything
 * else in the org — the billing engine's own overdue charges, an expense a
 * visitor typed — is left exactly as it is, and a month a member's dues are
 * already billed for by someone else is not billed again here. Its own rows are
 * replaced wholesale, but only when they differ from what would be written, so a
 * repeat run on the same day writes nothing; and only after re-reading that the
 * org really is a demo.
 */
async function seedLedger(c: Round3Ctx, def: DemoDef, cfg: DemoRound3Def, t: Round3Target): Promise<void> {
  const org = (await c.dx(`/items/hoa_organizations/${t.orgId}${qs({ fields: "id,is_demo" })}`))?.data;
  if (!org || org.is_demo !== true) throw new Error(`Refusing to replace payments of ${t.orgId}: not a demo org`);

  const emails = def.members.map((m) => m.email);
  const rows: Array<{ id: string; member_type?: string; email?: string }> =
    (await c.dx(`/items/hoa_members${qs({ filter: { organization: { _eq: t.orgId }, email: { _in: emails } }, fields: "id,member_type,email", limit: 100 })}`))?.data || [];
  rows.sort((a, b) => String(a.email).localeCompare(String(b.email)));

  const read = async (collection: string, filter: Record<string, any>, fields: string): Promise<any[]> =>
    (await c.dx(`/items/${collection}${qs({ filter: { organization: { _eq: t.orgId }, ...filter }, fields, limit: 1000 })}`))?.data || [];
  const mine = { notes: { _eq: DEMO_SEED_NOTE } };

  // Dues someone else billed: those (member, month)s are theirs.
  const billedByOthers = (await read("payment_requests", { request_type: { _eq: "monthly_dues" } }, "member,due_date,notes")).filter((r) => r.notes !== DEMO_SEED_NOTE);
  const want = buildDemoLedger(cfg, t.orgId, rows, c.now, new Set(billedByOthers.map((r) => occupiedKey(r.member, r.due_date))));

  const haveRequests = await read("payment_requests", mine, "id,member,request_type,title,amount,amount_paid,paid_at,status");
  const haveExpenses = await read("payment_expenses", mine, "id,category,title,vendor,amount,expense_date,status");

  const requestsSame = sameRows(haveRequests.map(requestKey), want.requests.map(requestKey));
  const expensesSame = sameRows(haveExpenses.map(expenseKey), want.expenses.map(expenseKey));

  const replace = async (collection: string, have: any[], rowsToWrite: any[]) => {
    if (have.length) {
      // Ids come from the org-and-marker-filtered read above, so this cannot reach another tenant or a row the seed did not write.
      await mut(c, `ledger: clear ${have.length} ${collection}`, "DELETE", `/items/${collection}`, have.map((r) => r.id));
      // More than the read returned? Keep clearing until none of its own are left.
      for (let pass = 0; pass < 20 && !c.dry && have.length >= 1000; pass++) {
        have = await read(collection, mine, "id");
        if (!have.length) break;
        await mut(c, `ledger: clear ${have.length} more ${collection}`, "DELETE", `/items/${collection}`, have.map((r) => r.id));
      }
    }
    for (let i = 0; i < rowsToWrite.length; i += 100) {
      await mut(c, `ledger: + ${Math.min(100, rowsToWrite.length - i)} ${collection}`, "POST", `/items/${collection}`, rowsToWrite.slice(i, i + 100));
    }
  };
  if (!requestsSame) await replace("payment_requests", haveRequests, want.requests);
  if (!expensesSame) await replace("payment_expenses", haveExpenses, want.expenses);
  if (requestsSame && expensesSame) c.log(`  = ledger already current (${want.requests.length} charges, ${want.expenses.length} expenses)`);
  else c.log(`  ledger${c.dry ? " would be" : ""}: ${want.requests.length} paid charges + ${want.expenses.length} paid expenses`);
  if (billedByOthers.length) c.log(`  ledger: left ${billedByOthers.length} dues charge(s) billed by someone else as they are`);

  // The balance the reserve held when the window opened, so the running balance reads as an account.
  if (await hasField(c, "hoa_organizations", "opening_balance")) {
    const asOf = ledgerWindowStart(c.now);
    const cur = (await c.dx(`/items/hoa_organizations/${t.orgId}${qs({ fields: "opening_balance,opening_balance_date" })}`))?.data;
    if (Number(cur?.opening_balance ?? 0) !== cfg.openingBalance || String(cur?.opening_balance_date ?? "").slice(0, 10) !== asOf) {
      await mut(c, `opening balance $${cfg.openingBalance} as of ${asOf}`, "PATCH", `/items/hoa_organizations/${t.orgId}`, { opening_balance: cfg.openingBalance, opening_balance_date: asOf });
    }
  }
}

/**
 * Delete visitor-added rows in each demo org so a reset returns to baseline.
 * Additive collections only — the org's own landing/hero/amenities/members/wallet
 * are rewritten by seedDemos(). Each collection is best-effort (a missing one is
 * skipped) and strictly scoped to the demo org id (tenant-safe).
 *
 * `hoa_emails` is in the list, which is why the demo's recurring email is made
 * by seedDemos() (it runs right after this) rather than by hand. Channels, the
 * DM and the paid ledger are not purged: seedDemos() keeps those current itself.
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
