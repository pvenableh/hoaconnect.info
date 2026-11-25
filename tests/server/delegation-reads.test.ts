/**
 * The delegation reads as batch specs (core/server/utils/delegation.ts): the
 * same reads loadMemberHolder, loadTeamHolder, readHolderRows and the
 * area-grants list made, and the same holders and 404s from their rows.
 */
import { describe, it, expect, vi } from "vitest";
import {
  holderRowsSpec,
  memberHolderFrom,
  memberHolderSpec,
  openGrantsSpec,
  teamHolderFrom,
  teamHolderSpec,
} from "#core/server/utils/delegation";

vi.stubGlobal("createError", (o: any) => Object.assign(new Error(o.message), o));

describe("holder specs", () => {
  it("read a member or team by id through the org filter, one row", () => {
    expect(memberHolderSpec("org-1", "m-1")).toEqual({
      collection: "hoa_members",
      filter: { id: { _eq: "m-1" }, organization: { _eq: "org-1" } },
      fields: ["id", "first_name", "last_name", "email", "status", "role", "user"],
      limit: 1,
    });
    expect(teamHolderSpec("org-1", "t-1")).toEqual({
      collection: "hoa_teams",
      filter: { id: { _eq: "t-1" }, organization: { _eq: "org-1" } },
      fields: ["id", "name", "status"],
      limit: 1,
    });
  });

  it("read every row for the holder in the community, newest first, with who granted and ended each", () => {
    const spec = holderRowsSpec("org-1", { kind: "team", id: "t-1" });
    expect(spec).toMatchObject({
      collection: "hoa_area_grants",
      filter: { organization: { _eq: "org-1" }, team: { _eq: "t-1" } },
      sort: ["-starts_at"],
      limit: -1,
    });
    expect(spec.fields).toContain("granted_by.first_name");
    expect(spec.fields).toContain("ended_by.email");
    expect(holderRowsSpec("org-1", { kind: "member", id: "m-1" }).filter).toEqual({ organization: { _eq: "org-1" }, member: { _eq: "m-1" } });
  });

  it("the list reads the community's rows not ended at now", () => {
    const now = new Date("2026-11-25T12:00:00.000Z");
    expect(openGrantsSpec("org-1", now)).toEqual({
      collection: "hoa_area_grants",
      filter: {
        organization: { _eq: "org-1" },
        _or: [{ ends_at: { _null: true } }, { ends_at: { _gt: "2026-11-25T12:00:00.000Z" } }],
      },
      fields: ["id", "organization", "area", "member", "team", "starts_at", "ends_at"],
      limit: -1,
    });
  });
});

describe("holders from rows", () => {
  it("names a member by membership name, else email; ids from expanded or raw relations", () => {
    expect(memberHolderFrom([{ id: 7, first_name: "Ada", last_name: "", email: "a@x", status: "active", role: { id: "r-1" }, user: "u-1" }])).toEqual({
      kind: "member", id: "7", name: "Ada", status: "active", roleId: "r-1", userId: "u-1",
    });
    expect(memberHolderFrom([{ id: "m-2", email: "b@x" }])).toMatchObject({ name: "b@x", status: null, roleId: null, userId: null });
  });

  it("a team defaults to active", () => {
    expect(teamHolderFrom([{ id: "t-1", name: "Grounds" }])).toEqual({ kind: "team", id: "t-1", name: "Grounds", status: "active" });
  });

  it("404 when there is no row", () => {
    expect(() => memberHolderFrom([])).toThrow(expect.objectContaining({ statusCode: 404 }));
    expect(() => teamHolderFrom(null)).toThrow(expect.objectContaining({ statusCode: 404 }));
  });
});
