/**
 * POST /api/org/responsibilities — add a job, with optional first holders.
 * Editors only (admin or the `responsibilities` grant).
 */
import { requireResponsibilitiesEdit } from "#core/server/utils/responsibility-access";
import {
  assertArea,
  assertEvidenceInOrg,
  assertProjectInOrg,
  assertTargetInOrg,
  logRegisterActivity,
  readBodyWith,
} from "#core/server/utils/responsibilities";
import { createJobBody } from "#core/shared/responsibilities/schemas";
import { targetColumns, validateTarget, type Target } from "#core/shared/responsibilities/holders";
import { sentences } from "#core/shared/responsibilities/activity";
import { todayUtc } from "#core/shared/roles/role-context";
import { createAs } from "#core/server/utils/create-as";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const b = await readBodyWith(event, createJobBody);
  const access = await requireResponsibilitiesEdit(event, b.orgId);

  assertArea(b.area);
  await assertProjectInOrg(b.orgId, b.project);
  await assertEvidenceInOrg(b.orgId, b.evidence);
  const holders: { target: Target; role: string; start_date: string; notes: string | null }[] = [];
  for (const h of b.holders ?? []) {
    const t = validateTarget(h);
    if (t.ok === false) throw createError({ statusCode: 400, message: t.error });
    await assertTargetInOrg(b.orgId, t.target);
    holders.push({ target: t.target, role: h.role ?? "owner", start_date: h.start_date ?? todayUtc(), notes: h.notes?.trim() || null });
  }

  const job = await createAs<{ id: string }>(
    "hoa_responsibilities",
    {
      organization: b.orgId,
      title: b.title,
      description: b.description ?? null,
      category: b.category,
      cadence: b.cadence ?? null,
      basis: b.basis ?? "unknown",
      basis_reference: b.basis_reference ?? null,
      area: b.area || null,
      status: b.status ?? "active",
      member_visible: b.member_visible ?? true,
      project: b.project ?? null,
      notes: b.notes ?? null,
      sort: b.sort ?? null,
      last_verified: b.last_verified ?? null,
      last_verified_by: b.last_verified ? access.userId : null,
      ...(b.evidence?.length ? { evidence: b.evidence.map((f) => ({ directus_files_id: f })) } : {}),
    },
    access.userId
  );

  for (const h of holders) {
    await createAs(
      "hoa_responsibility_assignees",
      {
        organization: b.orgId,
        responsibility: job.id,
        ...targetColumns(h.target),
        role: h.role,
        start_date: h.start_date,
        notes: h.notes,
      },
      access.userId
    );
  }

  await logRegisterActivity(event, access, {
    type: "responsibility",
    collection: "hoa_responsibilities",
    id: job.id,
    label: sentences.created(b.title),
    metadata: { action: "create", holders: holders.length },
  });
  return { id: job.id };
});
