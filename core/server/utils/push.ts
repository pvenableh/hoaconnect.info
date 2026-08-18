// server/utils/push.ts
// Web push — SERVER ONLY. Thin wrapper over `web-push`, storing subscriptions in
// the `push_subscriptions` collection via the admin Directus client.
//
// Push is BEST-EFFORT and never the record of anything: the Directus
// notification row is the durable channel, the bell shows it, and the digest
// email catches what was missed. A push failure must therefore never break — or
// even be visible to — the action that triggered it.
//
// VAPID configuration is LAZY. With no keys set, `ensureVapid()` returns false
// and every entry point becomes a no-op returning 0. That is the intended state
// for any environment where push isn't configured (local dev, preview branches,
// production before the keys are added) — nothing to guard at call sites.
import webpush from "web-push";
import { readItems, deleteItem, updateItem, readUsers } from "@directus/sdk";
import { pushAllowed, type PushPayload } from "#core/shared/notifications/push";
import type { NotificationCategory } from "#core/shared/notifications/preferences";

interface PushSubRow {
  id: string;
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
}

let configured = false;
let configuredFor = "";

/** Configure VAPID once. False when keys aren't set — push is then disabled. */
function ensureVapid(): boolean {
  const cfg = useRuntimeConfig();
  const pub = String(cfg.public?.vapidPublicKey || "");
  const priv = String((cfg as Record<string, unknown>).vapidPrivateKey || "");
  if (!pub || !priv) return false;
  // Re-apply if the key pair changed under us (key rotation in a long-lived
  // process); `configured` alone would pin the old pair forever.
  if (!configured || configuredFor !== pub) {
    webpush.setVapidDetails(
      String((cfg as Record<string, unknown>).vapidSubject || "mailto:support@hoaconnect.info"),
      pub,
      priv
    );
    configured = true;
    configuredFor = pub;
  }
  return true;
}

/** Is web push configured in this environment? Drives the UI's availability copy. */
export function pushConfigured(): boolean {
  return ensureVapid();
}

/** The public VAPID key the browser needs to subscribe (empty when disabled). */
export function vapidPublicKey(): string {
  return ensureVapid() ? String(useRuntimeConfig().public.vapidPublicKey || "") : "";
}

/**
 * Send to every subscription a user has registered. Returns how many were
 * delivered. Never throws.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureVapid() || !userId) return 0;
  let subs: PushSubRow[] = [];
  try {
    const admin = getTypedDirectus();
    subs = (await admin.request(
      readItems("push_subscriptions" as never, {
        filter: { user: { _eq: userId } },
        fields: ["id", "endpoint", "p256dh", "auth"],
        limit: -1,
      } as never)
    )) as unknown as PushSubRow[];
  } catch (err) {
    console.warn("[push] failed to load subscriptions", (err as Error)?.message);
    return 0;
  }
  if (!subs.length) return 0;

  const results = await Promise.all(subs.map((sub) => deliver(sub, payload)));
  return results.filter(Boolean).length;
}

/**
 * Send to several users at once, honoring each one's per-category preference.
 * This is the entry point the notify layer uses; `sendPushToUser` is the
 * primitive for cases that have already resolved consent (e.g. the test push a
 * member sends themselves).
 */
export async function sendPushToUsers(
  userIds: string[],
  category: NotificationCategory,
  payloadFor: (userId: string) => PushPayload
): Promise<number> {
  if (!ensureVapid()) return 0;
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return 0;

  let users: Array<{ id: string; notification_preferences?: Record<string, unknown> | null }> = [];
  try {
    const admin = getTypedDirectus();
    users = (await admin.request(
      readUsers({
        filter: { id: { _in: ids } },
        fields: ["id", "notification_preferences"],
        limit: -1,
      })
    )) as typeof users;
  } catch (err) {
    console.warn("[push] failed to load recipient preferences", (err as Error)?.message);
    return 0;
  }

  // Fail CLOSED on an unreadable preference: if we couldn't load a user's row we
  // don't know whether they consented, and a push is the one channel that
  // physically interrupts someone.
  const allowed = users.filter((u) =>
    pushAllowed((u.notification_preferences as never) ?? null, category)
  );
  const counts = await Promise.all(allowed.map((u) => sendPushToUser(u.id, payloadFor(u.id))));
  return counts.reduce((a, b) => a + b, 0);
}

async function deliver(sub: PushSubRow, payload: PushPayload): Promise<boolean> {
  const admin = getTypedDirectus();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh ?? "", auth: sub.auth ?? "" } },
      JSON.stringify(payload)
    );
    await admin
      .request(
        updateItem("push_subscriptions" as never, sub.id, {
          last_used_at: new Date().toISOString(),
        } as never)
      )
      .catch(() => {});
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // Gone: the browser unsubscribed, the app was uninstalled, or the endpoint
    // expired. Prune, or we retry a dead endpoint on every notification forever.
    if (status === 404 || status === 410) {
      await admin.request(deleteItem("push_subscriptions" as never, sub.id)).catch(() => {});
    } else {
      console.warn("[push] send failed", status ?? "", (err as Error).message);
    }
    return false;
  }
}
