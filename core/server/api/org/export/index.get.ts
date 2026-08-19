/**
 * GET /api/org/export?orgId=...
 *
 * This org's export history, newest first — what the Settings tab polls while a
 * job is running. HOA-Admin only, same reasoning as the POST: the row reveals
 * what was exported and when, and links to an archive full of member PII.
 *
 * The manifest is returned trimmed rather than whole. The UI wants row counts
 * and what was withheld; shipping the full excluded-collection prose on every
 * poll would be several KB per row for nothing.
 */

import { readItems } from "@directus/sdk";
import { totalRows, type ExportManifest } from "#core/shared/export/manifest";

interface ExportRow {
  id: string;
  status: string;
  tier: string;
  include_files: boolean;
  size_bytes: number | string | null;
  manifest: ExportManifest | null;
  error: string | null;
  date_created: string | null;
  date_completed: string | null;
  expires_at: string | null;
  requested_by: { first_name?: string | null; last_name?: string | null } | string | null;
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event);
  const query = getQuery(event);
  const orgId = String(query.orgId || "").trim();
  if (!orgId) throw createError({ statusCode: 400, statusMessage: "orgId is required" });

  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Only an administrator can view this community's exports.",
    });
  }

  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);

  const rows = (await getTypedDirectus().request(
    readItems("hoa_data_exports", {
      filter: { organization: { _eq: orgId } },
      sort: ["-date_created"],
      limit,
      fields: [
        "id",
        "status",
        "tier",
        "include_files",
        "size_bytes",
        "manifest",
        "error",
        "date_created",
        "date_completed",
        "expires_at",
        { requested_by: ["first_name", "last_name"] },
      ],
    })
  )) as unknown as ExportRow[];

  return {
    exports: rows.map((row) => {
      const requester =
        row.requested_by && typeof row.requested_by === "object"
          ? [row.requested_by.first_name, row.requested_by.last_name].filter(Boolean).join(" ")
          : null;

      return {
        id: row.id,
        status: row.status,
        tier: row.tier,
        includeFiles: row.include_files === true,
        // Directus returns bigInteger as a string; coerce at the boundary so the
        // UI never does arithmetic on "5242880".
        sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
        error: row.error,
        dateCreated: row.date_created,
        dateCompleted: row.date_completed,
        expiresAt: row.expires_at,
        requestedBy: requester || null,
        summary: row.manifest
          ? {
              rows: totalRows(row.manifest),
              collections: row.manifest.collections?.length ?? 0,
              files: row.manifest.files,
            }
          : null,
      };
    }),
  };
});
