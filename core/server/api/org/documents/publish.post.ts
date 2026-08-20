/**
 * POST /api/org/documents/publish
 *
 * Publish one or more documents — and record that the community's library grew.
 *
 * Like the grant-change route, the recording is why this exists. Documents were
 * created straight from the browser with the generic Directus proxy, status and
 * `date_published` set client-side, which works and leaves no trace: "when did
 * the amended rules become available to owners, and who made them available"
 * was not answerable afterwards. That question is one an association really does
 * have to answer years later, from a cold start, sometimes to a lawyer.
 *
 * **This route owns the draft → published transition.** The upload screens now
 * create documents as drafts and call this to publish them, so there is one
 * place where a document becomes readable by a community and one place where
 * that fact is recorded. A publish that fails leaves a draft — visible to the
 * admin who uploaded it, invisible to everyone else, which is the safe way for
 * this to break.
 *
 * Idempotent: publishing an already-published document changes nothing and
 * writes nothing. Admin, or a property manager holding the `documents` grant.
 */

import { readItems, updateItem } from "@directus/sdk";
import { buildDocumentPublishedEntry } from "#core/shared/ledger/entries";

/** Directus returns a relation as an object when the field is dotted, a string otherwise. */
function nameOf(relation: any): string | null {
  if (!relation || typeof relation !== "object") return null;
  const name = relation.name ?? relation.filename_download ?? null;
  return name ? String(name) : null;
}

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const body = await readBody(event);

  const orgId = String(body?.orgId || "").trim();
  const ids = (Array.isArray(body?.documentIds) ? body.documentIds : [body?.documentId])
    .map((id: unknown) => String(id ?? "").trim())
    .filter(Boolean);

  if (!orgId || !ids.length) {
    throw createError({
      statusCode: 400,
      statusMessage: "orgId and at least one document id are required",
    });
  }

  await requireAdminOrManagerGrant(event, orgId, "documents");

  const directus = getTypedDirectus();

  // Read THROUGH the org filter: an id from another community must miss rather
  // than publish someone else's draft.
  const [rows, orgs] = await Promise.all([
    directus.request(
      readItems("hoa_documents", {
        filter: { id: { _in: ids }, organization: { _eq: orgId } },
        fields: [
          "id",
          "title",
          "status",
          "document_category.name",
          "file.filename_download",
        ] as any,
        limit: ids.length,
      })
    ) as Promise<any[]>,
    directus.request(
      readItems("hoa_organizations", {
        filter: { id: { _eq: orgId } },
        fields: ["name"] as any,
        limit: 1,
      })
    ) as Promise<any[]>,
  ]);

  if (!rows?.length) {
    throw createError({ statusCode: 404, statusMessage: "No such document in this community." });
  }

  const organizationName = orgs?.[0]?.name ?? null;
  const user: any = session.user ?? {};
  const actor = {
    userId: user.id ?? null,
    name:
      [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
      user.email ||
      "An administrator",
    email: user.email ?? null,
  };

  const published: string[] = [];
  const summaries: string[] = [];
  let recordError: string | null = null;

  for (const row of rows) {
    const occurredAt = new Date().toISOString();
    const entry = buildDocumentPublishedEntry({
      organizationId: orgId,
      organizationName,
      document: {
        documentId: String(row.id),
        title: row.title ?? "",
        categoryName: nameOf(row.document_category),
        fileName: nameOf(row.file),
      },
      previousStatus: row.status ?? null,
      actor,
      occurredAt,
    });

    // Already published: nothing to do to the row and nothing to record.
    if (!entry) continue;

    await directus.request(
      updateItem("hoa_documents", String(row.id), {
        status: "published",
        date_published: occurredAt,
      } as any)
    );
    published.push(String(row.id));
    summaries.push(entry.summary);

    // The generic Directus proxy reindexes RAG on every write, and `ingestItem`
    // only indexes PUBLISHED documents — so a document created as a draft and
    // published here would never reach the index if this call were missing.
    // Best-effort and non-blocking, exactly as the proxy does it.
    if (isRagConfigured()) void ingestItem("hoa_documents", String(row.id)).catch(() => {});

    // The document is public now. If the entry fails, say so rather than
    // reporting a clean success on a history with a hole in it — and keep
    // publishing the rest: a batch half-published is worse than a batch
    // published with one missing ledger row, which is at least reported.
    try {
      await writeAuditEntry(entry);
    } catch (e: any) {
      console.error("[documents/publish] audit write failed:", e);
      recordError =
        e?.message || "The document was published but could not be recorded in the ledger.";
    }
  }

  return {
    published,
    /** How many of the requested ids were already published — a no-op, not a failure. */
    skipped: rows.length - published.length,
    recorded: published.length > 0 && !recordError,
    recordError,
    summaries,
  };
});
