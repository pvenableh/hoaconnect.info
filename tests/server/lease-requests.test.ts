/**
 * An owner reports from My Household that their unit is rented; one approval
 * records the lease on the unit and links or invites the tenant.
 *
 *   POST /api/org/change-requests (kind "lease")   buildLeaseChange's checks
 *   applyChangeRequest → applyLeaseRequest         the lease, the tenant
 *   POST /api/org/change-requests/[id]/decide      approve and reject, with the owner told
 *   claimInvitedLeases                             an invited tenant joins
 *   mayOpenLeaseDocument, GET [id]/document        who opens the signed lease
 *
 * Bob owns 4B (the link says owner) and 5C (the link says nothing; Bob is an
 * owner), and rents 7A (the link says tenant). Ann rents 7A and owns nothing.
 * Tia is an active member with no unit here; Fay is a former member.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { ID, ORG, OTHER, PERSONAS, ev, seed, stubGlobals, uuid, type Db, type Who } from "./__fixtures__/responsibilities-db";
import { leaseRequestLine, ownedUnitsInOrg } from "#core/shared/units/lease-requests";

vi.mock("@directus/sdk", async () => (await import("./__fixtures__/responsibilities-db")).sdkMock());
const mail = vi.hoisted(() => ({ sent: [] as any[] }));
vi.mock("#core/server/utils/invitation-email", () => ({ sendHoaInvitationEmail: async (input: any) => void mail.sent.push(input) }));
const bell = vi.hoisted(() => ({ sent: [] as any[] }));
vi.mock("#core/server/utils/notify", () => ({ notifyUsers: async (input: any) => void bell.sent.push(input) }));
vi.mock("#core/server/utils/asset-stream", () => ({ streamDirectusFile: async (_e: unknown, file: { id: string }) => `streamed:${file.id}` }));

const U = { u4B: uuid(301), u5C: uuid(302), u7A: uuid(303), uOther: uuid(304) };
const F = { bobPdf: uuid(311), bobFiled: uuid(312), annPdf: uuid(313), bobImage: uuid(314), libraryPdf: uuid(315) };
const M = { tia: uuid(321), fay: uuid(322) };

function db(): Db {
  const base = seed();
  const people: Record<string, Record<string, unknown>> = {
    [ID.memberBob]: { email: "bob@example.test", member_type: "owner" },
    [ID.memberAnn]: { email: "ann@example.test", member_type: "tenant" },
    [ID.memberAdmin]: { email: "ada@example.test", member_type: "owner" },
  };
  return {
    ...base,
    hoa_members: [
      ...base.hoa_members!.map((m) => ({ ...m, ...people[m.id] })),
      { id: M.tia, organization: ORG, user: null, first_name: "Tia", last_name: "Tran", email: "tia@example.test", status: "active", date_created: "2026-01-01" },
      { id: M.fay, organization: ORG, user: null, first_name: "Fay", last_name: "Ford", email: "fay@example.test", status: "archived", date_created: "2025-01-01" },
    ],
    hoa_units: [
      { id: U.u4B, organization: ORG, unit_number: "4B" },
      { id: U.u5C, organization: ORG, unit_number: "5C" },
      { id: U.u7A, organization: ORG, unit_number: "7A" },
      { id: U.uOther, organization: OTHER, unit_number: "1A" },
    ],
    hoa_member_units: [
      { id: uuid(331), member_id: ID.memberBob, unit_id: U.u4B, status: "published", is_primary_unit: true, member_type: "owner" },
      { id: uuid(332), member_id: ID.memberBob, unit_id: U.u5C, status: "published", is_primary_unit: false, member_type: null },
      { id: uuid(333), member_id: ID.memberBob, unit_id: U.u7A, status: "published", is_primary_unit: false, member_type: "tenant" },
      { id: uuid(334), member_id: ID.memberBob, unit_id: U.uOther, status: "published", member_type: "owner" },
      { id: uuid(335), member_id: ID.memberAnn, unit_id: U.u7A, status: "published", is_primary_unit: true, member_type: "tenant" },
    ],
    directus_files: [
      ...base.directus_files!,
      { id: F.bobPdf, uploaded_by: ID.userBob, folder: null, type: "application/pdf", filename_download: "lease-4B.pdf" },
      { id: F.bobFiled, uploaded_by: ID.userBob, folder: uuid(390), type: "application/pdf", filename_download: "filed.pdf" },
      { id: F.annPdf, uploaded_by: ID.userAnn, folder: null, type: "application/pdf", filename_download: "ann.pdf" },
      { id: F.bobImage, uploaded_by: ID.userBob, folder: null, type: "image/jpeg", filename_download: "lease.jpg" },
    ],
    hoa_member_change_requests: [],
    hoa_leases: [],
    hoa_invitations: [],
  };
}

const state: { who: Who; db: Db } = { who: PERSONAS.owner, db: db() };
let fake: ReturnType<typeof stubGlobals>;
let submit: (e: any) => Promise<any>;
let decide: (e: any) => Promise<any>;
let documentRoute: (e: any) => Promise<any>;
let applyChangeRequest: typeof import("#core/server/utils/change-requests").applyChangeRequest;
let claimInvitedLeases: typeof import("#core/server/utils/lease-requests").claimInvitedLeases;
let mayOpenLeaseDocument: typeof import("#core/server/utils/lease-documents").mayOpenLeaseDocument;

const ann: Who = { userId: ID.userAnn, memberId: ID.memberAnn };
const isReviewer = () => !!(state.who.admin || state.who.grants?.directory);

beforeAll(async () => {
  fake = stubGlobals(state);
  vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: state.who.userId }));
  vi.stubGlobal("requireMembership", async () => ({ memberId: state.who.memberId }));
  vi.stubGlobal("notifyReviewersOfChangeRequest", async () => undefined);
  vi.stubGlobal("isChangeReviewer", async () => isReviewer());
  vi.stubGlobal("requireChangeReviewer", async () => {
    if (!isReviewer()) throw Object.assign(new Error("Admin or property-manager access required"), { statusCode: 403 });
  });
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { directusRoleMember: "role-member", appUrl: "https://app.test" },
    directus: { url: "https://d.test" },
    directusUrl: "https://d.test",
    directusToken: "t",
  }));
  vi.stubGlobal("$fetch", async () => {
    throw new Error("no network in tests");
  });
  vi.stubGlobal("shouldBlockDemoEmail", async () => false);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  submit = (await import("#core/server/api/org/change-requests/index.post")).default;
  decide = (await import("#core/server/api/org/change-requests/[id]/decide.post")).default;
  documentRoute = (await import("#core/server/api/org/change-requests/[id]/document.get")).default;
  ({ applyChangeRequest } = await import("#core/server/utils/change-requests"));
  ({ claimInvitedLeases } = await import("#core/server/utils/lease-requests"));
  ({ mayOpenLeaseDocument } = await import("#core/server/utils/lease-documents"));
  vi.stubGlobal("notifyResidentOfDecision", (await import("#core/server/utils/change-request-notify")).notifyResidentOfDecision);
});

beforeEach(() => {
  state.db = db();
  state.who = PERSONAS.owner;
  fake.reset();
  mail.sent = [];
  bell.sent = [];
});

const lease = (over: Record<string, unknown> = {}) => ({
  unit_id: U.u4B,
  tenant_first_name: "Jane",
  tenant_last_name: "Doe",
  tenant_email: "  Jane.Doe@Example.test ",
  start_date: "2026-12-01",
  end_date: "2027-11-30",
  document: F.bobPdf,
  ...over,
});
const report = (payload: Record<string, unknown> = lease(), extra: Record<string, unknown> = {}) =>
  submit(ev({ body: { orgId: ORG, kind: "lease", action: "create", payload, note: "Moving abroad for a year", ...extra } }));
const requests = () => state.db.hoa_member_change_requests!;
const lastRequest = () => requests().at(-1)!;
const approve = (cr = lastRequest()) => applyChangeRequest(getTypedDirectus(), cr, "2026-11-16T15:00:00.000Z", { reviewerUserId: ID.userAdmin });

describe("which units an owner may report on", () => {
  it("counts a link that says owner, and a link that says nothing for a person who is an owner", () => {
    const links = state.db.hoa_member_units!
      .filter((l) => l.member_id === ID.memberBob)
      .map((l) => ({ ...l, unit_id: state.db.hoa_units!.find((u) => u.id === l.unit_id) }));
    expect(ownedUnitsInOrg(links, "owner", ORG, "2026-11-16").map((u) => u.unit_number)).toEqual(["4B", "5C"]);
    // The same links for someone whose own residency is tenant: only the link that says owner.
    expect(ownedUnitsInOrg(links, "tenant", ORG, "2026-11-16").map((u) => u.unit_number)).toEqual(["4B"]);
    // An ended or archived link is not theirs.
    const ended = links.map((l) => ({ ...l, end_date: "2026-01-31" }));
    expect(ownedUnitsInOrg(ended, "owner", ORG, "2026-11-16")).toEqual([]);
  });

  it("reads as the reviewer's line", () => {
    expect(
      leaseRequestLine({ unit_number: "4B", tenant_first_name: "Jane", tenant_last_name: "Doe", start_date: "2026-12-01T12:00:00.000Z", end_date: "2027-11-30T12:00:00.000Z" })
    ).toBe("Unit 4B · Jane Doe · Dec 1, 2026 – Nov 30, 2027");
  });
});

describe("an owner reports a lease", () => {
  it("stores a pending request with the unit, the tenant, the days at noon UTC and the document's name", async () => {
    await report();
    expect(lastRequest()).toMatchObject({
      status: "pending",
      organization: ORG,
      member: ID.memberBob,
      submitted_by: ID.userBob,
      kind: "lease",
      action: "create",
      target_collection: "hoa_leases",
      target_id: null,
      note: "Moving abroad for a year",
      payload: {
        unit_id: U.u4B,
        unit_number: "4B",
        tenant_first_name: "Jane",
        tenant_last_name: "Doe",
        tenant_email: "jane.doe@example.test",
        start_date: "2026-12-01T12:00:00.000Z",
        end_date: "2027-11-30T12:00:00.000Z",
        document: F.bobPdf,
        document_name: "lease-4B.pdf",
      },
    });
    // No rent, and nothing the form did not ask for.
    expect(Object.keys(lastRequest().payload).sort()).toEqual(
      ["document", "document_name", "end_date", "start_date", "tenant_email", "tenant_first_name", "tenant_last_name", "unit_id", "unit_number"].sort()
    );
  });

  it("takes a unit owned through the person's own residency", async () => {
    await report(lease({ unit_id: U.u5C }));
    expect(lastRequest().payload).toMatchObject({ unit_id: U.u5C, unit_number: "5C" });
  });

  it("asks which unit when the owner has several and named none, and uses the only one otherwise", async () => {
    await expect(report(lease({ unit_id: undefined }))).rejects.toMatchObject({ statusCode: 400, message: "Pick the unit you rent out." });
    state.db.hoa_member_units = state.db.hoa_member_units!.filter((l) => l.unit_id !== U.u5C);
    await report(lease({ unit_id: undefined }));
    expect(lastRequest().payload).toMatchObject({ unit_id: U.u4B, unit_number: "4B" });
  });
});

describe("what a lease report refuses", () => {
  // Every refusal leaves nothing behind.
  afterEach(() => expect(requests()).toHaveLength(0));

  it("someone who owns nothing here: a tenant", async () => {
    state.who = ann;
    await expect(report(lease({ unit_id: U.u7A, document: F.annPdf }))).rejects.toMatchObject({
      statusCode: 403,
      message: "Only an owner of a unit here can report a lease.",
    });
  });

  it("a unit that isn't theirs to report: one they rent, another community's, one they never had", async () => {
    const other = uuid(399);
    state.db.hoa_units!.push({ id: other, organization: ORG, unit_number: "9Z" });
    for (const unit_id of [U.u7A, U.uOther, other]) {
      await expect(report(lease({ unit_id }))).rejects.toMatchObject({ statusCode: 400, message: "That unit isn't one you own." });
    }
  });

  it("a document someone else uploaded, one filed in a library, or one that does not exist", async () => {
    for (const document of [F.annPdf, F.bobFiled, ID.fileOk, uuid(398)]) {
      await expect(report(lease({ document }))).rejects.toMatchObject({ statusCode: 403, message: "Attach a lease you uploaded here." });
    }
  });

  it("a document that is not a PDF", async () => {
    await expect(report(lease({ document: F.bobImage }))).rejects.toMatchObject({ statusCode: 400, message: "The signed lease has to be a PDF." });
  });

  it("dates out of order, the same day, or not a day", async () => {
    await expect(report(lease({ start_date: "2027-11-30", end_date: "2026-12-01" }))).rejects.toMatchObject({
      statusCode: 400,
      message: "The lease has to end after it starts.",
    });
    await expect(report(lease({ end_date: "2026-12-01" }))).rejects.toMatchObject({ statusCode: 400, message: "The lease has to end after it starts." });
    await expect(report(lease({ start_date: "2026-02-30" }))).rejects.toMatchObject({ statusCode: 400, message: "Pick the start date." });
    await expect(report(lease({ end_date: undefined }))).rejects.toMatchObject({ statusCode: 400, message: "Pick the end date." });
  });

  it("a missing tenant, a bad email, or the owner's own email", async () => {
    await expect(report(lease({ tenant_first_name: " " }))).rejects.toMatchObject({ statusCode: 400, message: "Enter the tenant's first name." });
    await expect(report(lease({ tenant_email: "jane" }))).rejects.toMatchObject({ statusCode: 400, message: "Enter the tenant's email." });
    await expect(report(lease({ tenant_email: "BOB@example.test" }))).rejects.toMatchObject({ statusCode: 400, message: "Enter your tenant's email, not yours." });
  });

  it("anything but adding one", async () => {
    await expect(report(lease(), { action: "update", targetId: uuid(397) })).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe("approving it", () => {
  it("links a member of the community as the tenant, and records the lease as the records route does", async () => {
    await report(lease({ tenant_email: "TIA@example.test" }));
    const result = await approve();
    const row = state.db.hoa_leases!.at(-1)!;
    expect(row).toMatchObject({
      unit: U.u4B,
      organization: ORG,
      owner: ID.memberBob,
      tenant: M.tia,
      status: "active",
      start_date: "2026-12-01T12:00:00.000Z",
      end_date: "2027-11-30T12:00:00.000Z",
      document: F.bobPdf,
    });
    expect(row).not.toHaveProperty("rent_amount");
    // Tia had no unit: now she is 4B's tenant, and it is her primary unit.
    expect(state.db.hoa_member_units!.filter((l) => l.member_id === M.tia)).toEqual([
      expect.objectContaining({ unit_id: U.u4B, member_type: "tenant", is_primary_unit: true, start_date: "2026-12-01", status: "published" }),
    ]);
    expect(result).toEqual({ leaseId: row.id, tenant: "linked", tenantName: "Jane Doe", unitNumber: "4B" });
    expect(lastRequest()).toMatchObject({ target_id: row.id, payload: { lease_id: row.id, tenant_member_id: M.tia, invitation_id: null } });
    expect(state.db.hoa_invitations).toHaveLength(0);
  });

  it("keeps a link the tenant already has to the unit", async () => {
    await report(lease({ unit_id: U.u4B, tenant_email: "ann@example.test" }));
    state.db.hoa_member_units!.push({ id: uuid(336), member_id: ID.memberAnn, unit_id: U.u4B, status: "published", member_type: null });
    expect((await approve())).toMatchObject({ tenant: "already_linked" });
    const annOn4B = state.db.hoa_member_units!.filter((l) => l.member_id === ID.memberAnn && l.unit_id === U.u4B);
    expect(annOn4B).toEqual([expect.objectContaining({ id: uuid(336), member_type: "tenant" })]);
    expect(state.db.hoa_leases!.at(-1)).toMatchObject({ tenant: ID.memberAnn });
  });

  it("invites someone new as the unit's tenant, from the owner, and leaves the lease's tenant for when they join", async () => {
    await report();
    const result = await approve();
    const inv = state.db.hoa_invitations!.at(-1)!;
    expect(inv).toMatchObject({
      email: "jane.doe@example.test",
      organization: ORG,
      role: "role-member",
      invited_by: ID.userBob,
      invitation_status: "pending",
      member_type: "tenant",
      unit: U.u4B,
    });
    expect(mail.sent).toEqual([expect.objectContaining({ to: "jane.doe@example.test", firstName: "Jane", lastName: "Doe", inviterName: "Bob Diaz", organizationName: "1033 Lenox" })]);
    const row = state.db.hoa_leases!.at(-1)!;
    expect(row).toMatchObject({ unit: U.u4B, owner: ID.memberBob, tenant: null, document: F.bobPdf });
    expect(result).toMatchObject({ tenant: "invited", tenantName: "Jane Doe" });
    expect(lastRequest().payload).toMatchObject({ lease_id: row.id, tenant_member_id: null, invitation_id: inv.id });
  });

  it("reuses an invitation that is still pending", async () => {
    state.db.hoa_invitations!.push({ id: uuid(341), email: "jane.doe@example.test", organization: ORG, invitation_status: "pending", expires_at: "2099-01-01T00:00:00Z" });
    await report();
    expect(await approve()).toMatchObject({ tenant: "already_invited" });
    expect(state.db.hoa_invitations).toHaveLength(1);
    expect(mail.sent).toHaveLength(0);
    expect(lastRequest().payload.invitation_id).toBe(uuid(341));
  });

  it("writes one lease when run again after a failure part way", async () => {
    await report();
    await approve();
    await approve(lastRequest());
    expect(state.db.hoa_leases).toHaveLength(1);
    expect(state.db.hoa_invitations).toHaveLength(1);
  });

  it("refuses, writing nothing, when the email is a former member's or the unit isn't the owner's any more", async () => {
    await report(lease({ tenant_email: "fay@example.test" }));
    await expect(approve()).rejects.toMatchObject({ statusCode: 409, message: "fay@example.test belongs to a former member here. Restore them on the Members page, then approve." });

    await report();
    state.db.hoa_member_units = state.db.hoa_member_units!.filter((l) => l.unit_id !== U.u4B);
    await expect(approve()).rejects.toMatchObject({ statusCode: 409, message: "Unit 4B isn't theirs any more. Reject this request with a note." });

    expect(state.db.hoa_leases).toHaveLength(0);
    expect(state.db.hoa_invitations).toHaveLength(0);
  });
});

describe("the reviewer decides", () => {
  const decideAs = (who: Who, decision: "approve" | "reject", note?: string) => {
    state.who = who;
    return decide(ev({ params: { id: lastRequest().id }, body: { orgId: ORG, decision, note } }));
  };

  it("approves as a manager with the directory grant, and the owner is told the tenant was invited", async () => {
    await report();
    const res = await decideAs(PERSONAS.manager, "approve");
    expect(res).toMatchObject({ success: true, status: "approved", lease: { tenant: "invited", tenantName: "Jane Doe", unitNumber: "4B" } });
    expect(lastRequest()).toMatchObject({ status: "approved", reviewed_by: PERSONAS.manager.userId });
    expect(state.db.hoa_leases).toHaveLength(1);
    expect(bell.sent).toEqual([
      expect.objectContaining({
        recipientUserIds: [ID.userBob],
        subject: "Lease recorded",
        message: "Your lease for Unit 4B is recorded. We've invited Jane Doe to join.",
        path: "/profile",
      }),
    ]);
  });

  it("rejects with a note, records nothing, and tells the owner", async () => {
    await report();
    await decideAs(PERSONAS.admin, "reject", "Please attach all pages.");
    expect(lastRequest()).toMatchObject({ status: "rejected", review_note: "Please attach all pages." });
    expect(state.db.hoa_leases).toHaveLength(0);
    expect(state.db.hoa_invitations).toHaveLength(0);
    expect(bell.sent).toEqual([
      expect.objectContaining({
        recipientUserIds: [ID.userBob],
        subject: "Lease needs another look",
        message: "Your lease for Unit 4B wasn't approved. Check the note and try again.",
      }),
    ]);
  });

  it("refuses a resident and a manager without the directory grant", async () => {
    await report();
    await expect(decideAs(ann, "approve")).rejects.toMatchObject({ statusCode: 403 });
    await expect(decideAs(PERSONAS.editor, "approve")).rejects.toMatchObject({ statusCode: 403 });
    expect(state.db.hoa_leases).toHaveLength(0);
  });
});

describe("the invited tenant joins", () => {
  // As the decide route leaves it.
  const approved = async () => {
    await report();
    await approve();
    lastRequest().status = "approved";
  };

  it("becomes the lease's tenant and its unit's", async () => {
    await approved();
    const jane = uuid(351);
    state.db.hoa_members!.push({ id: jane, organization: ORG, email: "jane.doe@example.test", status: "active", first_name: "Jane", last_name: "Doe" });
    expect(await claimInvitedLeases(ORG, "Jane.Doe@example.test", jane)).toBe(1);
    expect(state.db.hoa_leases!.at(-1)).toMatchObject({ tenant: jane });
    expect(state.db.hoa_member_units!.filter((l) => l.member_id === jane)).toEqual([
      expect.objectContaining({ unit_id: U.u4B, member_type: "tenant", start_date: "2026-12-01" }),
    ]);
    expect(lastRequest().payload.tenant_member_id).toBe(jane);
  });

  it("takes no lease that has a tenant, another community's, or one for someone else, nor one still waiting", async () => {
    await approved();
    state.db.hoa_leases!.at(-1)!.tenant = M.tia;
    expect(await claimInvitedLeases(ORG, "jane.doe@example.test", uuid(352))).toBe(0);
    expect(await claimInvitedLeases(OTHER, "jane.doe@example.test", uuid(352))).toBe(0);
    state.db.hoa_leases!.at(-1)!.tenant = null;
    expect(await claimInvitedLeases(ORG, "someone@example.test", uuid(352))).toBe(0);
    lastRequest().status = "pending";
    expect(await claimInvitedLeases(ORG, "jane.doe@example.test", uuid(352))).toBe(0);
    expect(state.db.hoa_leases!.at(-1)!.tenant).toBeNull();
  });
});

describe("who opens the signed lease", () => {
  const leaseRow = { id: uuid(361), organization: ORG, unit: U.u4B, owner: ID.memberBob, tenant: ID.memberAnn, document: F.bobPdf, status: "active" };
  const open = (who: Who, fileId = F.bobPdf) => {
    state.who = who;
    return mayOpenLeaseDocument(ev(), who.userId ?? "", fileId);
  };

  it("the lease's owner and tenant and the community's admins; not another member or the board", async () => {
    state.db.hoa_leases!.push(leaseRow);
    expect(await open(PERSONAS.owner)).toBe(true);
    expect(await open(ann)).toBe(true);
    expect(await open(PERSONAS.admin)).toBe(true);
    const tia: Who = { userId: uuid(8), memberId: M.tia };
    state.db.hoa_members!.find((m) => m.id === M.tia)!.user = uuid(8);
    expect(await open(tia)).toBe(false);
    expect(await open(PERSONAS.manager)).toBe(false);
  });

  it("is not its rule to decide for a file no lease names", async () => {
    expect(await open(PERSONAS.owner, F.annPdf)).toBeNull();
  });

  it("before approval: a reviewer while it waits, an admin, and the owner who sent it", async () => {
    await report();
    const get = (who: Who) => {
      state.who = who;
      return documentRoute(ev({ params: { id: lastRequest().id }, query: { orgId: ORG } }));
    };
    expect(await get(PERSONAS.owner)).toBe(`streamed:${F.bobPdf}`);
    expect(await get(PERSONAS.manager)).toBe(`streamed:${F.bobPdf}`);
    expect(await get(PERSONAS.admin)).toBe(`streamed:${F.bobPdf}`);
    await expect(get(ann)).rejects.toMatchObject({ statusCode: 403 });
    lastRequest().status = "approved";
    await expect(get(PERSONAS.manager)).rejects.toMatchObject({ statusCode: 403 });
    expect(await get(PERSONAS.admin)).toBe(`streamed:${F.bobPdf}`);
    await expect(documentRoute(ev({ params: { id: lastRequest().id }, query: { orgId: OTHER } }))).rejects.toMatchObject({ statusCode: 404 });
  });
});
