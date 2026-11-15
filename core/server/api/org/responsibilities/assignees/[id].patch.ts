/**
 * PATCH /api/org/responsibilities/assignees/[id] — correct a holder row in
 * place: notes, role, a wrong start date, or a wrong end date on a row that
 * has already ended. Editors only. The holder never changes here (a new
 * holder is a hand-over), and an open row is ended by hand-over, not here.
 */
import { updateItem } from "@directus/sdk";
import { requireResponsibilitiesEdit } from "#core/server/utils/responsibility-access";
import { idParam, loadAssignee, loadJob, loadNames, logRegisterActivity, readBodyWith } from "#core/server/utils/responsibilities";
import { correctHolderBody } from "#core/shared/responsibilities/schemas";
import { displayName } from "#core/shared/responsibilities/views";
import { fieldWords, sentences } from "#core/shared/responsibilities/activity";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = idParam(event);
  const b = await readBodyWith(event, correctHolderBody);
  const access = await requireResponsibilitiesEdit(event, b.orgId);
  const row = await loadAssignee(b.orgId, id);

  if (b.end_date !== undefined && !row.end_date) {
    throw createError({ statusCode: 409, message: "This holder is current. Hand it over to end it." });
  }
  const start = b.start_date ?? row.start_date;
  const end = b.end_date ?? row.end_date;
  if (start && end && end < start) throw createError({ statusCode: 400, message: "The row ends before it starts." });

  const before: Record<string, unknown> = {};
  const patch: Record<string, unknown> = {};
  for (const k of ["notes", "role", "start_date", "end_date"] as const) {
    const v = b[k];
    if (v === undefined) continue;
    const next = k === "notes" ? (typeof v === "string" ? v.trim() || null : null) : v;
    if ((row as unknown as Record<string, unknown>)[k] === next) continue;
    before[k] = (row as unknown as Record<string, unknown>)[k] ?? null;
    patch[k] = next;
  }
  const changed = Object.keys(patch);
  if (!changed.length) return { id, changed: [] };
  await getTypedDirectus().request(updateItem("hoa_responsibility_assignees" as any, id, patch as any));

  const job = await loadJob(b.orgId, row.responsibility);
  const name = displayName(row, await loadNames(b.orgId, [row]));
  await logRegisterActivity(event, access, {
    type: "responsibility",
    collection: "hoa_responsibilities",
    id: row.responsibility,
    label: sentences.corrected(job.title, name, fieldWords(changed)),
    metadata: { action: "correct_holder", assignee: id, before, after: patch },
  });
  return { id, changed };
});
