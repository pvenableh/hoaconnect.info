// server/utils/notify.ts
// ONE place that turns "something happened in this community" into the two
// in-app channels: the durable Directus notification row (the bell) and a
// best-effort web push on top of it.
//
// Why this exists: `bellAllowed` has been in the preferences module — and its
// toggles in the account UI — since the unified-preferences work, but nothing on
// the send path ever called it, so the per-category bell switches did nothing.
// Push has to honor those switches, and having push respect a preference the
// bell ignores would be incoherent. So both go through here and both obey it.
//
// The row is the record; the push is a tap on the shoulder. A push failure is
// invisible to the caller, and a member with no subscriptions simply gets the
// row — which the bell and the digest email will surface as they always did.
import { createNotification, readItem, readUsers } from "@directus/sdk";
import { bellAllowed, type NotificationCategory } from "#core/shared/notifications/preferences";
import { buildPushPayload, pushAllowed, type PushOrgContext } from "#core/shared/notifications/push";
import { sendPushToUser } from "./push";
import { scopeRecipientsToOrg } from "./org-members";

export interface NotifyOptions {
  /** The community this is about — push payloads and links are org-scoped. */
  organizationId: string;
  /** Directus user ids to notify. */
  recipientUserIds: string[];
  /** Preference category. Both channels are gated on `<category>_bell`. */
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
}

/**
 * Write the bell rows and fan out pushes, honoring each recipient's per-category
 * preference. Never throws.
 */
export async function notifyUsers(opts: NotifyOptions): Promise<{ bell: number; push: number }> {
  const asked = [...new Set((opts.recipientUserIds || []).filter(Boolean))].filter(
    (id) => id !== opts.excludeUserId
  );
  if (!asked.length) return { bell: 0, push: 0 };

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
  if (!recipients.length) return { bell: 0, push: 0 };

  const admin = getTypedDirectus();

  let users: Array<{ id: string; notification_preferences?: Record<string, unknown> | null }> = [];
  try {
    users = (await admin.request(
      readUsers({
        filter: { id: { _in: recipients } },
        fields: ["id", "notification_preferences"],
        limit: -1,
      })
    )) as typeof users;
  } catch (e) {
    // Preferences unreadable. The bell row is the durable record and losing it
    // is worse than showing a member a category they muted, so fall back to
    // notifying everyone — but send NO pushes, since a push physically
    // interrupts someone and consent is exactly what we just failed to read.
    console.warn("[notify] preferences unreadable; bell-only fallback", (e as Error).message);
    const bell = await writeBells(recipients, opts);
    return { bell, push: 0 };
  }

  const allowedBell = users.filter((u) =>
    bellAllowed((u.notification_preferences as never) ?? null, opts.category)
  );
  const bell = await writeBells(
    allowedBell.map((u) => u.id),
    opts
  );

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

  return { bell, push };
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
