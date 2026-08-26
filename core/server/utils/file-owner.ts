/**
 * "Which community does this file belong to?"
 *
 * Directus files are a flat, org-less pool — a file id carries no tenancy of its
 * own. Ownership only exists in the rows that point AT the file, so answering
 * the question means asking every collection that holds a file reference.
 *
 * This exists because the public read on `directus_files` is now filtered to
 * `type _starts_with image/`, which makes every PDF, zip and recording private.
 * Members still have to reach their own community's documents, and the only
 * honest way to authorize that is to resolve the file back to an organization
 * and check membership against it.
 *
 * FAILS CLOSED. An empty set means "no owner found", and the caller must treat
 * that as a refusal rather than as "unowned, therefore harmless" — an
 * unrecognised private file is exactly the case where guessing wrong leaks one
 * community's document to another. Adding a new collection that stores a file
 * means adding it to the tables below; forgetting to costs a 403, not a leak.
 */

import { readItems } from "@directus/sdk";

/** Collections that point straight at a file AND carry their own `organization`. */
const DIRECT_OWNERS: Array<{ collection: string; field: string }> = [
  { collection: "hoa_documents", field: "file" },
  { collection: "hoa_meetings", field: "notice_file" },
  { collection: "hoa_meetings", field: "recording_file" },
  { collection: "hoa_leases", field: "document" },
  { collection: "payment_expenses", field: "receipt" },
  { collection: "hoa_amenities", field: "image" },
  { collection: "hoa_pets", field: "image" },
  { collection: "hoa_vehicles", field: "image" },
  { collection: "hoa_newsletter_blocks", field: "thumbnail" },
];

/** Many-to-many junctions, whose organization lives one hop up on the parent. */
const JUNCTION_OWNERS: Array<{ collection: string; parentField: string }> = [
  { collection: "hoa_emails_files", parentField: "hoa_emails_id" },
  { collection: "hoa_meetings_files", parentField: "hoa_meetings_id" },
  { collection: "hoa_projects_files", parentField: "hoa_projects_id" },
  { collection: "hoa_project_events_files", parentField: "hoa_project_events_id" },
];

const asId = (v: unknown): string | null =>
  typeof v === "string" ? v : ((v as { id?: string } | null)?.id ?? null);

/**
 * Every organization that claims this file. Usually zero or one; a file reused
 * across two rows in the same community still yields one id.
 *
 * Errors from any single lookup are swallowed *per collection* — a collection
 * that does not exist in a given deployment must not take down the whole
 * resolution — but a file that resolves to nothing is still a refusal upstream.
 */
export async function fileOwnerOrgIds(fileId: string): Promise<Set<string>> {
  const directus = getTypedDirectus();
  const orgIds = new Set<string>();

  await Promise.all([
    ...DIRECT_OWNERS.map(async ({ collection, field }) => {
      try {
        const rows = (await directus.request(
          readItems(collection as never, {
            filter: { [field]: { _eq: fileId } },
            fields: ["organization"],
            limit: -1,
          } as never)
        )) as unknown as Array<{ organization?: unknown }>;
        for (const r of rows || []) {
          const id = asId(r?.organization);
          if (id) orgIds.add(id);
        }
      } catch {
        /* collection absent or unreadable — other owners still answer */
      }
    }),
    ...JUNCTION_OWNERS.map(async ({ collection, parentField }) => {
      try {
        const rows = (await directus.request(
          readItems(collection as never, {
            filter: { directus_files_id: { _eq: fileId } },
            fields: [`${parentField}.organization`],
            limit: -1,
          } as never)
        )) as unknown as Array<Record<string, { organization?: unknown } | null>>;
        for (const r of rows || []) {
          const id = asId(r?.[parentField]?.organization);
          if (id) orgIds.add(id);
        }
      } catch {
        /* see above */
      }
    }),
  ]);

  return orgIds;
}

/**
 * Data-export archives are deliberately NOT resolvable here.
 *
 * They have their own download route, which additionally enforces the archive's
 * expiry — the worker purges on a cron, so between expiry and purge the file is
 * still on disk. Letting the generic asset proxy serve one would quietly skip
 * that check, so this proxy refuses them and points at the route that does it
 * properly.
 */
export async function isDataExportArchive(fileId: string): Promise<boolean> {
  try {
    const rows = (await getTypedDirectus().request(
      readItems("hoa_data_exports" as never, {
        filter: { file: { _eq: fileId } },
        fields: ["id"],
        limit: 1,
      } as never)
    )) as unknown as unknown[];
    return (rows?.length ?? 0) > 0;
  } catch {
    return false;
  }
}
