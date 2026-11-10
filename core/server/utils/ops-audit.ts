/**
 * The only way anything gets into `ops_audit_log`: what HOA Connect staff did
 * from the operator console (docs/plan-operator-console.md §4.3, §6).
 *
 * Separate from `org_audit_log` on purpose (§4.4). A refund or a comp is a
 * platform action, not something the community did, and a community's own log
 * must never show HOA Connect acting as its admin.
 *
 * Append-only, the same way `org_audit_log` is (see `audit-log.ts`): there is no
 * update or delete function here and there must never be one. A correction is a
 * new row. The migration (`scripts/create-ops-audit-log.ts`) grants no Directus
 * role any access; this writer uses the admin token. Until the database trigger
 * in `docs/go-live-checklist.md` §3c covers this table too, immutability is a
 * property of the code, not of the database.
 *
 * `idempotency_key` is unique: one submit of one action is one row, however
 * many times it arrives. A second insert with the same key is a replay.
 */
import { createItem, readItems } from "@directus/sdk";
import type { OpsAction } from "#core/shared/ops/actions";
import type { PlatformActor } from "./admin-auth";
import { opsUsers } from "./ops-data";
import { isStripeLiveMode } from "./stripe";

export const OPS_AUDIT_SCHEMA_VERSION = 1;

/** What an action says about itself. The writer adds who, when and why. */
export interface OpsAuditDetails {
  summary: string;
  organization?: string | null;
  organizationName?: string | null;
  billingAccount?: string | null;
  /** Stripe ids touched, by kind: charge, refund, subscription, customer, coupon, promotion_code, portal_session. */
  stripe?: Record<string, string | null | undefined>;
  amountCents?: number | null;
  currency?: string | null;
  before?: unknown;
  after?: unknown;
}

export interface OpsAuditEntry extends OpsAuditDetails {
  action: OpsAction;
  /** Null for what HOA Connect does on its own schedule (automatic re-banding). */
  actor: PlatformActor | null;
  reason: string;
  idempotencyKey: string;
}

/** Directus's answer when a unique field already holds the value. */
function isNotUnique(e: unknown): boolean {
  const errs = (e as { errors?: Array<{ extensions?: { code?: string } }> })?.errors;
  return Array.isArray(errs) && errs.some((x) => x?.extensions?.code === "RECORD_NOT_UNIQUE");
}

/** The row already written for this key, if any. */
export async function findOpsAuditEntry(idempotencyKey: string): Promise<{ id: string } | null> {
  const rows = (await getTypedDirectus().request(
    readItems("ops_audit_log", {
      filter: { idempotency_key: { _eq: idempotencyKey } },
      fields: ["id"],
      limit: 1,
    })
  )) as Array<{ id: string }> | null;
  return rows?.[0] ?? null;
}

/**
 * Append one row. Returns its id, and `replayed` when a row for this key was
 * already there (another instance got there first). Failures are thrown, not
 * swallowed: the caller decides how to tell the operator.
 */
export async function writeOpsAuditEntry(entry: OpsAuditEntry): Promise<{ id: string; replayed: boolean }> {
  const actor = entry.actor;
  const who = actor ? (await opsUsers([actor.userId]).catch(() => null))?.get(actor.userId) : null;
  const stripeIds = Object.fromEntries(Object.entries(entry.stripe ?? {}).filter(([, v]) => !!v));
  try {
    const row = (await getTypedDirectus().request(
      createItem("ops_audit_log", {
        occurred_at: new Date().toISOString(),
        action: entry.action,
        actor_user: actor?.userId ?? null,
        actor_role: actor?.role ?? "system",
        actor_name: actor ? (who?.name ?? null) : "HOA Connect (automatic)",
        actor_email: who?.email ?? null,
        reason: entry.reason,
        summary: entry.summary,
        organization: entry.organization ?? null,
        organization_name: entry.organizationName ?? null,
        billing_account: entry.billingAccount ?? null,
        stripe_mode: isStripeLiveMode() ? "live" : "test",
        stripe_ids: Object.keys(stripeIds).length ? stripeIds : null,
        amount_cents: entry.amountCents ?? null,
        currency: entry.currency ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
        idempotency_key: entry.idempotencyKey,
        schema_version: OPS_AUDIT_SCHEMA_VERSION,
      })
    )) as { id: string };
    return { id: row.id, replayed: false };
  } catch (e) {
    if (!isNotUnique(e)) throw e;
    const existing = await findOpsAuditEntry(entry.idempotencyKey);
    if (!existing) throw e;
    return { id: existing.id, replayed: true };
  }
}
