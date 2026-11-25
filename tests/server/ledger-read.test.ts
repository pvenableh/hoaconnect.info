/**
 * GET /api/org/ledger (core/server/api/org/ledger.get.ts): the Community
 * Ledger read back in the tiers the caller may see (core/shared/ledger/
 * visibility.ts). One batch reads the memberships, a page for each tier set
 * and one count by type and tier; only the caller's page and sums come back.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "org-lenox";
const OTHER = "org-other";
const SLUGS: Record<string, string> = { lenox: ORG, other: OTHER };

type Entry = { id: string; organization: string; event_type: string; visibility: string; occurred_at: string };
let ledger: Entry[];
let members: any[];
let session: { user: { id: string } } | null;
let batches: Record<string, any>[];

const ME = "u-me";
const entry = (id: string, event_type: string, visibility: string, day: number, organization = ORG): Entry => ({
  id,
  organization,
  event_type,
  visibility,
  occurred_at: `2026-11-${String(day).padStart(2, "0")}T12:00:00.000Z`,
});

/** Lenox: three owner-visible entries and two board-only; one owners entry elsewhere. */
function seedLedger() {
  ledger = [
    entry("e1", "billing_run", "board", 1),
    entry("e2", "charge_corrected", "board", 2),
    entry("e3", "document_published", "owners", 3),
    entry("e4", "document_published", "owners", 4),
    entry("e5", "billing_run", "owners", 5),
    entry("x1", "document_published", "owners", 6, OTHER),
  ];
}

const membership = (over: Record<string, unknown>) => ({
  id: "m-me",
  user: ME,
  organization: ORG,
  status: "active",
  role: null,
  manager_permissions: null,
  board_member_terms: [],
  ...over,
});

/** The fake Directus: enough of `filter` for the ledger's reads. */
function matches(row: any, f: any): boolean {
  if (!f) return true;
  return Object.entries(f).every(([k, cond]: [string, any]) => {
    const v = row[k];
    if (k === "organization" && cond?.slug) return v === SLUGS[cond.slug._eq];
    if ("_eq" in cond) return v === cond._eq;
    if ("_in" in cond) return cond._in.includes(v);
    if ("_gte" in cond || "_lte" in cond) return (!cond._gte || v >= cond._gte) && (!cond._lte || v <= cond._lte);
    throw new Error(`fake: ${k} ${JSON.stringify(cond)}`);
  });
}

function runSpec(spec: any): any[] {
  if (spec.collection === "hoa_members") return members.filter((m) => matches(m, spec.filter));
  if (spec.collection === "hoa_organizations") return SLUGS[spec.filter.slug._eq] ? [{ id: SLUGS[spec.filter.slug._eq] }] : [];
  const rows = ledger.filter((r) => matches(r, spec.filter));
  if ("count" in spec) {
    const groups = new Map<string, any>();
    for (const r of rows) {
      const key = spec.groupBy.map((g: string) => r[g as keyof Entry]).join("|");
      const g = groups.get(key) ?? { ...Object.fromEntries(spec.groupBy.map((f: string) => [f, r[f as keyof Entry]])), count: 0 };
      g.count++;
      groups.set(key, g);
    }
    return [...groups.values()].map((g) => ({ ...g, count: String(g.count) }));
  }
  const sorted = [...rows].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  return sorted.slice(spec.offset ?? 0, (spec.offset ?? 0) + spec.limit);
}

beforeEach(async () => {
  seedLedger();
  members = [];
  session = { user: { id: ME } };
  batches = [];
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
  vi.stubGlobal("requireUserSession", async () => {
    if (!session) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
    return session;
  });
  vi.stubGlobal("isAppAdminSession", () => false);
  vi.stubGlobal("isHoaAdminRole", (r: unknown) => r === "role-admin");
  vi.stubGlobal("isPropertyManagerRole", (r: unknown) => r === "role-pm");
  const approvals = await import("#core/server/utils/money-approvals");
  vi.stubGlobal("orgMembersSpec", approvals.orgMembersSpec);
  vi.stubGlobal("seatsOfMembers", approvals.seatsOfMembers);
  vi.stubGlobal("orgHatsFrom", (await import("#core/server/utils/money-access")).orgHatsFrom);
  vi.stubGlobal("readItemsBatch", async (specs: Record<string, any>) => {
    batches.push(specs);
    return Object.fromEntries(Object.entries(specs).map(([k, spec]) => [k, runSpec(spec)]));
  });
});

const read = async (query: Record<string, string>) =>
  ((await import("#core/server/api/org/ledger.get")).default as any)({ __query: query });
const ids = (res: any) => res.entries.map((e: Entry) => e.id);

describe("who reads which tiers", () => {
  it("a member reads owner-visible entries only, and their counts", async () => {
    members = [membership({})];
    const res = await read({ orgId: ORG });
    expect(ids(res)).toEqual(["e5", "e4", "e3"]);
    expect(res.total).toBe(3);
    expect(res.types).toEqual([
      expect.objectContaining({ key: "document_published", count: 2 }),
      expect.objectContaining({ key: "billing_run", count: 1 }),
    ]);
    expect(res.viewer).toEqual({ tiers: ["owners"], seesBoardOnly: false });
  });

  it("the board, an admin and a manager read both tiers", async () => {
    const seat = { board_member_terms: [{ title: "treasurer", status: "published", term_start: null, term_end: null }] };
    for (const over of [seat, { role: "role-admin" }, { role: "role-pm" }, { role: "role-admin", status: "pending" }]) {
      members = [membership(over)];
      const res = await read({ orgId: ORG });
      expect(ids(res)).toEqual(["e5", "e4", "e3", "e2", "e1"]);
      expect(res.total).toBe(5);
      expect(res.types.find((t: any) => t.key === "billing_run").count).toBe(2);
      expect(res.viewer).toEqual({ tiers: ["owners", "board"], seesBoardOnly: true });
    }
  });

  it("closes the door on a non-member, a pending member and another community's member: 403, no entries", async () => {
    for (const m of [[], [membership({ status: "pending" })], [membership({ organization: OTHER })]]) {
      members = m;
      await expect(read({ orgId: ORG })).rejects.toMatchObject({ statusCode: 403 });
    }
  });

  it("401 without a session, 400 without a community", async () => {
    session = null;
    await expect(read({ orgId: ORG })).rejects.toMatchObject({ statusCode: 401 });
    session = { user: { id: ME } };
    await expect(read({})).rejects.toMatchObject({ statusCode: 400 });
    await expect(read({ slug: "nowhere" })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("filters", () => {
  beforeEach(() => {
    members = [membership({ role: "role-admin" })];
  });

  it("a category narrows the entries and the total, never the chips", async () => {
    const res = await read({ orgId: ORG, category: "records" });
    expect(ids(res)).toEqual(["e4", "e3"]);
    expect(res.total).toBe(2);
    expect(res.types.map((t: any) => t.key).sort()).toEqual(["billing_run", "charge_corrected", "document_published"]);
  });

  it("an unknown category matches nothing, rather than everything", async () => {
    const res = await read({ orgId: ORG, category: "nope" });
    expect(res).toMatchObject({ entries: [], total: 0 });
  });

  it("one event type wins over a category", async () => {
    const res = await read({ orgId: ORG, category: "records", eventType: "billing_run" });
    expect(ids(res)).toEqual(["e5", "e1"]);
    expect(res.total).toBe(2);
  });

  it("dates narrow everything, the chips included", async () => {
    const res = await read({ orgId: ORG, from: "2026-11-02T00:00:00Z", to: "2026-11-04T23:59:59Z" });
    expect(ids(res)).toEqual(["e4", "e3", "e2"]);
    expect(res.total).toBe(3);
    expect(res.types.find((t: any) => t.key === "billing_run")).toBeUndefined();
  });

  it("pages keep the total of the whole feed", async () => {
    const res = await read({ orgId: ORG, limit: "2", offset: "1" });
    expect(ids(res)).toEqual(["e4", "e3"]);
    expect(res).toMatchObject({ total: 5, limit: 2, offset: 1 });
  });

  it("a slug names the community in every read", async () => {
    const res = await read({ slug: "lenox" });
    expect(res.total).toBe(5);
    for (const [k, spec] of Object.entries(batches[0]!)) {
      if (k !== "org") expect(spec.filter.organization).toEqual({ slug: { _eq: "lenox" } });
    }
  });

  it("reads one community only", async () => {
    const res = await read({ orgId: ORG });
    expect(res.entries.every((e: Entry) => e.organization === ORG)).toBe(true);
    for (const spec of Object.values(batches[0]!)) expect(spec.filter.organization).toEqual({ _eq: ORG });
  });
});
