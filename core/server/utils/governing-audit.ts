// The governing-documents audit trail (spec §7): one append-only row per
// change that people may later argue about. No role has any permission on the
// collection; rows are written here with the admin token and never updated.

import { createItem, readItems } from "@directus/sdk";
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

export const AUDIT_PAGE_SIZE = 50;

export type GoverningAuditEntry = {
  id: string;
  occurred_at: string | null;
  action: string;
  actor_name: string | null;
  actor_email: string | null;
  document: string | null;
  provision: string | null;
  flag: string | null;
  summary: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
};

const refId = (v: unknown): string | null => (typeof v === "string" ? v : ((v as { id?: string } | null)?.id ?? null));

/**
 * The trail of one organization, newest first, for the people who manage its
 * governing documents. Read-only: nothing here writes. `before` is the
 * `occurred_at` of the last row of the page already shown.
 */
export async function listGoverningAudit(
  organizationId: string,
  options: { document?: string | null; action?: string | null; before?: string | null; limit?: number } = {}
): Promise<{ entries: GoverningAuditEntry[]; next_before: string | null }> {
  const limit = Math.min(Math.max(options.limit ?? AUDIT_PAGE_SIZE, 1), 200);
  const filter: Record<string, unknown> = { organization: { _eq: organizationId } };
  if (options.document) filter.document = { _eq: options.document };
  if (options.action) filter.action = { _eq: options.action };
  if (options.before) filter.occurred_at = { _lt: options.before };
  const found = ((await getTypedDirectus().request(
    readItems(AUDIT as never, {
      filter,
      fields: ["id", "occurred_at", "action", "actor_name", "actor_email", "document", "provision", "flag", "summary", "reason", "before", "after"],
      sort: ["-occurred_at"],
      limit: limit + 1,
    } as never)
  )) ?? []) as any[];
  const sorted = [...found].sort((a, b) => String(b.occurred_at ?? "").localeCompare(String(a.occurred_at ?? "")));
  const page = sorted.slice(0, limit);
  return {
    entries: page.map((r) => ({
      id: String(r.id),
      occurred_at: r.occurred_at ?? null,
      action: String(r.action ?? ""),
      actor_name: r.actor_name ?? null,
      actor_email: r.actor_email ?? null,
      document: refId(r.document),
      provision: refId(r.provision),
      flag: refId(r.flag),
      summary: r.summary ?? null,
      reason: r.reason ?? null,
      before: r.before ?? null,
      after: r.after ?? null,
    })),
    next_before: sorted.length > limit ? (page[page.length - 1]?.occurred_at ?? null) : null,
  };
}
