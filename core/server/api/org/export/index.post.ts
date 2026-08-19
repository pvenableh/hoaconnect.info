/**
 * POST /api/org/export
 *
 * Queue a Data Trust export. HOA-Admin only — the archive contains every
 * member's contact details, the community's finances and (in the full tier) the
 * board's private material, so this is deliberately NOT open to board members or
 * to property managers holding grants.
 *
 * The route only writes the job row. The archive is built by the droplet worker
 * (scripts/data-export-worker.ts), because org storage runs to hundreds of
 * gigabytes and because a board triggering an export mid-dispute has to get it
 * whether or not they keep the tab open.
 */

import { createItem, readItems } from "@directus/sdk";
import { EXPORT_TIERS, type ExportTier } from "#core/shared/export/collections";
import { EXPORT_TTL_DAYS } from "#core/shared/export/manifest";

/** Job states that mean "there is already work in flight for this org". */
const IN_FLIGHT = ["queued", "running"] as const;

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const body = await readBody(event);

  const orgId = String(body?.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, statusMessage: "orgId is required" });

  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only an administrator can export this community's data.",
    });
  }

  const tier = String(body?.tier || "full") as ExportTier;
  if (!EXPORT_TIERS.includes(tier)) {
    throw createError({ statusCode: 400, statusMessage: "Unknown export tier." });
  }
  const includeFiles = body?.includeFiles === true;

  const directus = getTypedDirectus();

  // One at a time per org. Not a rate limit for abuse's sake — a second worker
  // claiming the same org would double the disk and IO for an identical result.
  const inFlight = (await directus.request(
    readItems("hoa_data_exports", {
      filter: { organization: { _eq: orgId }, status: { _in: [...IN_FLIGHT] } },
      fields: ["id", "status", "date_created"],
      limit: 1,
    })
  )) as Array<{ id: string; status: string }>;

  const existing = inFlight[0];
  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: "An export is already being prepared for this community.",
      data: { exportId: existing.id, status: existing.status },
    });
  }

  const session = await getUserSession(event);
  const created = (await directus.request(
    createItem("hoa_data_exports", {
      organization: orgId,
      requested_by: session?.user?.id ?? null,
      status: "queued",
      tier,
      include_files: includeFiles,
    })
  )) as { id: string };

  return {
    id: created.id,
    status: "queued",
    tier,
    includeFiles,
    ttlDays: EXPORT_TTL_DAYS,
  };
});
