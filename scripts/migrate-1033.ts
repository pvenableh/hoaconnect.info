/**
 * Migrate 1033 Lenox in as HOA Connect tenant #1.
 *
 * 1033 (the Nuxt 3 editorial site at ~/Sites/1033/main, live at 1033lenox.com)
 * runs on its OWN Directus instance (collections: corporation, units, people /
 * persons, junction_directus_users_units, leases, board, …). This script reads
 * from that source Directus and upserts the core records onto the existing
 * HOA Connect hoa_* collections. Its editorial look maps to the `classic` style.
 *
 * The over-engineered 1033 finance engine (assessment_ledger, fiscal_years,
 * budget_*, reconciliation, cash_flow_projections, …) is intentionally LEFT
 * BEHIND (ROADMAP: simple, not QuickBooks). Only dues→payment_requests is
 * optionally carried over.
 *
 *   Source (1033):   SOURCE_1033_DIRECTUS_URL + SOURCE_1033_TOKEN
 *   Target (Connect): DIRECTUS_URL + DIRECTUS_STATIC_TOKEN
 *
 * Run with:  pnpm run migrate:1033          (writes)
 *            pnpm run migrate:1033 -- --dry  (no writes, just reports)
 *
 * Idempotent: rows are matched on natural keys (org slug, unit_number, member
 * email, board member+title) so re-running updates rather than duplicates.
 *
 * ⚠️  CONFIRM BEFORE RUNNING: the 1033 source collection/field names below are
 * best-guesses from the 1033 codebase — verify against the live 1033 Directus
 * schema (and obtain a read token) before trusting the mapping.
 */

const TARGET_URL = process.env.DIRECTUS_URL;
const TARGET_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const SOURCE_URL = process.env.SOURCE_1033_DIRECTUS_URL;
const SOURCE_TOKEN = process.env.SOURCE_1033_TOKEN;

const DRY = process.argv.includes("--dry") || process.argv.includes("--dry-run");

if (!TARGET_URL || !TARGET_TOKEN) {
  console.error("❌ Missing target env: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}
if (!SOURCE_URL || !SOURCE_TOKEN) {
  console.error("❌ Missing source env: SOURCE_1033_DIRECTUS_URL + SOURCE_1033_TOKEN");
  console.error("   (Obtain a read token for the 1033 Directus instance first.)");
  process.exit(1);
}

// ── Source mapping (CONFIRM against the live 1033 schema) ───────────────────
const SOURCE = {
  org: { collection: "corporation", name: "name", legalName: "legal_name" },
  units: { collection: "units", number: "unit_number", id: "id" },
  people: {
    collection: "people", // 1033 also has `persons` — confirm which is canonical
    first: "first_name",
    last: "last_name",
    email: "email",
    phone: "phone",
  },
  membership: {
    collection: "junction_directus_users_units",
    unit: "units_id",
    person: "directus_users_id",
    primary: "is_primary",
    ownership: "ownership_percentage",
  },
  board: { collection: "board", person: "person", title: "title", start: "term_start", end: "term_end" },
};

const ORG_SLUG = "1033-lenox";
const ORG_NAME = "1033 Lenox";

// ── HTTP helpers ────────────────────────────────────────────────────────────
async function dxFetch(baseUrl: string, token: string, endpoint: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status} (${endpoint}): ${err}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const src = (endpoint: string, options?: RequestInit) => dxFetch(SOURCE_URL!, SOURCE_TOKEN!, endpoint, options);
const tgt = (endpoint: string, options?: RequestInit) => dxFetch(TARGET_URL!, TARGET_TOKEN!, endpoint, options);

async function readAll(base: typeof src, collection: string, fields = "*"): Promise<any[]> {
  const out: any[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await base(`/items/${collection}?fields=${fields}&limit=100&page=${page}`);
    const rows = res?.data ?? [];
    out.push(...rows);
    if (rows.length < 100) break;
    page++;
  }
  return out;
}

async function findOne(collection: string, filter: Record<string, any>, fields = "id"): Promise<any | null> {
  const res = await tgt(`/items/${collection}?filter=${encodeURIComponent(JSON.stringify(filter))}&fields=${fields}&limit=1`);
  return res?.data?.[0] ?? null;
}

async function upsert(
  collection: string,
  matchFilter: Record<string, any>,
  data: Record<string, any>,
  label: string
): Promise<string | null> {
  const existing = await findOne(collection, matchFilter);
  if (DRY) {
    console.log(`   ${existing ? "↻ would update" : "+ would create"} ${collection}: ${label}`);
    return existing?.id ?? "dry-run-id";
  }
  if (existing) {
    await tgt(`/items/${collection}/${existing.id}`, { method: "PATCH", body: JSON.stringify(data) });
    console.log(`   ↻ updated ${collection}: ${label}`);
    return existing.id;
  }
  const created = await tgt(`/items/${collection}`, { method: "POST", body: JSON.stringify(data) });
  console.log(`   + created ${collection}: ${label}`);
  return created?.data?.id ?? null;
}

// ── Migration steps ─────────────────────────────────────────────────────────
async function migrateOrg(): Promise<string> {
  console.log("\n🏢 Organization…");
  const orgId = await upsert(
    "hoa_organizations",
    { slug: { _eq: ORG_SLUG } },
    { name: ORG_NAME, slug: ORG_SLUG, type: "residential", is_free_account: true },
    ORG_NAME
  );
  if (!orgId) throw new Error("Could not resolve org id");

  // Editorial look → classic style on the public landing.
  const existingSettings = await findOne("block_settings", { organization: { _eq: orgId } }, "id");
  if (!DRY) {
    if (existingSettings) {
      await tgt(`/items/block_settings/${existingSettings.id}`, { method: "PATCH", body: JSON.stringify({ theme: "classic" }) });
    } else {
      await tgt(`/items/block_settings`, { method: "POST", body: JSON.stringify({ organization: orgId, theme: "classic" }) });
    }
  }
  console.log("   ✅ settings.theme = classic");
  return orgId as string;
}

async function migrateUnits(orgId: string): Promise<Map<string, string>> {
  console.log("\n🏠 Units…");
  const sourceUnits = await readAll(src, SOURCE.units.collection);
  const map = new Map<string, string>(); // sourceUnitId → targetUnitId
  for (const u of sourceUnits) {
    const number = String(u[SOURCE.units.number] ?? u.name ?? u.id);
    const id = await upsert(
      "hoa_units",
      { _and: [{ organization: { _eq: orgId } }, { unit_number: { _eq: number } }] },
      { organization: orgId, unit_number: number, status: "active" },
      `Unit ${number}`
    );
    if (id) map.set(String(u[SOURCE.units.id]), id);
  }
  console.log(`   ✅ ${sourceUnits.length} unit(s)`);
  return map;
}

async function migrateMembers(orgId: string): Promise<Map<string, string>> {
  console.log("\n👥 Members…");
  const people = await readAll(src, SOURCE.people.collection);
  const map = new Map<string, string>(); // sourcePersonId → targetMemberId
  for (const p of people) {
    const email = p[SOURCE.people.email] || null;
    const first = p[SOURCE.people.first] || "";
    const last = p[SOURCE.people.last] || "";
    if (!email && !first && !last) continue;
    const match = email
      ? { _and: [{ organization: { _eq: orgId } }, { email: { _eq: email } }] }
      : { _and: [{ organization: { _eq: orgId } }, { first_name: { _eq: first } }, { last_name: { _eq: last } }] };
    const id = await upsert(
      "hoa_members",
      match,
      {
        organization: orgId,
        first_name: first || null,
        last_name: last || null,
        email,
        phone: p[SOURCE.people.phone] || null,
        status: "active",
        member_type: "owner",
      },
      `${first} ${last}`.trim() || email || "member"
    );
    if (id) map.set(String(p.id), id);
  }
  console.log(`   ✅ ${people.length} person/people`);
  return map;
}

async function migrateMemberships(orgId: string, unitMap: Map<string, string>, memberMap: Map<string, string>): Promise<void> {
  console.log("\n🔗 Member ↔ Unit links…");
  let links = 0;
  try {
    const junctions = await readAll(src, SOURCE.membership.collection);
    for (const j of junctions) {
      const unitId = unitMap.get(String(j[SOURCE.membership.unit]));
      const memberId = memberMap.get(String(j[SOURCE.membership.person]));
      if (!unitId || !memberId) continue;
      await upsert(
        "hoa_member_units",
        { _and: [{ member_id: { _eq: memberId } }, { unit_id: { _eq: unitId } }] },
        {
          member_id: memberId,
          unit_id: unitId,
          is_primary_unit: !!j[SOURCE.membership.primary],
          ownership_percentage: j[SOURCE.membership.ownership] ?? null,
          status: "published",
        },
        `${memberId.slice(0, 8)}→${unitId.slice(0, 8)}`
      );
      links++;
    }
  } catch (e: any) {
    console.log(`   ⚠️  membership junction skipped: ${e.message}`);
  }
  console.log(`   ✅ ${links} link(s)`);
}

const BOARD_TITLE_MAP: Record<string, "president" | "vice_president" | "secretary" | "treasurer" | "director"> = {
  president: "president",
  "vice president": "vice_president",
  vice_president: "vice_president",
  secretary: "secretary",
  treasurer: "treasurer",
  director: "director",
};

async function migrateBoard(memberMap: Map<string, string>): Promise<void> {
  console.log("\n🎖️  Board…");
  let count = 0;
  try {
    const board = await readAll(src, SOURCE.board.collection);
    for (const b of board) {
      const memberId = memberMap.get(String(b[SOURCE.board.person]));
      if (!memberId) continue;
      const rawTitle = String(b[SOURCE.board.title] ?? "director").toLowerCase().trim();
      const title = BOARD_TITLE_MAP[rawTitle] ?? "director";
      await upsert(
        "hoa_board_members",
        { _and: [{ hoa_member: { _eq: memberId } }, { title: { _eq: title } }] },
        {
          hoa_member: memberId,
          title,
          term_start: b[SOURCE.board.start] || null,
          term_end: b[SOURCE.board.end] || null,
          status: "published",
        },
        `${title}`
      );
      count++;
    }
  } catch (e: any) {
    console.log(`   ⚠️  board skipped: ${e.message}`);
  }
  console.log(`   ✅ ${count} board term(s)`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log(`🚚 Migrating 1033 Lenox → HOA Connect ${DRY ? "(DRY RUN)" : ""}`);
  console.log(`   source: ${SOURCE_URL}`);
  console.log(`   target: ${TARGET_URL}`);
  try {
    const orgId = await migrateOrg();
    const unitMap = await migrateUnits(orgId);
    const memberMap = await migrateMembers(orgId);
    await migrateMemberships(orgId, unitMap, memberMap);
    await migrateBoard(memberMap);

    console.log("\n✅ 1033 core migration complete.");
    console.log("   (Finance engine intentionally left behind — ROADMAP.)");
    console.log("\n📌 Next: spot-check units/members/board in HOA Connect, then");
    console.log("   review the landing at /" + ORG_SLUG + " (classic style).");
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

main();
