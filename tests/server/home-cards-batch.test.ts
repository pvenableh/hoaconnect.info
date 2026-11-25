/**
 * The caller's role context and the home cards' rows in one Directus request
 * (getRoleContextWith, core/server/utils/role-context.ts): the batch finds what
 * the reads one by one find, every card asks once, a caller who may not see a
 * list is refused without its rows, and "mine" keeps only the caller's own.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { fakeDirectus, type Db } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const A = "org-a";
const B = "org-b";
const ME = "user-me";
const YOU = "user-you";
const ROLE_ADMIN = "r-hoa-admin";
const LATER = "2999-01-01";

const seedDb = (): Db => ({
  hoa_organizations: [
    { id: A, billing_account: "ba-1", subscription_status: "active", subscription_plan: "plan-mid" },
    { id: B, billing_account: null, subscription_status: "active", subscription_plan: "plan-mid", is_free_account: true },
  ],
  subscription_plans: [{ id: "plan-mid", slug: "mid", features: { forms_to_sign: true }, is_contact_only: false }],
  billing_accounts: [
    { id: "ba-1", owner: YOU, subscription_status: "active", subscription_plan: "plan-mid" },
    { id: "ba-2", owner: ME },
  ],
  billing_account_members: [
    { id: 1, billing_account: "ba-2", user: ME, role: "owner" },
    { id: 2, billing_account: "ba-1", user: ME, role: "member" },
    { id: 3, billing_account: "ba-1", user: YOU, role: "owner" },
  ],
  hoa_members: [
    { id: "m-me-a", user: ME, organization: A, status: "active", role: null, member_type: "owner", first_name: "Me", last_name: "A" },
    { id: "m-me-a-old", user: ME, organization: A, status: "archived", role: ROLE_ADMIN, member_type: "tenant" },
    { id: "m-me-b", user: ME, organization: B, status: "pending", role: ROLE_ADMIN, member_type: "owner" },
    { id: "m-you-a", user: YOU, organization: A, status: "active", role: ROLE_ADMIN, member_type: "tenant", first_name: "You", last_name: "Z" },
  ],
  hoa_board_members: [
    { id: "t-1", hoa_member: "m-me-a", status: "published", title: "treasurer", term_start: "2020-01-01", term_end: LATER, sort: 1 },
    { id: "t-2", hoa_member: "m-me-a-old", status: "published", title: "president", term_start: "2020-01-01", term_end: null, sort: 2 },
    { id: "t-3", hoa_member: "m-you-a", status: "draft", title: "secretary", term_start: null, term_end: null, sort: 3 },
  ],
  hoa_forms: [
    { id: "f-1", organization: A, status: "open", title: "Pool waiver", description: "Sign it", document: null, audience: "all", due_date: LATER },
    { id: "f-2", organization: A, status: "open", title: "Pets", description: null, document: "file-1", audience: "all", due_date: null },
    { id: "f-3", organization: A, status: "draft", title: "Draft", audience: "all" },
  ],
  hoa_form_signatures: [
    // Signed by my archived membership: it does not count for the live one.
    { id: "s-1", form: "f-1", member: "m-me-a-old", organization: A, signed_at: "2026-01-02T00:00:00Z", signed_name: "Old me" },
    { id: "s-2", form: "f-2", member: "m-me-a", organization: A, signed_at: "2026-01-03T00:00:00Z", signed_name: "Me" },
    { id: "s-3", form: "f-1", member: "m-you-a", organization: A, signed_at: "2026-01-01T00:00:00Z", signed_name: "You" },
  ],
  hoa_announcements: [
    { id: "n-1", organization: A, status: "published", title: "Water off", target_audience: "all", requires_acknowledgment: true, ack_due: LATER, publish_date: "2020-01-01", expiry_date: null },
    { id: "n-2", organization: A, status: "published", title: "Paint", target_audience: "all", requires_acknowledgment: true, ack_due: null, publish_date: "2020-01-01", expiry_date: null },
  ],
  hoa_acknowledgments: [
    { id: 1, announcement: "n-1", member: "m-me-a", organization: A },
    { id: 2, announcement: "n-2", member: "m-me-a-old", organization: A },
  ],
});

const state: { db: Db } = { db: seedDb() };
let client: ReturnType<typeof fakeDirectus>;
let session: { user: { id: string; role?: string } } | null;
let batches: string[][];
let failBatch: boolean;
let rest: (specs: any) => Promise<any>;

const R = "#core/server/api/org";
const routes: Record<string, (e: any) => Promise<any>> = {};
const call = (route: string, query: Record<string, string>) => routes[route]!({ __query: query, context: {} });

beforeAll(async () => {
  rest = (await import("#core/server/utils/directus-graphql")).readItemsBatchRest;
  vi.stubGlobal("defineEventHandler", (fn: any) => fn);
  vi.stubGlobal("getQuery", (e: any) => e?.__query ?? {});
  vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.statusMessage ?? o.message), o));
  vi.stubGlobal("requireUserSession", async () => session);
  vi.stubGlobal("getUserSession", async () => session);
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { directusRoleHoaAdmin: ROLE_ADMIN } }));
  vi.stubGlobal("getTypedDirectus", () => client);
  vi.stubGlobal("getHelperAreas", async () => []);
  vi.stubGlobal("getFormsGate", (await import("#core/server/utils/forms-gate")).getFormsGate);
  vi.stubGlobal("getRoleContextWith", (await import("#core/server/utils/role-context")).getRoleContextWith);
  vi.stubGlobal("readItemsBatch", async (specs: Record<string, any>) => {
    batches.push(Object.keys(specs));
    if (failBatch) throw new Error("graphql down");
    return rest(specs);
  });
  for (const r of ["forms/pending", "forms/mine", "acknowledgments/pending", "acknowledgments/mine"]) {
    routes[r] = (await import(/* @vite-ignore */ `${R}/${r}.get`)).default;
  }
});

beforeEach(() => {
  state.db = seedDb();
  client = fakeDirectus(state);
  session = { user: { id: ME } };
  batches = [];
  failBatch = false;
});

describe("the role context's batch", () => {
  it("finds the membership, terms and billing account the reads one by one find", async () => {
    const { roleContextSpecs, roleInputsFrom, readRoleInputsOneByOne } = await import("#core/server/utils/role-context");
    // The fake returns whole rows; compare what each read asks for.
    const pick = (x: any) => ({
      id: x.membership?.id ?? null,
      status: x.membership?.status ?? null,
      titles: x.terms.map((t: any) => t.title),
      owner: x.billing?.owner ?? null,
      seats: x.billing?.members.map((m: any) => ({ user: m.user, role: m.role })) ?? null,
    });
    for (const [user, org] of [[ME, A], [ME, B], [YOU, A], [YOU, B]] as const) {
      const fromBatch = roleInputsFrom(await rest(roleContextSpecs(user, org)));
      expect(fromBatch, `${user} in ${org}`).not.toBeNull();
      expect(pick(fromBatch), `${user} in ${org}`).toEqual(pick(await readRoleInputsOneByOne(user, org)));
    }
  });

  it("keeps only the picked membership's terms, and only the community's account's seats", async () => {
    const { roleContextSpecs, roleInputsFrom } = await import("#core/server/utils/role-context");
    const mine = roleInputsFrom(await rest(roleContextSpecs(ME, A)))!;
    expect(mine.membership?.id).toBe("m-me-a");
    expect(mine.terms).toEqual([{ title: "treasurer" }]);
    expect(mine.billing).toEqual({ owner: YOU, members: [{ user: ME, role: "member" }] });
    expect(roleInputsFrom(await rest(roleContextSpecs(ME, B)))!.billing).toBeNull();
  });

  it("is null for a community with no row, so the reads one by one fail as they always did", async () => {
    const { roleContextSpecs, roleInputsFrom, readRoleInputsOneByOne } = await import("#core/server/utils/role-context");
    expect(roleInputsFrom(await rest(roleContextSpecs(ME, "org-gone")))).toBeNull();
    await expect(readRoleInputsOneByOne(ME, "org-gone")).rejects.toMatchObject({ statusCode: 403 });
  });

  it("goes out with the caller's standing and the route's rows, as one request", async () => {
    const { getRoleContextWith } = await import("#core/server/utils/role-context");
    const out = await getRoleContextWith({ context: {} } as any, A, { forms: { collection: "hoa_forms", fields: ["id"], filter: { organization: { _eq: A } } } });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toEqual(
      expect.arrayContaining(["rc_members", "rc_terms", "rc_org", "rc_seats", "forms", "access_mine", "access_teams", "access_restrictions", "access_areaGrants"])
    );
    expect(out.allowed).toBe(true);
    expect(out.context.hats.board).toBe(true);
    expect(out.rows.forms.map((f: any) => f.id).sort()).toEqual(["f-1", "f-2", "f-3"]);
  });

  it("reads one by one when the batch fails, with the same answer", async () => {
    const { getRoleContextWith } = await import("#core/server/utils/role-context");
    const extra = { forms: { collection: "hoa_forms", fields: ["id"], filter: { organization: { _eq: A } } } };
    const ok = await getRoleContextWith({ context: {} } as any, A, extra);
    let first = true;
    vi.stubGlobal("readItemsBatch", async (specs: Record<string, any>) => {
      batches.push(Object.keys(specs));
      if (first) {
        first = false;
        throw new Error("graphql down");
      }
      return rest(specs);
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(await getRoleContextWith({ context: {} } as any, A, extra)).toEqual(ok);
    } finally {
      warn.mockRestore();
      vi.stubGlobal("readItemsBatch", async (specs: Record<string, any>) => {
        batches.push(Object.keys(specs));
        if (failBatch) throw new Error("graphql down");
        return rest(specs);
      });
    }
  });

  it("refuses a route key that could collide with its own", async () => {
    const { getRoleContextWith } = await import("#core/server/utils/role-context");
    await expect(getRoleContextWith({ context: {} } as any, A, { rc_members: { collection: "x", fields: ["id"] } })).rejects.toThrow(/reserved/);
  });
});

describe("the home cards", () => {
  it("each asks Directus once", async () => {
    for (const r of Object.keys(routes)) {
      batches = [];
      await call(r, { orgId: A });
      expect(batches, r).toHaveLength(1);
    }
  });

  it("forms/mine counts only the live membership's signatures", async () => {
    const res = await call("forms/mine", { orgId: A });
    // f-1 was signed by the archived membership only; f-2 by the live one; f-3 is a draft.
    expect(res.forms.map((f: any) => f.id)).toEqual(["f-1"]);
    expect(res.forms[0]).toEqual({ id: "f-1", title: "Pool waiver", description: "Sign it", dueDate: LATER, hasDocument: false });
  });

  it("acknowledgments/mine counts only the live membership's acknowledgments", async () => {
    const res = await call("acknowledgments/mine", { orgId: A });
    expect(res.notices.map((n: any) => n.id)).toEqual(["n-2"]);
  });

  it("the pending lists name who has not signed or acknowledged, for the board", async () => {
    const forms = await call("forms/pending", { orgId: A });
    const f1 = forms.forms.find((f: any) => f.id === "f-1");
    expect(f1.pending.map((p: any) => p.memberId)).toEqual(["m-me-a"]);
    expect(f1.signed.map((s: any) => s.memberId)).toEqual(["m-you-a", "m-me-a-old"]);
    expect(f1.signed[1].name).toBe("Former member");

    const acks = await call("acknowledgments/pending", { orgId: A, announcementId: "n-2" });
    expect(acks.notices.map((n: any) => n.id)).toEqual(["n-2"]);
    expect(acks.notices[0].pending.map((p: any) => p.memberId).sort()).toEqual(["m-me-a", "m-you-a"]);
  });

  it("refuses a member without the board hat, after the one request, with no rows", async () => {
    session = { user: { id: YOU } }; // an HOA Admin role on an active membership: admin hat
    await expect(call("forms/pending", { orgId: A })).resolves.toBeTruthy();
    state.db.hoa_members.find((m: any) => m.id === "m-you-a")!.role = null;
    for (const r of ["forms/pending", "acknowledgments/pending"]) {
      batches = [];
      await expect(call(r, { orgId: A }), r).rejects.toMatchObject({ statusCode: 403 });
      expect(batches, r).toHaveLength(1);
    }
  });

  it("without a live membership, the mine cards are empty", async () => {
    expect(await call("forms/mine", { orgId: B })).toEqual({ forms: [] });
    expect(await call("acknowledgments/mine", { orgId: B })).toEqual({ notices: [] });
  });

  it("an ungated plan owes no signatures", async () => {
    state.db.subscription_plans[0].features = { forms_to_sign: false };
    expect(await call("forms/mine", { orgId: A })).toEqual({ forms: [] });
  });
});
