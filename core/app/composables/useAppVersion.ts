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

const updateAvailable = ref(false);
const liveBuildId = ref<string | null>(null);
/** The user waved the banner away; it stays gone until they background the app. */
const dismissed = ref(false);

export function useAppVersion() {
  const config = useRuntimeConfig();
  const bakedBuildId = config.public.buildId as string | undefined;
  const version = config.public.appVersion as string | undefined;

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
  };
}
