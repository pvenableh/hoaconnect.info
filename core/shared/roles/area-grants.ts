/**
 * Delegation to members — helpers and committees (docs/spec-delegation.md).
 *
 * An admin can give a member (a helper) or a team (a committee) some of the
 * areas a property manager can be given. The record is `hoa_area_grants`: one
 * row per holder per area, ended rather than deleted, so "who could do what,
 * and when" stays answerable.
 *
 * Only the areas in `HELPER_AREA_KEYS` can be held this way: those whose every
 * read and write goes through a server route. A helper is a plain HOA Member in
 * Directus — no policy gives them a ceiling — so an area whose page reads
 * Directus with the user's own token cannot be held until it reads through a
 * route instead.
 *
 * Pure: no Directus, no H3. The clock is an argument.
 */
import { MANAGER_GRANT_KEYS, type ManagerGrantKey } from "../transition/grants";

/**
 * The areas a helper or committee can hold, in grant order. Each must be a
 * grant key with a server gate (a test checks both). Not here, and why:
 * activity (shows a neighbour every resident's actions), contact_platform
 * (speaking to HOA Connect for the community stays with admins and managers).
 */
export const HELPER_AREA_KEYS = [
  "inquiries",
  "violations",
  "directory",
  "documents",
  "communications",
  "feedback",
  "projects",
  "responsibilities",
] as const satisfies readonly ManagerGrantKey[];

export type HelperAreaKey = (typeof HELPER_AREA_KEYS)[number];

export function isHelperArea(key: unknown): key is HelperAreaKey {
  return typeof key === "string" && (HELPER_AREA_KEYS as readonly string[]).includes(key);
}

type Ref = string | { id?: string | null } | null | undefined;

export function refId(ref: Ref): string | null {
  if (!ref) return null;
  if (typeof ref === "string") return ref;
  return ref.id ?? null;
}

/** A `hoa_area_grants` row as the pure helpers read it. */
export interface AreaGrantRow {
  id?: string | null;
  organization?: Ref;
  area?: string | null;
  member?: Ref;
  team?: Ref;
  starts_at?: string | null;
  ends_at?: string | null;
}

export type GrantHolder = { kind: "member"; id: string } | { kind: "team"; id: string };

function ms(at: Date | string): number {
  return typeof at === "string" ? Date.parse(at) : at.getTime();
}

/** Does the row hold at `at`? Starts inclusive, ends exclusive: an end takes effect at once. */
export function holdsAt(row: AreaGrantRow, at: Date | string): boolean {
  if (!row.starts_at) return false;
  const t = ms(at);
  const start = Date.parse(row.starts_at);
  if (Number.isNaN(start) || start > t) return false;
  if (row.ends_at) {
    const end = Date.parse(row.ends_at);
    if (!Number.isNaN(end) && end <= t) return false;
  }
  return true;
}

function holderOf(row: AreaGrantRow): GrantHolder | null {
  const member = refId(row.member);
  const team = refId(row.team);
  if (member && !team) return { kind: "member", id: member };
  if (team && !member) return { kind: "team", id: team };
  return null;
}

/**
 * The helper areas a person holds at `now`: rows naming their membership, or a
 * team they are on. The caller has already decided the membership is active
 * and which teams are current; this only reads the rows. A row of another org,
 * for a non-helper area, with both or neither holder, or not holding at `now`
 * is ignored. Returned in `HELPER_AREA_KEYS` order.
 */
export function helperAreasFor(input: {
  orgId: string;
  memberId: string | null;
  teamIds: readonly string[];
  rows: readonly AreaGrantRow[];
  now: Date | string;
}): HelperAreaKey[] {
  const held = new Set<string>();
  const teams = new Set(input.teamIds);
  for (const row of input.rows) {
    if (refId(row.organization) !== input.orgId) continue;
    if (!isHelperArea(row.area)) continue;
    const holder = holderOf(row);
    if (!holder) continue;
    const mine =
      (holder.kind === "member" && !!input.memberId && holder.id === input.memberId) ||
      (holder.kind === "team" && teams.has(holder.id));
    if (mine && holdsAt(row, input.now)) held.add(row.area);
  }
  return HELPER_AREA_KEYS.filter((k) => held.has(k));
}

/** The open row for one holder and area, or null. */
export function openRowFor(
  rows: readonly AreaGrantRow[],
  holder: GrantHolder,
  area: HelperAreaKey,
  now: Date | string
): AreaGrantRow | null {
  return (
    rows.find((r) => {
      const h = holderOf(r);
      return !!h && h.kind === holder.kind && h.id === holder.id && r.area === area && holdsAt(r, now);
    }) ?? null
  );
}

/** The areas a holder has open at `now`, in `HELPER_AREA_KEYS` order. */
export function openAreasOf(rows: readonly AreaGrantRow[], holder: GrantHolder, now: Date | string): HelperAreaKey[] {
  return HELPER_AREA_KEYS.filter((k) => openRowFor(rows, holder, k, now) !== null);
}

export type GrantChangePlan =
  | { kind: "none" }
  | {
      kind: "open";
      row: { organization: string; area: HelperAreaKey; member: string | null; team: string | null; starts_at: string; granted_by: string | null };
    }
  | { kind: "end"; id: string; patch: { ends_at: string; ended_by: string | null; end_reason: "revoked"; holder_name: string } };

/**
 * What switching one area on or off for one holder writes. On with a row
 * already open, or off with none open, is a no-op: nothing is written and no
 * ledger entry follows.
 */
export function planGrantChange(input: {
  orgId: string;
  rows: readonly AreaGrantRow[];
  holder: GrantHolder;
  holderName: string;
  area: HelperAreaKey;
  value: boolean;
  actorId: string | null;
  now: Date;
}): GrantChangePlan {
  const open = openRowFor(input.rows, input.holder, input.area, input.now);
  const at = input.now.toISOString();
  if (input.value) {
    if (open) return { kind: "none" };
    return {
      kind: "open",
      row: {
        organization: input.orgId,
        area: input.area,
        member: input.holder.kind === "member" ? input.holder.id : null,
        team: input.holder.kind === "team" ? input.holder.id : null,
        starts_at: at,
        granted_by: input.actorId,
      },
    };
  }
  if (!open?.id) return { kind: "none" };
  return {
    kind: "end",
    id: String(open.id),
    patch: { ends_at: at, ended_by: input.actorId, end_reason: "revoked", holder_name: input.holderName },
  };
}

/** Grant keys a helper cannot hold — the complement, for tests and copy. */
export const NON_HELPER_GRANT_KEYS: readonly ManagerGrantKey[] = MANAGER_GRANT_KEYS.filter((k) => !isHelperArea(k));
