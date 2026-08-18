/**
 * Web-push client: capability detection, permission, subscribe/unsubscribe.
 *
 * Push is optional everywhere. It is unavailable when the browser lacks the
 * APIs, when the server has no VAPID keys configured, or — the common case —
 * when the member is on iOS and hasn't installed the app to their Home Screen.
 * That last one is not a dead end but a two-tap fix, so `unsupportedReason`
 * distinguishes it and the UI can walk them through it instead of saying "not
 * supported" to someone whose phone supports it perfectly well.
 *
 * The subscription belongs to the BROWSER; the server ties it to the signed-in
 * account. Notifications themselves are org-scoped — that's carried in the
 * payload, not the subscription, so one subscription serves every community a
 * member belongs to.
 */
export function usePush() {
  const supported = ref(false);
  const permission = ref<NotificationPermission>("default");
  const subscribed = ref(false);
  const busy = ref(false);
  /** False when the server has no VAPID keys — push is off for everyone. */
  const serverEnabled = ref(false);
  const isIos = ref(false);
  const isStandalone = ref(false);
  /** Why push can't be enabled here — drives the guidance shown to the member. */
  const unsupportedReason = ref<"ios-install" | "ios-old" | "server-off" | "generic" | null>(null);

  let vapidKey = "";

  onMounted(async () => {
    const ua = navigator.userAgent || "";
    // iPhone/iPod/iPad — plus iPadOS 13+, which masquerades as desktop Safari.
    isIos.value = /iP(hone|od|ad)/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
    isStandalone.value =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;

    const hasApis =
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

    // Ask the server whether push is configured at all, and for the public key.
    try {
      const res = await $fetch<{ enabled: boolean; publicKey: string }>("/api/user/push/config");
      serverEnabled.value = !!res?.enabled;
      vapidKey = res?.publicKey || "";
    } catch {
      serverEnabled.value = false;
    }

    supported.value = hasApis && serverEnabled.value && !!vapidKey;
    if (!supported.value) {
      // On iOS, web push exists only inside a Home-Screen web app (iOS 16.4+) —
      // never in a regular Safari tab. So "unsupported" there usually means "not
      // installed yet", which is worth saying out loud.
      unsupportedReason.value = !hasApis
        ? isIos.value
          ? isStandalone.value
            ? "ios-old"
            : "ios-install"
          : "generic"
        : "server-off";
      return;
    }

    permission.value = Notification.permission;
    await refresh();
  });

  async function refresh() {
    if (!supported.value) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    subscribed.value = !!sub;
  }

  /**
   * Ask permission, subscribe this browser, and register it server-side. MUST be
   * called from a user gesture — browsers reject a permission prompt that isn't
   * tied to a click, and Safari silently hard-denies for the session.
   */
  async function enable(): Promise<boolean> {
    if (!supported.value || busy.value || !vapidKey) return false;
    busy.value = true;
    try {
      permission.value = await Notification.requestPermission();
      if (permission.value !== "granted") return false;
      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await $fetch("/api/user/push/subscribe", {
        method: "POST",
        body: { endpoint: json.endpoint, keys: json.keys },
      });
      subscribed.value = true;
      return true;
    } catch (e) {
      console.error("[push] enable failed", e);
      return false;
    } finally {
      busy.value = false;
    }
  }

  /** Unsubscribe this browser, server-side and locally. */
  async function disable(): Promise<void> {
    if (!supported.value) return;
    busy.value = true;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await $fetch("/api/user/push/unsubscribe", {
          method: "POST",
          body: { endpoint: sub.endpoint },
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      subscribed.value = false;
    } finally {
      busy.value = false;
    }
  }

  /** Send this member a push, so they can confirm it actually arrives. */
  async function sendTest(): Promise<number> {
    const res = await $fetch<{ sent: number }>("/api/user/push/test", { method: "POST" });
    return res?.sent ?? 0;
  }

  return {
    supported,
    serverEnabled,
    permission,
    subscribed,
    busy,
    isIos,
    isStandalone,
    unsupportedReason,
    enable,
    disable,
    sendTest,
    refresh,
  };
}

/** VAPID public key (base64url) → Uint8Array for applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
