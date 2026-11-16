/**
 * Accepting an invitation to a community (POST /api/hoa/accept-invitation,
 * core/server/utils/accept-invitation.ts), as a new HOA Connect account or
 * with one the person already has in another community.
 *
 * It used to refuse every email that already had an account ("A user with
 * this email already exists"), so someone in two communities could not join
 * the second, and a tenant whose owner reported a lease was stuck if they had
 * ever signed up anywhere.
 *
 * Zoe has an account and a membership in another community. Xena's account is
 * suspended. Tia is on this community's roster with no account.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ID, ORG, OTHER, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());

const sessions = vi.hoisted(() => ({ started: [] as any[], checked: [] as string[] }));
const dbRef = vi.hoisted(() => ({ db: null as any }));
vi.mock("#core/server/utils/password-session", () => ({
  // Directus's password check, against the fake's accounts.
  passwordTokens: async (email: string, password: string) => {
    sessions.checked.push(email);
    const user = dbRef.db.directus_users.find((u: any) => u.email === email);
    if (!user || user.password !== password || (user.status ?? "active") !== "active") throw new Error("Invalid user credentials.");
    return { access_token: `access-${user.id}`, refresh_token: `refresh-${user.id}`, expires: 900 };
  },
  startPasswordSession: async (_event: unknown, tokens: any) => void sessions.started.push(tokens),
}));
const mail = vi.hoisted(() => ({ sent: [] as any[] }));
vi.mock("#core/server/utils/invitation-accepted-email", () => ({
  sendInvitationAcceptedEmail: async (input: any) => void mail.sent.push(input),
}));

const ROLE = "role-member";
const U4B = uuid(501);
const USER = { zoe: uuid(502), xena: uuid(503) };
const M = { zoeElsewhere: uuid(511), tia: uuid(512) };

function db(): Db {
  const base = seed();
  return {
    ...base,
    hoa_organizations: base.hoa_organizations!.map((o) => (o.id === ORG ? { ...o, slug: "1033-lenox" } : o)),
    directus_roles: [{ id: ROLE, name: "HOA Member" }],
    directus_users: [
      ...base.directus_users!,
      { id: USER.zoe, first_name: "Zoe", last_name: "Zhang", email: "zoe@example.test", password: "zoe-secret", status: "active" },
      { id: USER.xena, first_name: "Xena", last_name: "Xu", email: "xena@example.test", password: "xena-secret", status: "suspended" },
    ],
    hoa_members: [
      ...base.hoa_members!,
      { id: M.zoeElsewhere, organization: OTHER, user: USER.zoe, email: "zoe@example.test", first_name: "Zoe", last_name: "Zhang", status: "active" },
      { id: M.tia, organization: ORG, user: null, email: "tia@example.test", first_name: "Tia", last_name: "Roster", status: "active", member_type: "tenant", date_created: "2026-01-01" },
    ],
    hoa_units: [{ id: U4B, organization: ORG, unit_number: "4B" }],
    hoa_member_units: [],
    hoa_invitations: [],
    hoa_leases: [],
    hoa_member_change_requests: [],
  };
}

const state: { who: Who; db: Db } = { who: { userId: null }, db: db() };
let fake: ReturnType<typeof stubGlobals>;
let accept: (e: any) => Promise<any>;
let verify: (e: any) => Promise<any>;
const counted: string[] = [];

const invite = (email: string, extra: Record<string, unknown> = {}) => {
  const row = {
    id: uuid(600 + state.db.hoa_invitations!.length),
    token: `token-${email}`,
    email,
    organization: ORG,
    invited_by: ID.userAdmin,
    role: ROLE,
    invitation_status: "pending",
    expires_at: "2099-01-01T00:00:00.000Z",
    member_type: "tenant",
    unit: U4B,
    ...extra,
  };
  state.db.hoa_invitations!.push(row);
  return row;
};
const send = (body: Record<string, unknown>) => accept(ev({ body }));
const membersHere = (email: string) => state.db.hoa_members!.filter((m) => m.organization === ORG && m.email === email);
const linksOf = (memberId: string) => state.db.hoa_member_units!.filter((l) => l.member_id === memberId);

beforeAll(async () => {
  fake = stubGlobals(state);
  vi.stubGlobal("useRuntimeConfig", () => ({ public: { directusRoleMember: ROLE }, directus: { url: "https://d.test" } }));
  vi.stubGlobal("recomputeMemberCount", async (orgId: string) => void counted.push(orgId));
  vi.spyOn(console, "error").mockImplementation(() => {});
  accept = (await import("#core/server/api/hoa/accept-invitation.post")).default;
  verify = (await import("#core/server/api/hoa/verify-invitation.post")).default;
});

beforeEach(() => {
  state.db = db();
  dbRef.db = state.db;
  state.who = { userId: null };
  fake.reset();
  sessions.started = [];
  sessions.checked = [];
  mail.sent = [];
  counted.length = 0;
});

describe("what the accept page is told", () => {
  it("says whether the invited email already has an account, and where to go after", async () => {
    invite("zoe@example.test");
    invite("new@example.test");
    await expect(verify(ev({ body: { token: "token-zoe@example.test" } }))).resolves.toMatchObject({
      email: "zoe@example.test",
      organizationName: "1033 Lenox",
      organizationSlug: "1033-lenox",
      roleName: "HOA Member",
      hasAccount: true,
      firstName: null,
    });
    await expect(verify(ev({ body: { token: "token-new@example.test" } }))).resolves.toMatchObject({ hasAccount: false });
  });

  it("offers a new account the name the roster has for them", async () => {
    invite("tia@example.test");
    await expect(verify(ev({ body: { token: "token-tia@example.test" } }))).resolves.toMatchObject({
      hasAccount: false,
      firstName: "Tia",
      lastName: "Roster",
    });
  });
});

describe("a new account", () => {
  it("is created with the invitation's role, joins, gets the unit, and is signed in", async () => {
    invite("new@example.test");
    const res = await send({ token: "token-new@example.test", firstName: " Nia ", lastName: "New", password: "long-enough" });

    const account = state.db.directus_users!.find((u) => u.email === "new@example.test")!;
    expect(account).toMatchObject({ first_name: "Nia", last_name: "New", role: { id: ROLE }, status: "active" });
    const [member] = membersHere("new@example.test");
    expect(member).toMatchObject({ user: account.id, role: ROLE, member_type: "tenant", status: "active", first_name: "Nia" });
    expect(linksOf(member!.id)).toEqual([expect.objectContaining({ unit_id: U4B, member_type: "tenant", is_primary_unit: true })]);
    expect(state.db.hoa_invitations![0]).toMatchObject({ invitation_status: "accepted" });
    expect(sessions.started).toEqual([expect.objectContaining({ access_token: `access-${account.id}` })]);
    expect(mail.sent).toEqual([expect.objectContaining({ to: "ada@example.test", memberName: "Nia New", organizationId: ORG })]);
    expect(counted).toEqual([ORG]);
    expect(res).toMatchObject({ success: true, existingAccount: false, organization: { slug: "1033-lenox" } });
  });

  it("needs a name and a password of 8 characters; nothing is written without them", async () => {
    invite("new@example.test");
    await expect(send({ token: "token-new@example.test", firstName: "Nia", password: "long-enough" })).rejects.toMatchObject({
      statusCode: 400,
      message: "Enter your first and last name.",
    });
    await expect(send({ token: "token-new@example.test", firstName: "Nia", lastName: "New", password: "short" })).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(state.db.directus_users!.some((u) => u.email === "new@example.test")).toBe(false);
    expect(state.db.hoa_invitations![0]).toMatchObject({ invitation_status: "pending" });
  });

  it("adopts the roster row for their email rather than adding a second", async () => {
    invite("tia@example.test", { member_type: null });
    await send({ token: "token-tia@example.test", firstName: "Tia", lastName: "Tran", password: "long-enough" });
    const rows = membersHere("tia@example.test");
    expect(rows).toHaveLength(1);
    // The roster's residency stands when the invitation states none.
    expect(rows[0]).toMatchObject({ id: M.tia, user: expect.any(String), last_name: "Tran", member_type: "tenant" });
  });
});

describe("someone who already has an account in another community", () => {
  it("joins with that account's password: no second account, their own name", async () => {
    invite("zoe@example.test");
    const users = state.db.directus_users!.length;
    const res = await send({ token: "token-zoe@example.test", password: "zoe-secret" });

    expect(state.db.directus_users!).toHaveLength(users);
    const [member] = membersHere("zoe@example.test");
    expect(member).toMatchObject({ user: USER.zoe, role: ROLE, first_name: "Zoe", last_name: "Zhang", status: "active" });
    expect(linksOf(member!.id)).toEqual([expect.objectContaining({ unit_id: U4B, member_type: "tenant" })]);
    // Their membership elsewhere is untouched.
    expect(state.db.hoa_members!.find((m) => m.id === M.zoeElsewhere)).toMatchObject({ organization: OTHER, status: "active" });
    expect(sessions.started).toEqual([expect.objectContaining({ access_token: `access-${USER.zoe}` })]);
    expect(state.db.hoa_invitations![0]).toMatchObject({ invitation_status: "accepted" });
    expect(res).toMatchObject({ success: true, existingAccount: true, user: { id: USER.zoe } });
  });

  it("refuses the wrong password, or none, before writing anything", async () => {
    invite("zoe@example.test");
    await expect(send({ token: "token-zoe@example.test", password: "guess" })).rejects.toMatchObject({
      statusCode: 401,
      message: "That isn't the password for zoe@example.test. Reset it from the sign-in page if you've forgotten it.",
    });
    await expect(send({ token: "token-zoe@example.test" })).rejects.toMatchObject({
      statusCode: 400,
      message: "Enter the password for zoe@example.test.",
    });
    expect(membersHere("zoe@example.test")).toHaveLength(0);
    expect(state.db.hoa_invitations![0]).toMatchObject({ invitation_status: "pending" });
    expect(sessions.started).toEqual([]);
  });

  it("needs nothing typed when they are signed in as that account, and keeps their session", async () => {
    invite("zoe@example.test");
    state.who = { userId: USER.zoe };
    await send({ token: "token-zoe@example.test" });
    expect(membersHere("zoe@example.test")).toEqual([expect.objectContaining({ user: USER.zoe })]);
    expect(sessions.checked).toEqual([]);
    expect(sessions.started).toEqual([]);
  });

  it("still asks for the password when someone else is signed in", async () => {
    invite("zoe@example.test");
    state.who = { userId: ID.userBob };
    await expect(send({ token: "token-zoe@example.test" })).rejects.toMatchObject({ statusCode: 400 });
    expect(membersHere("zoe@example.test")).toHaveLength(0);
  });

  it("adopts this community's roster row for them", async () => {
    const row = { id: uuid(520), organization: ORG, user: null, email: "zoe@example.test", first_name: "Z", last_name: "Imported", status: "active", date_created: "2026-01-01" };
    state.db.hoa_members!.push(row);
    invite("zoe@example.test");
    await send({ token: "token-zoe@example.test", password: "zoe-secret" });
    expect(membersHere("zoe@example.test")).toEqual([expect.objectContaining({ id: row.id, user: USER.zoe, first_name: "Zoe", last_name: "Zhang" })]);
  });

  it("is not added twice when the account is already a member here", async () => {
    state.db.hoa_members!.push({ id: uuid(521), organization: ORG, user: USER.zoe, email: "zoe@example.test", status: "active" });
    invite("zoe@example.test");
    await send({ token: "token-zoe@example.test", password: "zoe-secret" });
    expect(membersHere("zoe@example.test")).toHaveLength(1);
    expect(state.db.hoa_invitations![0]).toMatchObject({ invitation_status: "accepted" });
  });

  it("refuses an account whose membership here was ended: restoring it is the community's call", async () => {
    state.db.hoa_members!.push({ id: uuid(522), organization: ORG, user: USER.zoe, email: "zoe@example.test", status: "archived" });
    invite("zoe@example.test");
    await expect(send({ token: "token-zoe@example.test", password: "zoe-secret" })).rejects.toMatchObject({ statusCode: 409 });
    expect(membersHere("zoe@example.test")).toHaveLength(1);
    expect(state.db.hoa_invitations![0]).toMatchObject({ invitation_status: "pending" });
  });

  it("refuses a suspended account, and says so", async () => {
    invite("xena@example.test");
    await expect(send({ token: "token-xena@example.test", password: "xena-secret" })).rejects.toMatchObject({
      statusCode: 403,
      message: "The HOA Connect account for xena@example.test isn't active. Ask 1033 Lenox to contact HOA Connect.",
    });
  });

  it("becomes the tenant of the lease their owner reported", async () => {
    const lease = { id: uuid(530), organization: ORG, unit: U4B, tenant: null, start_date: "2026-12-01T12:00:00.000Z" };
    state.db.hoa_leases!.push(lease);
    state.db.hoa_member_change_requests!.push({
      id: uuid(531),
      organization: ORG,
      kind: "lease",
      status: "approved",
      target_id: lease.id,
      payload: { unit_id: U4B, tenant_email: "zoe@example.test", tenant_first_name: "Zoe", tenant_last_name: "Zhang" },
    });
    invite("zoe@example.test");
    await send({ token: "token-zoe@example.test", password: "zoe-secret" });
    const [member] = membersHere("zoe@example.test");
    expect(state.db.hoa_leases![0]).toMatchObject({ tenant: member!.id });
    expect(linksOf(member!.id)).toHaveLength(1);
  });
});

describe("an invitation that can't be used", () => {
  it("refuses an expired one and marks it expired", async () => {
    invite("new@example.test", { expires_at: "2020-01-01T00:00:00.000Z" });
    await expect(send({ token: "token-new@example.test", firstName: "N", lastName: "N", password: "long-enough" })).rejects.toMatchObject({
      statusCode: 400,
      message: "Invitation has expired",
    });
    expect(state.db.hoa_invitations![0]).toMatchObject({ invitation_status: "expired" });
  });

  it("refuses one already accepted", async () => {
    invite("new@example.test", { invitation_status: "accepted" });
    await expect(send({ token: "token-new@example.test", firstName: "N", lastName: "N", password: "long-enough" })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
