/**
 * The HOA Admin policy's scope swap (scripts/lib/admin-scope-perms.ts).
 */
import { describe, it, expect } from "vitest";
import { ADMIN_MEMBERSHIP, ANY_MEMBERSHIP, mentionsAnyMembership, scopeAdminPermission, toAdminScope } from "../../scripts/lib/admin-scope-perms";
import { FOLDER_OF_MY_ORG } from "../../scripts/lib/folder-org-filters";

describe("toAdminScope", () => {
  it("swaps the plain org filter", () => {
    expect(toAdminScope({ organization: { _in: ANY_MEMBERSHIP } })).toEqual({ organization: { _in: ADMIN_MEMBERSHIP } });
  });

  it("swaps inside nested relations, _and and _or", () => {
    const f = {
      _or: [
        { channel: { _in: "$CURRENT_USER.channel_memberships.channel" } },
        { channel: { _and: [{ organization: { _in: ANY_MEMBERSHIP } }, { is_private: { _neq: true } }] } },
      ],
    };
    const out = toAdminScope(f);
    expect(JSON.stringify(out)).not.toContain(ANY_MEMBERSHIP);
    expect(out._or[0]).toEqual({ channel: { _in: "$CURRENT_USER.channel_memberships.channel" } });
    expect(out._or[1].channel._and[0]).toEqual({ organization: { _in: ADMIN_MEMBERSHIP } });
  });

  it("swaps the folder rule's org path", () => {
    expect(toAdminScope({ folder: FOLDER_OF_MY_ORG })).toEqual({ folder: { hoa_organizations: { id: { _in: ADMIN_MEMBERSHIP } } } });
  });

  it("leaves every other variable alone, and does not mutate its input", () => {
    const f = { _and: [{ hoa_member: { _in: "$CURRENT_USER.hoa_members.id" } }, { user: { _eq: "$CURRENT_USER" } }] };
    const copy = JSON.parse(JSON.stringify(f));
    expect(toAdminScope(f)).toEqual(copy);
    const g = { organization: { _in: ANY_MEMBERSHIP } };
    toAdminScope(g);
    expect(g.organization._in).toBe(ANY_MEMBERSHIP);
  });

  it("passes null and {} through", () => {
    expect(toAdminScope(null)).toBeNull();
    expect(toAdminScope({})).toEqual({});
  });
});

describe("scopeAdminPermission", () => {
  it("swaps permissions and validation, nothing else", () => {
    const p = { action: "update", fields: ["*"], permissions: { organization: { _in: ANY_MEMBERSHIP } }, validation: { organization: { _in: ANY_MEMBERSHIP } } };
    const out = scopeAdminPermission(p);
    expect(out.permissions).toEqual({ organization: { _in: ADMIN_MEMBERSHIP } });
    expect(out.validation).toEqual({ organization: { _in: ADMIN_MEMBERSHIP } });
    expect(out.fields).toEqual(["*"]);
    expect(mentionsAnyMembership(out.permissions)).toBe(false);
    expect(mentionsAnyMembership(p.permissions)).toBe(true);
  });
});
