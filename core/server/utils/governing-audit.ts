// The governing-documents audit trail (spec §7): one append-only row per
// change that people may later argue about. No role has any permission on the
// collection; rows are written here with the admin token and never updated.

import { createItem } from "@directus/sdk";
import type { H3Event } from "h3";

const AUDIT = "hoa_governing_audit_log";

export type GoverningActor = { id: string; name: string | null; email: string | null };

export async function governingActor(event: H3Event): Promise<GoverningActor> {
  const user = ((await getUserSession(event))?.user ?? {}) as Record<string, any>;
  const name = [user.firstName ?? user.first_name, user.lastName ?? user.last_name].filter(Boolean).join(" ");
  return { id: String(user.id), name: name || null, email: user.email ?? null };
}

export async function writeGoverningAudit(
  actor: GoverningActor,
  entry: {
    action: string;
    organization: string;
    document?: string | null;
    provision?: string | null;
    flag?: string | null;
    summary: string;
    reason?: string | null;
    before?: unknown;
    after?: unknown;
  }
) {
  await getTypedDirectus().request(
    createItem(AUDIT as never, {
      occurred_at: new Date().toISOString(),
      action: entry.action,
      organization: entry.organization,
      actor_user: actor.id,
      actor_name: actor.name,
      actor_email: actor.email,
      ...(entry.document ? { document: entry.document } : {}),
      ...(entry.provision ? { provision: entry.provision } : {}),
      ...(entry.flag ? { flag: entry.flag } : {}),
      summary: entry.summary,
      ...(entry.reason ? { reason: entry.reason } : {}),
      before: entry.before ?? null,
      after: entry.after ?? null,
    } as never)
  );
}
