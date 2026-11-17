/**
 * Where an HOA Member writes (scripts/lib/admin-scope-perms.ts, "HOA Member";
 * docs/spec-member-restrictions.md). The rules below are the member rules as
 * the per-feature scripts write them (create-comments-, create-polls-,
 * create-requests-collections.ts), read back live on 2026-11-17 before the
 * shared validations were combined.
 */
import { describe, it, expect } from "vitest";
import {
  ACTIVE_MEMBERSHIP,
  ADMIN_MEMBERSHIP,
  ANY_MEMBERSHIP,
  ENROLLED_CHANNELS,
  POSTING_CHANNELS,
  POSTING_MEMBERSHIP,
  chatCreateValidation,
  memberScopePath,
  scopeMemberPermission,
} from "../../scripts/lib/admin-scope-perms";
import { guard, planSharedValidations, splitCombined } from "../../scripts/lib/shared-write-validations";

const org = { organization: { _in: ANY_MEMBERSHIP } };
const me = (field: string) => ({ [field]: { _eq: "$CURRENT_USER" } });
const rule = (collection: string, action: string, permissions: unknown, validation: unknown) => ({ collection, action, permissions, validation });

const MEMBER_RULES = [
  rule("hoa_comments", "create", {}, { _and: [org, { is_internal: { _eq: false } }] }),
  rule("hoa_comments", "read", { _and: [org, { is_internal: { _eq: false } }, { status: { _neq: "deleted" } }] }, null),
  rule("hoa_comments", "update", { _and: [org, me("user_created")] }, { _and: [org, me("user_created")] }),
  rule("hoa_comments", "delete", { _and: [org, me("user_created")] }, null),
  rule("hoa_reactions", "create", {}, org),
  rule("hoa_reactions", "read", org, null),
  rule("hoa_reactions", "delete", { _and: [org, me("user")] }, null),
  rule("hoa_comment_reports", "create", {}, { _and: [org, me("reporter")] }),
  rule("hoa_comment_reports", "read", { _and: [org, me("reporter")] }, null),
  rule("hoa_poll_votes", "create", {}, { _and: [org, me("user")] }),
  rule("hoa_poll_votes", "read", org, null),
  rule("hoa_poll_votes", "delete", { _and: [org, me("user")] }, null),
  rule("hoa_requests", "create", {}, { _and: [org, { type: { _in: ["maintenance", "arc", "complaint", "question"] } }, me("submitted_by")] }),
  rule("hoa_requests", "read", { _and: [org, { _or: [me("submitted_by"), { member: me("user") }] }] }, null),
  rule("hoa_requests", "update", { _and: [org, me("submitted_by"), { type: { _neq: "violation" } }] }, null),
];

const POSTING = ["hoa_comments", "hoa_reactions", "hoa_comment_reports"];
const PRIVATE = ["hoa_requests", "hoa_poll_votes"];
const json = (v: unknown) => JSON.stringify(v ?? null);
const scoped = MEMBER_RULES.map(scopeMemberPermission);

describe("HOA Member writes", () => {
  it("every create and update on the posting collections names posts_in, and nothing else", () => {
    const writes = scoped.filter((r) => POSTING.includes(r.collection) && (r.action === "create" || r.action === "update"));
    expect(writes.map((r) => `${r.collection}.${r.action}`)).toEqual([
      "hoa_comments.create", "hoa_comments.update", "hoa_reactions.create", "hoa_comment_reports.create",
    ]);
    for (const r of writes) {
      const both = json(r.permissions) + json(r.validation);
      expect(both, `${r.collection}.${r.action}`).toContain(POSTING_MEMBERSHIP);
      expect(both, `${r.collection}.${r.action}`).not.toContain(ANY_MEMBERSHIP);
      expect(both).not.toContain(ACTIVE_MEMBERSHIP);
    }
  });

  it("requests (create and edit their own) and poll votes name active_in", () => {
    const writes = scoped.filter((r) => PRIVATE.includes(r.collection) && (r.action === "create" || r.action === "update"));
    expect(writes.map((r) => `${r.collection}.${r.action}`)).toEqual(["hoa_poll_votes.create", "hoa_requests.create", "hoa_requests.update"]);
    for (const r of writes) {
      const both = json(r.permissions) + json(r.validation);
      expect(both, `${r.collection}.${r.action}`).toContain(ACTIVE_MEMBERSHIP);
      expect(both).not.toContain(ANY_MEMBERSHIP);
      expect(both).not.toContain(POSTING_MEMBERSHIP);
    }
  });

  it("reads and deleting one's own rows still name any membership, unchanged", () => {
    const kept = MEMBER_RULES.filter((r) => r.action === "read" || r.action === "delete");
    expect(kept.length).toBe(8);
    for (const r of kept) {
      expect(scopeMemberPermission(r), `${r.collection}.${r.action}`).toEqual(r);
      expect(memberScopePath(r.collection, r.action)).toBe(ANY_MEMBERSHIP);
    }
  });

  it("only the path changes: the rest of each filter is kept", () => {
    const create = scoped.find((r) => r.collection === "hoa_requests" && r.action === "create")!;
    expect(create.validation).toEqual({
      _and: [{ organization: { _in: ACTIVE_MEMBERSHIP } }, { type: { _in: ["maintenance", "arc", "complaint", "question"] } }, me("submitted_by")],
    });
  });

  it("leaves other collections alone, and is idempotent", () => {
    const other = rule("hoa_documents", "create", {}, org);
    expect(scopeMemberPermission(other)).toBe(other);
    for (const r of scoped) expect(scopeMemberPermission(r)).toEqual(r);
  });

  it("a shared write is combined again around the member's scoped branch, with the admin's kept", () => {
    const memberCreate = scoped.find((r) => r.collection === "hoa_reactions" && r.action === "create")!;
    const adminBase = { organization: { _in: ADMIN_MEMBERSHIP } };
    const plan = planSharedValidations([
      { id: 1, kind: "member", collection: "hoa_reactions", action: "create", validation: memberCreate.validation },
      { id: 2, kind: "admin", collection: "hoa_reactions", action: "create", validation: { _or: [org, guard(adminBase)] } },
    ]);
    expect(plan.combined).toEqual(["hoa_reactions.create"]);
    const want = { _or: [{ organization: { _in: POSTING_MEMBERSHIP } }, guard(adminBase)] };
    expect(plan.changes.map((c) => [c.id, c.validation])).toEqual([[1, want], [2, want]]);
    expect(splitCombined(want)?.member).toEqual({ organization: { _in: POSTING_MEMBERSHIP } });
  });
});

describe("chat creates", () => {
  it("read through the channel rows' posts_to once the posting scope is ready, the enrolment check before", () => {
    expect(chatCreateValidation(true)).toEqual({ channel: { _in: POSTING_CHANNELS } });
    expect(chatCreateValidation(false)).toEqual({ channel: { _in: ENROLLED_CHANNELS } });
    expect(POSTING_CHANNELS).toBe("$CURRENT_USER.channel_memberships.posts_to");
  });
});
