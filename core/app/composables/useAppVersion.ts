// useAppVersion — shared "a newer deploy exists" state.
//
// The client bundle bakes the build identity it was compiled with
// (runtimeConfig.public.buildId). Detection lives in
// app/plugins/app-update.client.ts, which watches THREE independent signals so
// no single dead channel can strand a client on a build whose chunks are gone:
//
//   1. Nuxt's own build manifest, re-checked around route changes
//      (`experimental.checkOutdatedBuildInterval`), firing `app:manifest:update`.
//   2. A visibility-gated poll of GET /api/version — the live server's build id,
//      which unlike a static manifest file can't be served stale by an edge.
//      Gated so a backgrounded client does no network work at all.
//   3. The `x-app-build` header on every /api response, compared in a fetch
//      wrapper, so a stale client learns on its next request rather than on its
//      next poll.
//
// This module is just the seam between that detection and <AppUpdatePrompt>.
// Singleton (module-level) state so every consumer shares one flag.
//
// It also owns the "What's new" sheet's open state, because the two are the same
// story from the user's side: <AppUpdatePrompt> asks them to refresh, and the
// sheet is what greets them on the other side of that refresh. Keeping the state
// here means <AppWhatsNew> can be mounted once in the layout and opened from
// anywhere (the Account page's About row) without a second store.
import {
  noteForVersion,
  WHATS_NEW_SEEN_KEY,
  type ReleaseNote,
} from "#core/shared/app/release-notes";

const updateAvailable = ref(false);
const liveBuildId = ref<string | null>(null);
/** The user waved the banner away; it stays gone until they background the app. */
const dismissed = ref(false);
/** Whether the "What's new" sheet is showing. */
const whatsNewOpen = ref(false);

export function useAppVersion() {
  const config = useRuntimeConfig();
  const bakedBuildId = config.public.buildId as string | undefined;
  const version = config.public.appVersion as string | undefined;

  /**
   * The release note for the running version, matched on its MAJOR.MINOR line.
   * `null` when this line has no note — in which case nothing about "What's new"
   * renders at all, rather than an empty sheet.
   */
  const releaseNote = computed<ReleaseNote | null>(() => noteForVersion(version));

  /** Detection found a newer build. Idempotent — the flag is sticky. */
  function markUpdateAvailable(live?: string | null) {
    if (live) liveBuildId.value = live;
    updateAvailable.value = true;
  }

  /**
   * Full document navigation: new HTML, new chunk hashes, new service-worker
   * check. `ttl` guards against a reload loop if the "new" build is somehow
   * still stale — without it a misconfigured deploy would spin forever.
   */
  function applyUpdate(path?: string) {
    if (!import.meta.client) return;
    reloadNuxtApp({
      path: path ?? window.location.pathname + window.location.search,
      persistState: false,
      ttl: 10_000,
    });
  }

  /**
   * Show the sheet ONCE per release line.
   *
   * The marker stores the line the user last saw, not a boolean, so it re-arms
   * itself: after 2.1 ships, a stored "2.0" no longer matches and the sheet
   * comes back exactly once. A boolean would have needed clearing on every
   * release — i.e. it would have needed someone to remember.
   *
   * Called from <AppWhatsNew> on mount. Silent when the running line has no note
   * (never nags about a release nobody wrote up) and when localStorage throws
   * (Safari private mode) — a storage failure must not turn a once-ever sheet
   * into an every-load sheet, so the read failing means "assume seen".
   */
  function maybeShowWhatsNew() {
    if (!import.meta.client) return;
    const note = releaseNote.value;
    if (!note) return;
    try {
      if (window.localStorage.getItem(WHATS_NEW_SEEN_KEY) === note.version) return;
    } catch {
      return;
    }
    whatsNewOpen.value = true;
  }

  /** Open it on purpose — the Account page's "What's new" row. */
  function openWhatsNew() {
    whatsNewOpen.value = true;
  }

  /** Close it and remember the line, so the auto-show doesn't fire again. */
  function closeWhatsNew() {
    whatsNewOpen.value = false;
    const note = releaseNote.value;
    if (!import.meta.client || !note) return;
    try {
      window.localStorage.setItem(WHATS_NEW_SEEN_KEY, note.version);
    } catch {
      // Storage unavailable — the sheet simply shows again next load. Harmless.
    }
  }

  return {
    updateAvailable: readonly(updateAvailable),
    liveBuildId: readonly(liveBuildId),
    dismissed,
    bakedBuildId,
    version,
    markUpdateAvailable,
    applyUpdate,
    /** Back-compat alias — <AppUpdatePrompt> has always called this. */
    reloadForUpdate: applyUpdate,
    releaseNote,
    whatsNewOpen,
    maybeShowWhatsNew,
    openWhatsNew,
    closeWhatsNew,
  };
}
