/**
 * Board-term history actions (plan §3.4, "History: end, don't erase";
 * docs/spec-responsibilities.md): End term, Change office, Correct, and
 * Delete only for a term entered by mistake. Admin only, org-scoped through
 * the term's member.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const state: { who: Who; db: Db; fail?: { failCreate?: string } } = { who: PERSONAS.admin, db: seed() };
let fake: ReturnType<typeof stubGlobals>;

const B = "#core/server/api/org/board-terms";
const ROUTES = {
  end: `${B}/[id]/end.post`,
  change: `${B}/[id]/change-office.post`,
  correct: `${B}/[id].patch`,
  remove: `${B}/[id].delete`,
} as const;
type Route = keyof typeof ROUTES;
const handlers: Partial<Record<Route, (e: any) => Promise<any>>> = {};
const call = (route: Route, o: { query?: any; body?: any; params?: any }) => handlers[route]!(ev(o));

beforeAll(async () => {
  fake = stubGlobals(state);
  for (const [k, path] of Object.entries(ROUTES)) handlers[k as Route] = (await import(/* @vite-ignore */ path)).default;
});

beforeEach(() => {
  state.db = seed();
  state.who = PERSONAS.admin;
  state.fail = undefined;
  fake.reset();
});

const term = (id: string) => state.db.hoa_board_members!.find((t) => t.id === id)!;
const activity = () => state.db.hoa_activity!;
const as = (who: Who) => (state.who = who);

const VALID: Record<Route, { query?: any; body?: any; params?: any }> = {
  end: { params: { id: ID.termAnn }, body: { orgId: ORG, lastDay: "2026-10-15", reason: "resigned" } },
  change: { params: { id: ID.termAnn }, body: { orgId: ORG, effective: "2026-06-01", office: "president" } },
  correct: { params: { id: ID.termAnn }, body: { orgId: ORG, term_start: "2026-01-02" } },
  remove: { params: { id: ID.termOld }, query: { orgId: ORG } },
};

describe("access", () => {
  for (const route of Object.keys(ROUTES) as Route[]) {
    it(`${route}: 401, 400, then admin only — a board seat and the register grant are refused`, async () => {
      as(PERSONAS.nobody);
      await expect(call(route, VALID[route])).rejects.toMatchObject({ statusCode: 401 });
      as(PERSONAS.admin);
      const v = VALID[route];
      await expect(
        call(route, { ...v, query: v.query ? {} : undefined, body: v.body ? { ...v.body, orgId: undefined } : undefined })
      ).rejects.toMatchObject({ statusCode: 400 });
      for (const who of [PERSONAS.board, PERSONAS.editor, PERSONAS.owner, PERSONAS.outsider]) {
        as(who);
        await expect(call(route, VALID[route])).rejects.toMatchObject({ statusCode: 403 });
      }
      expect(fake.calls.filter((c) => !c.op.startsWith("read"))).toHaveLength(0);
    });

    it(`${route}: 404 for another community's term`, async () => {
      await expect(call(route, { ...VALID[route], params: { id: ID.termOther } })).rejects.toMatchObject({ statusCode: 404 });
    });
  }
});

describe("End term", () => {
  it("sets the last day and the reason, and freezes the member's name", async () => {
    await call("end", VALID.end);
    expect(term(ID.termAnn)).toMatchObject({ term_end: "2026-10-15", end_reason: "resigned", holder_name: "Ann Lee", hoa_member: ID.memberAnn });
    expect(activity()[0]).toMatchObject({ event_type: "board_term", label: "Ann Lee's term as Treasurer ended (resigned)", user: ID.userAdmin });
  });

  it("refuses a term already ended, and 'changed office' as a reason", async () => {
    await call("end", VALID.end);
    await expect(call("end", VALID.end)).rejects.toMatchObject({ statusCode: 409 });
    await expect(call("end", { ...VALID.end, body: { ...VALID.end.body, reason: "changed_office" } })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("Change office", () => {
  it("ends the term the day before and opens one for the same member", async () => {
    const res = await call("change", VALID.change);
    expect(term(ID.termAnn)).toMatchObject({ title: "treasurer", term_end: "2026-05-31", end_reason: "changed_office", holder_name: "Ann Lee" });
    expect(term(res.opened)).toMatchObject({ hoa_member: ID.memberAnn, title: "president", term_start: "2026-06-01", term_end: null, status: "published" });
    expect(activity()[0].label).toBe("Ann Lee moved from Treasurer to President");
  });

  it("undoes the end when the new term cannot be opened", async () => {
    state.fail = { failCreate: "hoa_board_members" };
    await expect(call("change", VALID.change)).rejects.toMatchObject({ statusCode: 500 });
    expect(term(ID.termAnn)).toMatchObject({ term_end: null, end_reason: null, holder_name: null });
  });
});

describe("Correct", () => {
  it("fixes dates in place and logs before and after", async () => {
    const res = await call("correct", VALID.correct);
    expect(res.changed).toEqual(["term_start"]);
    expect(term(ID.termAnn).term_start).toBe("2026-01-02");
    expect(activity()[0].metadata).toEqual({ action: "correct", before: { term_start: "2026-01-01" }, after: { term_start: "2026-01-02" } });
  });

  it("never changes the member", async () => {
    await expect(call("correct", { ...VALID.correct, body: { orgId: ORG, hoa_member: ID.memberBob } })).rejects.toMatchObject({ statusCode: 400 });
    expect(term(ID.termAnn).hoa_member).toBe(ID.memberAnn);
  });
});

describe("Delete (entered by mistake)", () => {
  it("is refused while a register row for that office overlaps the term", async () => {
    await expect(call("remove", { params: { id: ID.termAnn }, query: { orgId: ORG } })).rejects.toMatchObject({
      statusCode: 409,
      data: { code: "term_in_use", jobs: ["Reconciles bank statements"] },
    });
    expect(term(ID.termAnn)).toBeTruthy();
  });

  it("is refused while a meeting's attendance links the term", async () => {
    state.db.hoa_meeting_attendees!.push({ id: "att-1", board_term: ID.termOld });
    await expect(call("remove", VALID.remove)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("deletes a term nothing depends on, and says so", async () => {
    await call("remove", VALID.remove);
    expect(state.db.hoa_board_members!.find((t) => t.id === ID.termOld)).toBeUndefined();
    expect(activity()[0].label).toBe("Deleted Bob Diaz's term as Secretary, entered by mistake");
  });
});

describe("Add a term (POST board-terms)", () => {
  // The Members page's "Add Board Position". Directus cannot check the person
  // a new term names, so the HOA Admin policy has no create on the collection.
  let create: (e: any) => Promise<any>;
  beforeAll(async () => {
    create = (await import(/* @vite-ignore */ `${B}/index.post`)).default;
  });
  const BODY = { orgId: ORG, hoa_member: ID.memberBob, title: "secretary", term_start: "2026-11-01", term_end: null, message: null };
  const add = (body: any) => create(ev({ body }));

  it("adds a term for a member of the community, published unless said otherwise, and logs it", async () => {
    const res = await add(BODY);
    expect(term(res.id)).toMatchObject({ hoa_member: ID.memberBob, title: "secretary", term_start: "2026-11-01", term_end: null, status: "published" });
    expect(activity()[0]).toMatchObject({ event_type: "board_term", target_id: res.id, label: "Added Bob Diaz as Secretary", user: ID.userAdmin });
    const draft = await add({ ...BODY, status: "draft" });
    expect(term(draft.id).status).toBe("draft");
  });

  it("401, then admin only: a board seat, the register grant and a resident are refused", async () => {
    as(PERSONAS.nobody);
    await expect(add(BODY)).rejects.toMatchObject({ statusCode: 401 });
    for (const who of [PERSONAS.board, PERSONAS.editor, PERSONAS.owner, PERSONAS.outsider]) {
      as(who);
      await expect(add(BODY)).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(fake.calls.filter((c) => !c.op.startsWith("read"))).toHaveLength(0);
  });

  it("refuses another community's person, an unknown one, dates out of order, a title that is not an office, and a field it does not take", async () => {
    for (const body of [
      { ...BODY, hoa_member: ID.memberOther },
      { ...BODY, hoa_member: uuid(98) },
      { ...BODY, term_start: "2026-11-01", term_end: "2026-10-31" },
      { ...BODY, title: "chair" },
      { ...BODY, holder_name: "Someone else" },
      { ...BODY, hoa_member: { id: ID.memberOther } },
      { ...BODY, orgId: undefined },
    ]) {
      await expect(add(body)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(fake.calls.filter((c) => !c.op.startsWith("read"))).toHaveLength(0);
  });
});
