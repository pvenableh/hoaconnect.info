// GET /api/ops/health — is the machinery running? (docs/plan-operator-console.md §5, Phase 4)
// App Admin and Platform Support (`billing.read`).
//
// From what already exists: the jobs' heartbeats (`ops_job_heartbeats`) and
// what each job leaves behind, the email queue and SendGrid's events, AI usage
// and wallets, storage per community, push subscriptions, and Stripe webhook
// delivery. Every section is read on its own, so one missing collection or a
// Stripe outage blanks that section, not the page. Counts only where people are
// involved: no email address, user agent or resident name leaves this route.
import { readItems } from "@directus/sdk";
import { requireOpsPermission } from "#core/server/utils/admin-auth";
import { emailQueueSchema } from "#core/server/utils/email-send-queue";
import { loadOpsCommunities, opsEvents, opsSubscriptions, ourCustomerIds } from "#core/server/utils/ops-data";
import { getOrgStorage } from "#core/server/utils/storage-enforcement";
import { getStripe, getStripeWebhookSecrets, isStripeLiveMode } from "#core/server/utils/stripe";
import {
  EMAIL_STUCK_MINUTES,
  PUSH_PLATFORM_LABEL,
  UNDELIVERED_EMAIL_EVENTS,
  summarizeAiUsage,
  summarizePush,
  walletLow,
} from "#core/shared/ops/health";
import { OPS_JOBS, jobOverdue, type OpsJobKey } from "#core/shared/ops/jobs";
import { isOurStripeObject } from "#core/shared/ops/metrics";

// Several of these collections are newer than the generated schema types.
const readAny = readItems as any;

const DAY_MS = 86_400_000;
const idOf = (v: unknown): string | null =>
  v && typeof v === "object" ? ((v as { id?: string }).id ?? null) : typeof v === "string" ? v : null;

/** One section's read: its value, or null and a note. */
async function section<T>(label: string, notes: string[], read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (e: any) {
    console.warn(`[ops/health] ${label} unavailable:`, e?.message ?? e);
    notes.push(`${label} couldn't be read.`);
    return null;
  }
}

/** The newest value of `field` in `collection` (optionally filtered), or null. */
async function newest(collection: string, field: string, filter?: Record<string, unknown>): Promise<string | null> {
  const rows = (await getTypedDirectus().request(
    readAny(collection as any, { ...(filter ? { filter } : {}), fields: [field], sort: [`-${field}`], limit: 1 } as any)
  )) as Array<Record<string, string | null>>;
  return rows?.[0]?.[field] ?? null;
}

export default defineEventHandler(async (event) => {
  await requireOpsPermission(event, "billing.read");
  const directus = getTypedDirectus() as any;
  const config = useRuntimeConfig();
  const now = new Date();
  const notes: string[] = [];
  const since = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();

  const { orgs, accounts } = await loadOpsCommunities(now);
  const orgName = new Map(orgs.map((o) => [o.id, o.name || o.slug]));

  // ── Scheduled jobs ─────────────────────────────────────────────────────────
  let heartbeats: Map<string, any> | null = null;
  try {
    const rows = await getTypedDirectus().request(readItems("ops_job_heartbeats", { limit: -1 }));
    heartbeats = new Map(rows.map((r) => [r.id, r]));
  } catch (e: any) {
    console.warn("[ops/health] heartbeats unavailable:", e?.message ?? e);
    notes.push("Jobs record their runs once `pnpm run create:ops-job-heartbeats` has created the collection.");
  }

  // What each job leaves behind, for when there is no heartbeat yet. A run that
  // found nothing to do leaves nothing, so this is "last sign of work", not "last run".
  const evidence: Partial<Record<OpsJobKey, () => Promise<string | null>>> = {
    reminders: () => newest("hoa_reminder_log", "date_created"),
    "ai-notices": () => newest("ai_notice_history", "date_created"),
    "data-export": () => newest("hoa_data_exports", "date_completed"),
    "email-continue-sends": async () =>
      (await emailQueueSchema(directus)) ? newest("hoa_emails", "last_run_at") : null,
  };
  const jobs = await Promise.all(
    OPS_JOBS.map(async (job) => {
      const hb = heartbeats?.get(job.key) ?? null;
      const lastActivityAt = evidence[job.key] ? await evidence[job.key]!().catch(() => null) : null;
      const lastRunAt: string | null = hb?.last_finished_at ?? hb?.last_started_at ?? null;
      const overdue = heartbeats ? jobOverdue(job, lastRunAt, now) : null;
      return {
        key: job.key,
        label: job.label,
        runner: job.runner,
        schedule: job.schedule,
        source: job.source,
        lastRunAt,
        lastOkAt: hb?.last_ok_at ?? null,
        lastStatus: (hb?.last_status as string | undefined) ?? null,
        lastError: hb?.last_error ?? null,
        lastVia: hb?.last_via ?? null,
        summary: hb?.last_summary ?? null,
        lastActivityAt,
        status: !heartbeats ? null : !lastRunAt ? "never" : hb?.last_status === "error" ? "error" : overdue ? "overdue" : "ok",
      };
    })
  );

  // ── Email ─────────────────────────────────────────────────────────────────
  const email = await section("Email", notes, async () => {
    const queue = await emailQueueSchema(directus);
    const emails = (await directus.request(
      readAny("hoa_emails", {
        filter: {
          _or: [
            { status: { _in: ["sending", "paused", "scheduled"] } },
            { _and: [{ status: { _eq: "failed" } }, { date_updated: { _gte: since(30) } }] },
            { _and: [{ status: { _eq: "sent" } }, { failed_count: { _gt: 0 } }, { sent_at: { _gte: since(30) } }] },
          ],
        },
        fields: ["id", "organization", "status", "scheduled_at", "sent_at", "date_updated", "recipient_count", "failed_count", ...(queue ? ["last_run_at"] : [])],
        limit: 500,
      } as any)
    )) as any[];
    const stuckBefore = now.getTime() - EMAIL_STUCK_MINUTES * 60_000;
    const progressAt = (e: any) => new Date(e.last_run_at ?? e.date_updated ?? 0).getTime();
    const ref = (e: any) => ({ community: orgName.get(idOf(e.organization) ?? "") ?? null, communityId: idOf(e.organization) });
    const stuck = emails
      .filter((e) => e.status === "sending" && progressAt(e) < stuckBefore)
      .map((e) => ({ ...ref(e), since: new Date(progressAt(e)).toISOString() }));
    const lateScheduled = emails
      .filter((e) => e.status === "scheduled" && e.scheduled_at && new Date(e.scheduled_at).getTime() < stuckBefore)
      .map((e) => ({ ...ref(e), scheduledAt: e.scheduled_at }));
    const failed = emails.filter((e) => e.status === "failed").map((e) => ({ ...ref(e), at: e.date_updated ?? null }));
    const partlyFailed = emails.filter((e) => e.status === "sent" && e.failed_count > 0);

    const leases = queue
      ? ((await directus.request(readAny("hoa_email_send_leases", { fields: ["id", "started_at", "purpose"], limit: -1 } as any))) as any[])
      : [];
    const oldLeases = leases.filter((l) => new Date(l.started_at).getTime() < stuckBefore);

    const activity = (await directus.request(
      readAny("hoa_email_activity", {
        filter: { _and: [{ event: { _in: [...UNDELIVERED_EMAIL_EVENTS] } }, { date_created: { _gte: since(7) } }] },
        fields: ["event", "organization", "bounce_type"],
        limit: 5000,
      } as any)
    )) as any[];
    const byEvent: Record<string, number> = {};
    const byCommunity = new Map<string, number>();
    for (const a of activity) {
      byEvent[a.event] = (byEvent[a.event] ?? 0) + 1;
      if (a.event === "deferred") continue;
      const org = idOf(a.organization);
      if (org) byCommunity.set(org, (byCommunity.get(org) ?? 0) + 1);
    }
    return {
      queueProvisioned: queue,
      sending: emails.filter((e) => e.status === "sending").length,
      paused: emails.filter((e) => e.status === "paused").length,
      stuck,
      lateScheduled,
      failed30d: failed,
      partlyFailed30d: { emails: partlyFailed.length, recipients: partlyFailed.reduce((n, e) => n + (e.failed_count ?? 0), 0) },
      leases: { open: leases.length, older: oldLeases.length },
      undelivered7d: {
        byEvent,
        truncated: activity.length >= 5000,
        topCommunities: [...byCommunity]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id, count]) => ({ communityId: id, community: orgName.get(id) ?? null, count })),
      },
      sendgridKey: !!config.sendgridApiKey,
    };
  });

  // ── AI spend ──────────────────────────────────────────────────────────────
  const ai = await section("AI usage", notes, async () => {
    const rows = (await directus.request(
      readAny("ai_transactions", {
        filter: { date_created: { _gte: since(30) } },
        fields: ["type", "credits", "feature", "model", "input_tokens", "output_tokens", "cache_read_tokens", "date_created"],
        limit: 5000,
      } as any)
    )) as any[];
    const wallets = (await directus.request(
      readAny("ai_wallets", { fields: ["organization", "balance_credits", "allowance_credits", "period_resets_at"], limit: -1 } as any)
    )) as any[];
    return {
      keys: { anthropic: !!config.anthropicApiKey, voyage: !!config.voyageApiKey },
      usage30d: { ...summarizeAiUsage(rows), truncated: rows.length >= 5000 },
      wallets: {
        count: wallets.length,
        totalBalance: wallets.reduce((n, w) => n + (Number(w.balance_credits) || 0), 0),
        low: wallets
          .filter(walletLow)
          .map((w) => ({
            communityId: idOf(w.organization),
            community: orgName.get(idOf(w.organization) ?? "") ?? null,
            balance: Number(w.balance_credits) || 0,
            allowance: Number(w.allowance_credits) || 0,
            resetsAt: w.period_resets_at ?? null,
          })),
      },
    };
  });

  // ── Storage ───────────────────────────────────────────────────────────────
  const storage = await section("Storage", notes, async () => {
    const rows = (await directus.request(
      readAny("hoa_organizations", { fields: ["id", "storage_used_bytes"], filter: { storage_used_bytes: { _gt: 0 } }, limit: -1 } as any)
    )) as any[];
    const top = rows.sort((a, b) => (b.storage_used_bytes ?? 0) - (a.storage_used_bytes ?? 0)).slice(0, 25);
    const communities = await Promise.all(
      top.map(async (r) => {
        const q = await getOrgStorage(r.id).catch(() => null);
        const used = q?.usedBytes ?? (Number(r.storage_used_bytes) || 0);
        return {
          communityId: r.id,
          community: orgName.get(r.id) ?? null,
          usedBytes: used,
          limitBytes: q?.limitBytes ?? null,
          percent: q?.limitBytes ? Math.round((used / q.limitBytes) * 100) : null,
        };
      })
    );
    return {
      totalBytes: rows.reduce((n, r) => n + (Number(r.storage_used_bytes) || 0), 0),
      communitiesWithFiles: rows.length,
      communities,
    };
  });

  // ── Push ──────────────────────────────────────────────────────────────────
  const push = await section("Push subscriptions", notes, async () => {
    const rows = (await directus.request(
      readAny("push_subscriptions", { fields: ["user_agent", "last_used_at", "date_created"], limit: -1 } as any)
    )) as any[];
    const s = summarizePush(rows, now);
    return {
      total: s.total,
      platforms: Object.entries(s.byPlatform)
        .filter(([, v]) => v.total > 0)
        .map(([key, v]) => ({ key, label: PUSH_PLATFORM_LABEL[key as keyof typeof PUSH_PLATFORM_LABEL], ...v })),
      // Push sends only with both halves of the VAPID pair.
      vapid: !!config.vapidPrivateKey && !!(config.public as any).vapidPublicKey,
    };
  });

  // ── Stripe webhooks ───────────────────────────────────────────────────────
  const webhooks = await section("Stripe webhook delivery", notes, async () => {
    const stripe = getStripe();
    const [{ subs }, undelivered] = await Promise.all([
      opsSubscriptions(stripe),
      opsEvents("undelivered:7", { delivery_success: false, days: 7 }, stripe),
    ]);
    const customers = ourCustomerIds(orgs, accounts.values(), subs);
    const ours = undelivered.items.filter((e) => isOurStripeObject(e.data.object, customers));
    const types: Record<string, number> = {};
    for (const e of ours) types[e.type] = (types[e.type] ?? 0) + 1;
    const oldest = ours.reduce<number | null>((min, e) => (min == null || e.created < min ? e.created : min), null);
    return {
      undelivered7d: ours.length,
      oldestAt: oldest ? new Date(oldest * 1000).toISOString() : null,
      types,
      signingSecrets: getStripeWebhookSecrets().length,
    };
  });

  return {
    generatedAt: now.toISOString(),
    stripeMode: isStripeLiveMode() ? "live" : "test",
    jobs,
    heartbeatsProvisioned: !!heartbeats,
    email,
    ai,
    storage,
    push,
    webhooks,
    notes,
  };
});
