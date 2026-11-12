/**
 * Someone removed from a community (`hoa_members.status` inactive or archived)
 * keeps nothing their membership granted. Server routes read with the ADMIN
 * Directus token, so each membership lookup's own status filter is the only
 * thing between a removed member and the community's data. The reference rule
 * is `checkMembership` / `getBoardPosition`: an ACTIVE member row first.
 *
 *  - a removed officer whose board term was never ended (transition-execute's
 *    deactivate_member leaves the term alone) is not "board" for channels,
 *    the Board Room or notices, and is not enrolled into new channels;
 *  - a channel-admin row counts only with an active membership in that org;
 *  - a former HOA Admin is refused the storage library;
 *  - a removed member cannot put files or folders into the old library;
 *  - a removed former occupant (or officer) is refused a unit's records.
 *
 * The Directus here is stateful and evaluates filters, so an inactive row is
 * excluded only when the code asks for `status: active`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { MemoryDirectus } from "./support/memory-directus";

vi.mock("@directus/sdk", async () => ({
  ...(await import("./support/email-queue-memory")).sdkDescriptors,
  readFolder: (id: string, query?: any) => ({ op: "readFolder", collection: "directus_folders", id, query }),
  createFolder: (data: any) => ({ op: "createFolder", collection: "directus_folders", data }),
}));

vi.stubGlobal("defineEventHandler", (fn: unknown) => fn);

const { isActiveBoardMember, getOrgChannelEnrollees, requireChannelManager } = await import(
  "#core/server/utils/channel-enrollment"
);
const { resolveStorageContext } = await import("#core/server/utils/org-storage");
const { callerCommunities, assertFolderInCallerLibrary } = await import("#core/server/utils/caller-library");
const unitRecords = (await import("#core/server/api/hoa/units/records.get")).default as unknown as (
  event: H3Event
) => Promise<any>;

const ORG = "org-lenox";
const LENOX = { id: ORG, folder: "root-lenox" };
const OTHER = { id: "org-other", folder: "root-other" };
const HOA_ADMIN = "role-hoa-admin";
const HOA_MEMBER = "role-hoa-member";
const event = {} as H3Event;

// Ada: active HOA Admin and officer, occupies unit-1.
// Rex: REMOVED (inactive) — still holds the HOA Admin role on the row, a board
//      term nobody ended, a channel-admin seat, and a past occupancy of unit-1.
// Arc: archived, otherwise like Rex's board seat.
// Cal: active plain member with a channel-admin seat.
// Oz:  active member of ANOTHER community only, with a channel-admin seat here.
const ada = { id: "m-ada", user: "u-ada", organization: LENOX, status: "active", role: HOA_ADMIN };
const rex = { id: "m-rex", user: "u-rex", organization: LENOX, status: "inactive", role: HOA_ADMIN };
const arc = { id: "m-arc", user: "u-arc", organization: LENOX, status: "archived", role: HOA_MEMBER };
const cal = { id: "m-cal", user: "u-cal", organization: LENOX, status: "active", role: HOA_MEMBER };
const oz = { id: "m-oz", user: "u-oz", organization: OTHER, status: "active", role: HOA_MEMBER };

let db: MemoryDirectus;
let sessionUser: string;

// The admin client: MemoryDirectus plus the folder ops org-storage uses.
const client = {
  request: async (op: any) => {
    switch (op.op) {
      case "readFolder": {
        const folder = db.one("directus_folders", op.id);
        if (!folder) throw new Error(`no folder ${op.id}`);
        return { ...folder };
      }
      case "readFolders":
        return db.all("directus_folders", op.query?.filter).map((f) => ({ ...f }));
      case "createFolder":
        return db.request({ op: "createItem", collection: "directus_folders", data: op.data });
      default:
        return db.request(op);
    }
  },
};

/** Every hoa_members lookup made so far must ask for active rows. */
const memberLookups = () => db.ops.filter((o) => o.op === "readItems" && o.collection === "hoa_members");
function expectActiveOnly() {
  const lookups = memberLookups();
  expect(lookups.length).toBeGreaterThan(0);
  for (const o of lookups) expect(o.query.filter).toMatchObject({ status: { _eq: "active" } });
}

beforeEach(() => {
  db = new MemoryDirectus();
  db.seed("hoa_organizations", [
    { id: ORG, name: "Lenox", folder: "root-lenox", modules: {} },
    { id: "org-other", name: "Other", folder: "root-other", modules: {} },
  ]);
  db.seed("directus_folders", [
    { id: "root-lenox", name: "Lenox", parent: null },
    { id: "docs-lenox", name: "Documents", parent: "root-lenox" },
    { id: "root-other", name: "Other", parent: null },
  ]);
  db.seed("hoa_members", [ada, rex, arc, cal, oz]);
  // Open-ended published terms: still "current" for all three officers.
  db.seed("hoa_board_members", [
    { id: "t-ada", status: "published", hoa_member: ada, term_start: null, term_end: null },
    { id: "t-rex", status: "published", hoa_member: rex, term_start: null, term_end: null },
    { id: "t-arc", status: "published", hoa_member: arc, term_start: null, term_end: null },
  ]);
  db.seed("hoa_channels", [{ id: "ch-1", organization: ORG }]);
  db.seed("hoa_channel_members", [
    { id: "cm-rex", channel: "ch-1", user: "u-rex", role: "admin" },
    { id: "cm-cal", channel: "ch-1", user: "u-cal", role: "admin" },
    { id: "cm-oz", channel: "ch-1", user: "u-oz", role: "admin" },
  ]);
  db.seed("hoa_units", [{ id: "unit-1", unit_number: "1A", status: "occupied", organization: ORG }]);
  db.seed("hoa_member_units", [
    { id: "mu-ada", member_id: ada, unit_id: "unit-1", start_date: "2025-01-01", end_date: null },
    { id: "mu-rex", member_id: rex, unit_id: "unit-1", start_date: "2020-01-01", end_date: "2024-12-31" },
  ]);

  sessionUser = "u-ada";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("useRuntimeConfig", () => ({
    public: { directusRoleHoaAdmin: HOA_ADMIN, directusRoleAppAdmin: "role-app-admin" },
  }));
  vi.stubGlobal("getTypedDirectus", () => client);
  vi.stubGlobal("getUserSession", async () => ({ user: { id: sessionUser } }));
  vi.stubGlobal("requireUserSession", async () => ({ user: { id: sessionUser } }));
  vi.stubGlobal("readBody", async () => ({ orgId: ORG }));
  // Nobody here is an org admin by checkAdminAccess (which already filters status).
  vi.stubGlobal("checkAdminAccess", async () => ({ isAdmin: false }));
  vi.stubGlobal("requireAuthenticatedUser", async () => ({ userId: sessionUser }));
  vi.stubGlobal("getQuery", () => ({ orgId: ORG, unitId: "unit-1" }));
});

describe("board standing — isActiveBoardMember (channels, Board Room, notices)", () => {
  it("a removed or archived officer whose term was never ended is not board; an active one is", async () => {
    expect(await isActiveBoardMember(client as any, "u-rex", ORG)).toBe(false);
    expect(await isActiveBoardMember(client as any, "u-arc", ORG)).toBe(false);
    expect(await isActiveBoardMember(client as any, "u-ada", ORG)).toBe(true);
    expectActiveOnly();
  });
});

describe("channel enrollment — getOrgChannelEnrollees", () => {
  it("a new channel enrolls the active officer, not the removed ones", async () => {
    const users = (await getOrgChannelEnrollees(client as any, ORG)).map((e) => e.user);
    expect(users).toEqual(["u-ada"]);
    const terms = db.ops.find((o) => o.op === "readItems" && o.collection === "hoa_board_members");
    expect(terms.query.filter.hoa_member).toMatchObject({ status: { _eq: "active" } });
  });
});

describe("channel management — requireChannelManager's channel-admin seat", () => {
  it("counts only with an active membership in the channel's own org", async () => {
    await expect(requireChannelManager(event, client as any, "u-rex", "ch-1")).rejects.toMatchObject({ statusCode: 403 });
    await expect(requireChannelManager(event, client as any, "u-oz", "ch-1")).rejects.toMatchObject({ statusCode: 403 });
    expect(await requireChannelManager(event, client as any, "u-cal", "ch-1")).toBe(ORG);
    expectActiveOnly();
  });
});

describe("storage library — resolveStorageContext", () => {
  it("refuses a former HOA Admin; an active HOA Admin is still the library's admin", async () => {
    sessionUser = "u-rex";
    await expect(resolveStorageContext(event, ORG)).rejects.toMatchObject({ statusCode: 403 });
    sessionUser = "u-ada";
    const ctx = await resolveStorageContext(event, ORG);
    expect(ctx).toMatchObject({ userId: "u-ada", orgId: ORG, isAdmin: true, canBrowseLibrary: true });
    expectActiveOnly();
  });
});

describe("caller library — callerCommunities", () => {
  it("a removed member can't file into the old community's library; an active one can", async () => {
    sessionUser = "u-rex";
    expect(await callerCommunities(event)).toEqual([]);
    await expect(assertFolderInCallerLibrary(event, "docs-lenox")).rejects.toMatchObject({ statusCode: 403 });
    sessionUser = "u-ada";
    expect(await callerCommunities(event)).toEqual([{ organization: ORG, root: "root-lenox" }]);
    await expect(assertFolderInCallerLibrary(event, "docs-lenox")).resolves.toBeUndefined();
    expectActiveOnly();
  });
});

describe("unit records — /api/hoa/units/records", () => {
  it("refuses a removed former occupant who also kept a board term; an active occupant sees member records", async () => {
    sessionUser = "u-rex";
    await expect(unitRecords(event)).rejects.toMatchObject({ statusCode: 403 });
    sessionUser = "u-ada";
    db.table("hoa_board_members").length = 0; // Ada as a plain occupant
    const res = await unitRecords(event);
    expect(res.access).toBe("member");
    expect(res.occupants.map((o: any) => o.id)).toContain("mu-ada");
    expectActiveOnly();
  });
});
