/**
 * POST /api/ai/notices/check — the notices cron.
 *
 * Sweeps every community (or one, if the body names it), regenerates its
 * notices deterministically, and turns the `urgent` and `high` ones into real
 * notifications for that community's admins and seated board members. No LLM is
 * involved at any point, so a nightly run over every org costs nothing.
 *
 * ── Why only urgent/high ────────────────────────────────────────────────────
 * The endpoint returns every notice because a person who opened the page asked
 * for them. A notification is different: it interrupts. `medium` and `low` are
 * things worth seeing when you look, not things worth being told, and the
 * attention curve is what decides which is which — a tiny balance two years
 * late scores into `low` and stays out of everyone's pocket.
 *
 * ── Why it does not repeat itself ───────────────────────────────────────────
 * A deterministic generator will produce the same notice tomorrow, and the day
 * after, until someone acts. Unguarded, that is a nightly nag, and the reliable
 * result of a nightly nag is a member who mutes the category. So each escalation
 * writes an `ai_notice_history` row keyed by a hash of
 * `noticeType : entityType : entityId : YYYY-MM`, and anything already present
 * is skipped: **once per notice, per entity, per calendar month.**
 *
 * If `ai_notice_history` has not been provisioned yet
 * (`pnpm create:ai-notice-history`), the run warns, skips dedup, and still
 * sends. Degrading loud-but-working is the right failure here: the collection's
 * absence must not silence a genuinely urgent notice.
 *
 * Auth: `x-cron-secret` matching CRON_SECRET, or an authenticated session (so a
 * developer can trigger a run without the secret). Invoked from the droplet
 * crontab — see docs/ai-notices-cron.md.
 *
 * Body (all optional):
 *   orgId    — restrict to one community
 *   dryRun   — compute and report, notify nobody, write no history
 */

import { createHash } from "node:crypto";
import { createItem, readItems } from "@directus/sdk";
import { collectOrgNotices, type AINotice } from "#core/server/utils/ai-notices";

/** Only these interrupt anybody. */
const ESCALATE = new Set(["urgent", "high"]);

/** `YYYY-MM` in UTC — the dedup window. */
export function periodKey(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The notice id minus its entity id — `request-aged-<uuid>` → `request-aged`.
 * Hashing on the TYPE rather than the whole id is what makes the key stable
 * when a title changes, and what keeps two different notices about the same
 * request (aged, and overdue) independently deliverable.
 */
export function noticeTypeOf(notice: AINotice): string {
  const suffix = notice.entityId ? `-${notice.entityId}` : "";
  return suffix && notice.id.endsWith(suffix)
    ? notice.id.slice(0, -suffix.length)
    : notice.id;
}

export function noticeHash(notice: AINotice, period: string): string {
  const key = [
    noticeTypeOf(notice),
    notice.entityType ?? "",
    notice.entityId ?? "",
    period,
  ].join(":");
  return createHash("sha256").update(key).digest("hex");
}

export default defineEventHandler(async (event) => {
  const secret = process.env.CRON_SECRET;
  const provided = getHeader(event, "x-cron-secret");
  let authorized = !!secret && !!provided && provided === secret;
  if (!authorized) {
    try {
      await requireUserSession(event);
      authorized = true;
    } catch {
      /* no session */
    }
  }
  if (!authorized) throw createError({ statusCode: 401, message: "Unauthorized" });

  const body = (await readBody(event).catch(() => ({}))) as {
    orgId?: string;
    dryRun?: boolean;
  };
  const dryRun = body?.dryRun === true;

  const directus = getTypedDirectus();
  const now = new Date();
  const period = periodKey(now);
  // Resolved once — it is the same for every org in the sweep, and it is an
  // async host lookup, not a property read.
  const origin = await safeRequestOrigin(event).catch(() => null);

  // Is the dedup ledger there? One probe for the whole run, not one per org.
  let historyAvailable = true;
  try {
    await directus.request(
      (readItems as any)("ai_notice_history", { fields: ["id"], limit: 1 })
    );
  } catch {
    historyAvailable = false;
    console.warn(
      "[ai-notices] ai_notice_history is unavailable — running WITHOUT dedup. " +
        "Run `pnpm create:ai-notice-history` against this Directus; until then " +
        "escalated notices may repeat on every run."
    );
  }

  const orgs = body?.orgId
    ? [{ id: body.orgId }]
    : (((await directus
        .request(
          (readItems as any)("hoa_organizations", {
            filter: { status: { _neq: "archived" } },
            fields: ["id", "name"],
            limit: -1,
          })
        )
        .catch(() => [])) as any[]) || []);

  const summary: Array<{
    organization: string;
    considered: number;
    escalated: number;
    skipped: number;
    notified: number;
  }> = [];

  for (const org of orgs as any[]) {
    const orgId = String(org.id);

    const all = await collectOrgNotices(directus, orgId, now).catch(() => [] as AINotice[]);
    const candidates = all.filter((n) => ESCALATE.has(n.priority));
    if (!candidates.length) {
      summary.push({ organization: orgId, considered: all.length, escalated: 0, skipped: 0, notified: 0 });
      continue;
    }

    // One query for the month's hashes, not one per notice.
    let alreadySent = new Set<string>();
    if (historyAvailable) {
      const rows = (((await directus
        .request(
          (readItems as any)("ai_notice_history", {
            filter: { organization: { _eq: orgId }, period: { _eq: period } },
            fields: ["notice_hash"],
            limit: -1,
          })
        )
        .catch(() => [])) as any[]) || []) as Array<{ notice_hash: string }>;
      alreadySent = new Set(rows.map((r) => r.notice_hash).filter(Boolean));
    }

    const fresh = candidates.filter((n) => !alreadySent.has(noticeHash(n, period)));
    const skipped = candidates.length - fresh.length;

    if (!fresh.length || dryRun) {
      summary.push({
        organization: orgId,
        considered: all.length,
        escalated: fresh.length,
        skipped,
        notified: 0,
      });
      continue;
    }

    // Admins + seated board members — the same set channels auto-enroll, so
    // "who is answerable for this community" is defined in exactly one place.
    const enrollees = await getOrgChannelEnrollees(directus, orgId).catch(() => []);
    const recipientUserIds = enrollees.map((e) => e.user).filter(Boolean);
    if (!recipientUserIds.length) {
      summary.push({
        organization: orgId,
        considered: all.length,
        escalated: fresh.length,
        skipped,
        notified: 0,
      });
      continue;
    }

    let notified = 0;
    for (const n of fresh) {
      const result = await notifyUsers({
        organizationId: orgId,
        recipientUserIds,
        category: "ai_insight",
        subject: n.title,
        message: n.description,
        collection: null,
        item: null,
        path: n.actionRoute ?? null,
        origin,
      }).catch(() => ({ bell: 0, push: 0, email: 0 }));

      notified += result.bell;

      // The history row is written whether or not the bell reached anybody. A
      // notification nobody was eligible to receive has still been *attempted*
      // this month, and retrying it nightly would be the nag this exists to
      // prevent.
      if (historyAvailable) {
        await directus
          .request(
            (createItem as any)("ai_notice_history", {
              organization: orgId,
              notice_hash: noticeHash(n, period),
              notice_type: noticeTypeOf(n),
              entity_type: n.entityType ?? null,
              entity_id: n.entityId ?? null,
              priority: n.priority,
              period,
              title: n.title.slice(0, 250),
              recipients: result.bell,
            })
          )
          .catch((e: any) => {
            console.warn(`[ai-notices] could not record history for ${n.id}: ${e?.message}`);
          });
      }
    }

    summary.push({
      organization: orgId,
      considered: all.length,
      escalated: fresh.length,
      skipped,
      notified,
    });
  }

  return {
    ok: true,
    dryRun,
    period,
    dedup: historyAvailable ? "on" : "unavailable",
    organizations: summary.length,
    results: summary,
  };
});
