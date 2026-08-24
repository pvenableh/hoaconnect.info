// server/utils/notify.ts
// ONE place that turns "something happened in this community" into the member's
// three channels: the durable Directus notification row (the bell), a
// best-effort web push on top of it, and — when the caller supplies a body — a
// branded email twin.
//
// Why this exists: `bellAllowed` has been in the preferences module — and its
// toggles in the account UI — since the unified-preferences work, but nothing on
// the send path ever called it, so the per-category bell switches did nothing.
// Push has to honor those switches, and having push respect a preference the
// bell ignores would be incoherent. So every channel goes through here and each
// obeys the switch that governs it.
//
// The row is the record; the push is a tap on the shoulder; the email is the
// copy that survives outside the app. A push or email failure is invisible to
// the caller, and a member with no subscriptions simply gets the row — which the
// bell and the digest email will surface as they always did.
//
// ── Channel independence (Parity Round 2, Phase 2b) ──────────────────────────
// Three switches, three answers, deliberately not chained:
//
//   bell   ← `<category>_bell`            (default on)
//   email  ← `email_notifications` master AND `_all` AND `<category>` (opt-out)
//   push   ← the BELL's switch, never the email master
//
// Push mirroring the bell rather than the email is HOA-specific and load-bearing
// — see the note on `pushAllowed` in shared/notifications/push.ts. Turning off
// "Payments" *emails* to keep an inbox quiet is not a request for a silent
// phone; muting the payments *bell* is. Push is the bell's mobile twin, so a
// push is never sent where no row was written.
import { createNotification, readItem, readUsers } from "@directus/sdk";
import {
  bellAllowed,
  emailAllowed,
  type NotificationCategory,
} from "#core/shared/notifications/preferences";
import { buildPushPayload, pushAllowed, type PushOrgContext } from "#core/shared/notifications/push";
import { sendPushToUser } from "./push";
import { sendBrandedTransactionalEmail } from "./transactional-email";
import { scopeRecipientsToOrg } from "./org-members";

/** The branded email twin, when this event deserves one. Omit for bell-only. */
export interface NotifyEmail {
  /** Bold lead line above the body. Defaults to the notification subject. */
  heading?: string;
  /** Body paragraph(s) as HTML. Callers escape their own interpolations. */
  bodyHtml: string;
  /** Pill CTA — org-relative path, absolutised per send. */
  cta?: { label: string; path: string };
  /** Header treatment. Defaults to "notice". */
  emailType?: "basic" | "notice" | "alert";
  /** Subject line, when it should differ from the bell's. */
  subject?: string;
}

export interface NotifyOptions {
  /** The community this is about — push payloads and links are org-scoped. */
  organizationId: string;
  /** Directus user ids to notify. */
  recipientUserIds: string[];
  /** Preference category. Each channel is gated on its own key (see above). */
  category: NotificationCategory;
  subject: string;
  message: string;
  /** Directus collection + item, for the bell's deep link and the push's tag. */
  collection?: string | null;
  item?: string | null;
  /** Org-relative path a push tap should land on, e.g. "/admin/projects". */
  path?: string | null;
  /** Absolute origin from `safeRequestOrigin`, when the caller has an event. */
  origin?: string | null;
  /** Skip this user (the actor who caused the event). */
  excludeUserId?: string | null;
  /** Send a branded email twin as well, gated on the email preferences. */
  email?: NotifyEmail | null;
}

interface RecipientRow {
  id: string;
  email_notifications?: boolean | null;
  notification_preferences?: Record<string, unknown> | null;
}

/** Everything we want about a recipient. Prefs are the field that 403s. */
const RECIPIENT_FIELDS = ["id", "email_notifications", "notification_preferences"] as const;

/**
 * Write the bell rows and fan out pushes (and, when asked, the email twin),
 * honoring each recipient's per-channel preference. Never throws.
 */
export async function notifyUsers(
  opts: NotifyOptions
): Promise<{ bell: number; push: number; email: number }> {
  const asked = [...new Set((opts.recipientUserIds || []).filter(Boolean))].filter(
    (id) => id !== opts.excludeUserId
  );
  if (!asked.length) return { bell: 0, push: 0, email: 0 };

  // TENANCY GATE, and it has to come FIRST.
  //
  // Every id here arrived from a caller, and some callers derive them from
  // rows that in turn came from a request body. `organizationId` is used for
  // the push payload's branding and deep link, so an id from another community
  // would receive THIS community's message under THIS community's name.
  //
  // It sits above the try/catch below on purpose. That block deliberately
  // fails open — an unreadable preference falls back to notifying everyone —
  // and if the filter ran inside or after it, a preference read failure would
  // hand the fallback the unfiltered list and turn a fail-open convenience
  // into a way around the tenancy check. Filter first; everything downstream
  // only ever sees people who belong here.
  const recipients = await scopeRecipientsToOrg(opts.organizationId, asked, "notify");
  if (!recipients.length) return { bell: 0, push: 0, email: 0 };

  const users = await readRecipients(recipients);

  if (!users) {
    // Both reads failed — we know WHO belongs here but nothing about what they
    // asked for. The bell row is the durable record and losing it is worse than
    // showing a member a category they muted, so write the rows; send no push
    // and no email, since both physically interrupt someone and consent is
    // exactly what we just failed to read.
    const bell = await writeBells(recipients, opts);
    return { bell, push: 0, email: 0 };
  }

  const allowedBell = users.filter((u) =>
    bellAllowed((u.notification_preferences as never) ?? null, opts.category)
  );
  const bell = await writeBells(
    allowedBell.map((u) => u.id),
    opts
  );

  // Push rides the bell's decision (see the header note): no row, no push.
  let push = 0;
  const allowedPush = allowedBell.filter((u) =>
    pushAllowed((u.notification_preferences as never) ?? null, opts.category)
  );
  // No slug means no org-scoped link, and an unscoped push ("New task") is
  // useless to a member who belongs to three communities. Skip push, keep bells.
  const org = allowedPush.length ? await orgPushContext(opts.organizationId) : null;
  if (allowedPush.length && org) {
    const payload = buildPushPayload({
      title: opts.subject,
      body: opts.message,
      org,
      path: opts.path,
      origin: opts.origin,
      collection: opts.collection,
      item: opts.item,
    });
    const counts = await Promise.all(
      allowedPush.map((u) => sendPushToUser(u.id, payload).catch(() => 0))
    );
    push = counts.reduce((a, b) => a + b, 0);
  }

  // Email is decided independently of the bell — muting the payments BELL is a
  // request for a quiet app, not for a silent inbox, and the reverse holds too.
  let email = 0;
  if (opts.email) {
    const allowedEmail = users.filter((u) =>
      emailAllowed(
        (u.notification_preferences as never) ?? null,
        u.email_notifications ?? null,
        opts.category
      )
    );
    if (allowedEmail.length) {
      // sendBrandedTransactionalEmail re-scopes to the org and re-checks the
      // same preferences with the same shared helper. Both are deliberate: it
      // is called directly from other paths too, and a boundary that only holds
      // when its caller remembers to check is not a boundary.
      await sendBrandedTransactionalEmail({
        organizationId: opts.organizationId,
        recipientUserIds: allowedEmail.map((u) => u.id),
        subject: opts.email.subject || opts.subject,
        heading: opts.email.heading ?? opts.subject,
        bodyHtml: opts.email.bodyHtml,
        cta: opts.email.cta,
        emailType: opts.email.emailType || "notice",
        category: opts.category,
      }).catch((e) => console.warn("[notify] email twin failed", (e as Error).message));
      email = allowedEmail.length;
    }
  }

  return { bell, push, email };
}

/**
 * Load the recipients' preference rows, with Earnest's retry.
 *
 * A missing or permission-blocked `notification_preferences` column 403s the
 * WHOLE bulk read, which silently zeroes an entire fan-out — this happened in
 * Earnest's prod when the column was never migrated, and HOA's own column was
 * added late enough that a stale environment can still hit it. So retry without
 * the field rather than treating the failure as "everyone opted out": missing
 * keys mean opt-IN by design, so a prefs-less row is the documented default,
 * not a guess. Only when even the reduced read fails do we know nothing.
 *
 * Returns null when both reads failed.
 */
async function readRecipients(recipientIds: string[]): Promise<RecipientRow[] | null> {
  const admin = getTypedDirectus();
  try {
    return (await admin.request(
      readUsers({
        filter: { id: { _in: recipientIds } },
        fields: [...RECIPIENT_FIELDS],
        limit: -1,
      })
    )) as RecipientRow[];
  } catch (e) {
    console.warn(
      "[notify] recipient read failed on the full field set; retrying without notification_preferences:",
      (e as Error).message
    );
  }

  try {
    const rows = (await admin.request(
      readUsers({
        filter: { id: { _in: recipientIds } },
        fields: RECIPIENT_FIELDS.filter((f) => f !== "notification_preferences"),
        limit: -1,
      })
    )) as RecipientRow[];
    // Prefs absent, not muted — every default-on key stays on.
    return (rows || []).map((r) => ({ ...r, notification_preferences: null }));
  } catch (e) {
    console.warn("[notify] preferences unreadable; bell-only fallback", (e as Error).message);
    return null;
  }
}

async function writeBells(userIds: string[], opts: NotifyOptions): Promise<number> {
  if (!userIds.length) return 0;
  const admin = getTypedDirectus();
  let written = 0;
  for (const uid of userIds) {
    try {
      await admin.request(
        createNotification({
          recipient: uid,
          subject: opts.subject,
          message: opts.message,
          ...(opts.collection ? { collection: opts.collection } : {}),
          ...(opts.item ? { item: opts.item } : {}),
        })
      );
      written++;
    } catch (e) {
      console.warn("[notify] bell failed for", uid, (e as Error).message);
    }
  }
  return written;
}

/** Org slug + name for push payloads. Cached briefly: notify fans out per event,
 *  and an org's slug changes about as often as its name. */
const orgCache = new Map<string, { value: PushOrgContext | null; expires: number }>();
const ORG_TTL_MS = 5 * 60_000;

async function orgPushContext(orgId: string): Promise<PushOrgContext | null> {
  if (!orgId) return null;
  const hit = orgCache.get(orgId);
  if (hit && hit.expires > Date.now()) return hit.value;
  let value: PushOrgContext | null = null;
  try {
    const row = (await getTypedDirectus().request(
      readItem("hoa_organizations", orgId, { fields: ["id", "slug", "name"] })
    )) as { id: string; slug: string | null; name: string | null };
    if (row?.slug) value = { id: row.id, slug: row.slug, name: row.name ?? null };
  } catch (e) {
    console.warn("[notify] org lookup failed", (e as Error).message);
    return null; // Not cached — a transient failure shouldn't mute push for 5 min.
  }
  if (orgCache.size > 200) orgCache.clear();
  orgCache.set(orgId, { value, expires: Date.now() + ORG_TTL_MS });
  return value;
}
