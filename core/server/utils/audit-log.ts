/**
 * The only way anything gets into `org_audit_log`.
 *
 * There is deliberately no `updateAuditEntry` and no `deleteAuditEntry` in this
 * file, and there should never be one. VISION lists "no mutable audit log, ever"
 * under What NOT to Build, and the cheapest way to keep that true is for the
 * capability to be absent rather than merely unused: a function that exists gets
 * called eventually, by someone fixing a typo in a summary at 2am.
 *
 * Corrections are new entries. If an entry is wrong, the honest record is that
 * it was written and then corrected — that is what an audit trail is for.
 *
 * **What this does and does not guarantee.** No Directus role can touch the
 * collection (the migration grants none), and the app exposes no update or
 * delete path. But this writer uses the admin token, and so could anything else
 * holding it — immutability is a property of our code until the database trigger
 * in `docs/go-live-checklist.md` §3c is installed on the droplet. Claiming more
 * than that in front of a board would be the kind of overstatement this whole
 * pillar exists to avoid.
 */

import { createItem } from "@directus/sdk";
import type { AuditEntry } from "#core/shared/transition/audit";

/**
 * Append one entry. Returns the new row id.
 *
 * Deliberately NOT swallowing failures. A transition that silently doesn't get
 * recorded is worse than one that fails loudly — the caller still holds the
 * knowledge of what it just did, and the execute route uses that to tell the
 * admin the writes landed but the record didn't, rather than reporting success
 * on a history that has a hole in it.
 */
export async function writeAuditEntry(entry: AuditEntry): Promise<string> {
  const directus = getTypedDirectus();
  const row = (await directus.request(
    createItem("org_audit_log", {
      organization: entry.organization,
      event_type: entry.event_type,
      occurred_at: entry.occurred_at,
      actor_user: entry.actor_user,
      actor_name: entry.actor_name,
      actor_email: entry.actor_email,
      visibility: entry.visibility,
      summary: entry.summary,
      payload: entry.payload,
      schema_version: entry.schema_version,
    } as any)
  )) as { id: string };

  return row.id;
}
