/**
 * POST /api/org/member-restrictions — pause a member's posting in one
 * community. docs/spec-member-restrictions.md.
 *
 * Body: { orgId, member, endsOn?, memberNote, internalNote? }. `endsOn` is the
 * day posting resumes ("YYYY-MM-DD", from midnight on the community's clock);
 * absent or null = until lifted.
 *
 * Admin only. Refuses (400) an admin or a property manager (remove the role
 * first), and (409) a membership that is not active, a current board seat, or
 * a pause already open. Writes the row, re-syncs the member's scope fields
 * (posts_in, and posts_to on their channels), one board-visible ledger entry
 * without the internal note, and a bell the member gets even with
 * notifications off. A failed entry, bell or sync is reported, not hidden.
 */
import { createItem } from "@directus/sdk";
import { z } from "zod";
import { buildMemberRestrictionEntry } from "#core/shared/ledger/entries";
import { INTERNAL_NOTE_MAX, MEMBER_NOTE_MAX, planImpose, restrictionUntil, resumeInstant } from "#core/shared/members/restrictions";
import { idString, loadMemberHolder, readDelegationBody, recordEntry } from "#core/server/utils/delegation";
import {
  holdsCurrentBoardTerm,
  orgCopyContext,
  readRestrictionRows,
  requireRestrictionAdmin,
} from "#core/server/utils/member-restrictions";
import { syncAdminScope } from "#core/server/utils/admin-scope";
import { notifyUsers } from "#core/server/utils/notify";

const body = z.object({
  orgId: idString,
  member: idString,
  endsOn: z.string().trim().max(10).nullable().optional(),
  memberNote: z.string({ message: "Write the note the member will see." }).max(MEMBER_NOTE_MAX + 200),
  internalNote: z.string().max(INTERNAL_NOTE_MAX + 200).nullable().optional(),
});

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const b = await readDelegationBody(event, body);
  const actor = await requireRestrictionAdmin(event, b.orgId);
  const holder = await loadMemberHolder(b.orgId, b.member);

  const config = useRuntimeConfig();
  if (holder.roleId && holder.roleId === config.public.directusRoleHoaAdmin) {
    throw createError({ statusCode: 400, message: "An admin's posting can't be paused. Remove the admin role first." });
  }
  if (holder.roleId && holder.roleId === config.public.directusRolePropertyManager) {
    throw createError({ statusCode: 400, message: "A property manager's posting can't be paused. End their management first." });
  }
  if (holder.status !== "active") {
    throw createError({ statusCode: 409, message: "Only an active member's posting can be paused." });
  }
  const now = new Date();
  if (await holdsCurrentBoardTerm(holder.id, now)) {
    throw createError({ statusCode: 409, message: "They hold a board seat. End or change their term first." });
  }

  const org = await orgCopyContext(b.orgId);
  let endsAt: string | null = null;
  if (b.endsOn) {
    const at = resumeInstant(b.endsOn, org.timeZone);
    if (!at) throw createError({ statusCode: 400, message: "That end date is not a date." });
    endsAt = at.toISOString();
  }
  const plan = planImpose({ rows: await readRestrictionRows(b.orgId, holder.id), now, endsAt, memberNote: b.memberNote, internalNote: b.internalNote });
  if (!("row" in plan)) throw createError({ statusCode: plan.status, message: plan.message });

  const created: any = await getTypedDirectus().request(
    createItem("hoa_member_restrictions" as any, {
      organization: b.orgId,
      member: holder.id,
      ...plan.row,
      imposed_by: actor.userId,
      holder_name: holder.name || null,
      user_created: actor.userId,
    } as any)
  );

  const scopeSynced = await syncAdminScope([holder.id]).then(
    () => true,
    (e) => {
      console.error("[member-restrictions] scope sync failed; the nightly reconcile will close it:", e);
      return false;
    }
  );

  const until = restrictionUntil(plan.row.ends_at, org.timeZone);
  const rec = await recordEntry(
    buildMemberRestrictionEntry({
      organizationId: b.orgId,
      member: { memberId: holder.id, name: holder.name },
      change: "restricted",
      startsAt: plan.row.starts_at,
      endsAt: plan.row.ends_at,
      until,
      memberNote: plan.row.member_note,
      actor,
      occurredAt: now.toISOString(),
    })
  );

  const sent = holder.userId
    ? await notifyUsers({
        organizationId: b.orgId,
        recipientUserIds: [holder.userId],
        category: "membership",
        subject: `Posting is paused in ${org.name}`,
        message: `${until[0]!.toUpperCase()}${until.slice(1)}. ${plan.row.member_note}`,
        path: "/requests",
        mustReach: true,
      })
    : { bell: 0, push: 0, email: 0 };

  return {
    restriction: { id: String(created?.id ?? ""), startsAt: plan.row.starts_at, endsAt: plan.row.ends_at, until },
    ...rec,
    notified: sent.bell > 0,
    scopeSynced,
  };
});
