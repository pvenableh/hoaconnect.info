/**
 * GET /api/cron/notification-digest  — hourly digest dispatcher.
 *
 * Runs every hour (Vercel cron). For each member whose digest is enabled, we
 * compute their LOCAL hour + weekday (their directus_users.timezone, else the
 * platform default) and send only when it matches their configured cadence/hour
 * — so an hourly cron naturally fans a day's worth of digests across timezones
 * and sends each member at most once per day.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel injects this) OR an
 * `x-cron-secret` header OR a logged-in session (manual trigger). `?dryRun=1`
 * reports who WOULD be sent without sending.
 */

import { readItems, readUsers } from "@directus/sdk";
import {
  shouldSendDigest,
  digestCadence,
  digestSections,
} from "#core/shared/notifications/preferences";
import { sendDigest } from "#core/server/utils/notification-digest";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_TZ = process.env.DIGEST_TZ || "America/New_York";

/** The user's local hour (0–23) + weekday (0=Sun) in `tz`, or null if tz invalid. */
function localParts(tz: string, now: Date): { hour: number; dow: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
      weekday: "short",
    }).formatToParts(now);
    let hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    if (hour === 24) hour = 0;
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    const dow = WEEKDAYS.indexOf(wd);
    return { hour, dow: dow < 0 ? 0 : dow };
  } catch {
    return null;
  }
}

function sinceForCadence(cadence: string, now: Date): string {
  const hours = cadence === "weekly" ? 8 * 24 : 25; // slight overlap to avoid gaps
  return new Date(now.getTime() - hours * 3600 * 1000).toISOString();
}

export default defineEventHandler(async (event) => {
  // ── Authorization ──────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  const bearer = getHeader(event, "authorization");
  const xcron = getHeader(event, "x-cron-secret");
  let authorized = !!secret && (xcron === secret || bearer === `Bearer ${secret}`);
  if (!authorized) {
    try {
      await requireUserSession(event);
      authorized = true;
    } catch {
      /* no session */
    }
  }
  if (!authorized) throw createError({ statusCode: 401, statusMessage: "Unauthorized" });

  const dryRun = ["1", "true", "yes"].includes(String(getQuery(event).dryRun || "").toLowerCase());
  const admin = getTypedDirectus();
  const now = new Date();

  // Candidates: users who have set any notification preferences.
  let candidates: Array<{
    id: string;
    notification_preferences?: Record<string, any> | null;
  }> = [];
  try {
    candidates = (await admin.request(
      readUsers({
        filter: { notification_preferences: { _nnull: true } },
        fields: ["id", "notification_preferences"],
        limit: -1,
      })
    )) as typeof candidates;
  } catch (e) {
    console.warn("[digest-cron] failed to load candidates", (e as Error).message);
    return { ok: false, error: "load_failed" };
  }

  // HOAs share one timezone, so we interpret each member's digest hour in the
  // platform timezone (DIGEST_TZ). Computed once per run.
  const lp = localParts(DEFAULT_TZ, now) || { hour: now.getHours(), dow: now.getDay() };
  const eligible = candidates.filter((u) =>
    shouldSendDigest(u.notification_preferences || null, lp.hour, lp.dow)
  );

  if (dryRun) {
    return { ok: true, dryRun: true, candidates: candidates.length, wouldSend: eligible.map((u) => u.id) };
  }

  let sent = 0;
  let skippedEmpty = 0;
  for (const u of eligible) {
    const prefs = u.notification_preferences || {};
    const cadence = digestCadence(prefs);
    const sinceIso = sinceForCadence(cadence, now);
    const sections = digestSections(prefs);
    const cadenceLabel = cadence === "weekly" ? "weekly" : "daily";

    // Active memberships → per-org digests (most residents have exactly one).
    let members: Array<{ id: string; organization?: string | { id: string } | null }> = [];
    try {
      members = (await admin.request(
        readItems("hoa_members", {
          filter: { user: { _eq: u.id }, status: { _in: ["active"] } },
          fields: ["id", "organization"],
          limit: -1,
        })
      )) as typeof members;
    } catch {
      continue;
    }

    // Group member ids by org.
    const byOrg = new Map<string, string[]>();
    for (const m of members) {
      const orgId = m.organization == null ? null : typeof m.organization === "string" ? m.organization : m.organization.id;
      if (!orgId) continue;
      byOrg.set(orgId, [...(byOrg.get(orgId) || []), m.id]);
    }

    for (const [orgId, memberIds] of byOrg) {
      try {
        const did = await sendDigest(
          { userId: u.id, organizationId: orgId, memberIds, sections, sinceIso },
          { cadenceLabel }
        );
        if (did) sent++;
        else skippedEmpty++;
      } catch (e) {
        console.warn("[digest-cron] send failed for", u.id, orgId, (e as Error).message);
      }
    }
  }

  return { ok: true, candidates: candidates.length, eligible: eligible.length, sent, skippedEmpty };
});
