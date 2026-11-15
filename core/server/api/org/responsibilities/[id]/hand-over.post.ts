/**
 * POST /api/org/responsibilities/[id]/hand-over — end one holder row and open
 * the next, in one call (plan §3.4, "History: end, don't erase"). Editors only.
 *
 * `effective` is the next holder's first day; the current row ends the day
 * before and freezes its holder's name. Without `next` the row only ends and
 * the job reads unassigned from `effective`. If opening the next row fails,
 * the end is undone, so a hand-over never half happens.
 */
import { createItem, updateItem } from "@directus/sdk";
import { requireResponsibilitiesEdit } from "#core/server/utils/responsibility-access";
import {
  assertTargetInOrg,
  idParam,
  loadAssignee,
  loadJob,
  loadNames,
  logRegisterActivity,
  nameToFreeze,
  readBodyWith,
} from "#core/server/utils/responsibilities";
import { handOverBody } from "#core/shared/responsibilities/schemas";
import { planHandOver } from "#core/shared/responsibilities/plan";
import { liveName } from "#core/shared/responsibilities/views";
import { sentences } from "#core/shared/responsibilities/activity";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = idParam(event);
  const b = await readBodyWith(event, handOverBody);
  const access = await requireResponsibilitiesEdit(event, b.orgId);
  const job = await loadJob(b.orgId, id);
  if (job.status === "retired") throw createError({ statusCode: 409, message: "This job is retired." });
  const current = await loadAssignee(b.orgId, b.assignee);
  if (current.responsibility !== id) throw createError({ statusCode: 404, message: "Holder not found" });

  const r = planHandOver(current, b.next ?? null, b.effective);
  if (r.ok === false) throw createError({ statusCode: r.status, message: r.error });
  const { end, open, target } = r.plan;
  if (target) await assertTargetInOrg(b.orgId, target);

  const d = getTypedDirectus();
  const fromName = await nameToFreeze(b.orgId, current);
  await d.request(updateItem("hoa_responsibility_assignees" as any, end.id, { end_date: end.end_date, holder_name: fromName } as any));

  let opened: string | null = null;
  if (open) {
    try {
      const created = (await d.request(
        createItem("hoa_responsibility_assignees" as any, {
          organization: b.orgId,
          responsibility: id,
          ...open,
          user_created: access.userId,
        } as any)
      )) as unknown as { id: string };
      opened = created.id;
    } catch (e) {
      console.error("[responsibilities] hand-over open failed; undoing the end:", e);
      await d.request(updateItem("hoa_responsibility_assignees" as any, end.id, { end_date: null, holder_name: current.holder_name ?? null } as any));
      throw createError({ statusCode: 500, message: "Couldn't hand it over. Nothing changed." });
    }
  }

  const toName = target
    ? liveName(target.kind, target.value, await loadNames(b.orgId, [{ id: opened ?? "", responsibility: id, ...(open as object) }]))
    : null;
  await logRegisterActivity(event, access, {
    type: "responsibility",
    collection: "hoa_responsibilities",
    id,
    label: sentences.handedOver(job.title, fromName, toName),
    metadata: { action: "hand_over", ended: end.id, opened, effective: b.effective },
  });
  return { ended: end.id, opened };
});
