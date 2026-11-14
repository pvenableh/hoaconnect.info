/**
 * resolveNotified — who to address about one area of one community
 * (docs/spec-role-context.md, plan §2.1).
 *
 * The members with the manager hat and notify switched on for `area`; when
 * nobody has it, the community's active admins. This picks WHO only — each
 * person's own notification preferences still choose bell, push or email.
 *
 * Not wired into the reminder engine yet (Phase 1a). Before
 * scripts/add-manager-hat.ts has run nobody has the switch, so every area
 * resolves to the admins.
 */
import { readItems } from "@directus/sdk";
import { isAreaKey, type AreaKey } from "#core/shared/transition/grants";
import { roleIdOf } from "#core/shared/ops/permissions";
import { pickNotified, type NotifiableMembership } from "#core/shared/roles/role-context";

export interface NotifiedRecipients {
  /** Deduped Directus user ids. */
  userIds: string[];
  memberIds: string[];
  via: "area" | "admins";
}

export async function resolveNotified(orgId: string, area: AreaKey): Promise<NotifiedRecipients> {
  if (!orgId) throw createError({ statusCode: 400, message: "orgId is required" });
  if (!isAreaKey(area)) throw createError({ statusCode: 400, message: `Unknown area: ${String(area)}` });

  const directus = getTypedDirectus();
  // `*`: the manager fields may not exist yet, and naming one fails the read.
  const rows = ((await directus.request(
    readItems("hoa_members", {
      filter: { organization: { _eq: orgId }, status: { _eq: "active" } },
      fields: ["*"],
      limit: -1,
    })
  )) ?? []) as NotifiableMembership[];

  // Belt and braces: only this org's rows, whatever the read returned.
  const own = rows.filter((r) => roleIdOf(r.organization) === orgId);
  const { members, via } = pickNotified(own, area, serverRoleIds());

  const userIds = [...new Set(members.map((m) => roleIdOf(m.user)).filter((id): id is string => !!id))];
  const memberIds = [...new Set(members.map((m) => m.id).filter((id): id is string => !!id))];
  return { userIds, memberIds, via };
}
