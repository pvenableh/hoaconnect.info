/**
 * Email compliance on the server (Earnest parity round 3, Phase 3a): the
 * unsubscribe token, the member's suppression flags, and the probe that lets
 * every path run before the schema exists.
 *
 * Fields (scripts/add-email-compliance-fields.ts, `pnpm add:email-compliance`):
 *   hoa_members.email_community_opt_out (+ _at, _source: link|one_click|spam|admin)
 *   hoa_members.email_bounced (+ _at, _reason)
 *   hoa_members.unsubscribe_token — unique; 24 random bytes base64url, minted at send time
 *   hoa_emails.email_class — essential | community
 *
 * Until the script has run, `emailComplianceSchema()` says so and every caller
 * degrades the way Phase 2's app_prefs routes do: sends go out as before (no
 * suppression to apply — nobody can be opted out of a field that doesn't exist —
 * no token, so no List-Unsubscribe header and the generic unsubscribe page in the
 * footer), the preference reads answer `available: false`, and the writes 503.
 *
 * Every function takes the Directus client, so the routes and the tests decide
 * which one.
 */

import { randomBytes } from "node:crypto";
import * as sdk from "@directus/sdk";
import { isUnsubscribeToken } from "#core/shared/email/unsubscribe";
import type { OptOutSource } from "#core/shared/email/email-class";
import type { SuppressionAction } from "#core/shared/email/suppression-events";

type DirectusLike = { request: (op: any) => Promise<any> };

// The client here is `DirectusLike` (the routes pass getTypedDirectus(), the
// tests a stub), so the builders are used untyped; the field lists are checked
// against core/types/directus.ts by the callers' reads instead. They are looked
// up when called, so a test that mocks @directus/sdk without one of them can
// still import a module that imports this one.
const readFieldsByCollection = (collection: string) => (sdk as any).readFieldsByCollection(collection);
const readItems = (collection: string, query: Record<string, unknown>) => (sdk as any).readItems(collection, query);
const updateItem = (collection: string, id: string, data: Record<string, unknown>) => (sdk as any).updateItem(collection, id, data);
const updateItemsBatch = (collection: string, data: Array<Record<string, unknown>>) => (sdk as any).updateItemsBatch(collection, data);

/** 24 random bytes, base64url: 32 characters, 192 bits. */
export function mintUnsubscribeToken(): string {
  return randomBytes(24).toString("base64url");
}

/** The audience reads add these to their member fields once the schema exists. */
export const MEMBER_SUPPRESSION_FIELDS = [
  "email_community_opt_out",
  "email_bounced",
  "unsubscribe_token",
] as const;

/** The whole state, for the Members page and the preferences card. */
export const MEMBER_EMAIL_STATE_FIELDS = [
  "email_community_opt_out",
  "email_community_opt_out_at",
  "email_community_opt_out_source",
  "email_bounced",
  "email_bounced_at",
  "email_bounced_reason",
] as const;

// ── Schema probe ────────────────────────────────────────────────────────────

export interface ComplianceSchema {
  /** The seven hoa_members fields exist. */
  members: boolean;
  /** hoa_emails.email_class exists. */
  emailClass: boolean;
}

const NEGATIVE_TTL_MS = 60_000;
let cached: { value: ComplianceSchema; at: number } | null = null;

/**
 * Which of the Phase 3a fields exist. A positive answer is kept for the life of
 * the process (fields don't disappear); a negative one for a minute, so the
 * script's run is picked up without a redeploy. A failed read throws: Directus
 * being down is not the same as the fields being missing, and the caller decides
 * what an outage means (the webhook 503s so SendGrid retries).
 */
export async function emailComplianceSchema(directus: DirectusLike): Promise<ComplianceSchema> {
  const now = Date.now();
  if (cached) {
    const complete = cached.value.members && cached.value.emailClass;
    if (complete || now - cached.at < NEGATIVE_TTL_MS) return cached.value;
  }
  const [memberFields, emailFields] = await Promise.all([
    directus.request(readFieldsByCollection("hoa_members")),
    directus.request(readFieldsByCollection("hoa_emails")),
  ]);
  const names = (rows: unknown) =>
    new Set(Array.isArray(rows) ? rows.map((r: any) => r?.field).filter(Boolean) : []);
  const m = names(memberFields);
  const value: ComplianceSchema = {
    members:
      MEMBER_EMAIL_STATE_FIELDS.every((f) => m.has(f)) && m.has("unsubscribe_token"),
    emailClass: names(emailFields).has("email_class"),
  };
  cached = { value, at: now };
  return value;
}

/** Tests only. */
export function _resetEmailComplianceSchemaCache(): void {
  cached = null;
}

// ── Tokens ──────────────────────────────────────────────────────────────────

/**
 * Give every member about to be mailed a token, minting the missing ones in one
 * batch write and reading them back: only a STORED token resolves a click, so
 * the read-back is what the mail carries. A failed write or read leaves the
 * members as they were — no header, the generic page in the footer — and never
 * fails the send (Earnest's `ensureUnsubscribeTokens`, same trade).
 */
export async function ensureUnsubscribeTokens<T extends { id: string; unsubscribe_token?: string | null }>(
  directus: DirectusLike,
  members: T[]
): Promise<T[]> {
  const missing = members.filter((m) => m?.id && !isUnsubscribeToken(m.unsubscribe_token)).map((m) => m.id);
  if (!missing.length) return members;
  try {
    await directus.request(
      updateItemsBatch(
        "hoa_members",
        missing.map((id) => ({ id, unsubscribe_token: mintUnsubscribeToken() })) as any
      )
    );
    const stored = (await directus.request(
      readItems("hoa_members", {
        filter: { id: { _in: missing } },
        fields: ["id", "unsubscribe_token"],
        limit: -1,
      })
    )) as Array<{ id: string; unsubscribe_token: string | null }>;
    const byId = new Map(stored.map((r) => [r.id, r.unsubscribe_token]));
    return members.map((m) =>
      byId.has(m.id) ? { ...m, unsubscribe_token: byId.get(m.id) ?? null } : m
    );
  } catch (e) {
    console.warn("[email-compliance] could not mint unsubscribe tokens:", (e as Error)?.message || e);
    return members;
  }
}

export interface TokenMember {
  id: string;
  email: string | null;
  first_name: string | null;
  email_community_opt_out: boolean;
  email_community_opt_out_at: string | null;
  email_bounced: boolean;
  organization: { id: string; name: string | null; slug: string | null };
}

/**
 * The membership a token names — exactly one member of one org, or null. A
 * malformed token never reaches Directus. Two rows for one token (the field is
 * unique, so only a broken schema could produce it) resolve to nobody rather
 * than to a guess. A failed read THROWS: the one-click route turns that into a
 * 503 so the mailbox provider retries, instead of a 200 that silently did nothing.
 */
export async function findMemberByToken(directus: DirectusLike, token: unknown): Promise<TokenMember | null> {
  if (!isUnsubscribeToken(token)) return null;
  const rows = (await directus.request(
    readItems("hoa_members", {
      filter: { unsubscribe_token: { _eq: token } },
      fields: [
        "id",
        "email",
        "first_name",
        "email_community_opt_out",
        "email_community_opt_out_at",
        "email_bounced",
        { organization: ["id", "name", "slug"] },
      ],
      limit: 2,
    })
  )) as any[];
  if (!Array.isArray(rows) || rows.length !== 1) return null;
  const row = rows[0];
  const org = row.organization && typeof row.organization === "object" ? row.organization : null;
  if (!org?.id) return null;
  return {
    id: String(row.id),
    email: row.email ?? null,
    first_name: row.first_name ?? null,
    email_community_opt_out: row.email_community_opt_out === true,
    email_community_opt_out_at: row.email_community_opt_out_at ?? null,
    email_bounced: row.email_bounced === true,
    organization: { id: String(org.id), name: org.name ?? null, slug: org.slug ?? null },
  };
}

// ── Writes (all idempotent) ─────────────────────────────────────────────────

/**
 * Opt a member out of community mail. Already out → no write, so the first
 * opt-out's time and source are the ones kept (a spam report after a link
 * click doesn't rewrite why they left). Returns whether anything changed.
 */
export async function optOutOfCommunity(
  directus: DirectusLike,
  member: { id: string; email_community_opt_out?: boolean | null },
  source: OptOutSource,
  now: Date = new Date()
): Promise<boolean> {
  if (member.email_community_opt_out === true) return false;
  await directus.request(
    updateItem("hoa_members", member.id, {
      email_community_opt_out: true,
      email_community_opt_out_at: now.toISOString(),
      email_community_opt_out_source: source,
    })
  );
  return true;
}

/** Undo an opt-out (the member, from the page or their preferences; or an admin's Clear). */
export async function resubscribeToCommunity(
  directus: DirectusLike,
  member: { id: string; email_community_opt_out?: boolean | null }
): Promise<boolean> {
  if (member.email_community_opt_out !== true) return false;
  await directus.request(
    updateItem("hoa_members", member.id, {
      email_community_opt_out: false,
      email_community_opt_out_at: null,
      email_community_opt_out_source: null,
    })
  );
  return true;
}

/** Mark an address dead. Already bounced → no write (the first bounce's reason is kept). */
export async function markEmailBounced(
  directus: DirectusLike,
  member: { id: string; email_bounced?: boolean | null },
  reason: string,
  now: Date = new Date()
): Promise<boolean> {
  if (member.email_bounced === true) return false;
  await directus.request(
    updateItem("hoa_members", member.id, {
      email_bounced: true,
      email_bounced_at: now.toISOString(),
      email_bounced_reason: reason.slice(0, 255),
    })
  );
  return true;
}

/** An admin's Clear on a bounce: mail resumes to the address. */
export async function clearEmailBounce(
  directus: DirectusLike,
  member: { id: string; email_bounced?: boolean | null }
): Promise<boolean> {
  if (member.email_bounced !== true) return false;
  await directus.request(
    updateItem("hoa_members", member.id, {
      email_bounced: false,
      email_bounced_at: null,
      email_bounced_reason: null,
    })
  );
  return true;
}

/**
 * The org's members with this address, case-insensitively. Directus `_eq` is
 * case-sensitive on Postgres and SendGrid reports the address as delivered to,
 * so read candidates with `_icontains` and keep exact (folded) matches only —
 * `bob@x.com` must not catch `abob@x.com`.
 */
export async function orgMembersByEmail(
  directus: DirectusLike,
  organizationId: string,
  email: string
): Promise<Array<{ id: string; email: string | null; email_community_opt_out: boolean; email_bounced: boolean }>> {
  const folded = email.trim().toLowerCase();
  if (!folded) return [];
  const rows = (await directus.request(
    readItems("hoa_members", {
      filter: { organization: { _eq: organizationId }, email: { _icontains: folded } },
      fields: ["id", "email", "email_community_opt_out", "email_bounced"],
      limit: -1,
    })
  )) as any[];
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => typeof r?.email === "string" && r.email.trim().toLowerCase() === folded)
    .map((r) => ({
      id: String(r.id),
      email: r.email,
      email_community_opt_out: r.email_community_opt_out === true,
      email_bounced: r.email_bounced === true,
    }));
}

// ── The webhook's half ──────────────────────────────────────────────────────

export interface SuppressionWork {
  organizationId: string;
  email: string;
  action: SuppressionAction;
}

/**
 * Apply what a SendGrid batch asks (see core/shared/email/suppression-events.ts)
 * to the org's members with each address. Each item re-reads its members, so
 * two events for one person in one batch stay idempotent. THROWS on any read or
 * write failure: the route answers 503 and SendGrid redelivers the batch, which
 * is safe because every write here is a no-op the second time.
 */
export async function applySuppressionActions(
  directus: DirectusLike,
  work: readonly SuppressionWork[]
): Promise<{ bounced: number; optedOut: number }> {
  let bounced = 0;
  let optedOut = 0;
  for (const item of work) {
    const members = await orgMembersByEmail(directus, item.organizationId, item.email);
    for (const m of members) {
      if (item.action.kind === "bounced") {
        if (await markEmailBounced(directus, m, item.action.reason)) bounced++;
      } else if (await optOutOfCommunity(directus, m, item.action.source)) {
        optedOut++;
      }
    }
  }
  return { bounced, optedOut };
}
