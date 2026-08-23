/**
 * Migrate 1033 Lenox in as an HOA Connect tenant.
 *
 * 1033 (the Nuxt 3 editorial site at ~/Sites/1033/main, live at 1033lenox.com)
 * runs on its OWN Directus instance. This reads from there and upserts onto the
 * HOA Connect `hoa_*` collections.
 *
 * The mapping below was VERIFIED against the live 1033 schema on 2026-08-22 —
 * every collection and field name here was read back from `/fields/*` and every
 * enum value from a distinct-value sweep of the real rows. An earlier version of
 * this file was written from the 1033 codebase and guessed; several of its
 * guesses (`persons`, `junction_directus_users_units` as the membership link,
 * `is_owner` as the owner signal) were wrong. Notes below record which, and why.
 *
 * The over-engineered 1033 finance engine (assessment_ledger, fiscal_years,
 * budget_*, reconciliation, cash_flow_projections, …) is intentionally LEFT
 * BEHIND — ROADMAP: simple, not QuickBooks.
 *
 *   Source (1033):    1033_DIRECTUS_URL + 1033_DIRECTUS_SERVER_TOKEN
 *   Target (Connect): DIRECTUS_URL + DIRECTUS_STATIC_TOKEN
 *
 * NOTE those source names begin with a digit, so they are NOT valid shell
 * identifiers — `$1033_DIRECTUS_URL` is a syntax error and `set -a; . ./.env`
 * warns on them. Node reads them fine as object keys, which is why they are
 * addressed as `process.env["1033_…"]` throughout.
 *
 * Run with:  pnpm run migrate:1033 -- --dry    (reports, writes nothing)
 *            pnpm run migrate:1033             (writes)
 *
 * Idempotent: every row is matched on a natural key (org + unit number, org +
 * email, org + subject + sent date, …) so re-running updates instead of
 * duplicating.
 */

const TARGET_URL = process.env.DIRECTUS_URL;
const TARGET_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
// New names first; the older SOURCE_* pair still works if someone has it set.
const SOURCE_URL = process.env["1033_DIRECTUS_URL"] || process.env.SOURCE_1033_DIRECTUS_URL;
const SOURCE_TOKEN =
  process.env["1033_DIRECTUS_SERVER_TOKEN"] || process.env.SOURCE_1033_TOKEN;

const DRY = process.argv.includes("--dry") || process.argv.includes("--dry-run");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").replace("--only=", "");

if (!TARGET_URL || !TARGET_TOKEN) {
  console.error("❌ Missing target env: DIRECTUS_URL + DIRECTUS_STATIC_TOKEN");
  process.exit(1);
}
if (!SOURCE_URL || !SOURCE_TOKEN) {
  console.error("❌ Missing source env: 1033_DIRECTUS_URL + 1033_DIRECTUS_SERVER_TOKEN");
  process.exit(1);
}

const ORG_SLUG = "1033-lenox";

// ── HTTP ────────────────────────────────────────────────────────────────────
async function dxFetch(baseUrl: string, token: string, endpoint: string, options: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} (${endpoint}): ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
const src = (e: string, o?: RequestInit) => dxFetch(SOURCE_URL!, SOURCE_TOKEN!, e, o);
const tgt = (e: string, o?: RequestInit) => dxFetch(TARGET_URL!, TARGET_TOKEN!, e, o);

async function readAll(collection: string, fields = "*"): Promise<any[]> {
  const out: any[] = [];
  let page = 1;
  while (true) {
    const res = await src(`/items/${collection}?fields=${fields}&limit=100&page=${page}`);
    const rows = res?.data ?? [];
    out.push(...rows);
    if (rows.length < 100) break;
    page++;
  }
  return out;
}

async function findOne(collection: string, filter: Record<string, any>) {
  const res = await tgt(
    `/items/${collection}?filter=${encodeURIComponent(JSON.stringify(filter))}&fields=id&limit=1`
  );
  return res?.data?.[0] ?? null;
}

const stats: Record<string, { created: number; updated: number; skipped: number }> = {};
function tally(k: string, what: "created" | "updated" | "skipped") {
  stats[k] = stats[k] || { created: 0, updated: 0, skipped: 0 };
  stats[k][what]++;
}

async function upsert(
  collection: string,
  match: Record<string, any>,
  data: Record<string, any>,
  bucket: string
): Promise<string | null> {
  const existing = await findOne(collection, match);
  if (DRY) {
    tally(bucket, existing ? "updated" : "created");
    // A dry run still has to hand back an id, because later steps filter on it —
    // and those columns are uuid, so a readable placeholder like "dry-12" makes
    // Postgres 500 rather than simply missing. Deterministic and well-formed, so
    // the lookup runs, finds nothing, and reports "would create" like it should.
    return existing?.id ?? dryUuid(collection, match);
  }
  if (existing) {
    await tgt(`/items/${collection}/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    tally(bucket, "updated");
    return existing.id;
  }
  const created = await tgt(`/items/${collection}`, { method: "POST", body: JSON.stringify(data) });
  tally(bucket, "created");
  return created?.data?.id ?? null;
}

const clean = (v: any) => (typeof v === "string" ? v.trim() || null : (v ?? null));

/**
 * Compare two timestamps that came from different systems by their wall clock.
 *
 * Source stores `2023-11-17T09:01:04`; Directus returns the same instant as
 * `2023-11-17T09:01:04.000Z`. A string compare therefore fails on every dated
 * row — which is exactly what happened: only the handful with NO date on either
 * side matched, because "" equalled "". Truncating both to seconds compares the
 * digits that actually mean the same thing, and avoids `new Date()` guessing a
 * timezone for the unzoned side.
 */
const normTs = (v: any): string => (v ? String(v).replace(" ", "T").slice(0, 19) : "");

/** A well-formed, stable stand-in id for dry runs. Never written anywhere. */
function dryUuid(collection: string, match: Record<string, any>): string {
  const seed = `${collection}:${JSON.stringify(match)}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  const hex = (Math.abs(h).toString(16) + "0".repeat(12)).slice(0, 12);
  return `00000000-0000-4000-8000-${hex}`;
}

/**
 * Source stores a mailing address as one flat string; Connect stores JSON and
 * the profile page reads `{ line1, line2, city, state, zip }` (`fmtAddress`).
 * Passing the raw string makes Postgres reject the insert outright — "invalid
 * input syntax for type json" — which is how this was found.
 *
 * Anything that does not parse keeps the whole original in `line1`, so no
 * address is ever dropped on the floor: `fmtAddress` renders on `line1 || city`,
 * so an unparsed address still displays, just unsplit.
 */
function parseAddress(raw: string | null): Record<string, string> | null {
  const text = (raw || "").trim().replace(/\s+/g, " ");
  if (!text) return null;
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const tail = parts[parts.length - 1]!;
    // "FL 33139" or "FL 33139-1234"
    const m = /^([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(tail);
    if (m) {
      const city = parts[parts.length - 2]!;
      const lines = parts.slice(0, parts.length - 2);
      return {
        line1: lines[0] || "",
        ...(lines.length > 1 ? { line2: lines.slice(1).join(", ") } : {}),
        city,
        state: m[1]!.toUpperCase(),
        zip: m[2]!,
      };
    }
  }
  return { line1: text };
}

// ── Org ─────────────────────────────────────────────────────────────────────
async function getOrg(): Promise<string> {
  const org = await findOne("hoa_organizations", { slug: { _eq: ORG_SLUG } });
  if (!org) throw new Error(`Target org "${ORG_SLUG}" not found — create it first.`);
  return org.id;
}

// ── Units ───────────────────────────────────────────────────────────────────
/** source unit id → target unit id */
async function migrateUnits(orgId: string) {
  const rows = await readAll("units", "id,number,status,occupant");
  const map = new Map<number, string>();
  for (const u of rows) {
    const number = clean(u.number);
    if (!number) {
      tally("units", "skipped");
      continue;
    }
    // `occupant` is the source of the building's headline ownership figure — it
    // reads Owner 18 / Tenant 10 across 28 units, which is exactly the
    // "18 owner-occupied · 64% ownership" the live site shows. Derived from
    // member_type it would have come out ~28, because owners own units whether
    // or not they live in them.
    const occ = (u.occupant || "").toLowerCase();
    const occupancy = occ === "owner" ? "owner" : occ === "tenant" ? "tenant" : null;

    const id = await upsert(
      "hoa_units",
      { organization: { _eq: orgId }, unit_number: { _eq: number } },
      { organization: orgId, unit_number: number, status: "active", occupancy },
      "units"
    );
    if (id) map.set(u.id, id);
  }
  return map;
}

// ── People → members ────────────────────────────────────────────────────────
/**
 * `category` is the owner/tenant signal, NOT `is_owner`: that boolean is null on
 * 84 of 89 rows, so trusting it would have made almost everyone a tenant.
 * Counts at time of writing: Owner 49 · Tenant 33 · Property Manager 5 ·
 * vendor 1 · Test User 1.
 */
function memberTypeFor(category: string | null): "owner" | "tenant" | null {
  const c = (category || "").toLowerCase();
  if (c === "owner") return "owner";
  if (c === "tenant" || c === "renter") return "tenant";
  // A property manager is neither, and hoa_members.member_type only offers those
  // two — so it stays null rather than being forced into a wrong answer. The PM
  // role in Connect is granted separately (see the vendors/PM notes).
  return null;
}

/** source person id → target member id */
async function migrateMembers(orgId: string) {
  const rows = await readAll(
    "people",
    "id,first_name,last_name,email,phone,mailing_address,category,status"
  );
  const map = new Map<number, string>();
  for (const p of rows) {
    const cat = (p.category || "").toLowerCase();
    // Not people: a vendor contact and a leftover test row.
    if (cat === "vendor" || cat === "test user") {
      tally("members", "skipped");
      continue;
    }
    const email = clean(p.email)?.toLowerCase() ?? null;
    const first = clean(p.first_name);
    const last = clean(p.last_name);
    if (!first && !last && !email) {
      tally("members", "skipped");
      continue;
    }

    // Email is the natural key where there is one (83 of 89). The rest fall back
    // to the name, which is why the filter is built rather than fixed.
    const match = email
      ? { organization: { _eq: orgId }, email: { _eq: email } }
      : {
          organization: { _eq: orgId },
          first_name: { _eq: first },
          last_name: { _eq: last },
        };

    const data: Record<string, any> = {
      organization: orgId,
      first_name: first,
      last_name: last,
      email,
      phone: clean(p.phone),
      mailing_address: parseAddress(p.mailing_address),
      // 28 of 89 are archived at source; they stay archived here rather than
      // being resurrected into the directory.
      status: p.status === "archived" ? "archived" : "active",
    };
    const mt = memberTypeFor(p.category);
    if (mt) data.member_type = mt;

    const id = await upsert("hoa_members", match, data, "members");
    if (id) map.set(p.id, id);
  }
  return map;
}

// ── Unit ↔ member links ─────────────────────────────────────────────────────
/**
 * Taken from each unit's own `people` array, NOT from the `units_people`
 * junction: that table's first rows carry NULL on both sides, so reading it
 * directly produces orphans.
 */
async function migrateMemberships(
  unitMap: Map<number, string>,
  memberMap: Map<number, string>
) {
  const units = await readAll("units", "id,people");
  for (const u of units) {
    const unitId = unitMap.get(u.id);
    const people: number[] = Array.isArray(u.people) ? u.people : [];
    if (!unitId || !people.length) continue;
    for (const [i, personId] of people.entries()) {
      const memberId = memberMap.get(personId);
      if (!memberId) {
        tally("memberships", "skipped");
        continue;
      }
      await upsert(
        "hoa_member_units",
        { member_id: { _eq: memberId }, unit_id: { _eq: unitId } },
        { member_id: memberId, unit_id: unitId, is_primary_unit: i === 0 },
        "memberships"
      );
    }
  }
}

// ── Vehicles ────────────────────────────────────────────────────────────────
async function migrateVehicles(orgId: string, unitMap: Map<number, string>) {
  const rows = await readAll(
    "vehicles",
    "id,make,model,year,license_plate,parking_spot,unit_id,status"
  );
  for (const v of rows) {
    const plate = clean(v.license_plate);
    const unitId = v.unit_id ? unitMap.get(v.unit_id) : null;
    if (!plate && !unitId) {
      tally("vehicles", "skipped");
      continue;
    }
    // `color`, `state` and `category` have no home on hoa_vehicles and are
    // dropped rather than stuffed somewhere they would not be found again.
    await upsert(
      "hoa_vehicles",
      plate
        ? { organization: { _eq: orgId }, license_plate: { _eq: plate } }
        : { organization: { _eq: orgId }, unit_id: { _eq: unitId } },
      {
        organization: orgId,
        make: clean(v.make),
        model: clean(v.model),
        year: v.year ?? null,
        license_plate: plate,
        parking_spot: clean(v.parking_spot),
        unit_id: unitId,
        status: v.status === "archived" ? "archived" : v.status === "draft" ? "draft" : "published",
      },
      "vehicles"
    );
  }
}

// ── Pets ────────────────────────────────────────────────────────────────────
const PET_TYPES = ["dog", "cat", "bird", "reptile", "other"];
async function migratePets(orgId: string, unitMap: Map<number, string>) {
  const rows = await readAll("pets", "id,name,breed,weight,category,unit_id,status");
  for (const p of rows) {
    const unitId = p.unit_id ? unitMap.get(p.unit_id) : null;
    const type = PET_TYPES.includes((p.category || "").toLowerCase())
      ? (p.category as string).toLowerCase()
      : "other";
    // Every source pet is unnamed, so the natural key has to be the unit plus
    // the breed — enough to stop a re-run duplicating them.
    await upsert(
      "hoa_pets",
      {
        organization: { _eq: orgId },
        unit_id: { _eq: unitId },
        breed: { _eq: clean(p.breed) },
      },
      {
        organization: orgId,
        name: clean(p.name),
        breed: clean(p.breed),
        weight: p.weight ?? null,
        type,
        unit_id: unitId,
        status: p.status === "archived" ? "archived" : "published",
      },
      "pets"
    );
  }
}

// ── Meetings ────────────────────────────────────────────────────────────────
/** Source has one category, "Board Meeting"; keep the map so others land right. */
function meetingType(category: string | null): string {
  const c = (category || "").toLowerCase();
  if (c.includes("annual")) return "annual";
  if (c.includes("special")) return "special";
  if (c.includes("committee")) return "committee";
  return "board";
}

async function migrateMeetings(orgId: string) {
  const rows = await readAll(
    "meetings",
    "id,title,date,time,description,agenda,minutes,location,video_link,recording_link,category,canceled,status"
  );
  for (const m of rows) {
    const title = clean(m.title) || "Board Meeting";
    // date + time are separate columns at source; Connect stores one timestamp.
    const when = m.date ? `${m.date}${m.time ? `T${m.time}` : "T00:00:00"}` : null;
    await upsert(
      "hoa_meetings",
      { organization: { _eq: orgId }, title: { _eq: title }, meeting_date: { _eq: when } },
      {
        organization: orgId,
        title,
        type: meetingType(m.category),
        meeting_date: when,
        location: clean(m.location),
        virtual_url: clean(m.video_link),
        recording_url: clean(m.recording_link),
        agenda: clean(m.agenda) || clean(m.description),
        minutes: clean(m.minutes),
        status: m.canceled ? "canceled" : "completed",
        is_published: m.status === "published",
        target_audience: "all",
      },
      "meetings"
    );
  }
}

// ── Announcements → emails ──────────────────────────────────────────────────
/**
 * 1033's "announcements" ARE its sent emails — subject, body, greeting, closing,
 * a template name and a sent date — so they belong on `hoa_emails`, not on
 * `hoa_announcements`. Status at source is sent (101) / "Sent" (3) / archived
 * (2); hoa_emails has no archived state, so all of them land as `sent`, which is
 * true of every one of them.
 */
async function migrateAnnouncements(orgId: string) {
  const rows = await readAll(
    "announcements",
    "id,title,subtitle,content,greeting,closing,urgent,date_sent,status,private"
  );
  for (const a of rows) {
    const subject = clean(a.title);
    // Four real, dated announcements carry a title and NO body — they were sent
    // from a SendGrid template, so the copy never lived in this table. Skipping
    // them lost four genuine notices from the community's record and from the
    // count on the landing. `content` is NOT NULL here, so they store an empty
    // body: true to what the source holds, and better than inventing text or
    // pretending the announcement never happened.
    const content = clean(a.content) ?? "";
    if (!subject) {
      tally("emails", "skipped");
      continue;
    }
    await upsert(
      "hoa_emails",
      {
        organization: { _eq: orgId },
        subject: { _eq: subject },
        sent_at: { _eq: a.date_sent ?? null },
      },
      {
        organization: orgId,
        subject,
        subtitle: clean(a.subtitle),
        content,
        greeting: clean(a.greeting),
        salutation: clean(a.closing),
        urgent: a.urgent === true,
        sent_at: a.date_sent ?? null,
        status: "sent",
        email_type: "announcement",
        content_mode: "visual",
      },
      "emails"
    );
  }
}

// ── Email activity (SendGrid events) ────────────────────────────────────────
/**
 * ~9,800 delivery events for the migrated notices: processed, delivered,
 * deferred, open, click, bounce, dropped. All seven source values are already
 * valid `hoa_email_activity.event` values, so nothing is coerced.
 *
 * Two joins have to be rebuilt on this side:
 *  - `announcement` (a source integer id) → the target email, matched on the
 *    same natural key the email migration used, subject + sent_at;
 *  - the recipient → an `hoa_members` row, matched on EMAIL ADDRESS rather than
 *    the source `person` id, which is both simpler and survives a member being
 *    re-created.
 *
 * `event_timestamp` is SendGrid's own field and is in SECONDS — the reader does
 * `new Date(event_timestamp * 1000)`, so writing milliseconds here would put
 * every event in the year 56000.
 *
 * Written in batches. One request per row would be ~9,800 round trips.
 */
async function migrateEmailActivity(orgId: string) {
  const rows = await readAll(
    "email_activity",
    "id,event,email,sg_message_id,clicked_url,announcement,date_created"
  );
  if (!rows.length) return;

  // source announcement id → target email id
  const srcAnnouncements = await readAll("announcements", "id,title,date_sent");
  const tgtEmails: any[] = [];
  for (let page = 1; ; page++) {
    const res = await tgt(
      `/items/hoa_emails?filter=${encodeURIComponent(
        JSON.stringify({ organization: { _eq: orgId } })
      )}&fields=id,subject,sent_at&limit=100&page=${page}`
    );
    const batch = res?.data ?? [];
    tgtEmails.push(...batch);
    if (batch.length < 100) break;
  }
  const emailByKey = new Map<string, string>();
  for (const e of tgtEmails) emailByKey.set(`${e.subject}|${normTs(e.sent_at)}`, e.id);
  const emailBySrcId = new Map<number, string>();
  for (const a of srcAnnouncements) {
    const id = emailByKey.get(`${clean(a.title)}|${normTs(a.date_sent)}`);
    if (id) emailBySrcId.set(a.id, id);
  }

  // email address → target member id
  const members: any[] = [];
  for (let page = 1; ; page++) {
    const res = await tgt(
      `/items/hoa_members?filter=${encodeURIComponent(
        JSON.stringify({ organization: { _eq: orgId } })
      )}&fields=id,email&limit=100&page=${page}`
    );
    const batch = res?.data ?? [];
    members.push(...batch);
    if (batch.length < 100) break;
  }
  const memberByEmail = new Map<string, string>();
  for (const m of members) if (m.email) memberByEmail.set(String(m.email).toLowerCase(), m.id);

  // Already imported? Key on the event's own identity so a re-run is a no-op.
  const seen = new Set<string>();
  for (let page = 1; ; page++) {
    const res = await tgt(
      `/items/hoa_email_activity?filter=${encodeURIComponent(
        JSON.stringify({ organization: { _eq: orgId } })
      )}&fields=sg_message_id,event,email,event_timestamp&limit=500&page=${page}`
    );
    const batch = res?.data ?? [];
    for (const a of batch) {
      seen.add(`${a.sg_message_id}|${a.event}|${a.email}|${a.event_timestamp}`);
    }
    if (batch.length < 500) break;
  }

  const pending: Record<string, any>[] = [];
  for (const r of rows) {
    const ts = r.date_created ? Math.floor(new Date(r.date_created).getTime() / 1000) : null;
    const key = `${r.sg_message_id}|${r.event}|${r.email}|${ts}`;
    if (seen.has(key)) {
      tally("activity", "updated");
      continue;
    }
    seen.add(key);
    pending.push({
      organization: orgId,
      event: r.event,
      email: clean(r.email),
      sg_message_id: clean(r.sg_message_id),
      clicked_url: clean(r.clicked_url),
      event_timestamp: ts,
      email_record: r.announcement ? emailBySrcId.get(r.announcement) ?? null : null,
      member: r.email ? memberByEmail.get(String(r.email).toLowerCase()) ?? null : null,
    });
  }

  if (DRY) {
    pending.forEach(() => tally("activity", "created"));
    return;
  }
  const CHUNK = 200;
  for (let i = 0; i < pending.length; i += CHUNK) {
    const slice = pending.slice(i, i + CHUNK);
    await tgt(`/items/hoa_email_activity`, { method: "POST", body: JSON.stringify(slice) });
    slice.forEach(() => tally("activity", "created"));
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🏢 1033 Lenox → HOA Connect${DRY ? "  (DRY RUN — no writes)" : ""}`);
  console.log(`   source: ${SOURCE_URL}`);
  console.log(`   target: ${TARGET_URL}`);
  if (ONLY) console.log(`   only:   ${ONLY}`);

  const want = (name: string) => !ONLY || ONLY.split(",").includes(name);

  try {
    const orgId = await getOrg();
    console.log(`   org:    ${ORG_SLUG} (${orgId})\n`);

    // Units and members first — everything else refers to them.
    const unitMap = want("units") || want("all") || !ONLY ? await migrateUnits(orgId) : new Map();
    const memberMap = await migrateMembers(orgId);
    if (want("memberships") || !ONLY) await migrateMemberships(unitMap, memberMap);
    if (want("vehicles") || !ONLY) await migrateVehicles(orgId, unitMap);
    if (want("pets") || !ONLY) await migratePets(orgId, unitMap);
    if (want("meetings") || !ONLY) await migrateMeetings(orgId);
    if (want("announcements") || !ONLY) await migrateAnnouncements(orgId);
    // After announcements — it joins onto the emails they create.
    if (want("activity") || !ONLY) await migrateEmailActivity(orgId);

    console.log("\n   what moved");
    for (const [k, v] of Object.entries(stats)) {
      console.log(
        `   ${k.padEnd(13)} created ${String(v.created).padStart(4)}  updated ${String(v.updated).padStart(4)}  skipped ${String(v.skipped).padStart(4)}`
      );
    }
    console.log(
      DRY
        ? "\n🔍 Dry run — nothing was written. Re-run without --dry to apply."
        : "\n✅ Migration complete. Finance engine intentionally left behind."
    );
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  }
}

main();
