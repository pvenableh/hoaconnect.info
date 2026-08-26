/**
 * GET /api/directus/assets/:id
 *
 * Serves a Directus file to the member who is allowed to have it.
 *
 * Until now the app handed the browser a bare `admin.hoaconnect.info/assets/<id>`
 * URL and let the Directus **public** policy do the serving — which meant no
 * serving decision at all. Anonymously, that URL returned 605 Lincoln Road's
 * balance sheets, its approved meeting minutes, and a data-export archive, to
 * anyone who asked. The public grant is now filtered to `type _starts_with
 * image/`, so every PDF, zip and recording is private and reaches its own
 * community through here instead.
 *
 * Two rules, and the split is deliberate:
 *
 *   - **Images** need only a session. They stay publicly readable by type — the
 *     logo in every already-sent email and every anonymous landing page depend
 *     on that — so requiring more here would buy nothing and only break the
 *     avatars in `ProjectCard`/`TaskItem`, which already point at this route.
 *   - **Everything else** must resolve to an owning organization and the caller
 *     must belong to it. A file nothing claims is refused, not allowed: see the
 *     fails-closed note in `file-owner.ts`.
 *
 * Deliberately NOT a general Directus passthrough. It takes a file id and the
 * image transform parameters, nothing else, so it can never be steered into
 * serving something the caller named a different way.
 */

import { readFile } from "@directus/sdk";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The only query params forwarded upstream — an allow-list, not a filter. */
const TRANSFORM_KEYS = ["width", "height", "fit", "quality", "format", "key", "download"] as const;

export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  const id = getRouterParam(event, "id");
  if (!id || !UUID.test(id)) {
    throw createError({ statusCode: 400, statusMessage: "A file id is required" });
  }

  const directus = getTypedDirectus();

  let file: { id: string; type?: string | null; filename_download?: string | null };
  try {
    file = (await directus.request(
      readFile(id, { fields: ["id", "type", "filename_download"] })
    )) as typeof file;
  } catch {
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  }

  const isImage = (file.type || "").startsWith("image/");

  if (!isImage) {
    // Export archives have their own route, which also enforces expiry.
    if (await isDataExportArchive(id)) {
      throw createError({
        statusCode: 403,
        statusMessage: "Export archives download from /api/org/export/:id/download.",
      });
    }

    const owners = await fileOwnerOrgIds(id);
    if (owners.size === 0) {
      throw createError({ statusCode: 403, statusMessage: "Not authorized to read this file." });
    }

    let allowed = false;
    for (const orgId of owners) {
      const [member, admin] = await Promise.all([
        checkMembership(event, orgId),
        checkAdminAccess(event, orgId),
      ]);
      if (member.isMember || admin.isAdmin) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      throw createError({ statusCode: 403, statusMessage: "Not authorized to read this file." });
    }
  }

  const config = useRuntimeConfig();
  const url = config.directus?.url || config.public.directusUrl;
  const token = config.directus?.staticToken;

  const incoming = getQuery(event);
  const params = new URLSearchParams();
  for (const key of TRANSFORM_KEYS) {
    const value = incoming[key];
    if (value !== undefined && value !== null && value !== "") {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();

  const upstream = await fetch(`${url}/assets/${id}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!upstream.ok || !upstream.body) {
    throw createError({ statusCode: 502, statusMessage: "Could not read the file." });
  }

  const contentType = upstream.headers.get("content-type");
  if (contentType) setResponseHeader(event, "Content-Type", contentType);
  const length = Number(upstream.headers.get("content-length"));
  if (Number.isFinite(length) && length > 0) setResponseHeader(event, "Content-Length", length);
  if (file.filename_download) {
    setResponseHeader(
      event,
      "Content-Disposition",
      `inline; filename="${file.filename_download.replace(/"/g, "")}"`
    );
  }
  // A shared cache must never hold one member's document for the next visitor.
  setResponseHeader(event, "Cache-Control", "private, no-store");

  return sendStream(event, upstream.body as unknown as ReadableStream);
});
