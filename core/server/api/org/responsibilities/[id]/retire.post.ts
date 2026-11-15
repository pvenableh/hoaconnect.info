/**
 * POST /api/org/responsibilities/[id]/retire — retire a job. Editors only.
 * Its open holder rows end the day before `effective` (default today), with
 * their names frozen. Nothing is deleted; there is no delete route.
 */
import { updateItem } from "@directus/sdk";
import { requireResponsibilitiesEdit } from "#core/server/utils/responsibility-access";
import { idParam, loadAssignees, loadJob, logRegisterActivity, nameToFreeze, readBodyWith } from "#core/server/utils/responsibilities";
import { retireBody } from "#core/shared/responsibilities/schemas";
import { planHandOver } from "#core/shared/responsibilities/plan";
import { sentences } from "#core/shared/responsibilities/activity";
import { todayUtc } from "#core/shared/roles/role-context";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = idParam(event);
  const b = await readBodyWith(event, retireBody);
  const access = await requireResponsibilitiesEdit(event, b.orgId);
  const job = await loadJob(b.orgId, id);
  if (job.status === "retired") throw createError({ statusCode: 409, message: "This job is already retired." });

  const effective = b.effective ?? todayUtc();
  const open = (await loadAssignees(b.orgId, id)).filter((r) => !r.end_date);
  const plans = open.map((r) => ({ row: r, plan: planHandOver(r, null, effective) }));
  for (const { plan } of plans) if (plan.ok === false) throw createError({ statusCode: plan.status, message: plan.error });

  const d = getTypedDirectus();
  const ended: string[] = [];
  for (const { row, plan } of plans) {
    if (plan.ok === false) continue;
    const name = await nameToFreeze(b.orgId, row);
    await d.request(updateItem("hoa_responsibility_assignees" as any, row.id, { end_date: plan.plan.end.end_date, holder_name: name } as any));
    ended.push(name);
  }
  await d.request(updateItem("hoa_responsibilities" as any, id, { status: "retired" } as any));

  await logRegisterActivity(event, access, {
    type: "responsibility",
    collection: "hoa_responsibilities",
    id,
    label: sentences.retired(job.title, ended),
    metadata: { action: "retire", effective, ended: open.map((r) => r.id) },
  });
  return { id, status: "retired", ended: open.map((r) => r.id) };
});
