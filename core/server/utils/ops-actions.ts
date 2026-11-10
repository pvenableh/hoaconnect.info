// The operator console's actions (docs/plan-operator-console.md §5, Phase 2):
// what every `/api/ops` POST route does before and after its own work.
//
//  1. `beginOpsAction`: the platform role first (`billing.write`: App Admin
//     only, so Platform Support gets 403 here), before the body is read or
//     Directus or Stripe is asked anything. Then the rate limit, then the body:
//     `confirmed: true`, a reason, and a `requestId` the dialog made when it opened.
//  2. `runOpsAction`: one submit runs once. The Stripe idempotency key is
//     `ops:<action>:<target>:<requestId>`, so a double click, a retry or two
//     instances racing reach Stripe with the same key and Stripe does it once.
//     Before that, a submit already in flight here is joined, and one already
//     logged is answered from the log without calling Stripe again.
//  3. The audit row, through `writeOpsAuditEntry` only. If Stripe did the work
//     and the row then can't be written, the operator is told and the row goes
//     to the server log in full: the money moved, so this never reports failure.
import { readItem, readItems } from "@directus/sdk";
import type { H3Event } from "h3";
import type { z } from "zod";
import { opsIdempotencyKey, reasonProblem, type OpsAction } from "#core/shared/ops/actions";
import { requireOpsPermission, type PlatformActor } from "./admin-auth";
import { findOpsAuditEntry, writeOpsAuditEntry, type OpsAuditDetails } from "./ops-audit";
import { invalidateOpsCache, stripeReadProblem } from "./ops-data";
import { rateLimit } from "./rate-limit";

/** Console writes per staff member per window. Generous for real work, a wall for a loop. */
export const OPS_WRITE_LIMIT = 20;
export const OPS_WRITE_WINDOW_MS = 10 * 60_000;

const REQUEST_ID = /^[A-Za-z0-9_-]{8,80}$/;

export interface OpsActionBody {
  reason: string;
  requestId: string;
}

/** Guard, rate limit, body: in that order. */
export async function beginOpsAction<S extends z.ZodTypeAny>(
  event: H3Event,
  extra: S
): Promise<{ actor: PlatformActor; body: OpsActionBody & z.infer<S> }> {
  const actor = await requireOpsPermission(event, "billing.write");
  if (!rateLimit(`ops-write:${actor.userId}`, OPS_WRITE_LIMIT, OPS_WRITE_WINDOW_MS)) {
    throw createError({ statusCode: 429, message: "Too many console actions in a short time. Wait a few minutes." });
  }
  const raw = ((await readBody(event).catch(() => null)) ?? {}) as Record<string, unknown>;
  if (raw.confirmed !== true) throw createError({ statusCode: 400, message: "Confirm the action first." });
  const problem = reasonProblem(raw.reason);
  if (problem) throw createError({ statusCode: 400, message: problem });
  if (typeof raw.requestId !== "string" || !REQUEST_ID.test(raw.requestId)) {
    throw createError({ statusCode: 400, message: "This form is out of date. Close it and open it again." });
  }
  const parsed = extra.safeParse(raw);
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? "Check the form." });
  }
  return { actor, body: { ...parsed.data, reason: (raw.reason as string).trim(), requestId: raw.requestId } };
}

export type OpsPerformed<T> =
  | { result: T; audit: OpsAuditDetails; invalidate?: string[] }
  | { result: T; unchanged: true };

export interface OpsActionOutcome<T> {
  ok: true;
  action: OpsAction;
  /** Null when the submit was answered from the log (it had already run). */
  result: T | null;
  /** This submit had already run; nothing was done twice. */
  replayed: boolean;
  /** It was already that way; nothing was done and nothing logged. */
  unchanged: boolean;
  auditId: string | null;
  /** False when the action landed but its audit row didn't (the row is in the server log). */
  audited: boolean;
}

const inFlight = new Map<string, Promise<OpsActionOutcome<unknown>>>();

export async function runOpsAction<T>(opts: {
  actor: PlatformActor;
  action: OpsAction;
  targetId: string;
  body: OpsActionBody;
  /** Load, check and do the work, passing `idempotencyKey` to every Stripe write. */
  perform: (idempotencyKey: string) => Promise<OpsPerformed<T>>;
}): Promise<OpsActionOutcome<T>> {
  const { actor, action, body } = opts;
  const key = opsIdempotencyKey(action, opts.targetId, body.requestId);
  const base = { ok: true as const, action };

  const running = inFlight.get(key);
  if (running) return { ...((await running) as OpsActionOutcome<T>), replayed: true };

  const work = (async (): Promise<OpsActionOutcome<T>> => {
    let logged: { id: string } | null;
    try {
      logged = await findOpsAuditEntry(key);
    } catch (e: any) {
      // No audit log, no action: nothing happens that can't be recorded.
      console.error("[ops] ops_audit_log unreadable:", e?.message ?? e);
      throw createError({ statusCode: 503, message: "The console's audit log isn't available, so no action can run." });
    }
    if (logged) return { ...base, result: null, replayed: true, unchanged: false, auditId: logged.id, audited: true };

    const done = await opts.perform(key);
    if ("unchanged" in done) return { ...base, result: done.result, replayed: false, unchanged: true, auditId: null, audited: true };

    invalidateOpsCache(...(done.invalidate ?? []));
    try {
      const row = await writeOpsAuditEntry({ ...done.audit, action, actor, reason: body.reason, idempotencyKey: key });
      return { ...base, result: done.result, replayed: row.replayed, unchanged: false, auditId: row.id, audited: true };
    } catch (e: any) {
      console.error(
        "[ops] ACTION DONE, AUDIT ROW NOT WRITTEN:",
        JSON.stringify({ action, idempotencyKey: key, actor: actor.userId, reason: body.reason, ...done.audit }),
        e?.message ?? e
      );
      return { ...base, result: done.result, replayed: false, unchanged: false, auditId: null, audited: false };
    }
  })();

  inFlight.set(key, work);
  try {
    return await work;
  } finally {
    inFlight.delete(key);
  }
}

/** Turn a Stripe error into an answer for the operator. Anything else is rethrown as is. */
export function opsStripeError(e: unknown): never {
  const err = e as { type?: string; code?: string; message?: string; rawType?: string };
  if (typeof err?.type !== "string" || !err.type.startsWith("Stripe")) throw e;
  if (err.type === "StripeIdempotencyError" || err.rawType === "idempotency_error") {
    throw createError({
      statusCode: 409,
      message: "This submit was already sent with different details. Close the form and start again.",
    });
  }
  if (err.code === "resource_missing") {
    const p = stripeReadProblem(err);
    throw createError({ statusCode: p.otherMode ? 409 : 404, message: p.message });
  }
  const said = String(err.message ?? "unknown error").replace(/(sk|rk|pk|whsec)_(live|test)_[A-Za-z0-9_]+/g, "[key]");
  console.error("[ops] Stripe refused:", said);
  throw createError({ statusCode: 502, message: `Stripe refused: ${said}` });
}

export const opsIdOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" && v ? v : null;

export interface OpsCommunityBilling {
  org: {
    id: string;
    name: string;
    subscription_status: string | null;
    trial_ends_at: string | null;
    is_free_account: boolean;
    stripe_subscription_id: string | null;
  };
  /** The agency billing account it's billed through, if any. Then the account's Stripe ids apply. */
  account: { id: string; name: string } | null;
  customerId: string | null;
  subscriptionId: string | null;
}

/** A community and the Stripe customer and subscription that bill it. 404 if it doesn't exist. */
export async function loadOpsCommunityBilling(id: string): Promise<OpsCommunityBilling> {
  const directus = getTypedDirectus();
  const org = (await directus
    .request(
      readItem("hoa_organizations", id, {
        fields: [
          "id",
          "name",
          "slug",
          "subscription_status",
          "trial_ends_at",
          "is_free_account",
          "billing_account",
          "stripe_customer_id",
          "stripe_subscription_id",
        ] as any,
      })
    )
    .catch(() => null)) as any;
  if (!org) throw createError({ statusCode: 404, message: "Community not found" });
  const accountId = opsIdOf(org.billing_account);
  const account = accountId
    ? ((await directus
        .request(
          readItem("billing_accounts", accountId, {
            fields: ["id", "name", "stripe_customer_id", "stripe_subscription_id"] as any,
          })
        )
        .catch(() => null)) as any)
    : null;
  return {
    org: {
      id: org.id,
      name: org.name || org.slug || org.id,
      subscription_status: org.subscription_status ?? null,
      trial_ends_at: org.trial_ends_at ?? null,
      is_free_account: org.is_free_account === true,
      stripe_subscription_id: org.stripe_subscription_id ?? null,
    },
    account: account ? { id: account.id, name: account.name ?? account.id } : null,
    customerId: (accountId ? account?.stripe_customer_id : org.stripe_customer_id) ?? null,
    subscriptionId: (accountId ? account?.stripe_subscription_id : org.stripe_subscription_id) ?? null,
  };
}

/** Whose Stripe customer this is: a community's, or an agency billing account's. */
export async function ownerOfCustomer(
  customerId: string
): Promise<{ organization: string | null; billingAccount: string | null; name: string } | null> {
  const directus = getTypedDirectus();
  const orgs = (await directus.request(
    readItems("hoa_organizations", {
      filter: { stripe_customer_id: { _eq: customerId } },
      fields: ["id", "name", "slug"] as any,
      limit: 1,
    })
  )) as any[];
  if (orgs?.[0]) return { organization: orgs[0].id, billingAccount: null, name: orgs[0].name || orgs[0].slug };
  const accounts = (await directus.request(
    readItems("billing_accounts", {
      filter: { stripe_customer_id: { _eq: customerId } },
      fields: ["id", "name"] as any,
      limit: 1,
    })
  )) as any[];
  if (accounts?.[0]) return { organization: null, billingAccount: accounts[0].id, name: accounts[0].name };
  return null;
}

/** A subscription's state, as the audit row's before and after. */
export function opsSubscriptionState(s: any) {
  return {
    status: s?.status ?? null,
    cancel_at_period_end: !!s?.cancel_at_period_end,
    current_period_end: s?.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null,
    trial_end: s?.trial_end ? new Date(s.trial_end * 1000).toISOString() : null,
  };
}
