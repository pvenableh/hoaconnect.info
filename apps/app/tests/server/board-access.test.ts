import { describe, it, expect, vi, beforeEach } from "vitest";
import type { H3Event } from "h3";
import { getBoardPosition, resolveActors } from "#core/server/utils/board-access";

const ORG = "org-1";
const event = {} as H3Event;

let session: { user?: { id: string } } | null;
let directusRequest: ReturnType<typeof vi.fn>;
let adminResult: { isAdmin: boolean };
let membershipResult: { isMember: boolean };
let managerGrants: Record<string, boolean> | null;

beforeEach(() => {
  session = { user: { id: "u1" } };
  directusRequest = vi.fn(async () => []);
  adminResult = { isAdmin: false };
  membershipResult = { isMember: true };
  managerGrants = null;

  vi.stubGlobal("getUserSession", async () => session);
  vi.stubGlobal("getTypedDirectus", () => ({ request: directusRequest }));
  vi.stubGlobal("checkAdminAccess", async () => adminResult);
  vi.stubGlobal("checkMembership", async () => membershipResult);
  vi.stubGlobal("getManagerGrants", async () => managerGrants);
});

describe("getBoardPosition", () => {
  it("returns null without a session", async () => {
    session = null;
    expect(await getBoardPosition(event, ORG)).toBeNull();
    expect(directusRequest).not.toHaveBeenCalled();
  });

  it("returns null when the caller is not an org member", async () => {
    directusRequest.mockResolvedValueOnce([]); // getMemberId → no member
    expect(await getBoardPosition(event, ORG)).toBeNull();
    expect(directusRequest).toHaveBeenCalledTimes(1);
  });

  it("returns null when the member holds no current-term office", async () => {
    directusRequest
      .mockResolvedValueOnce([{ id: "m1" }]) // getMemberId
      .mockResolvedValueOnce([]); // board lookup → none
    expect(await getBoardPosition(event, ORG)).toBeNull();
  });

  it("returns the current-term office title", async () => {
    directusRequest
      .mockResolvedValueOnce([{ id: "m1" }]) // getMemberId
      .mockResolvedValueOnce([{ title: "treasurer" }]); // board lookup
    expect(await getBoardPosition(event, ORG)).toBe("treasurer");
  });

  it("fails closed (null) when a lookup throws", async () => {
    directusRequest.mockRejectedValueOnce(new Error("boom"));
    expect(await getBoardPosition(event, ORG)).toBeNull();
  });
});

describe("resolveActors", () => {
  it("a plain member with no office gets just ['member']", async () => {
    // getBoardPosition: getMemberId → member, board lookup → none; team-lead → none
    directusRequest
      .mockResolvedValueOnce([{ id: "m1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    expect(await resolveActors(event, ORG)).toEqual(["member"]);
  });

  it("stacks admin + board office + team lead hats", async () => {
    adminResult = { isAdmin: true };
    directusRequest
      .mockResolvedValueOnce([{ id: "m1" }]) // getMemberId
      .mockResolvedValueOnce([{ title: "president" }]) // board lookup
      .mockResolvedValueOnce([{ id: "tm1" }]); // team-lead lookup
    const actors = await resolveActors(event, ORG);
    expect(actors).toContain("admin");
    expect(actors).toContain("member");
    expect(actors).toContain("board_president");
    expect(actors).toContain("team_lead");
  });

  it("adds property_manager when manager grants resolve", async () => {
    managerGrants = { projects: true };
    directusRequest
      .mockResolvedValueOnce([{ id: "m1" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const actors = await resolveActors(event, ORG);
    expect(actors).toContain("property_manager");
  });
});
