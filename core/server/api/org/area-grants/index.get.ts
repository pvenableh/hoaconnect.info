/**
 * GET /api/org/area-grants?orgId= — every open helper and committee row in
 * the community, for the Members and Teams lists' "Helps with" chips.
 * GET /api/org/area-grants?orgId=&member= (or &team=) — that holder's rows,
 * open and ended, with who granted and ended each. docs/spec-delegation.md.
 *
 * Admin only. A holder reads what they hold through the role context
 * (`helps`), never through this route.
 */
import { readItems } from "@directus/sdk";
import { HELPER_AREA_KEYS, holdsAt, isHelperArea, openAreasOf, refId } from "#core/shared/roles/area-grants";
import {
  holderRef,
  loadMemberHolder,
  loadTeamHolder,
  orgIdFromQuery,
  personOf,
  readHolderRows,
  requireDelegationAdmin,
} from "#core/server/utils/delegation";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = orgIdFromQuery(event);
  await requireDelegationAdmin(event, orgId);
  const q = getQuery(event);
  const member = String(q.member ?? "").trim();
  const team = String(q.team ?? "").trim();
  if (member && team) throw createError({ statusCode: 400, message: "Name one of member or team, not both." });
  const now = new Date();

  if (member || team) {
    const holder = member ? await loadMemberHolder(orgId, member) : await loadTeamHolder(orgId, team);
    const ref = holderRef(holder);
    const rows = await readHolderRows(orgId, ref);
    // Who can be given an area at all, so the page offers no switch the POST
    // would refuse: not an admin (works every area), not a property manager
    // (Property management), not an inactive member or archived committee.
    const config = useRuntimeConfig();
    let reason: string | null = null;
    if (holder.kind === "member") {
      if (holder.roleId && holder.roleId === config.public.directusRoleHoaAdmin) reason = "Admins already work every area.";
      else if (holder.roleId && holder.roleId === config.public.directusRolePropertyManager) reason = "A property manager's areas are set in Property management.";
      else if (holder.status !== "active") reason = "Only an active member can be given an area.";
    } else if (holder.status !== "active") {
      reason = "An archived committee cannot be given an area.";
    }
    return {
      holder: { kind: holder.kind, id: holder.id, name: holder.name, status: holder.status },
      canHold: reason === null,
      reason,
      helperAreas: HELPER_AREA_KEYS,
      open: openAreasOf(rows, ref, now),
      rows: rows
        .filter((r) => isHelperArea(r.area))
        .map((r) => ({
          id: String(r.id),
          area: r.area,
          startsAt: r.starts_at ?? null,
          endsAt: r.ends_at ?? null,
          endReason: r.end_reason ?? null,
          grantedBy: personOf(r.granted_by),
          endedBy: personOf(r.ended_by),
          open: holdsAt(r, now),
        })),
    };
  }

  const rows = ((await getTypedDirectus().request(
    readItems("hoa_area_grants" as any, {
      filter: {
        organization: { _eq: orgId },
        _or: [{ ends_at: { _null: true } }, { ends_at: { _gt: now.toISOString() } }],
      } as any,
      fields: ["id", "organization", "area", "member", "team", "starts_at", "ends_at"] as any,
      limit: -1,
    })
  )) ?? []) as any[];

  return {
    helperAreas: HELPER_AREA_KEYS,
    open: rows
      .filter((r) => isHelperArea(r.area) && holdsAt(r, now) && refId(r.organization) === orgId)
      .map((r) => ({ id: String(r.id), area: r.area, member: refId(r.member), team: refId(r.team) })),
  };
});
