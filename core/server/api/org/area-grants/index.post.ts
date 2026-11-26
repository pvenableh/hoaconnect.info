/**
 * POST /api/org/area-grants — switch one helper area on or off for a member
 * (a helper) or a team (a committee). docs/spec-delegation.md.
 *
 * Admin only: a holder can never widen, keep or move their own grants. On
 * opens a row from now; off ends the open row now (nothing is deleted). A
 * no-op writes nothing and records nothing. Every change writes one ledger
 * entry; a failed entry is reported, not hidden.
 */
import { updateItem } from "@directus/sdk";
import { z } from "zod";
import { buildHelperGrantEntry } from "#core/shared/ledger/entries";
import { HELPER_AREA_KEYS, openAreasOf, planGrantChange } from "#core/shared/roles/area-grants";
import {
  holderRef,
  idString,
  loadMemberHolder,
  loadTeamHolder,
  readDelegationBody,
  readHolderRows,
  recordEntry,
  requireDelegationAdmin,
  type LoadedHolder,
} from "#core/server/utils/delegation";
import { orgName } from "#core/server/utils/org-name";
import { createAs } from "#core/server/utils/create-as";

const body = z
  .object({
    orgId: idString,
    member: idString.optional(),
    team: idString.optional(),
    area: z.enum(HELPER_AREA_KEYS, { message: "That area cannot be given to a helper or a committee." }),
    value: z.boolean({ message: "value must be true or false" }),
  })
  .refine((b) => !!b.member !== !!b.team, { message: "Name exactly one of member or team." });

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const b = await readDelegationBody(event, body);
  const actor = await requireDelegationAdmin(event, b.orgId);

  const holder: LoadedHolder = b.member ? await loadMemberHolder(b.orgId, b.member) : await loadTeamHolder(b.orgId, b.team!);

  if (holder.kind === "member") {
    const config = useRuntimeConfig();
    if (holder.roleId && holder.roleId === config.public.directusRoleHoaAdmin) {
      throw createError({ statusCode: 400, message: "Admins already work every area." });
    }
    if (holder.roleId && holder.roleId === config.public.directusRolePropertyManager) {
      throw createError({ statusCode: 400, message: "Use Property management for a property manager." });
    }
  }
  // Ending is always allowed, so a grant left on an archived member can be closed.
  if (b.value) {
    if (holder.kind === "member" && holder.status !== "active") {
      throw createError({ statusCode: 409, message: "Only an active member can be given an area." });
    }
    if (holder.kind === "team" && holder.status !== "active") {
      throw createError({ statusCode: 409, message: "An archived committee cannot be given an area." });
    }
  }

  const ref = holderRef(holder);
  const rows = await readHolderRows(b.orgId, ref);
  const now = new Date();
  const plan = planGrantChange({
    orgId: b.orgId,
    rows,
    holder: ref,
    holderName: holder.name,
    area: b.area,
    value: b.value,
    actorId: actor.userId,
    now,
  });

  if (plan.kind === "none") {
    return { changed: false, areas: openAreasOf(rows, ref, now), recorded: false, recordError: null, summary: null };
  }

  const d = getTypedDirectus();
  if (plan.kind === "open") {
    await createAs("hoa_area_grants", { ...plan.row }, actor.userId);
  } else {
    await d.request(updateItem("hoa_area_grants" as any, plan.id, plan.patch as any));
  }

  const after = openAreasOf(await readHolderRows(b.orgId, ref), ref, new Date());
  const entry = buildHelperGrantEntry({
    organizationId: b.orgId,
    organizationName: await orgName(b.orgId),
    holder: { kind: holder.kind, id: holder.id, name: holder.name },
    area: b.area,
    on: b.value,
    resultingAreas: after,
    actor,
    occurredAt: now.toISOString(),
  });
  const rec = await recordEntry(entry);
  return { changed: true, areas: after, ...rec, summary: entry.summary };
});
