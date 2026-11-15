/**
 * PATCH /api/org/responsibilities/visibility — the two publishing switches:
 * "Published to owners" and "Show unassigned jobs to owners". ADMIN ONLY:
 * the `responsibilities` work switch is not enough, because the delegate may
 * be the party who is not answering (plan §3.4). Each change of either
 * switch is written to hoa_activity with who made it.
 */
import { updateItem } from "@directus/sdk";
import { requireResponsibilitiesAdmin } from "#core/server/utils/responsibility-access";
import { loadOrgSwitches, logRegisterActivity, readBodyWith } from "#core/server/utils/responsibilities";
import { visibilityBody } from "#core/shared/responsibilities/schemas";
import { sentences } from "#core/shared/responsibilities/activity";

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const b = await readBodyWith(event, visibilityBody);
  const access = await requireResponsibilitiesAdmin(event, b.orgId);
  const org = await loadOrgSwitches(b.orgId);

  const patch: Record<string, boolean> = {};
  const changes: { field: string; on: boolean; label: string }[] = [];
  if (b.published !== undefined && b.published !== org.published) {
    patch.responsibilities_published = b.published;
    changes.push({ field: "responsibilities_published", on: b.published, label: sentences.published(b.published) });
  }
  if (b.showUnassigned !== undefined && b.showUnassigned !== org.showUnassigned) {
    patch.responsibilities_show_unassigned = b.showUnassigned;
    changes.push({ field: "responsibilities_show_unassigned", on: b.showUnassigned, label: sentences.showUnassigned(b.showUnassigned) });
  }
  if (changes.length) {
    await getTypedDirectus().request(updateItem("hoa_organizations", b.orgId, patch as any));
    for (const c of changes) {
      await logRegisterActivity(event, access, {
        type: "responsibility",
        collection: "hoa_organizations",
        id: b.orgId,
        label: c.label,
        metadata: { action: "visibility", field: c.field, from: !c.on, to: c.on },
      });
    }
  }
  return {
    published: patch.responsibilities_published ?? org.published,
    showUnassigned: patch.responsibilities_show_unassigned ?? org.showUnassigned,
  };
});
