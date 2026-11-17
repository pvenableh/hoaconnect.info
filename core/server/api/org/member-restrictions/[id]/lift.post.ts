/**
 * POST /api/org/member-restrictions/[id]/lift — end a pause now.
 * docs/spec-member-restrictions.md.
 *
 * Body: { orgId }. Admin only. Sets lifted_at and lifted_by (nothing is
 * deleted); 409 when it has already ended, by a lift or its date. Re-syncs the
 * member's scope fields, writes one board-visible ledger entry and a bell the
 * member gets even with notifications off.
 */
import { readItems, updateItem } from "@directus/sdk";
import { z } from "zod";
import { buildMemberRestrictionEntry } from "#core/shared/ledger/entries";
import { planLift, refId, restrictionUntil } from "#core/shared/members/restrictions";
import { idString, readDelegationBody, recordEntry } from "#core/server/utils/delegation";
import { loadRestriction, orgCopyContext, requireRestrictionAdmin } from "#core/server/utils/member-restrictions";
import { syncAdminScope } from "#core/server/utils/admin-scope";
import { notifyUsers } from "#core/server/utils/notify";

const body = z.object({ orgId: idString });

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = String(getRouterParam(event, "id") ?? "").trim();
  if (!id) throw createError({ statusCode: 400, message: "Which pause?" });
  const b = await readDelegationBody(event, body);
  const actor = await requireRestrictionAdmin(event, b.orgId);
  const row = await loadRestriction(b.orgId, id);

  const now = new Date();
  const plan = planLift(row, now, String(actor.userId));
  if (!("patch" in plan)) throw createError({ statusCode: 409, message: plan.message });

  // The member as they are now (null if the membership was deleted): the name
  // is frozen on the row as it ends.
  const memberId = refId(row.member);
  const member = memberId
    ? (((await getTypedDirectus().request(
        readItems("hoa_members", {
          filter: { id: { _eq: memberId }, organization: { _eq: b.orgId } },
          fields: ["id", "first_name", "last_name", "email", "user"] as any,
          limit: 1,
        })
      )) ?? []) as any[])[0]
    : null;
  const name = (member && ([member.first_name, member.last_name].filter(Boolean).join(" ").trim() || member.email)) || row.holder_name || "";

  await getTypedDirectus().request(updateItem("hoa_member_restrictions" as any, id, { ...plan.patch, holder_name: name || null } as any));

  const scopeSynced = memberId
    ? await syncAdminScope([memberId]).then(
        () => true,
        (e) => {
          console.error("[member-restrictions] scope sync failed; the nightly reconcile will reopen it:", e);
          return false;
        }
      )
    : true;

  const org = await orgCopyContext(b.orgId);
  const rec = await recordEntry(
    buildMemberRestrictionEntry({
      organizationId: b.orgId,
      member: { memberId: memberId ?? "", name },
      change: "lifted",
      startsAt: row.starts_at ?? now.toISOString(),
      endsAt: row.ends_at ?? null,
      until: restrictionUntil(row.ends_at, org.timeZone),
      memberNote: row.member_note ?? "",
      actor,
      occurredAt: now.toISOString(),
    })
  );

  const userId = refId(member?.user);
  const sent = userId
    ? await notifyUsers({
        organizationId: b.orgId,
        recipientUserIds: [userId],
        category: "membership",
        subject: `You can post in ${org.name} again`,
        message: "The board lifted the pause on your posting.",
        path: "/",
        mustReach: true,
      })
    : { bell: 0, push: 0, email: 0 };

  return { lifted: true, liftedAt: plan.patch.lifted_at, ...rec, notified: sent.bell > 0, scopeSynced };
});
