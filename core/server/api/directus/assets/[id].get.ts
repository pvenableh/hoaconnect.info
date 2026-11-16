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
 * community through here instead. Governing originals and page images are
 * images the grant leaves out too, by their `governing-` description
 * (scripts/lib/public-files.ts), so a draft's scan comes only through here.
 *
 * Two rules, and the split is deliberate:
 *
 *   - **Images** need only a session. They stay publicly readable by type — the
 *     logo in every already-sent email and every anonymous landing page depend
 *     on that — so requiring more here would buy nothing and only break the
 *     avatars in `ProjectCard`/`TaskItem`, which already point at this route.
 *   - **Everything else** must resolve to an owning organization and the caller
 *     must belong to it. A file nothing claims is refused, not allowed: see the
 *     fails-closed note in `file-owner.ts`. A lease's document is narrower:
 *     its owner, its tenant and the community's admins (`lease-documents.ts`).
 *
 * Deliberately NOT a general Directus passthrough. It takes a file id and the
 * image transform parameters, nothing else, so it can never be steered into
 * serving something the caller named a different way.
 */

import { readFile } from "@directus/sdk";
import { isSupportFileMarker } from "#core/shared/support/attachments";
import { mayOpenGoverningSourceFile } from "#core/server/utils/governing-sources";
import { mayOpenLeaseDocument } from "#core/server/utils/lease-documents";
import { streamDirectusFile } from "#core/server/utils/asset-stream";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);

  const id = getRouterParam(event, "id");
  if (!id || !UUID.test(id)) {
    throw createError({ statusCode: 400, statusMessage: "A file id is required" });
  }

  const directus = getTypedDirectus();

  let file: { id: string; type?: string | null; filename_download?: string | null; description?: string | null };
  try {
    file = (await directus.request(
      readFile(id, { fields: ["id", "type", "filename_download", "description"] })
    )) as typeof file;
  } catch {
    throw createError({ statusCode: 404, statusMessage: "File not found" });
  }

  // Support attachments are checked against the message they're on, images
  // included; this proxy would hand any image to anyone signed in.
  if (isSupportFileMarker(file.description)) {
    throw createError({
      statusCode: 403,
      statusMessage: "Support attachments download from /api/support/attachments/:messageId/:fileId.",
    });
  }

  const isImage = (file.type || "").startsWith("image/");

  // An original governing document, image or not: belonging to the community
  // is not enough, because a member may not open the scan of a draft.
  const governing = await mayOpenGoverningSourceFile(event, id);
  if (governing === false) {
    throw createError({ statusCode: 403, statusMessage: "Not authorized to read this file." });
  }

  if (!isImage && governing !== true) {
    // Export archives have their own route, which also enforces expiry.
    if (await isDataExportArchive(id)) {
      throw createError({
        statusCode: 403,
        statusMessage: "Export archives download from /api/org/export/:id/download.",
      });
    }

    // A lease's document is its owner's, its tenant's and the admins'
    // (lease-documents.ts). The same file filed in a library is also that
    // library's community's, by the rule below.
    const lease = await mayOpenLeaseDocument(event, String(session.user?.id ?? ""), id);
    const owners = await fileOwnerOrgIds(id, { except: ["hoa_leases"] });
    if (owners.size === 0 && lease !== true) {
      throw createError({ statusCode: 403, statusMessage: "Not authorized to read this file." });
    }

    let allowed = lease === true;
    for (const orgId of allowed ? [] : owners) {
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

  return streamDirectusFile(event, file);
});
