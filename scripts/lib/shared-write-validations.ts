/**
 * One validation per shared write, so a role with two policies gets the
 * union of what they allow, not the intersection.
 *
 * Directus ANDs the validation of every permission that matches a write, from
 * every policy the user holds (11.13.4, api/src/permissions/modules/
 * process-payload: `validatePayload({ _and: validationRules }, payload)`; a
 * maintainer calls it intended in directus/directus#25162). Item filters are
 * ORed; validations are not. The HOA Admin and Property Manager roles also
 * carry the HOA Member policy (scripts/lib/admin-scope-perms.ts), so where
 * both policies write the same collection:
 *   - in their own community an admin's create had to pass the member rule
 *     too: no internal note (`is_internal = false`), no task or violation
 *     request (the member's type list);
 *   - in a community where they are only a member, it had to pass the admin
 *     rule too (`organization` in admin_of): no comment, vote or request.
 *
 * The fix puts one validation on every policy's rule for the pair: the
 * member's own, OR each other policy's own behind a guard. A role's AND of
 * identical rules is that OR. The guard requires `organization` to be
 * submitted and not null, so the branch is decided by its scope field
 * (admin_of, manager_of, …), which is null on every membership that is not
 * that kind. Without the guard a plain member's payload could pass the admin
 * branch by leaving `organization` out (Directus does not check an absent
 * field) or by sending null (`_in` a list of nulls holds for null).
 *
 * Only a branch that is scoped by a role's own field can be guarded; a pair
 * whose other branch reaches through any membership or follows a relation is
 * left as it is and reported.
 *
 * Pure: no Directus.
 */
import {
  ADMIN_MEMBERSHIP,
  ANY_MEMBERSHIP,
  COMMUNICATIONS_MEMBERSHIP,
  INQUIRIES_MEMBERSHIP,
  MANAGER_MEMBERSHIP,
} from "./admin-scope-perms";

export type PolicyKind = "member" | "admin" | "manager";

/** The scope fields a guarded branch may read through, and whose branch each is. */
const SCOPE_KIND: Record<string, Exclude<PolicyKind, "member">> = {
  [ADMIN_MEMBERSHIP]: "admin",
  [MANAGER_MEMBERSHIP]: "manager",
  [COMMUNICATIONS_MEMBERSHIP]: "manager",
  [INQUIRIES_MEMBERSHIP]: "manager",
};

export const ORG_GUARD = [{ organization: { _submitted: true } }, { organization: { _nnull: true } }] as const;

const json = (v: unknown) => JSON.stringify(v ?? null);
const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A branch behind the organization guard. */
export function guard(base: unknown): { _and: unknown[] } {
  return { _and: [base, ...ORG_GUARD] };
}

function unguard(v: unknown): unknown | undefined {
  if (!isObject(v) || Object.keys(v).length !== 1 || !Array.isArray(v._and) || v._and.length !== 3) return undefined;
  return json(v._and.slice(1)) === json(ORG_GUARD) ? v._and[0] : undefined;
}

/** The scope field an `organization` condition reads through, at the top or one `_and` down. */
function orgScope(base: unknown): string | null {
  if (!isObject(base)) return null;
  const org = base.organization;
  if (isObject(org) && typeof org._in === "string") return org._in;
  if (Array.isArray(base._and)) {
    for (const part of base._and) {
      const s = orgScope(part);
      if (s) return s;
    }
  }
  return null;
}

/** Whose guarded branch this base is, or null when it cannot be guarded. */
export function branchKind(base: unknown): Exclude<PolicyKind, "member"> | null {
  if (json(base).includes(ANY_MEMBERSHIP)) return null;
  const scope = orgScope(base);
  return scope ? (SCOPE_KIND[scope] ?? null) : null;
}

/** The parts of a combined validation, or null when it is not one. */
export function splitCombined(v: unknown): { member: unknown; branches: unknown[] } | null {
  if (!isObject(v) || Object.keys(v).length !== 1 || !Array.isArray(v._or) || v._or.length < 2) return null;
  const branches = v._or.slice(1).map(unguard);
  if (branches.some((b) => b === undefined)) return null;
  return { member: v._or[0], branches };
}

/**
 * A policy's own validation: inside a combined one, its branch; otherwise the
 * value itself. Undefined when a combined value holds no branch of that kind.
 */
export function baseOf(v: unknown, kind: PolicyKind): unknown | undefined {
  const parts = splitCombined(v);
  if (!parts) return v ?? null;
  if (kind === "member") return parts.member;
  return parts.branches.find((b) => branchKind(b) === kind);
}

/**
 * The validation every policy's rule for one pair should carry, given each
 * policy's own: `{ validation }` when a combined one is needed, `{ skip }`
 * when it is needed but cannot be made safely, null when the policies'
 * validations already agree (or only one policy has one).
 */
export function combineValidations(bases: Partial<Record<PolicyKind, unknown>>): { validation: unknown } | { skip: string } | null {
  const member = bases.member;
  // No member rule: the admin and manager policies never share a role.
  if (isEmpty(member)) return null;
  const others = (["admin", "manager"] as const)
    .map((k) => ({ kind: k, base: bases[k] }))
    .filter((o) => !isEmpty(o.base) && json(o.base) !== json(member));
  if (!others.length) return null;
  for (const o of others) {
    if (branchKind(o.base) !== o.kind) {
      return { skip: `the ${o.kind} validation is not scoped by its own field on organization` };
    }
  }
  return { validation: { _or: [member, ...others.map((o) => guard(o.base))] } };
}

export interface LiveRule {
  id: number | string;
  kind: PolicyKind;
  collection: string;
  action: string;
  validation: unknown;
}

/**
 * What to write so every shared create or update carries one validation. A
 * pair that no longer needs combining gets each policy's own back.
 */
export function planSharedValidations(rules: readonly LiveRule[]): {
  changes: { id: LiveRule["id"]; kind: PolicyKind; collection: string; action: string; validation: unknown }[];
  combined: string[];
  skipped: string[];
} {
  const changes: { id: LiveRule["id"]; kind: PolicyKind; collection: string; action: string; validation: unknown }[] = [];
  const combined: string[] = [];
  const skipped: string[] = [];
  const pairs = new Map<string, LiveRule[]>();
  for (const r of rules) {
    if (r.action !== "create" && r.action !== "update") continue;
    const key = `${r.collection}.${r.action}`;
    pairs.set(key, [...(pairs.get(key) ?? []), r]);
  }
  for (const [key, group] of [...pairs].sort(([a], [b]) => a.localeCompare(b))) {
    const bases: Partial<Record<PolicyKind, unknown>> = {};
    let unknownBase = false;
    for (const r of group) {
      const b = baseOf(r.validation, r.kind);
      if (b === undefined) unknownBase = true;
      else bases[r.kind] = b;
    }
    if (unknownBase) {
      skipped.push(`${key}: a combined validation holds no branch for one of its policies`);
      continue;
    }
    const result = combineValidations(bases);
    if (result && "skip" in result) skipped.push(`${key}: ${result.skip}`);
    if (result && "validation" in result) combined.push(key);
    for (const r of group) {
      const want = result && "validation" in result ? result.validation : (bases[r.kind] ?? null);
      if (json(r.validation) !== json(want)) {
        changes.push({ id: r.id, kind: r.kind, collection: r.collection, action: r.action, validation: want });
      }
    }
  }
  return { changes, combined, skipped };
}
