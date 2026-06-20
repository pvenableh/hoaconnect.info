// server/api/version.get.ts
// Live build identity of the CURRENTLY-RUNNING deployment. The client bakes its own
// buildId at build time (runtimeConfig.public.buildId) and polls this endpoint; when the
// two diverge a new version has shipped and the user can be prompted to refresh.
// Kept deliberately tiny + uncached so the poll always reflects the live server.
export default defineEventHandler((event) => {
  const config = useRuntimeConfig();

  // Never cache — a stale CDN copy would mask a fresh deploy and defeat detection.
  setResponseHeaders(event, {
    "cache-control": "no-store, no-cache, must-revalidate",
    pragma: "no-cache",
  });

  return {
    buildId: config.public.buildId,
    version: config.public.appVersion,
  };
});
