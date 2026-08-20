/**
 * A community always gets an administrator of its own.
 *
 * `add-property.post.ts` used to make the creating agency the new community's
 * only HOA Admin. That single line is how a community ends up unable to run its
 * own account: when the manager leaves, the admin seat leaves with them, and
 * `planTransition` then has no safe way through — it returns
 * `no_eligible_successor` and refuses, correctly but far too late, since by then
 * the only person who could invite a board member is the manager being removed.
 *
 * A route test with the whole Directus/H3 surface mocked would be a lot of
 * scaffolding for one property. This is a promise-level guard instead, in the
 * style of `tests/shared/data-continuity.test.ts`: it reads the source and
 * asserts the guarantee is still expressed there. It cannot prove the invite is
 * delivered — the end-to-end run does that — but it does fail if someone makes
 * `boardAdmin` optional to unblock a form, which is the realistic way this gets
 * quietly undone.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
  join(process.cwd(), "core/server/api/billing-account/add-property.post.ts"),
  "utf8"
);

describe("add-property board-admin guarantee", () => {
  it("takes a board administrator, and does not accept a property without one", () => {
    expect(SOURCE).toMatch(/boardAdmin:\s*z\.object\(/);
    // The whole point: not `.optional()`, not defaulted away.
    const schemaBlock = SOURCE.slice(
      SOURCE.indexOf("boardAdmin: z.object("),
      SOURCE.indexOf("});", SOURCE.indexOf("boardAdmin: z.object("))
    );
    expect(schemaBlock).not.toMatch(/\.optional\(\)/);
    expect(schemaBlock).toMatch(/email\(/);
  });

  it("invites them into the community's own admin role, not a manager role", () => {
    expect(SOURCE).toContain('createItem("hoa_invitations"');
    const inviteBlock = SOURCE.slice(SOURCE.indexOf('createItem("hoa_invitations"'));
    expect(inviteBlock).toMatch(/role:\s*hoaAdminRoleId/);
    expect(inviteBlock).toMatch(/invitation_status:\s*"pending"/);
  });

  it("does not throw away a created property when the invitation fails", () => {
    // The org, its folder and the seat are already written and there is no
    // transaction across them. Throwing here would leave a half-made property
    // behind and the agency would simply create a second one.
    const inviteBlock = SOURCE.slice(SOURCE.indexOf("3b."), SOURCE.indexOf("4. Bump seats"));
    expect(inviteBlock).toMatch(/catch\s*\(/);
    expect(SOURCE).toMatch(/boardAdminInvite/);
  });
});
