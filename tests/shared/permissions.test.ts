import { describe, it, expect } from "vitest";
import {
  type Actor,
  type Capability,
  CAPABILITY_MATRIX,
  boardTitleToActor,
  hasCapability,
  capabilitiesFor,
} from "#core/shared/permissions";

describe("boardTitleToActor", () => {
  it("maps each board office title to its actor", () => {
    expect(boardTitleToActor("president")).toBe("board_president");
    expect(boardTitleToActor("vice_president")).toBe("board_vp");
    expect(boardTitleToActor("treasurer")).toBe("board_treasurer");
    expect(boardTitleToActor("secretary")).toBe("board_secretary");
    expect(boardTitleToActor("director")).toBe("board_member");
  });

  it("returns null for unknown / missing titles", () => {
    expect(boardTitleToActor(null)).toBeNull();
    expect(boardTitleToActor(undefined)).toBeNull();
    expect(boardTitleToActor("emperor")).toBeNull();
  });
});

describe("hasCapability", () => {
  it("admin is a super-actor — holds every capability", () => {
    for (const cap of Object.keys(CAPABILITY_MATRIX) as Capability[]) {
      expect(hasCapability(["admin"], cap)).toBe(true);
    }
  });

  it("treasurer can read and write money", () => {
    expect(hasCapability(["board_treasurer"], "money:read")).toBe(true);
    expect(hasCapability(["board_treasurer"], "money:write")).toBe(true);
  });

  it("president has money read oversight but not write", () => {
    expect(hasCapability(["board_president"], "money:read")).toBe(true);
    expect(hasCapability(["board_president"], "money:write")).toBe(false);
  });

  it("president and VP can approve milestones; a plain member cannot", () => {
    expect(hasCapability(["board_president"], "milestone:approve")).toBe(true);
    expect(hasCapability(["board_vp"], "milestone:approve")).toBe(true);
    expect(hasCapability(["member"], "milestone:approve")).toBe(false);
  });

  it("team lead can write projects and approve milestones", () => {
    expect(hasCapability(["team_lead"], "projects:write")).toBe(true);
    expect(hasCapability(["team_lead"], "milestone:approve")).toBe(true);
  });

  it("ORs across multiple hats — the most permissive wins", () => {
    const hats: Actor[] = ["member", "board_treasurer"];
    expect(hasCapability(hats, "money:write")).toBe(true);
  });

  it("members:manage and settings:manage are admin-only", () => {
    expect(hasCapability(["board_president"], "members:manage")).toBe(false);
    expect(hasCapability(["property_manager"], "settings:manage")).toBe(false);
    expect(hasCapability(["admin"], "members:manage")).toBe(true);
  });

  it("ignores unknown actors and empty actor sets", () => {
    expect(hasCapability([], "projects:read")).toBe(false);
    expect(hasCapability(["nobody" as Actor], "projects:read")).toBe(false);
  });
});

describe("capabilitiesFor", () => {
  it("returns the full matrix for admin", () => {
    const all = Object.keys(CAPABILITY_MATRIX) as Capability[];
    expect(capabilitiesFor(["admin"]).sort()).toEqual([...all].sort());
  });

  it("unions capabilities across hats without duplicates", () => {
    const caps = capabilitiesFor(["board_treasurer", "team_lead"]);
    expect(caps).toContain("money:read");
    expect(caps).toContain("money:write");
    expect(caps).toContain("projects:write");
    expect(caps).toContain("milestone:approve");
    expect(new Set(caps).size).toBe(caps.length);
  });

  it("a plain member gets only the broad reads", () => {
    const caps = capabilitiesFor(["member"]);
    expect(caps).toContain("projects:read");
    expect(caps).toContain("documents:read");
    expect(caps).not.toContain("money:read");
    expect(caps).not.toContain("milestone:approve");
  });
});
