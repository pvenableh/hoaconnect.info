/**
 * GET /api/org/export/:id/download
 *
 * Streams a finished archive to the admin who is allowed to have it.
 *
 * The download deliberately proxies through here rather than handing out a
 * Directus asset URL. A raw /assets/<id> link would either need the file to be
 * publicly readable — a zip of every member's contact details, on a guessable
 * URL — or need the admin token in the browser. Proxying costs one hop and keeps
 * both the authorization and the org scoping on the server.
 *
 * Expiry is enforced HERE as well as by the worker's purge. The worker runs on a
 * cron, so between the moment an archive expires and the moment the worker next
 * wakes, the file still exists; without this check it would still be
 * downloadable.
 */

import { readItem } from "@directus/sdk";

interface ExportJob {
  id: string;
  organization: string | { id: string; slug?: string | null };
  status: string;
  tier: string;
  file: string | { id: string } | null;
  expires_at: string | null;
}

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const id = getRouterParam(event, "id");
  if (!id) throw createError({ statusCode: 400, statusMessage: "Export id is required" });

  const directus = getTypedDirectus();

  let job: ExportJob;
  try {
    job = (await directus.request(
      readItem("hoa_data_exports", id, {
        fields: [
          "id",
          "status",
          "tier",
          "file",
          "expires_at",
          { organization: ["id", "slug"] },
        ],
      })
    )) as unknown as ExportJob;
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Export not found" });
  }

  const orgId = typeof job.organization === "string" ? job.organization : job.organization?.id;
  if (!orgId) throw createError({ statusCode: 404, statusMessage: "Export not found" });

  // Authorize against the export's OWN org, never an org id from the request —
  // otherwise an admin of any community could name their own org and pull
  // another community's archive.
  const admin = await checkAdminAccess(event, orgId);
  if (!admin.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: "Not authorized to download this export." });
  }

  if (job.status !== "ready") {
    throw createError({
      statusCode: 409,
      statusMessage:
        job.status === "expired"
          ? "This export has expired. Request a new one."
          : "This export is not ready yet.",
    });
  }

  if (job.expires_at && new Date(job.expires_at).getTime() <= Date.now()) {
    throw createError({
      statusCode: 410,
      statusMessage: "This export has expired. Request a new one.",
    });
  }

  const fileId = typeof job.file === "string" ? job.file : job.file?.id;
  if (!fileId) {
    throw createError({ statusCode: 410, statusMessage: "This export's archive is no longer available." });
  }

  const config = useRuntimeConfig();
  const url = config.directus?.url || config.public.directusUrl;
  const token = config.directus?.staticToken;

  const upstream = await fetch(`${url}/assets/${fileId}?download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!upstream.ok || !upstream.body) {
    throw createError({ statusCode: 502, statusMessage: "Could not read the archive." });
  }

  // Name the file for a human's Downloads folder, not for the database.
  const slug =
    typeof job.organization === "object" ? job.organization?.slug || null : null;
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${slug || "community"}-${job.tier}-export-${stamp}.zip`;
  setResponseHeader(event, "Content-Type", "application/zip");
  setResponseHeader(event, "Content-Disposition", `attachment; filename="${filename}"`);
  const length = Number(upstream.headers.get("content-length"));
  if (Number.isFinite(length) && length > 0) {
    setResponseHeader(event, "Content-Length", length);
  }
  // Never let a proxy or the browser keep a copy of an archive full of PII.
  setResponseHeader(event, "Cache-Control", "private, no-store");

  return sendStream(event, upstream.body as unknown as ReadableStream);
});
