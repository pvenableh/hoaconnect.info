import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_DEFS, purgeDemoContent, seedDemos, type DemoUser } from "../../core/shared/demo/seed";
import { DEMO_ROUND3, DEMO_SEED_NOTE, DEMO_TIME_ZONE, ledgerMonths } from "../../core/shared/demo/round3";
import { dmSlug, isValidDmRoster } from "../../core/shared/channels/rules";
import { REMINDER_RULES, resolveReminderSettings } from "../../core/shared/reminders/settings";

// ── A Directus in a Map ──────────────────────────────────────────────────────
// Just enough of the REST surface that seedDemos / purgeDemoContent use: filters
// are flat `{ field: { _eq | _in } }`, ids are assigned on create, and every call
// is recorded so a test can say what was written, to what, and for whom.

type Row = Record<string, any>;
interface Call {
  method: string;
  path: string;
  body: any;
}

const BASE = "https://directus.test";
const USER: DemoUser = { email: "demo@example.test", password: "unused-in-tests", first_name: "Demo", last_name: "Admin" };
const NOW = new Date("2026-11-12T15:00:00Z");

const ALL_FIELDS = [
  "hoa_organizations.is_demo",
  "hoa_organizations.opening_balance",
  "block_settings.reminders",
  "hoa_channels.is_dm",
  "hoa_emails.recurrence_rule",
  "hoa_emails.recurrence_timezone",
  "hoa_emails.email_class",
];

function makeDirectus(opts: { missingFields?: string[] } = {}) {
  const tables: Record<string, Row[]> = {
    roles: [{ id: "role-hoa-admin", name: "HOA Admin" }],
    users: [],
    folders: [],
  };
  const calls: Call[] = [];
  const fields = new Set(ALL_FIELDS.filter((f) => !opts.missingFields?.includes(f)));
  let n = 0;
  const newId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
  const table = (name: string) => (tables[name] ??= []);

  const matches = (row: Row, filter: Row) =>
    Object.entries(filter).every(([field, cond]: [string, any]) => {
      if ("_eq" in cond) return row[field] === cond._eq;
      if ("_in" in cond) return cond._in.includes(row[field]);
      throw new Error(`fake directus: unsupported filter on ${field}: ${JSON.stringify(cond)}`);
    });
  const project = (row: Row, fieldsParam: string | null) => {
    if (!fieldsParam) return { ...row };
    return Object.fromEntries(fieldsParam.split(",").map((f) => [f, row[f] ?? null]));
  };

  const respond = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status });
  const nameOf = (segments: string[]) => (segments[0] === "items" ? segments[1]! : segments[0]!);

  const fetchFake = async (input: any, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input));
    const method = (init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path: url.pathname, body });
    const segments = url.pathname.split("/").filter(Boolean);

    if (segments[0] === "fields") {
      return fields.has(`${segments[1]}.${segments[2]}`) ? respond({ field: segments[2] }) : new Response("no such field", { status: 403 });
    }

    const name = nameOf(segments);
    const id = segments[0] === "items" ? segments[2] : segments[1];
    const rows = table(name);
    const filter = url.searchParams.get("filter");
    const fieldsParam = url.searchParams.get("fields");

    if (method === "GET") {
      if (id) {
        const row = rows.find((r) => r.id === id);
        return row ? respond(project(row, fieldsParam)) : new Response("not found", { status: 404 });
      }
      let hits = filter ? rows.filter((r) => matches(r, JSON.parse(filter))) : rows;
      const limit = Number(url.searchParams.get("limit") || 100);
      if (limit > 0) hits = hits.slice(0, limit);
      return respond(hits.map((r) => project(r, fieldsParam)));
    }
    if (method === "POST") {
      const make = (b: Row) => {
        // A real Directus refuses a second user with the same email.
        if (name === "users" && rows.some((u) => u.email === b.email)) throw new Error(`duplicate user ${b.email}`);
        const row = { id: newId(), ...b };
        rows.push(row);
        return row;
      };
      return respond(Array.isArray(body) ? body.map(make) : make(body));
    }
    if (method === "PATCH") {
      const row = rows.find((r) => r.id === id);
      if (!row) return new Response("not found", { status: 404 });
      Object.assign(row, body);
      return respond(row);
    }
    if (method === "DELETE") {
      for (const rid of body as string[]) {
        const i = rows.findIndex((r) => r.id === rid);
        if (i >= 0) rows.splice(i, 1);
      }
      return new Response(null, { status: 204 });
    }
    return new Response("unsupported", { status: 500 });
  };

  return { tables, calls, table, fetch: fetchFake, newId };
}

type Fake = ReturnType<typeof makeDirectus>;

const io = (fake: Fake, extra: Record<string, any> = {}) => ({ baseUrl: BASE, token: "t", now: NOW, log: () => {}, ...extra });
const seed = (fake: Fake, extra: Record<string, any> = {}) => seedDemos(io(fake, extra), USER);
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const orgId = (fake: Fake, slug: string) => fake.table("hoa_organizations").find((o) => o.slug === slug)!.id as string;

let fake: Fake;
beforeEach(() => {
  fake = makeDirectus();
  vi.stubGlobal("fetch", fake.fetch);
});
afterEach(() => vi.unstubAllGlobals());

describe("seedDemos — Round 3, on a fresh database", () => {
  it.each(DEMO_DEFS.map((d) => d.slug))("%s: reminders are on for every rule", async (slug) => {
    await seed(fake);
    const org = fake.table("hoa_organizations").find((o) => o.slug === slug)!;
    const settings = fake.table("block_settings").find((s) => s.id === org.settings)!;
    const resolved = resolveReminderSettings(settings.reminders);
    for (const rule of REMINDER_RULES) expect(resolved.rules[rule].enabled).toBe(true);
    // Approved by the demo admin, who is a real user here.
    const adminId = fake.table("users").find((u) => u.email === USER.email)!.id;
    expect(settings.reminders.rules.dues.approved_by).toBe(adminId);
    // …and the landing config the seed already wrote is still there beside it.
    expect(settings.landing.blocks.length).toBeGreaterThan(0);
  });

  it.each(DEMO_DEFS.map((d) => d.slug))("%s: one recurring email, scheduled for a first Monday, on the community's clock", async (slug) => {
    await seed(fake);
    const id = orgId(fake, slug);
    const emails = fake.table("hoa_emails").filter((e) => e.organization === id);
    expect(emails).toHaveLength(1);
    const email = emails[0]!;
    expect(email).toMatchObject({
      status: "scheduled",
      email_type: "newsletter",
      email_class: "community",
      recurrence_rule: "monthly_nth_weekday",
      recurrence_timezone: DEMO_TIME_ZONE,
      recipient_filter: "all",
      subject: DEMO_ROUND3[slug as keyof typeof DEMO_ROUND3].email.subject,
    });
    expect(email.scheduled_at).toBe(email.next_run_at);
    expect(email.scheduled_at).toBe("2026-12-07T14:00:00.000Z"); // 9:00 EST on the first Monday after NOW
    expect(Date.parse(email.scheduled_at)).toBeGreaterThan(NOW.getTime());
  });

  it.each(DEMO_DEFS.map((d) => d.slug))("%s: a community channel, and a DM of exactly two people", async (slug) => {
    await seed(fake);
    const id = orgId(fake, slug);
    const cfg = DEMO_ROUND3[slug as keyof typeof DEMO_ROUND3];
    const channels = fake.table("hoa_channels").filter((c) => c.organization === id);
    const community = channels.find((c) => c.slug === cfg.channel.slug)!;
    expect(community).toMatchObject({ status: "published", is_private: false });

    const admin = fake.table("users").find((u) => u.email === USER.email)!;
    const peer = fake.table("users").find((u) => u.email === cfg.dmPeerUserEmail)!;
    expect(peer).toBeTruthy();
    const dm = channels.find((c) => c.is_dm === true)!;
    expect(dm).toMatchObject({ slug: dmSlug(admin.id, peer.id), is_private: true, status: "published", is_default: false });
    const roster = fake.table("hoa_channel_members").filter((m) => m.channel === dm.id);
    expect(isValidDmRoster(roster.map((m) => m.user), [admin.id, peer.id])).toBe(true);
    expect(roster.every((m) => m.role === "member")).toBe(true);

    // Both are on the community channel too, the admin as its admin.
    const onCommunity = fake.table("hoa_channel_members").filter((m) => m.channel === community.id);
    expect(onCommunity.map((m) => m.user).sort()).toEqual([admin.id, peer.id].sort());
    expect(onCommunity.find((m) => m.user === admin.id)!.role).toBe("admin");
  });

  it("the DM's other person is a linked, passwordless-to-everyone HOA Admin — not a second shared login", async () => {
    await seed(fake);
    for (const def of DEMO_DEFS) {
      const cfg = DEMO_ROUND3[def.slug as keyof typeof DEMO_ROUND3];
      const peer = fake.table("users").find((u) => u.email === cfg.dmPeerUserEmail)!;
      expect(peer).toMatchObject({ role: "role-hoa-admin", status: "active" });
      // A random secret that is not the demo's published password, and not anywhere the repo can name.
      expect(peer.password).not.toBe(USER.password);
      expect(String(peer.password).length).toBeGreaterThanOrEqual(64);
      const member = fake.table("hoa_members").find((m) => m.organization === orgId(fake, def.slug) && m.email === cfg.dmPeerEmail)!;
      expect(member).toMatchObject({ user: peer.id, role: "role-hoa-admin" });
    }
  });

  it.each(DEMO_DEFS.map((d) => d.slug))("%s: Reports has twelve months of paid dues and expenses, for this org only", async (slug) => {
    await seed(fake);
    const id = orgId(fake, slug);
    const requests = fake.table("payment_requests").filter((r) => r.organization === id);
    const expenses = fake.table("payment_expenses").filter((e) => e.organization === id);
    expect(requests.length).toBeGreaterThan(40);
    expect(expenses.length).toBeGreaterThanOrEqual(45);
    expect(requests.every((r) => r.status === "paid")).toBe(true);
    // Every row is stamped, which is what makes it the seed's to replace.
    for (const row of [...requests, ...expenses]) expect(row.notes).toBe(DEMO_SEED_NOTE);
    // Every month of the window has income and spend.
    for (const { year, month } of ledgerMonths(NOW)) {
      const ym = `${year}-${String(month).padStart(2, "0")}`;
      expect(requests.some((r) => r.paid_at.startsWith(ym))).toBe(true);
      expect(expenses.some((e) => e.expense_date.startsWith(ym))).toBe(true);
    }
    // The billed members are this org's directory members.
    const mine = new Set(fake.table("hoa_members").filter((m) => m.organization === id).map((m) => m.id));
    expect(requests.every((r) => mine.has(r.member))).toBe(true);
    // The reserve the running balance starts from.
    const org = fake.table("hoa_organizations").find((o) => o.id === id)!;
    expect(org.opening_balance).toBe(DEMO_ROUND3[slug as keyof typeof DEMO_ROUND3].openingBalance);
    expect(org.opening_balance_date).toBe("2025-12-01");
  });
});

describe("seedDemos — Round 3 is idempotent", () => {
  it("a second run on the same day writes nothing to any Round 3 collection", async () => {
    await seed(fake);
    const before = JSON.stringify(fake.tables);
    fake.calls.length = 0;
    await seed(fake);
    const round3 = ["hoa_emails", "hoa_channels", "hoa_channel_members", "payment_requests", "payment_expenses", "users"];
    const touched = writes(fake.calls).filter((c) => round3.some((t) => c.path.includes(`/${t}`)));
    expect(touched).toEqual([]);
    // Nor to reminders: the only block_settings write is the landing/theme one every run makes.
    for (const c of writes(fake.calls).filter((c) => c.path.includes("/block_settings"))) expect(c.body).not.toHaveProperty("reminders");
    // …and the org PATCH for the opening balance did not happen again.
    expect(writes(fake.calls).filter((c) => c.path.includes("/hoa_organizations") && c.body && "opening_balance" in c.body)).toEqual([]);
    // The seed's own baseline rewrite (amenities and so on) is the only thing that changed; Round 3 rows are identical.
    const after = JSON.parse(JSON.stringify(fake.tables));
    const strip = (t: any) => Object.fromEntries(Object.entries(t).filter(([k]) => ["hoa_emails", "hoa_channels", "hoa_channel_members", "payment_requests", "payment_expenses", "users"].includes(k)));
    expect(strip(after)).toEqual(strip(JSON.parse(before)));
  });

  it("the nightly reset: purge deletes the emails, the seed puts the recurring one back", async () => {
    await seed(fake);
    // A visitor also drafts an email, which the purge takes with the rest.
    fake.table("hoa_emails").push({ id: "visitor-draft", organization: orgId(fake, "demo"), subject: "Hello", status: "draft" });
    const purged = await purgeDemoContent(io(fake));
    expect(purged.hoa_emails).toBe(3);
    expect(fake.table("hoa_emails")).toHaveLength(0);

    await seed(fake);
    for (const def of DEMO_DEFS) {
      const emails = fake.table("hoa_emails").filter((e) => e.organization === orgId(fake, def.slug));
      expect(emails.map((e) => e.recurrence_rule)).toEqual(["monthly_nth_weekday"]);
    }
    // The purge does not touch channels, the DM or the ledger, so they were not rebuilt.
    expect(fake.table("hoa_channels").filter((c) => c.is_dm)).toHaveLength(2);
  });

  it("moves forward with the calendar: a later day reschedules the one email and slides the window, without duplicating", async () => {
    await seed(fake);
    const id = orgId(fake, "demo");
    const first = fake.table("hoa_emails").find((e) => e.organization === id)!;
    expect(first.scheduled_at).toBe("2026-12-07T14:00:00.000Z");

    await seed(fake, { now: new Date("2026-12-20T15:00:00Z") });
    const emails = fake.table("hoa_emails").filter((e) => e.organization === id);
    expect(emails).toHaveLength(1);
    expect(emails[0]!.id).toBe(first.id); // patched, not recreated
    expect(emails[0]!.scheduled_at).toBe("2027-01-04T14:00:00.000Z");

    const requests = fake.table("payment_requests").filter((r) => r.organization === id);
    expect(requests.some((r) => r.paid_at.startsWith("2025-12"))).toBe(false); // slid out
    expect(requests.some((r) => r.paid_at.startsWith("2026-12"))).toBe(true); // slid in
    expect(fake.table("hoa_organizations").find((o) => o.id === id)!.opening_balance_date).toBe("2026-01-01");
  });

  it("a visitor's edits to what the seed made are put back: reminders off, the channel archived, a seeded expense changed", async () => {
    await seed(fake);
    const id = orgId(fake, "demo");
    const org = fake.table("hoa_organizations").find((o) => o.id === id)!;
    const settings = fake.table("block_settings").find((s) => s.id === org.settings)!;
    settings.reminders = { send_hour: 9, rules: { dues: { enabled: false } } };
    fake.table("hoa_channels").find((c) => c.organization === id && c.slug === "board-room")!.status = "archived";
    const seeded = fake.table("payment_expenses").find((e) => e.organization === id)!;
    const original = seeded.amount;
    seeded.amount = 1;

    await seed(fake);
    expect(resolveReminderSettings(settings.reminders).rules.dues.enabled).toBe(true);
    expect(fake.table("hoa_channels").find((c) => c.organization === id && c.slug === "board-room")!.status).toBe("published");
    expect(fake.table("payment_expenses").filter((e) => e.organization === id && e.notes === DEMO_SEED_NOTE).some((e) => e.amount === 1)).toBe(false);
    expect(fake.table("payment_expenses").some((e) => e.title === seeded.title && e.amount === original)).toBe(true);
  });

  it("leaves alone every charge and expense it did not write", async () => {
    await seed(fake);
    const id = orgId(fake, "demo");
    const visitor = { id: "visitor-lunch", organization: id, title: "Visitor lunch", amount: 99, category: "other", status: "paid", expense_date: "2026-11-01", notes: null };
    fake.table("payment_expenses").push({ ...visitor });
    await seed(fake);
    await seed(fake, { now: new Date("2026-12-20T15:00:00Z") });
    expect(fake.table("payment_expenses").find((e) => e.id === "visitor-lunch")).toEqual(visitor);
  });

  it("works around the billing engine's own charges: they stay, and that month is not billed twice", async () => {
    // What the demo holds today: overdue September dues made by a schedule, not by the seed.
    await seed(fake);
    const id = orgId(fake, "demo");
    fake.table("payment_requests").splice(0); // as if the seed had not run yet
    const members = fake.table("hoa_members").filter((m) => m.organization === id);
    const owner = (first: string) => members.find((m) => m.first_name === first)!;
    const scheduled = ["Ava", "Marcus", "Priya", "Sofia"].map((first, i) => ({
      id: `sched-${i}`, organization: id, member: owner(first).id, request_type: "monthly_dues", title: "Monthly dues — 2026-09",
      status: "overdue", amount: 250, amount_paid: 0, due_date: "2026-09-01", paid_at: null, source: "schedule", source_id: "sched-1", notes: null,
    }));
    for (const row of scheduled) fake.table("payment_requests").push(JSON.parse(JSON.stringify(row)));

    await seed(fake);
    for (const row of scheduled) expect(fake.table("payment_requests").find((r) => r.id === row.id)).toEqual(row);
    const seeded = fake.table("payment_requests").filter((r) => r.organization === id && r.notes === DEMO_SEED_NOTE);
    const owners = new Set(scheduled.map((r) => r.member));
    // No paid September dues for a member whose September is already billed…
    expect(seeded.filter((r) => r.request_type === "monthly_dues" && r.due_date === "2026-09-01" && owners.has(r.member))).toEqual([]);
    // …but every other month of theirs is there.
    expect(seeded.filter((r) => r.request_type === "monthly_dues" && owners.has(r.member))).toHaveLength(4 * 11);

    // And that holds on the next run too.
    fake.calls.length = 0;
    await seed(fake);
    expect(writes(fake.calls).filter((c) => c.path.includes("/payment_requests"))).toEqual([]);
  });

  it("leaves an email that is mid-send alone", async () => {
    await seed(fake);
    const id = orgId(fake, "demo");
    const email = fake.table("hoa_emails").find((e) => e.organization === id)!;
    email.status = "sending";
    fake.calls.length = 0;
    await seed(fake);
    expect(email.status).toBe("sending");
    expect(writes(fake.calls).filter((c) => c.path.includes("/hoa_emails"))).toEqual([]);
  });
});

describe("seedDemos — tenant scope", () => {
  it("never touches another community's emails, channels, charges or expenses", async () => {
    const other = "other-org";
    fake.table("hoa_organizations").push({ id: other, slug: "pilot-community", is_demo: false });
    const mine = [
      ["hoa_emails", { id: "e1", organization: other, subject: "Real newsletter", web_slug: "monthly-community-update", status: "scheduled" }],
      ["hoa_channels", { id: "c1", organization: other, slug: "board-room", status: "published" }],
      ["payment_requests", { id: "r1", organization: other, status: "paid", amount: 500, amount_paid: 500, request_type: "monthly_dues", title: "Real dues" }],
      ["payment_expenses", { id: "x1", organization: other, title: "Real invoice", amount: 800, category: "other", status: "paid" }],
    ] as const;
    for (const [t, row] of mine) fake.table(t).push(JSON.parse(JSON.stringify(row)));

    await seed(fake);
    await seed(fake, { now: new Date("2026-12-20T15:00:00Z") });
    for (const [t, row] of mine) expect(fake.table(t).find((r) => r.id === row.id)).toEqual(row);

    // Everything Round 3 wrote names a demo org.
    const demoIds = new Set(DEMO_DEFS.map((d) => orgId(fake, d.slug)));
    for (const t of ["hoa_emails", "hoa_channels", "payment_requests", "payment_expenses"]) {
      for (const row of fake.table(t).filter((r) => r.organization !== other)) expect(demoIds.has(row.organization)).toBe(true);
    }
    // And every DELETE the seed sent carried ids it had read back from a demo org.
    const deletedPaths = writes(fake.calls).filter((c) => c.method === "DELETE" && /payment_/.test(c.path));
    for (const d of deletedPaths) expect(d.body).not.toContain("r1");
  });
});

describe("seedDemos — dry run", () => {
  it("sends no write at all, on an empty database", async () => {
    await seed(fake, { dry: true });
    expect(writes(fake.calls)).toEqual([]);
  });

  it("sends no write at all, on a seeded one — and says what it would have done", async () => {
    await seed(fake);
    // Break each Round 3 piece, so the dry run has something to plan.
    fake.tables.hoa_emails = [];
    fake.tables.payment_expenses = [];
    fake.table("hoa_channels").splice(0);
    fake.table("hoa_channel_members").splice(0);
    // A seeded charge that no longer matches, so the ledger has something to clear as well as something to add.
    fake.table("payment_requests").push({ id: "stale-charge", organization: orgId(fake, "demo"), status: "paid", amount: 5, amount_paid: 5, request_type: "other", title: "Old seeded charge", notes: DEMO_SEED_NOTE });
    const org = fake.table("hoa_organizations").find((o) => o.slug === "demo")!;
    fake.table("block_settings").find((s) => s.id === org.settings)!.reminders = null;

    const log: string[] = [];
    const snapshot = JSON.stringify(fake.tables);
    fake.calls.length = 0;
    await seedDemos(io(fake, { dry: true, log: (m: string) => log.push(m) }), USER);

    expect(writes(fake.calls)).toEqual([]);
    expect(JSON.stringify(fake.tables)).toBe(snapshot);
    const said = log.join("\n");
    expect(said).toContain("(dry) reminders: every rule ON");
    expect(said).toContain("(dry) + recurring email");
    expect(said).toContain("(dry) + channel #board-room");
    expect(said).toContain("(dry) + direct message");
    expect(said).toContain("(dry) ledger: clear");
    expect(said).toContain("(dry) ledger: + ");
    expect(said).toContain("ledger would be:");
    expect(said).not.toMatch(/^ {2}ledger: \d/m); // the past-tense summary is for a real run
  });
});

describe("seedDemos — a database that has not run every Round 3 script", () => {
  it("skips what is not migrated, says so, and still seeds the rest", async () => {
    fake = makeDirectus({ missingFields: ["block_settings.reminders", "hoa_channels.is_dm", "hoa_emails.recurrence_timezone", "hoa_emails.email_class", "hoa_organizations.opening_balance"] });
    vi.stubGlobal("fetch", fake.fetch);
    const log: string[] = [];
    await seedDemos(io(fake, { log: (m: string) => log.push(m) }), USER);
    const said = log.join("\n");

    expect(said).toContain("block_settings.reminders is not there");
    expect(said).toContain("hoa_channels.is_dm is not there");
    // No DM and no reminders, but the community channel, the ledger and the email are all there.
    expect(fake.table("hoa_channels").some((c) => c.is_dm)).toBe(false);
    expect(fake.table("hoa_channels").filter((c) => c.slug === "board-room")).toHaveLength(2);
    expect(fake.table("payment_requests").length).toBeGreaterThan(40);
    // Before Phase 4 there is no nth-weekday rule and no zone: a plain monthly, with no class column either.
    const email = fake.table("hoa_emails")[0]!;
    expect(email.recurrence_rule).toBe("monthly");
    expect(email).not.toHaveProperty("recurrence_timezone");
    expect(email).not.toHaveProperty("email_class");
    expect(fake.table("block_settings").every((s) => !("reminders" in s))).toBe(true);
    expect(fake.table("hoa_organizations").every((o) => !("opening_balance" in o))).toBe(true);
  });
});
