/**
 * POST /api/org/responsibilities/apply-template — add a seed list's jobs
 * ("Florida condominium"). Editors only. Additive and idempotent on title:
 * a title the community already has (trimmed, any case, retired included)
 * is skipped, so applying twice adds nothing.
 */
import { requireResponsibilitiesEdit } from "#core/server/utils/responsibility-access";
import { loadJobs, logRegisterActivity, readBodyWith } from "#core/server/utils/responsibilities";
import { applyTemplateBody } from "#core/shared/responsibilities/schemas";
import { rowsToAdd, templateFor } from "#core/shared/responsibilities/config";
import { sentences } from "#core/shared/responsibilities/activity";
import { createManyAs } from "#core/server/utils/create-as";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const b = await readBodyWith(event, applyTemplateBody);
  const access = await requireResponsibilitiesEdit(event, b.orgId);
  const template = templateFor(b.template);
  if (!template) throw createError({ statusCode: 400, message: "Unknown list." });

  const existing = await loadJobs(b.orgId);
  const add = rowsToAdd(template, existing.map((j) => j.title));
  const base = existing.reduce((m, j) => Math.max(m, j.sort ?? 0), 0);
  if (add.length) {
    await createManyAs(
      "hoa_responsibilities",
      add.map((r, i) => ({
        organization: b.orgId,
        title: r.title,
        category: r.category,
        cadence: r.cadence,
        basis: "unknown",
        status: "active",
        member_visible: true,
        sort: base + i + 1,
      })),
      access.userId
    );
  }

  await logRegisterActivity(event, access, {
    type: "responsibility",
    collection: "hoa_responsibilities",
    id: b.orgId,
    label: sentences.template(add.length, template.label),
    metadata: { action: "apply_template", template: template.key, created: add.length },
  });
  return { created: add.length, skipped: template.rows.length - add.length };
});
