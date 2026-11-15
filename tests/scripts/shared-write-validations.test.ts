/**
 * scripts/lib/shared-write-validations.ts: one validation per shared write, so
 * a role holding two policies gets the union of what they allow.
 *
 * `passes` evaluates a validation the way Directus 11.13.4 does
 * (packages/utils/shared/generate-joi.ts, validate-payload.ts): a field absent
 * from the payload is not checked, `_submitted` only needs the key, `_in`
 * compares each value strictly (null equals null), a nested path needs an
 * object, `_and` needs every part, `_or` any. A role's write is allowed when
 * every one of its policies that has a rule passes (Directus ANDs them).
 */
import { describe, expect, it } from "vitest";
import { ADMIN_MEMBERSHIP, ANY_MEMBERSHIP, MANAGER_MEMBERSHIP, isRemovedAdminRule, pinAdminUpdate } from "../../scripts/lib/admin-scope-perms";
import { baseOf, branchKind, combineValidations, guard, planSharedValidations, splitCombined, type PolicyKind } from "../../scripts/lib/shared-write-validations";

type Membership = { organization: string; admin_of: string | null; manager_of: string | null };
type User = { id: string; memberships: Membership[] };

function resolve(value: unknown, user: User): unknown {
  if (value === "$CURRENT_USER") return user.id;
  if (typeof value === "string" && value.startsWith("$CURRENT_USER.hoa_members.")) {
    const field = value.slice("$CURRENT_USER.hoa_members.".length) as keyof Membership;
    return user.memberships.map((m) => m[field] ?? null);
  }
  return value;
}

function passes(filter: unknown, payload: Record<string, unknown>, user: User): boolean {
  if (!filter || typeof filter !== "object" || !Object.keys(filter).length) return true;
  const f = filter as Record<string, any>;
  if (Array.isArray(f._and)) return f._and.every((p: unknown) => passes(p, payload, user));
  if (Array.isArray(f._or)) return !f._or.length || f._or.some((p: unknown) => passes(p, payload, user));
  return Object.entries(f).every(([field, cond]) => {
    const op = Object.keys(cond)[0]!;
    if (op === "_submitted") return field in payload;
    if (!(field in payload)) return true;
    const v = payload[field];
    if (!op.startsWith("_")) return !!v && typeof v === "object" && passes(cond, v as Record<string, unknown>, user);
    const want = resolve(cond[op], user);
    if (op === "_eq") return v === want;
    if (op === "_in") return (Array.isArray(want) ? want : [want]).some((w) => w === v);
    if (op === "_nnull") return v !== null;
    throw new Error(`operator ${op} not modelled`);
  });
}

const ROLE_POLICIES: Record<string, PolicyKind[]> = {
  member: ["member"],
  admin: ["admin", "member"],
  manager: ["manager", "member"],
};

function allowed(role: string, rules: Partial<Record<PolicyKind, unknown>>, payload: Record<string, unknown>, user: User): boolean {
  const held = ROLE_POLICIES[role]!.filter((k) => k in rules);
  if (!held.length) return false;
  return held.every((k) => passes(rules[k], payload, user));
}

/** Every policy's rule carries the combined validation. */
function after(bases: Partial<Record<PolicyKind, unknown>>): Partial<Record<PolicyKind, unknown>> {
  const c = combineValidations(bases);
  if (!c || !("validation" in c)) throw new Error("expected a combined validation");
  return Object.fromEntries(Object.keys(bases).map((k) => [k, c.validation]));
}

// Live 2026-11-15.
const COMMENTS_CREATE = {
  member: { _and: [{ organization: { _in: ANY_MEMBERSHIP } }, { is_internal: { _eq: false } }] },
  admin: { organization: { _in: ADMIN_MEMBERSHIP } },
  manager: { organization: { _in: MANAGER_MEMBERSHIP } },
};
const REQUESTS_CREATE = {
  member: {
    _and: [
      { organization: { _in: ANY_MEMBERSHIP } },
      { type: { _in: ["maintenance", "arc", "complaint", "question"] } },
      { submitted_by: { _eq: "$CURRENT_USER" } },
    ],
  },
  admin: { organization: { _in: ADMIN_MEMBERSHIP } },
};
const PETS_CREATE = {
  member: { member_id: { _in: "$CURRENT_USER.hoa_members.id" } },
  admin: { member_id: { organization: { _in: ADMIN_MEMBERSHIP } } },
};

// The test account: admin of PT, owner in LR. A resident of LR. A manager of PT.
const ADMIN: User = { id: "u-admin", memberships: [{ organization: "PT", admin_of: "PT", manager_of: null }, { organization: "LR", admin_of: null, manager_of: null }] };
const RESIDENT: User = { id: "u-res", memberships: [{ organization: "LR", admin_of: null, manager_of: null }] };
const MANAGER: User = { id: "u-pm", memberships: [{ organization: "PT", admin_of: null, manager_of: "PT" }] };

describe("Directus ANDs the policies: what went wrong", () => {
  it("an admin could not post an internal note in their own community, nor comment where they are only a member", () => {
    expect(allowed("admin", COMMENTS_CREATE, { organization: "PT", is_internal: true }, ADMIN)).toBe(false);
    expect(allowed("admin", COMMENTS_CREATE, { organization: "LR", is_internal: false }, ADMIN)).toBe(false);
  });

  it("an admin could not open a task request", () => {
    expect(allowed("admin", REQUESTS_CREATE, { organization: "PT", type: "task", submitted_by: "u-admin" }, ADMIN)).toBe(false);
  });
});

describe("combined: each role gets the union", () => {
  const comments = after(COMMENTS_CREATE);
  const requests = after(REQUESTS_CREATE);

  it("an admin posts internal notes in their own community and member comments where they live", () => {
    expect(allowed("admin", comments, { organization: "PT", is_internal: true }, ADMIN)).toBe(true);
    expect(allowed("admin", comments, { organization: "LR", is_internal: false }, ADMIN)).toBe(true);
    expect(allowed("admin", comments, { organization: "LR", is_internal: true }, ADMIN)).toBe(false);
    expect(allowed("admin", comments, { organization: "ELSEWHERE", is_internal: false }, ADMIN)).toBe(false);
  });

  it("an admin opens a task request in their community, and only member requests elsewhere", () => {
    expect(allowed("admin", requests, { organization: "PT", type: "task", submitted_by: "u-admin" }, ADMIN)).toBe(true);
    expect(allowed("admin", requests, { organization: "LR", type: "task", submitted_by: "u-admin" }, ADMIN)).toBe(false);
    expect(allowed("admin", requests, { organization: "LR", type: "question", submitted_by: "u-admin" }, ADMIN)).toBe(true);
  });

  it("a manager gets internal notes where they manage", () => {
    expect(allowed("manager", comments, { organization: "PT", is_internal: true }, MANAGER)).toBe(true);
    expect(allowed("manager", comments, { organization: "LR", is_internal: false }, MANAGER)).toBe(false);
  });

  it("a resident gets exactly what they had", () => {
    const payloads = [
      { organization: "LR", is_internal: false },
      { organization: "LR", is_internal: true },
      { organization: "PT", is_internal: false },
      { is_internal: true }, // no organization: the admin branch must not pass vacuously
      { organization: null, is_internal: true }, // null: admin_of is null on their membership
      {},
    ];
    for (const p of payloads) {
      expect(allowed("member", comments, p, RESIDENT), JSON.stringify(p)).toBe(allowed("member", COMMENTS_CREATE, p, RESIDENT));
    }
    const reqs = [
      { organization: "LR", type: "violation", submitted_by: "u-res" },
      { type: "violation", submitted_by: "someone-else" },
      { organization: null, type: "task", submitted_by: "u-res" },
      { organization: "LR", type: "question", submitted_by: "u-res" },
    ];
    for (const p of reqs) {
      expect(allowed("member", requests, p, RESIDENT), JSON.stringify(p)).toBe(allowed("member", REQUESTS_CREATE, p, RESIDENT));
    }
  });
});

describe("combineValidations", () => {
  it("keeps the member branch first and guards the others", () => {
    const c = combineValidations(COMMENTS_CREATE) as { validation: { _or: unknown[] } };
    expect(c.validation._or).toEqual([COMMENTS_CREATE.member, guard(COMMENTS_CREATE.admin), guard(COMMENTS_CREATE.manager)]);
  });

  it("does nothing without a member rule, or when the validations already agree", () => {
    expect(combineValidations({ admin: COMMENTS_CREATE.admin, manager: COMMENTS_CREATE.manager })).toBeNull();
    const same = { channel: { _in: "$CURRENT_USER.channel_memberships.channel" } };
    expect(combineValidations({ member: same, admin: same })).toBeNull();
    expect(combineValidations({ member: COMMENTS_CREATE.member, admin: null })).toBeNull();
  });

  it("refuses a branch reached through any membership (before the admin scope) or through a relation", () => {
    expect(combineValidations({ member: COMMENTS_CREATE.member, admin: { organization: { _in: ANY_MEMBERSHIP } } })).toHaveProperty("skip");
    expect(combineValidations(PETS_CREATE)).toHaveProperty("skip");
  });

  it("refuses a branch scoped by another role's field", () => {
    expect(combineValidations({ member: COMMENTS_CREATE.member, admin: { organization: { _in: MANAGER_MEMBERSHIP } } })).toHaveProperty("skip");
  });
});

describe("baseOf and splitCombined", () => {
  const combined = (combineValidations(COMMENTS_CREATE) as { validation: unknown }).validation;

  it("finds each policy's own validation inside a combined one", () => {
    expect(baseOf(combined, "member")).toEqual(COMMENTS_CREATE.member);
    expect(baseOf(combined, "admin")).toEqual(COMMENTS_CREATE.admin);
    expect(baseOf(combined, "manager")).toEqual(COMMENTS_CREATE.manager);
    expect(splitCombined(combined)?.branches).toHaveLength(2);
  });

  it("returns a plain validation as it is, and undefined for a branch that is not there", () => {
    expect(baseOf(COMMENTS_CREATE.member, "member")).toEqual(COMMENTS_CREATE.member);
    expect(baseOf(null, "admin")).toBeNull();
    const memberAndAdmin = (combineValidations({ member: COMMENTS_CREATE.member, admin: COMMENTS_CREATE.admin }) as { validation: unknown }).validation;
    expect(baseOf(memberAndAdmin, "manager")).toBeUndefined();
  });

  it("does not read an ordinary _or as combined", () => {
    expect(splitCombined({ _or: [{ a: { _eq: 1 } }, { b: { _eq: 2 } }] })).toBeNull();
  });

  it("names a branch by its scope field", () => {
    expect(branchKind(COMMENTS_CREATE.admin)).toBe("admin");
    expect(branchKind({ _and: [{ organization: { _in: MANAGER_MEMBERSHIP } }, { user: { _eq: "$CURRENT_USER" } }] })).toBe("manager");
    expect(branchKind(COMMENTS_CREATE.member)).toBeNull();
  });
});

describe("planSharedValidations", () => {
  const live = [
    { id: 1, kind: "member" as const, collection: "hoa_comments", action: "create", validation: COMMENTS_CREATE.member },
    { id: 2, kind: "admin" as const, collection: "hoa_comments", action: "create", validation: COMMENTS_CREATE.admin },
    { id: 3, kind: "manager" as const, collection: "hoa_comments", action: "create", validation: COMMENTS_CREATE.manager },
    { id: 4, kind: "member" as const, collection: "hoa_pets", action: "create", validation: PETS_CREATE.member },
    { id: 5, kind: "admin" as const, collection: "hoa_pets", action: "create", validation: PETS_CREATE.admin },
    { id: 6, kind: "admin" as const, collection: "hoa_comments", action: "read", validation: null },
  ];

  it("writes the combined validation on every rule of the pair, and reports what it left", () => {
    const plan = planSharedValidations(live);
    expect(plan.changes.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(new Set(plan.changes.map((c) => JSON.stringify(c.validation))).size).toBe(1);
    expect(plan.combined).toEqual(["hoa_comments.create"]);
    expect(plan.skipped).toEqual(["hoa_pets.create: the admin validation is not scoped by its own field on organization"]);
  });

  it("is a no-op on its own output", () => {
    const plan = planSharedValidations(live);
    const applied = live.map((r) => ({ ...r, validation: plan.changes.find((c) => c.id === r.id)?.validation ?? r.validation }));
    expect(planSharedValidations(applied).changes).toEqual([]);
  });

  it("gives each policy its own back when the pair no longer needs combining", () => {
    const plan = planSharedValidations(live);
    const applied = live.map((r) => ({ ...r, validation: plan.changes.find((c) => c.id === r.id)?.validation ?? r.validation }));
    const memberOnly = applied.filter((r) => r.id === 1);
    expect(planSharedValidations(memberOnly).changes).toEqual([
      { id: 1, kind: "member", collection: "hoa_comments", action: "create", validation: COMMENTS_CREATE.member },
    ]);
  });
});

describe("admin writes that could leave the community", () => {
  it("removes the meeting-attachment create and update", () => {
    expect(isRemovedAdminRule("hoa_meetings_files", "create")).toBe(true);
    expect(isRemovedAdminRule("hoa_meetings_files", "update")).toBe(true);
    expect(isRemovedAdminRule("hoa_meetings_files", "delete")).toBe(false);
  });

  it("pins the template and attendee updates to their filter", () => {
    const filter = { meeting: { organization: { _in: ADMIN_MEMBERSHIP } } };
    const rule = { collection: "hoa_meeting_attendees", action: "update", permissions: filter, validation: null };
    expect(pinAdminUpdate(rule).validation).toEqual(filter);
    expect(pinAdminUpdate({ ...rule, action: "delete" }).validation).toBeNull();
    expect(pinAdminUpdate({ ...rule, collection: "directus_files" }).validation).toBeNull();
    // An attendee edit that names a meeting by id is refused; one that does not, passes.
    expect(passes(filter, { meeting: "m-1" }, ADMIN)).toBe(false);
    expect(passes(filter, { attended: true }, ADMIN)).toBe(true);
  });
});
