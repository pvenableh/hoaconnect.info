/**
 * Install affordance state (Phase 6). The `beforeinstallprompt` event fires
 * once, early, and usually before any card has mounted — so `pwa.client.ts`
 * captures it into this module-level ref via `captureInstallPrompt()` and the
 * composable only reads.
 */
import {
  INSTALL_DISMISS_KEY,
  installDismissed,
  installMode,
  showInstallCard,
} from "#core/shared/pwa/install";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const deferred = shallowRef<BeforeInstallPromptEvent | null>(null);
const installedThisSession = ref(false);

export function captureInstallPrompt(e: Event) {
  e.preventDefault();
  deferred.value = e as BeforeInstallPromptEvent;
}

export function markInstalled() {
  deferred.value = null;
  installedThisSession.value = true;
}

export function useInstallPrompt() {
  const config = useRuntimeConfig();
  const buildId = (config.public.buildId as string | undefined) || "dev";
  const ready = ref(false);
  const standalone = ref(false);
  const userAgent = ref("");
  const maxTouchPoints = ref(0);
  const dismissedFor = ref<string | null>(null);

  onMounted(() => {
    userAgent.value = navigator.userAgent || "";
    maxTouchPoints.value = navigator.maxTouchPoints || 0;
    standalone.value =
      !!window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    try {
      dismissedFor.value = localStorage.getItem(INSTALL_DISMISS_KEY);
    } catch {
      /* storage refused — the card just won't remember */
    }
    ready.value = true;
  });

  const mode = computed(() =>
    installedThisSession.value
      ? ("installed" as const)
      : installMode({
          userAgent: userAgent.value,
          maxTouchPoints: maxTouchPoints.value,
          standalone: standalone.value,
          hasDeferredPrompt: !!deferred.value,
        })
  );
  const dismissed = computed(() => installDismissed(dismissedFor.value, buildId));
  const visible = computed(() => showInstallCard(mode.value, dismissed.value, ready.value));

  function dismiss() {
    dismissedFor.value = buildId;
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, buildId);
    } catch {
      /* ignore */
    }
  }

  /** Fire the browser's own install dialog. Resolves true when the member accepted. */
  async function install(): Promise<boolean> {
    const e = deferred.value;
    if (!e) return false;
    try {
      await e.prompt();
      const { outcome } = await e.userChoice;
      deferred.value = null; // the event is single-use either way
      if (outcome === "accepted") installedThisSession.value = true;
      return outcome === "accepted";
    } catch {
      return false;
    }
  }

  return { mode, dismissed, visible, ready, dismiss, install };
}
