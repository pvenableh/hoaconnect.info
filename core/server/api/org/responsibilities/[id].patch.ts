/**
 * PATCH /api/org/responsibilities/[id] — change a job's facts. Editors only.
 * Status moves only between active and disputed (a retired job may be made
 * active again); retiring is its own route. Setting `last_verified` records
 * the caller as `last_verified_by`. Holders change through hand-over, never here.
 */
import { readItems, updateItem } from "@directus/sdk";
import { requireResponsibilitiesEdit } from "#core/server/utils/responsibility-access";
import {
  assertArea,
  assertEvidenceInOrg,
  assertProjectInOrg,
  idParam,
  loadJob,
  logRegisterActivity,
  readBodyWith,
} from "#core/server/utils/responsibilities";
import { patchJobBody } from "#core/shared/responsibilities/schemas";
import { fieldWords, sentences } from "#core/shared/responsibilities/activity";

const SIMPLE = [
  "title", "description", "category", "cadence", "basis", "basis_reference", "area", "status",
  "member_visible", "project", "notes", "sort", "last_verified",
] as const;

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const id = idParam(event);
  const b = await readBodyWith(event, patchJobBody);
  const access = await requireResponsibilitiesEdit(event, b.orgId);
  const job = await loadJob(b.orgId, id);

  if (b.area !== undefined) assertArea(b.area);
  if (b.project !== undefined) await assertProjectInOrg(b.orgId, b.project);
  if (b.evidence !== undefined) await assertEvidenceInOrg(b.orgId, b.evidence);

  const patch: Record<string, unknown> = {};
  const changed: string[] = [];
  for (const k of SIMPLE) {
    const v = (b as Record<string, unknown>)[k];
    if (v === undefined) continue;
    const next = k === "area" && v === "" ? null : v;
    if ((job as unknown as Record<string, unknown>)[k] === next) continue;
    patch[k] = next;
    changed.push(k);
  }
  if (patch.last_verified !== undefined) patch.last_verified_by = patch.last_verified ? access.userId : null;

  const d = getTypedDirectus();
  if (b.evidence !== undefined) {
    // Replace the set: delete the junction rows that go, create the ones that come.
    const current = ((await d.request(
      readItems("hoa_responsibilities_files" as any, {
        filter: { hoa_responsibilities_id: { _eq: id } } as any,
        fields: ["id", "directus_files_id"] as any,
        limit: -1,
      })
    )) ?? []) as { id: string | number; directus_files_id: string }[];
    const want = new Set(b.evidence);
    const have = new Set(current.map((r) => r.directus_files_id));
    const remove = current.filter((r) => !want.has(r.directus_files_id)).map((r) => r.id);
    const add = b.evidence.filter((f) => !have.has(f)).map((f) => ({ directus_files_id: f }));
    if (remove.length || add.length) {
      patch.evidence = { create: add, update: [], delete: remove };
      changed.push("evidence");
    }
  }

  if (!changed.length) return { id, changed: [] };
  await d.request(updateItem("hoa_responsibilities" as any, id, patch as any));

  const onlyVerified = changed.length === 1 && changed[0] === "last_verified" && !!patch.last_verified;
  await logRegisterActivity(event, access, {
    type: "responsibility",
    collection: "hoa_responsibilities",
    id,
    label: onlyVerified ? sentences.verified(String(patch.title ?? job.title)) : sentences.updated(String(patch.title ?? job.title), fieldWords(changed)),
    metadata: { action: onlyVerified ? "verify" : "update", fields: changed },
  });
  return { id, changed };
});
