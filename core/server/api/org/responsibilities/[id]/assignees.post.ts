/**
 * POST /api/org/responsibilities/[id]/assignees — open a holder row beside
 * the others (a backup, a second performer, the first holder). Editors only.
 * To replace a holder, hand over instead.
 */
import { requireResponsibilitiesEdit } from "#core/server/utils/responsibility-access";
import {
  assertTargetInOrg,
  idParam,
  loadAssignees,
  loadJob,
  loadNames,
  logRegisterActivity,
  readBodyWith,
} from "#core/server/utils/responsibilities";
import { addHolderBody } from "#core/shared/responsibilities/schemas";
import { holdsOn, sameTarget, targetColumns, targetOf, validateTarget } from "#core/shared/responsibilities/holders";
import { liveName } from "#core/shared/responsibilities/views";
import { sentences } from "#core/shared/responsibilities/activity";
import { todayUtc } from "#core/shared/roles/role-context";
import { createAs } from "#core/server/utils/create-as";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = idParam(event);
  const b = await readBodyWith(event, addHolderBody);
  const access = await requireResponsibilitiesEdit(event, b.orgId);
  const job = await loadJob(b.orgId, id);
  if (job.status === "retired") throw createError({ statusCode: 409, message: "This job is retired. Make it active first." });

  const t = validateTarget(b);
  if (t.ok === false) throw createError({ statusCode: 400, message: t.error });
  await assertTargetInOrg(b.orgId, t.target);

  const start = b.start_date ?? todayUtc();
  const rows = await loadAssignees(b.orgId, id);
  if (rows.some((r) => holdsOn(r, start) && sameTarget(targetOf(r), t.target))) {
    throw createError({ statusCode: 409, message: "They already hold it on that date." });
  }

  const created = await createAs<{ id: string }>(
    "hoa_responsibility_assignees",
    {
      organization: b.orgId,
      responsibility: id,
      ...targetColumns(t.target),
      role: b.role ?? "owner",
      start_date: start,
      notes: b.notes?.trim() || null,
    },
    access.userId
  );

  const name = liveName(t.target.kind, t.target.value, await loadNames(b.orgId, [{ id: created.id, responsibility: id, ...targetColumns(t.target) }]));
  await logRegisterActivity(event, access, {
    type: "responsibility",
    collection: "hoa_responsibilities",
    id,
    label: sentences.added(job.title, name),
    metadata: { action: "add_holder", assignee: created.id, start_date: start },
  });
  return { id: created.id };
});
