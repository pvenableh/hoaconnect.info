/**
 * GET /api/org/member-restrictions?orgId= — every pause in force in the
 * community, for the Members list's "Posting paused" chip.
 * GET /api/org/member-restrictions?orgId=&member= — that member's pauses, in
 * force and ended, with who imposed and lifted each, and whether one can be
 * imposed (with the reason when not). docs/spec-member-restrictions.md.
 *
 * Admin only. The member reads their own through `mine`.
 */
import { readItems } from "@directus/sdk";
import { inForceAt, openRestriction, refId, restrictionUntil } from "#core/shared/members/restrictions";
import { loadMemberHolder, memberHolderFrom, memberHolderSpec, orgIdFromQuery } from "#core/server/utils/delegation";
import {
  actorNamesFor,
  boardTermSpec,
  holdsCurrentBoardTerm,
  holdsTermFrom,
  openRestrictionsSpec,
  orgCopyContext,
  orgCopyFrom,
  orgCopySpec,
  readRestrictionRows,
  requireRestrictionGate,
  restrictionRowsSpec,
  type RestrictionRecord,
} from "#core/server/utils/member-restrictions";
import type { BatchSpec } from "#core/server/utils/directus-graphql";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = orgIdFromQuery(event);
  const member = String(getQuery(event).member ?? "").trim();
  const now = new Date();

  // This view's reads and the caller's memberships as ONE request: for one
  // member, their row, their pauses, the community's clock and their board
  // terms; for the list, the pauses in force. The admin gate then answers
  // from that standing and refuses before any row is used. A failed batch
  // reads one by one as before.
  const specs: Record<string, BatchSpec> = member
    ? {
        rs_holder: memberHolderSpec(orgId, member),
        rs_rows: restrictionRowsSpec(orgId, member),
        rs_org: orgCopySpec(orgId),
        rs_terms: boardTermSpec(member, now),
      }
    : { rs_open: openRestrictionsSpec(orgId, now) };
  const batched = await batchWithAccessSnapshot(event, orgId, specs, "base").catch(() => null);
  await requireRestrictionGate(event, orgId);

  if (member) {
    const holder = batched ? memberHolderFrom(batched.rs_holder) : await loadMemberHolder(orgId, member);
    const rows = batched ? (batched.rs_rows as RestrictionRecord[]) : await readRestrictionRows(orgId, holder.id);
    const { timeZone } = batched ? orgCopyFrom(batched.rs_org ?? []) : await orgCopyContext(orgId);
    const nameOf = await actorNamesFor(orgId, rows);
    // Who can be paused at all, so the sheet offers no control the POST would
    // refuse, and says why.
    const config = useRuntimeConfig();
    let reason: string | null = null;
    // An HOA Admin membership, or one carrying the App Administrator role.
    if (holder.roleId && [config.public.directusRoleHoaAdmin, config.public.directusRoleAppAdmin].includes(holder.roleId)) reason = "An admin's posting can't be paused. Remove the admin role first.";
    else if (holder.roleId && holder.roleId === config.public.directusRolePropertyManager) reason = "A property manager's posting can't be paused. End their management first.";
    else if (holder.status !== "active") reason = "Only an active member's posting can be paused.";
    else if (batched ? holdsTermFrom(batched.rs_terms ?? [], now) : await holdsCurrentBoardTerm(holder.id, now)) reason = "They hold a board seat. End or change their term first.";
    const open = openRestriction(rows, now);
    return {
      member: { id: holder.id, name: holder.name, status: holder.status },
      canRestrict: reason === null && !open,
      reason,
      timeZone,
      open: open ? String(open.id) : null,
      rows: rows.map((r) => ({
        id: String(r.id),
        startsAt: r.starts_at ?? null,
        endsAt: r.ends_at ?? null,
        until: restrictionUntil(r.ends_at, timeZone),
        liftedAt: r.lifted_at ?? null,
        memberNote: r.member_note ?? "",
        internalNote: r.internal_note ?? null,
        imposedBy: nameOf(r.imposed_by),
        liftedBy: nameOf(r.lifted_by),
        inForce: inForceAt(r, now),
      })),
    };
  }

  const spec = openRestrictionsSpec(orgId, now);
  const rows = (batched?.rs_open ??
    ((await getTypedDirectus().request(
      readItems("hoa_member_restrictions" as any, { filter: spec.filter as any, fields: [...spec.fields] as any, limit: spec.limit })
    )) ??
      [])) as any[];
  return {
    open: rows
      .filter((r) => inForceAt(r, now) && refId(r.organization) === orgId && refId(r.member))
      .map((r) => ({ id: String(r.id), member: refId(r.member), endsAt: r.ends_at ?? null })),
  };
});
