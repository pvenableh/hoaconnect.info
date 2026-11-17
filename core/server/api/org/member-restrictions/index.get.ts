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
import { loadMemberHolder, orgIdFromQuery } from "#core/server/utils/delegation";
import {
  actorNamesFor,
  holdsCurrentBoardTerm,
  orgCopyContext,
  readRestrictionRows,
  requireRestrictionAdmin,
} from "#core/server/utils/member-restrictions";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = orgIdFromQuery(event);
  await requireRestrictionAdmin(event, orgId);
  const member = String(getQuery(event).member ?? "").trim();
  const now = new Date();

  if (member) {
    const holder = await loadMemberHolder(orgId, member);
    const rows = await readRestrictionRows(orgId, holder.id);
    const { timeZone } = await orgCopyContext(orgId);
    const nameOf = await actorNamesFor(orgId, rows);
    // Who can be paused at all, so the sheet offers no control the POST would
    // refuse, and says why.
    const config = useRuntimeConfig();
    let reason: string | null = null;
    if (holder.roleId && holder.roleId === config.public.directusRoleHoaAdmin) reason = "An admin's posting can't be paused. Remove the admin role first.";
    else if (holder.roleId && holder.roleId === config.public.directusRolePropertyManager) reason = "A property manager's posting can't be paused. End their management first.";
    else if (holder.status !== "active") reason = "Only an active member's posting can be paused.";
    else if (await holdsCurrentBoardTerm(holder.id, now)) reason = "They hold a board seat. End or change their term first.";
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

  const iso = now.toISOString();
  const rows = ((await getTypedDirectus().request(
    readItems("hoa_member_restrictions" as any, {
      filter: {
        _and: [
          { organization: { _eq: orgId } },
          { _or: [{ lifted_at: { _null: true } }, { lifted_at: { _gt: iso } }] },
          { _or: [{ ends_at: { _null: true } }, { ends_at: { _gt: iso } }] },
        ],
      } as any,
      fields: ["id", "organization", "member", "starts_at", "ends_at", "lifted_at"] as any,
      limit: -1,
    })
  )) ?? []) as any[];
  return {
    open: rows
      .filter((r) => inForceAt(r, now) && refId(r.organization) === orgId && refId(r.member))
      .map((r) => ({ id: String(r.id), member: refId(r.member), endsAt: r.ends_at ?? null })),
  };
});
