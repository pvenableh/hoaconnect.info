/**
 * Delegation to members — what the admin-only routes share
 * (docs/spec-delegation.md): who may call them, loading a holder through the
 * org filter, the open rows, the ledger actor and the community's name.
 *
 * Every route here is admin only. A holder can never widen, keep or move their
 * own grants, and joining a committee grants its areas, so its membership is
 * admin only too.
 */
import type { H3Event } from "h3";
import { readItems } from "@directus/sdk";
import { ledgerActorFor } from "./member-names";
import { z } from "zod";
import type { LedgerActor } from "#core/shared/ledger/entry";
import { openAreasOf, refId, type AreaGrantRow, type GrantHolder, type HelperAreaKey } from "#core/shared/roles/area-grants";
import type { ReadSpec } from "./directus-graphql";

/** 401 without a session, 403 unless an admin of `orgId`. Returns the session user. */
export async function requireDelegationGate(event: H3Event, orgId: string): Promise<Record<string, any>> {
  const session = await requireUserSession(event);
  const user: any = session?.user ?? {};
  if (!user.id) throw createError({ statusCode: 401, message: "Authentication required" });
  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) {
    throw createError({ statusCode: 403, message: "Only an administrator can change who helps with what." });
  }
  return user;
}

/** requireDelegationGate, then the ledger actor: for the routes that write. */
export async function requireDelegationAdmin(event: H3Event, orgId: string): Promise<LedgerActor> {
  const user = await requireDelegationGate(event, orgId);
  // The community's name for the admin (core/shared/members/display-name.ts).
  return await ledgerActorFor(orgId, user);
}

/** The `orgId` from the query (GET, DELETE), or 400. */
export function orgIdFromQuery(event: H3Event): string {
  const orgId = String(getQuery(event).orgId ?? "").trim();
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  return orgId;
}

/** Parse a body with zod, 400 with the first message. */
export async function readDelegationBody<T>(event: H3Event, schema: z.ZodType<T>): Promise<T> {
  const parsed = schema.safeParse(await readBody(event).catch(() => null));
  if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  return parsed.data;
}

export const idString = z.string().trim().min(1).max(64);

export interface MemberHolder {
  kind: "member";
  id: string;
  name: string;
  status: string | null;
  roleId: string | null;
  userId: string | null;
}

export interface TeamHolder {
  kind: "team";
  id: string;
  name: string;
  status: string;
}

export type LoadedHolder = MemberHolder | TeamHolder;

/** The read behind loadMemberHolder: a member of `orgId` by id, through the org filter. */
export function memberHolderSpec(orgId: string, memberId: string): ReadSpec {
  return {
    collection: "hoa_members",
    filter: { id: { _eq: memberId }, organization: { _eq: orgId } },
    fields: ["id", "first_name", "last_name", "email", "status", "role", "user"],
    limit: 1,
  };
}

/** The member holder from memberHolderSpec's rows: 404 when there is none. */
export function memberHolderFrom(rows: readonly any[] | null | undefined): MemberHolder {
  const m = rows?.[0];
  if (!m) throw createError({ statusCode: 404, message: "No such member in this community." });
  return {
    kind: "member",
    id: String(m.id),
    name: [m.first_name, m.last_name].filter(Boolean).join(" ").trim() || m.email || "",
    status: m.status ?? null,
    roleId: refId(m.role),
    userId: refId(m.user),
  };
}

/** A member of `orgId`, read through the org filter: 404 for another community's. */
export async function loadMemberHolder(orgId: string, memberId: string): Promise<MemberHolder> {
  const spec = memberHolderSpec(orgId, memberId);
  const rows = (await getTypedDirectus().request(
    readItems("hoa_members", { filter: spec.filter as any, fields: [...spec.fields] as any, limit: spec.limit })
  )) as any[];
  return memberHolderFrom(rows);
}

/** The read behind loadTeamHolder: a team of `orgId` by id, through the org filter. */
export function teamHolderSpec(orgId: string, teamId: string): ReadSpec {
  return {
    collection: "hoa_teams",
    filter: { id: { _eq: teamId }, organization: { _eq: orgId } },
    fields: ["id", "name", "status"],
    limit: 1,
  };
}

/** The team holder from teamHolderSpec's rows: 404 when there is none. */
export function teamHolderFrom(rows: readonly any[] | null | undefined): TeamHolder {
  const t = rows?.[0];
  if (!t) throw createError({ statusCode: 404, message: "No such committee in this community." });
  return { kind: "team", id: String(t.id), name: String(t.name ?? ""), status: t.status ?? "active" };
}

/** A team of `orgId`, read through the org filter: 404 for another community's. */
export async function loadTeamHolder(orgId: string, teamId: string): Promise<TeamHolder> {
  const spec = teamHolderSpec(orgId, teamId);
  const rows = (await getTypedDirectus().request(
    readItems("hoa_teams", { filter: spec.filter as any, fields: [...spec.fields] as any, limit: spec.limit })
  )) as any[];
  return teamHolderFrom(rows);
}

export const holderRef = (h: LoadedHolder): GrantHolder => ({ kind: h.kind, id: h.id }) as GrantHolder;

/** The read behind readHolderRows: every row (open and ended) for one holder in `orgId`, newest first. */
export function holderRowsSpec(orgId: string, holder: GrantHolder): ReadSpec {
  return {
    collection: "hoa_area_grants",
    filter: { organization: { _eq: orgId }, [holder.kind]: { _eq: holder.id } },
    fields: [
      "id", "organization", "area", "member", "team", "starts_at", "ends_at", "end_reason", "holder_name",
      "granted_by.first_name", "granted_by.last_name", "granted_by.email",
      "ended_by.first_name", "ended_by.last_name", "ended_by.email",
    ],
    sort: ["-starts_at"],
    limit: -1,
  };
}

/** Every row (open and ended) for one holder in `orgId`, newest first. */
export async function readHolderRows(orgId: string, holder: GrantHolder): Promise<(AreaGrantRow & Record<string, any>)[]> {
  const spec = holderRowsSpec(orgId, holder);
  return ((await getTypedDirectus().request(
    readItems("hoa_area_grants" as any, {
      filter: spec.filter as any,
      fields: [...spec.fields] as any,
      sort: [...spec.sort!] as any,
      limit: spec.limit,
    })
  )) ?? []) as any[];
}

/** The community's area grants that have not ended at `now` (the Members and Teams lists' chips). */
export function openGrantsSpec(orgId: string, now: Date): ReadSpec {
  return {
    collection: "hoa_area_grants",
    filter: {
      organization: { _eq: orgId },
      _or: [{ ends_at: { _null: true } }, { ends_at: { _gt: now.toISOString() } }],
    },
    fields: ["id", "organization", "area", "member", "team", "starts_at", "ends_at"],
    limit: -1,
  };
}

/** A team's open areas now: what someone joining or leaving it gains or loses. */
export async function teamOpenAreas(orgId: string, teamId: string): Promise<HelperAreaKey[]> {
  const rows = await readHolderRows(orgId, { kind: "team", id: teamId });
  return openAreasOf(rows, { kind: "team", id: teamId }, new Date());
}

/** A user's display name from an expanded M2O, or null. */
export function personOf(u: any): string | null {
  if (!u || typeof u !== "object") return null;
  return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || u.email || null;
}

/**
 * Write a ledger entry after the change has landed. A failure is reported, not
 * thrown: the change stands, and the admin is told the record did not.
 */
export async function recordEntry(entry: Parameters<typeof writeAuditEntry>[0]): Promise<{ recorded: boolean; recordError: string | null }> {
  try {
    await writeAuditEntry(entry);
    return { recorded: true, recordError: null };
  } catch (e: any) {
    console.error("[delegation] audit write failed:", e);
    return { recorded: false, recordError: e?.message || "The change was saved but could not be recorded in the ledger." };
  }
}
