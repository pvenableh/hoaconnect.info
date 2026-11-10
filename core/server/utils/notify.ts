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
//   email  ← `_email` master AND `_all` AND `<category>` (opt-out)
//   push   ← the BELL's switch, never the email master
//
// Push mirroring the bell rather than the email is HOA-specific and load-bearing
// — see the note on `pushAllowed` in shared/notifications/push.ts. Turning off
// "Payments" *emails* to keep an inbox quiet is not a request for a silent
// phone; muting the payments *bell* is. Push is the bell's mobile twin, so a
// push is never sent where no row was written.
//
// ── Directus's own email (Operator console, Session H) ───────────────────────
// Directus core emails every new `directus_notifications` row, from its own
// sender and with no setting to stop it (checked against 11.13.4's docs and
// source), to any recipient whose stock `email_notifications` is true. That was
// a second, unbranded copy of every email twin above, and the only email for
// bell-only events. So that field is false for everyone and the app's switch is
// `_email` in `notification_preferences`. Users are created with it false, but
// Studio, invites and SSO can still make one at true, so `writeBells` turns it
// off for any recipient still at true before writing their row.
import {
  createNotification,
  readItem,
  readNotifications,
  readUsers,
  updateNotification,
  updateUsers,
} from "@directus/sdk";
import { parseCollapsedCount } from "#core/shared/channels/rules";
import {
  bellAllowed,
  emailAllowed,
  emailMasterOn,
  DIRECTUS_EMAIL_OFF,
  type NotificationCategory,
} from "#core/shared/notifications/preferences";
import { buildPushPayload, pushAllowed, type PushActionInput, type PushOrgContext } from "#core/shared/notifications/push";
import { sendPushToUser, type PushDeliveryOptions } from "./push";
import { sendBrandedTransactionalEmail } from "./transactional-email";
import { scopeRecipientsToOrg } from "./org-members";
import type { PartialVars } from "./email-partials";

/** The branded email twin, when this event deserves one. Omit for bell-only. */
export interface NotifyEmail {
  /** Bold lead line above the body. Defaults to the notification subject. */
  heading?: string;
  /** Body paragraph(s) as HTML. Callers escape their own interpolations. */
  bodyHtml: string;
  /** Pill CTA — org-relative path, absolutised per send. */
  cta?: { label: string; path: string };
  /** Header treatment. Defaults to "notice". */
  emailType?: "basic" | "notice" | "alert" | "reminder";
  /** Subject line, when it should differ from the bell's. */
  subject?: string;
  /** A content partial for the body (the reminder templates); `bodyHtml` then makes the text part. */
  contentPartial?: { name: string; source: string; vars: PartialVars } | null;
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
  /**
   * Write the bell row (default). `false` is a push without a row — the
   * meeting-in-an-hour reminder — still gated on the bell's switch.
   */
  bell?: boolean;
  /** Push (default), or not; or push with a Web Push urgency and time-to-live. */
  push?: boolean | PushDeliveryOptions;
  /** Buttons on the push (dues → Pay, meeting → Add to calendar, request → Open). */
  pushActions?: PushActionInput[] | null;
  /**
   * Essential (dues and violation reminders): the email twin is stopped only by
   * the master email switch, not the category opt-out or the mute, and its
   * footer says it can't be unsubscribed. Bell and push are unchanged.
   */
  essential?: boolean;
  /**
   * Fold repeats into ONE unread bell row per recipient (Phase 7: "3 new in
   * #board"). Needs `collection` + `item`. If the recipient already has an
   * unread (inbox) row for the same collection/item, that row's subject becomes
   * `subjectFor(count + 1)` and its message the newest excerpt; once they read
   * it (archived) the next event starts a fresh row. The push is unaffected —
   * its `tag` (collection:item) already replaces the previous push.
   */
  bellCollapse?: { subjectFor: (count: number) => string } | null;
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
    const bell = opts.bell === false ? 0 : await writeBells(recipients, opts);
    return { bell, push: 0, email: 0 };
  }

  const allowedBell = users.filter((u) =>
    bellAllowed((u.notification_preferences as never) ?? null, opts.category)
  );
  let bell = 0;
  if (opts.bell !== false && allowedBell.length) {
    await silenceDirectusEmail(allowedBell);
    bell = await writeBells(
      allowedBell.map((u) => u.id),
      opts
    );
  }

  // Push rides the bell's decision (see the header note): no row, no push —
  // except a caller that asked for no row (`bell: false`), where the bell's
  // switch still decides.
  let push = 0;
  const allowedPush = allowedBell.filter((u) =>
    pushAllowed((u.notification_preferences as never) ?? null, opts.category)
  );
  // No slug means no org-scoped link, and an unscoped push ("New task") is
  // useless to a member who belongs to three communities. Skip push, keep bells.
  const wantPush = opts.push !== false;
  const pushOptions = typeof opts.push === "object" ? opts.push : undefined;
  const org = wantPush && allowedPush.length ? await orgPushContext(opts.organizationId) : null;
  if (wantPush && allowedPush.length && org) {
    const payload = buildPushPayload({
      title: opts.subject,
      body: opts.message,
      org,
      path: opts.path,
      origin: opts.origin,
      collection: opts.collection,
      item: opts.item,
      actions: opts.pushActions,
    });
    const counts = await Promise.all(
      allowedPush.map((u) => sendPushToUser(u.id, payload, pushOptions).catch(() => 0))
    );
    push = counts.reduce((a, b) => a + b, 0);
  }

  // Email is decided independently of the bell — muting the payments BELL is a
  // request for a quiet app, not for a silent inbox, and the reverse holds too.
  let email = 0;
  if (opts.email) {
    const allowedEmail = users.filter((u) =>
      opts.essential
        ? emailMasterOn((u.notification_preferences as never) ?? null)
        : emailAllowed((u.notification_preferences as never) ?? null, opts.category)
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
        essential: opts.essential === true,
        contentPartial: opts.email.contentPartial ?? null,
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

/**
 * Turn Directus's own notification email off for any recipient still at true,
 * BEFORE their bell row is written (Directus decides at insert time). One write
 * for the lot, and only when someone needs it. A failure is logged and the rows
 * are written anyway: a duplicate email is a smaller loss than a missing bell.
 */
async function silenceDirectusEmail(rows: RecipientRow[]): Promise<void> {
  const ids = rows.filter((u) => u.email_notifications === true).map((u) => u.id);
  if (!ids.length) return;
  try {
    await getTypedDirectus().request(updateUsers(ids, { ...DIRECTUS_EMAIL_OFF }));
  } catch (e) {
    console.warn("[notify] could not turn off Directus's own email for", ids.length, (e as Error).message);
  }
}

async function writeBells(userIds: string[], opts: NotifyOptions): Promise<number> {
  if (!userIds.length) return 0;
  const admin = getTypedDirectus();
  let written = 0;
  for (const uid of userIds) {
    try {
      if (opts.bellCollapse && opts.collection && opts.item) {
        const prior = (
          (await admin.request(
            readNotifications({
              filter: {
                recipient: { _eq: uid },
                collection: { _eq: opts.collection },
                item: { _eq: opts.item },
                status: { _eq: "inbox" },
              },
              fields: ["id", "subject"],
              sort: ["-timestamp"],
              limit: 1,
            })
          )) as Array<{ id: string; subject: string | null }>
        )[0];
        if (prior) {
          const count = Math.max(1, parseCollapsedCount(prior.subject)) + 1;
          await admin.request(
            updateNotification(prior.id, {
              subject: opts.bellCollapse.subjectFor(count),
              message: opts.message,
            })
          );
          written++;
          continue;
        }
      }
      await admin.request(
        createNotification({
          recipient: uid,
          subject: opts.bellCollapse ? opts.bellCollapse.subjectFor(1) : opts.subject,
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
