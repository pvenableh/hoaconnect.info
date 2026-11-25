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
  holderRowsSpec,
  loadMemberHolder,
  loadTeamHolder,
  memberHolderFrom,
  memberHolderSpec,
  openGrantsSpec,
  orgIdFromQuery,
  personOf,
  readHolderRows,
  requireDelegationGate,
  teamHolderFrom,
  teamHolderSpec,
} from "#core/server/utils/delegation";
import type { BatchSpec } from "#core/server/utils/directus-graphql";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const orgId = orgIdFromQuery(event);
  const q = getQuery(event);
  const member = String(q.member ?? "").trim();
  const team = String(q.team ?? "").trim();
  const now = new Date();

  // A holder's view (admin only in the app): the holder, its rows (named by
  // the id asked for) and the caller's memberships as ONE request; the admin
  // gate needs only the memberships ("base"), then answers from them and
  // refuses before any row is used. A failed batch (a malformed id, say)
  // reads one by one below, as before. The list is read after the gate
  // instead: the Members page asks it for everyone, and reading the open
  // rows with the memberships made a refusal ~40ms slower. A GET writes
  // nothing, so neither takes the ledger actor requireDelegationAdmin reads.
  const specs: Record<string, BatchSpec> | null =
    member && !team
      ? { ag_holder: memberHolderSpec(orgId, member), ag_rows: holderRowsSpec(orgId, { kind: "member", id: member }) }
      : team && !member
        ? { ag_holder: teamHolderSpec(orgId, team), ag_rows: holderRowsSpec(orgId, { kind: "team", id: team }) }
        : null;
  const batched = specs
    ? await Promise.resolve()
        .then(() => batchWithAccessSnapshot(event, orgId, specs, "base"))
        .catch(() => null)
    : null;

  await requireDelegationGate(event, orgId);
  if (member && team) throw createError({ statusCode: 400, message: "Name one of member or team, not both." });

  if (member || team) {
    const holder = batched
      ? member
        ? memberHolderFrom(batched.ag_holder)
        : teamHolderFrom(batched.ag_holder)
      : member
        ? await loadMemberHolder(orgId, member)
        : await loadTeamHolder(orgId, team);
    const ref = holderRef(holder);
    const rows = batched ? (batched.ag_rows as Awaited<ReturnType<typeof readHolderRows>>) : await readHolderRows(orgId, ref);
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

  const open = openGrantsSpec(orgId, now);
  const rows = (((await getTypedDirectus().request(
    readItems("hoa_area_grants" as any, { filter: open.filter as any, fields: [...open.fields] as any, limit: -1 })
  )) ?? []) as any[]);

  return {
    helperAreas: HELPER_AREA_KEYS,
    open: rows
      .filter((r) => isHelperArea(r.area) && holdsAt(r, now) && refId(r.organization) === orgId)
      .map((r) => ({ id: String(r.id), area: r.area, member: refId(r.member), team: refId(r.team) })),
  };
});
