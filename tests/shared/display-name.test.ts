/**
 * Which name other people see (core/shared/members/display-name.ts): the
 * membership's, which the admin keeps, before the login's, which the person
 * renames at will.
 */
import { describe, it, expect } from "vitest";
import { displayName, fullName, namesByUser, partsByUser, withMemberName } from "#core/shared/members/display-name";

describe("display names", () => {
  it("joins and trims, null when empty", () => {
    expect(fullName({ first_name: " Tester ", last_name: "Two" })).toBe("Tester Two");
    expect(fullName({ first_name: "", last_name: null })).toBeNull();
    expect(fullName(null)).toBeNull();
  });

  it("prefers the membership over the login, then the fallback", () => {
    expect(displayName({ first_name: "Tester", last_name: "Two" }, { first_name: "Abby", last_name: "Hoffman" })).toBe("Tester Two");
    expect(displayName(null, { first_name: "Abby", last_name: "Hoffman" })).toBe("Abby Hoffman");
    expect(displayName({ first_name: " " }, null, "A member")).toBe("A member");
  });

  it("one name per login, an active membership first, skipping rows without a user or a name", () => {
    const names = namesByUser([
      { user: "u1", first_name: "Old", last_name: "Name", status: "archived" },
      { user: { id: "u1" }, first_name: "Tester", last_name: "Two", status: "active" },
      { user: null, first_name: "No", last_name: "Login" },
      { user: "u2", first_name: "", last_name: "" },
    ]);
    expect(Object.fromEntries(names)).toEqual({ u1: "Tester Two" });
  });

  it("puts the membership's parts into a login object, leaving one without a membership alone", () => {
    const parts = partsByUser([{ user: "u1", first_name: "Tester", last_name: "Two", status: "active" }]);
    expect(withMemberName({ id: "u1", first_name: "Abby", last_name: "Hoffman", avatar: "a" } as any, parts)).toEqual({
      id: "u1", first_name: "Tester", last_name: "Two", avatar: "a",
    });
    const stranger = { id: "u9", first_name: "Platform", last_name: "Admin" };
    expect(withMemberName(stranger, parts)).toBe(stranger);
    expect(withMemberName(null, parts)).toBeNull();
  });
});
